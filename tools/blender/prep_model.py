"""Prepare a raw Tripo GLB (~2M triangles, 2K+ textures) for the web scene (headless).

  Blender -b --factory-startup -P tools/blender/prep_model.py -- --in raw.glb --out out.glb --size 0.55 [--axis long]
         [--tris 15000] [--rotz 0] [--tex 1024] [--keep-parts 0]

- joins all meshes (unless --keep-parts 1), applies transforms
- rotates by --rotz degrees about the up axis (to face the model's front toward +Z in three.js / -Y in Blender)
- scales so the chosen dimension (--axis long|height|width|depth) equals --size metres
- puts the origin at the bottom centre (sits on y=0 in three.js)
- collapse-decimates to about --tris triangles (UVs kept), smooth-shades by angle
- downsizes every texture to --tex px; exports GLB (JPEG for colour/ORM, PNG for normals is left to the exporter)
Prints before/after triangle counts and final dimensions.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
IN, OUT = arg('--in'), arg('--out')
SIZE, AXIS = float(arg('--size', '1')), arg('--axis', 'long')
TRIS, ROTZ, TEX = int(arg('--tris', '15000')), float(arg('--rotz', '0')), int(arg('--tex', '1024'))
KEEP = arg('--keep-parts', '0') == '1'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(False)
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if not KEEP and len(meshes) > 1:
    bpy.ops.object.join(); meshes = [bpy.context.view_layer.objects.active]
for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
before = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)

def bbox():
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p[i] for p in pts) for i in range(3))); hi = Vector((max(p[i] for p in pts) for i in range(3)))
    return lo, hi

R = Matrix.Rotation(math.radians(ROTZ), 4, 'Z')
for o in meshes: o.data.transform(R)
lo, hi = bbox(); d = hi - lo
ref = {'long': max(d.x, d.y), 'height': d.z, 'width': d.x, 'depth': d.y}[AXIS]
s = SIZE / max(ref, 1e-6)
ctr = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
M = Matrix.Scale(s, 4) @ Matrix.Translation(-ctr)
for o in meshes: o.data.transform(M); o.data.update()

# decimate each mesh in proportion to its share of triangles
for o in meshes:
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    share = TRIS * n / max(before, 1)
    ratio = max(0.002, min(1.0, share / max(n, 1)))
    if ratio < 0.999:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio; mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons: p.use_smooth = True
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    except Exception:
        pass
after = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)

for img in bpy.data.images:
    if img.size[0] > TEX or img.size[1] > TEX:
        w = TEX; h = max(1, round(img.size[1] * TEX / img.size[0]))
        img.scale(w, h)

lo, hi = bbox(); d = hi - lo
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=90, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT')
print('PREP', OUT, 'tris', before, '->', after, 'dims_m', tuple(round(x, 3) for x in d))
sys.stdout.flush(); os._exit(0)
