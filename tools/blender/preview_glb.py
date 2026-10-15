"""Render a quick Eevee preview of a glb from several angles into one contact sheet.
  Blender -b --factory-startup -P tools/blender/preview_glb.py -- --in assets/models/robot.glb --out renders/robot_preview.png [--views 4]
"""
import bpy, sys, os, math
from mathutils import Vector
A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
src, out, views = arg('--in'), arg('--out'), int(arg('--views', '4'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo = Vector((min(v[i] for o in objs for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
hi = Vector((max(v[i] for o in objs for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
center, size = (lo + hi) / 2, (hi - lo).length
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 800, 800
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.18, 0.18, 0.18, 1); sc.world = w
for i, (e, p) in enumerate([(3.0, (1, -1, 1.2)), (1.0, (-1.2, -0.6, 0.6)), (1.5, (0.2, 1.2, 1.0))]):
    l = bpy.data.lights.new(f'l{i}', 'AREA'); l.energy = 300 * e * size * size; l.size = size
    lo_ = bpy.data.objects.new(f'l{i}', l); sc.collection.objects.link(lo_)
    lo_.location = center + Vector(p) * size * 1.2
    lo_.rotation_euler = (center - lo_.location).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
frames = []
for k in range(views):
    a = -math.pi / 2 + k * (2 * math.pi / views) + 0.4
    cam.location = center + Vector((math.cos(a), math.sin(a), 0.45)) * size * 1.5
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    f = f'/tmp/_prev_{k}.png'; sc.render.filepath = f
    bpy.ops.render.render(write_still=True); frames.append(f)
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
os.system('ffmpeg -v error -y ' + ' '.join(f'-i {f}' for f in frames) + f' -filter_complex "hstack=inputs={views}" {out}')
print('PREVIEW', out)
sys.stdout.flush(); os._exit(0)
