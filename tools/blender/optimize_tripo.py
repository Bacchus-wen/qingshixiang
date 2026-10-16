"""Tripo HD output (often 1-2M tris, 60 MB) -> web asset: decimate to a triangle budget, real-world size, origin at the
bottom centre of its BACK face (so facade modules sit flush on a wall: local -Z = wall, +Z = street), JPEG textures.
  Blender -b --factory-startup -P tools/blender/optimize_tripo.py -- --in in.glb --out out.glb --size 3.0 --axis long|height --tris 50000 [--back -y]
"""
import bpy, sys, os
from mathutils import Vector
A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=arg('--in'))
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
tris0 = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
target = int(arg('--tris', '50000'))
dg = bpy.context.evaluated_depsgraph_get()
for o in objs:
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    share = target * n / max(1, tris0)
    if n > share * 1.05:
        mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = max(0.01, share / n); mod.use_collapse_triangulate = True
dg = bpy.context.evaluated_depsgraph_get()
for o in objs:
    if o.modifiers:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); o.modifiers.clear(); o.data = me
bpy.context.view_layer.update()
# align: rotate about Z so the footprint's long axis runs along X (wall direction); --flip turns it 180 so the
# street face (+Z in glTF, -Y in Blender) is the right one; --rotz adds a manual quarter turn
import math, numpy as np
P = np.array([(o.matrix_world @ o.data.vertices[i].co)[:2] for o in objs for i in range(0, len(o.data.vertices), 7)])
P = P - P.mean(0); w, V = np.linalg.eigh(np.cov(P.T)); ax = V[:, np.argmax(w)]
ang = -math.atan2(ax[1], ax[0]) + math.radians(float(arg('--rotz', '0'))) + (math.pi if arg('--flip') == '1' else 0)
holder = bpy.data.objects.new('align', None); bpy.context.scene.collection.objects.link(holder)
for o in objs:
    if o.parent is None or o.parent.type != 'MESH':
        mw = o.matrix_world.copy(); o.parent = holder; o.matrix_world = mw
holder.rotation_euler = (0, 0, ang); bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
ext = hi - lo
k = float(arg('--size')) / (ext.z if arg('--axis', 'long') == 'height' else max(ext.x, ext.y))
# Blender: glTF -Z(front? ) imported as +Y; Tripo models face the camera = glTF +Z = Blender -Y. Back face = max Y.
back = arg('--back', '+y')
by = hi.y if back == '+y' else lo.y
root = bpy.data.objects.new('module', None); bpy.context.scene.collection.objects.link(root)
mw = holder.matrix_world.copy(); holder.parent = root; holder.matrix_world = mw
root.location = (-(lo.x + hi.x) / 2 * k, -by * k, -lo.z * k); root.scale = (k, k, k)
tris1 = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
print('OPTIMIZED', os.path.basename(arg('--out')), 'tris', tris0, '->', tris1, 'size', tuple(round(e * k, 2) for e in ext))
bpy.ops.export_scene.gltf(filepath=arg('--out'), export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=88)
sys.stdout.flush(); os._exit(0)
