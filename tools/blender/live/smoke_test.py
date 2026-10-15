#!/usr/bin/env python3
"""Real Blender acceptance test; keeps artifacts for visual inspection."""
import argparse
import json
from pathlib import Path
import struct
import subprocess
import sys

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=19877)
    parser.add_argument("--engine", choices=["CYCLES", "EEVEE"], default="CYCLES")
    args = parser.parse_args()
    prefix = [sys.executable, str(HERE / "blender_live.py"), "--port", str(args.port)]

    def run(*arguments, expected=0):
        command = prefix + list(arguments)
        completed = subprocess.run(command, text=True, capture_output=True, timeout=360)
        print("COMMAND:", " ".join(command), flush=True)
        print(completed.stdout or completed.stderr, flush=True)
        if completed.returncode != expected:
            raise RuntimeError(f"Expected exit {expected}, got {completed.returncode}")
        return json.loads(completed.stdout)

    # Do not reset or stop an existing user's session, even on our test port.
    status = subprocess.run(prefix + ["status"], text=True, capture_output=True, timeout=310)
    if status.returncode == 0:
        raise RuntimeError("Test port already has a session; choose another --port")
    run("start")
    try:
        pid = run("status")["pid"]
        assert run("start")["pid"] == pid
        run("reset")
        model = HERE / "_output" / "model.py"
        model.parent.mkdir(exist_ok=True)
        model.write_text('''bpy.ops.mesh.primitive_cube_add()
cube = bpy.context.object
cube.name = "PersistentCube"
bevel = cube.modifiers.new("Bevel", "BEVEL")
bevel.width = 0.16
bevel.segments = 4
counter = 1
print("created", cube.name)
result = {"counter": counter}
''', encoding="utf-8")
        assert run("exec", str(model))["result"] == {"counter": 1}
        modified = run("exec", "-c", 'assert cube == bpy.data.objects["PersistentCube"]; cube.scale.z = 1.4; counter += 1; result = {"counter": counter, "scale_z": cube.scale.z}')
        assert modified["result"]["counter"] == 2
        assert abs(modified["result"]["scale_z"] - 1.4) < 1e-5
        failure = run("exec", "-c", "print('before error'); raise ValueError('intentional')", expected=1)
        assert "Traceback" in failure["error"] and "before error" in failure["stdout"]
        assert run("exec", "-c", "result = counter")["result"] == 2
        png = HERE / "_output" / f"cube-{args.engine.lower()}.png"
        glb = HERE / "_output" / "cube.glb"
        run("render", str(png), "--engine", args.engine, "--samples", "8", "--res", "640x360")
        run("export", str(glb))
        header = png.read_bytes()[:24]
        assert header[:8] == b"\x89PNG\r\n\x1a\n"
        assert struct.unpack(">II", header[16:24]) == (640, 360)
        data = glb.read_bytes()
        assert data[:4] == b"glTF"
        assert struct.unpack_from("<II", data, 4) == (2, len(data))
        length, kind = struct.unpack_from("<I4s", data, 12)
        assert kind == b"JSON"
        document = json.loads(data[20:20 + length])
        counts = [document["accessors"][p["attributes"]["POSITION"]]["count"]
                  for mesh in document["meshes"] for p in mesh["primitives"]]
        assert max(counts) > 24, "Bevel modifier was not baked into the GLB"
        print(f"PASS: persistent counter=2; PNG {png.stat().st_size} bytes; GLB {len(data)} bytes; vertices={counts}")
        run("reset")
        assert run("exec", "-c", "result = len(bpy.data.objects)")["result"] == 0
        run("exec", "-c", "result = counter", expected=1)
    finally:
        run("stop")
    assert run("status", expected=1)["running"] is False
    run("stop")
    print("PASS: process stopped")


if __name__ == "__main__":
    main()
