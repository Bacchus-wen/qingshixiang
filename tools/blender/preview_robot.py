"""Close preview of the robot glb with readable material colours (front 3/4, side, back 3/4, face).
  Blender -b --factory-startup -P tools/blender/preview_robot.py -- --in renders/robot_k1_test.glb --out renders/robot_k1_look.png
"""
import bpy, sys, os, math
from mathutils import Vector
A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=arg('--in'))
COL = {'shell_ceramic': (0.62, 0.62, 0.6, 0.45, 0), 'shell_dark': (0.08, 0.08, 0.085, 0.5, 0), 'joint_metal': (0.12, 0.12, 0.13, 0.35, 1),
       'frame_brass': (0.55, 0.38, 0.16, 0.3, 1), 'shell_accent': (0.5, 0.18, 0.08, 0.4, 0), 'eye_dead': (0.01, 0.01, 0.012, 0.08, 0)}
for m in bpy.data.materials:
    k = next((k for k in COL if k in m.name), None)
    if not k or not m.node_tree: continue
    b = m.node_tree.nodes.get('Principled BSDF')
    if b: r, g, bb, rough, met = COL[k]; b.inputs['Base Color'].default_value = (r, g, bb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = met
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo = Vector((min(v[i] for o in objs for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
hi = Vector((max(v[i] for o in objs for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
ctr, size = (lo + hi) / 2, (hi - lo).length
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 700, 800
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.05, 0.055, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6; sc.world = w
for i, (e, p) in enumerate([(2.0, (1.5, -2, 2.5)), (0.6, (-2, -1, 1)), (1.2, (0.5, 2.5, 2))]):
    l = bpy.data.lights.new(f'l{i}', 'AREA'); l.energy = 120 * e; l.size = 1.5
    lo_ = bpy.data.objects.new(f'l{i}', l); bpy.context.collection.objects.link(lo_); lo_.location = ctr + Vector(p)
    lo_.rotation_euler = (ctr - lo_.location).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
outs = []
head = bpy.data.objects.get('head')
views = [((1.0, -1.6, 0.35), ctr, 40), ((2.0, 0.1, 0.2), ctr, 40), ((-1.2, -1.2, 0.5), ctr, 40), ((0.25, -0.55, 0.05), head.matrix_world.translation if head else ctr, 40)]
for i, (off, tgt, fov) in enumerate(views):
    cam.location = tgt + Vector(off) * (size if i < 3 else 1); cam.data.angle = math.radians(fov)
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    f = f'/tmp/_rp_{i}.png'; sc.render.filepath = f; bpy.ops.render.render(write_still=True); outs.append(f)
import subprocess
subprocess.run(['ffmpeg', '-v', 'error', '-y'] + sum([['-i', f] for f in outs], []) + ['-filter_complex', f'hstack=inputs={len(outs)}', arg('--out')])
print('PREVIEW', arg('--out')); sys.stdout.flush(); os._exit(0)
