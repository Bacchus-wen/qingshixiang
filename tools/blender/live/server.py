"""A local, sequential JSON/HTTP server running on Blender's main thread."""
import argparse
import contextlib
import io
import json
import math
import os
from pathlib import Path
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

import bpy
from mathutils import Vector

PROTOCOL = "blender-live/1"
MAX_BODY = 8 * 1024 * 1024


def namespace():
    return {"__name__": "__blender_live__", "bpy": bpy}


GLOBALS = namespace()


def render_preview(request):
    scene = bpy.context.scene
    width, height = request.get("resolution", [1280, 720])
    samples = request.get("samples", 32)
    if not (1 <= width <= 16384 and 1 <= height <= 16384 and 1 <= samples <= 65536):
        raise ValueError("Invalid resolution or samples")
    engine = request.get("engine", "EEVEE")
    if engine not in {"EEVEE", "CYCLES"}:
        raise ValueError("engine must be EEVEE or CYCLES")
    scene.render.engine = "CYCLES" if engine == "CYCLES" else "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    scene.render.use_border = False
    if engine == "CYCLES":
        scene.cycles.samples = samples
        scene.cycles.device = "CPU"
    elif hasattr(scene, "eevee"):
        for prop in ("taa_render_samples", "taa_samples"):
            if hasattr(scene.eevee, prop):
                setattr(scene.eevee, prop, samples)
                break
        else:
            raise RuntimeError("This Blender version has no supported EEVEE samples property")

    if scene.camera is None:
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        points = []
        for instance in depsgraph.object_instances:
            obj = instance.object
            if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT", "VOLUME"} and not obj.hide_render:
                points.extend(instance.matrix_world @ Vector(corner) for corner in obj.bound_box)
        if not points:
            points = [Vector((-1, -1, -1)), Vector((1, 1, 1))]
        low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
        high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
        center = (low + high) * 0.5
        radius = max((high - low).length * 0.5, 0.1)
        data = bpy.data.cameras.new("LivePreviewCamera")
        camera = bpy.data.objects.new("LivePreviewCamera", data)
        scene.collection.objects.link(camera)
        scene.camera = camera
        data.lens = 50
        data.sensor_fit = "HORIZONTAL"
        half_horizontal = math.atan(data.sensor_width / (2 * data.lens))
        half_vertical = math.atan(math.tan(half_horizontal) * height / width)
        distance = radius / math.sin(min(half_horizontal, half_vertical)) * 1.15
        camera.location = center + Vector((1.3, -1.8, 1.15)).normalized() * distance
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        data.clip_start = max(0.001, radius * 0.001)
        data.clip_end = max(100, distance + radius * 4)
        light_data = bpy.data.lights.new("LivePreviewLight", "AREA")
        light_data.energy = 1000 * radius * radius
        light_data.shape = "DISK"
        light_data.size = radius * 3
        light = bpy.data.objects.new("LivePreviewLight", light_data)
        scene.collection.objects.link(light)
        light.location = center + Vector((1, -1, 2)) * radius * 2
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()

    output = Path(request["path"]).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output)
    scene.render.use_file_extension = False
    if "FINISHED" not in bpy.ops.render.render(write_still=True):
        raise RuntimeError("Blender cancelled the render")
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Blender did not write a non-empty PNG")
    return {"path": str(output), "bytes": output.stat().st_size, "engine": engine}


def dispatch(request, server):
    action = request.get("action", "exec")
    if action == "status":
        return {"protocol": PROTOCOL, "pid": os.getpid(), "blender": bpy.app.version_string,
                "server": str(Path(__file__).resolve()), "cwd": os.getcwd()}
    if action == "stop":
        server.stopping = True
        return {"stopping": True, "pid": os.getpid()}
    if action == "reset":
        bpy.ops.wm.read_factory_settings(use_empty=True)
        GLOBALS.clear()
        GLOBALS.update(namespace())
        return {"objects": len(bpy.data.objects)}
    if action == "render":
        return render_preview(request)
    if action == "export":
        output = Path(request["path"]).expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        if "FINISHED" not in bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_apply=True):
            raise RuntimeError("Blender cancelled the export")
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError("Blender did not write a non-empty GLB")
        return {"path": str(output), "bytes": output.stat().st_size}
    if action != "exec":
        raise ValueError("Unknown action: " + str(action))
    code = request.get("code")
    if not isinstance(code, str):
        raise ValueError("code must be a string")
    # A result belongs to one request; all other bindings persist.
    GLOBALS.pop("result", None)
    exec(compile(code, "<blender-live>", "exec"), GLOBALS, GLOBALS)
    return GLOBALS.get("result")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        stream = io.StringIO()
        response = {"ok": False, "stdout": "", "error": None, "result": None}
        try:
            if self.path != "/" or self.headers.get("Origin"):
                raise ValueError("Only local non-browser POST / requests are accepted")
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise ValueError("JSON body must be between 1 byte and 8 MiB")
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object")
            with contextlib.redirect_stdout(stream), contextlib.redirect_stderr(stream):
                response["result"] = dispatch(request, self.server)
            # Validate serialization here so errors get a traceback too.
            json.dumps(response["result"], allow_nan=False)
            response["ok"] = True
        except BaseException:
            response["result"] = None
            response["error"] = traceback.format_exc()
        response["stdout"] = stream.getvalue()
        body = json.dumps(response, ensure_ascii=True, allow_nan=False).encode("utf-8")
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A disconnected client must not terminate the Blender session.

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, fmt, *args):
        print("HTTP " + fmt % args, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9877)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    # This loop deliberately stays on Blender's main thread (no bpy worker threads).
    with HTTPServer(("127.0.0.1", args.port), Handler) as server:
        server.stopping = False
        print(f"{PROTOCOL} READY 127.0.0.1:{args.port} pid={os.getpid()}", flush=True)
        while not server.stopping:
            server.handle_request()
    # Skip Blender's normal teardown: its OpenEXR thread pool segfaults on exit in background mode,
    # which pops a macOS crash dialog for the user.
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
