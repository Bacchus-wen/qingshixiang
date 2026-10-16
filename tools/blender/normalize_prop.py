"""Normalize a Tripo glb: real-world size (longest horizontal side or height), origin at bottom centre, single mesh.
  Blender -b --factory-startup -P tools/blender/normalize_prop.py -- --in model.glb --out out.glb --size 2.4 --axis long|height
"""
import bpy, sys, os
from mathutils import Vector
A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=arg('--in'))
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
ext = hi - lo
size = float(arg('--size'))
cur = ext.z if arg('--axis', 'long') == 'height' else max(ext.x, ext.y)
k = size / cur
root = bpy.data.objects.new('prop', None); bpy.context.scene.collection.objects.link(root)
for o in objs:
    if o.parent is None or o.parent.type != 'MESH':
        mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
root.location = (-(lo.x + hi.x) / 2 * k, -(lo.y + hi.y) / 2 * k, -lo.z * k)
root.scale = (k, k, k)
print('NORMALIZED', os.path.basename(arg('--out')), 'ext', tuple(round(e * k, 2) for e in ext), 'tris', sum(len(o.data.polygons) for o in objs))
bpy.ops.export_scene.gltf(filepath=arg('--out'), export_format='GLB', export_apply=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=88)
sys.stdout.flush(); os._exit(0)
