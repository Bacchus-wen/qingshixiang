"""Assemble the hero robot from two Tripo models (headless): the whole seated robot (body + stool, one model) with
its own head cut away, and the separately generated high-detail head placed on the neck as its own node (so it can
turn). Writes one GLB with nodes 'robot_body' and 'robot_head' (origin of the head = neck pivot).

  Blender -b --factory-startup -P tools/blender/robot_assemble.py -- --body full.glb --head head.glb --out robot.glb
        [--height 1.05] [--neck 0.0] [--body-tris 45000] [--head-tris 25000] [--tex 2048] [--rotz -90] [--head-rotz -90]
--neck: neck height as a fraction of the body height (0 = find it automatically: the narrowest slice between 55% and
85% of the height). Prints the width profile so the cut can be checked.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
HEIGHT = float(arg('--height', '1.05')); NECK = float(arg('--neck', '0'))
BT, HT, TEX = int(arg('--body-tris', '45000')), int(arg('--head-tris', '25000')), int(arg('--tex', '2048'))
ROTZ, HROTZ = float(arg('--rotz', '-90')), float(arg('--head-rotz', '-90'))
HMUL, SINK = float(arg('--head-scale-mul', '1')), float(arg('--head-sink', '0.015'))

bpy.ops.wm.read_factory_settings(use_empty=True)

def load(path, rotz):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    ms = [o for o in new if o.type == 'MESH']
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(ms) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    for x in [x for x in new if x.type != 'MESH']: bpy.data.objects.remove(x, do_unlink=True)
    o.data.transform(Matrix.Rotation(math.radians(rotz), 4, 'Z'))
    return o

def bounds(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    lo = Vector((min(v[i] for v in vs) for i in range(3))); hi = Vector((max(v[i] for v in vs) for i in range(3)))
    return lo, hi

body = load(arg('--body'), ROTZ); body.name = 'robot_body'
lo, hi = bounds(body); s = HEIGHT / (hi.z - lo.z)
body.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
body.data.update()
lo, hi = bounds(body); H = hi.z - lo.z

# width profile (x and y extent per height slice)
N = 40; prof = []
co = [v.co.copy() for v in body.data.vertices]
for i in range(N):
    z0, z1 = lo.z + H * i / N, lo.z + H * (i + 1) / N
    sl = [c for c in co if z0 <= c.z < z1]
    if not sl: prof.append((i, 0, 0)); continue
    prof.append((i, max(c.x for c in sl) - min(c.x for c in sl), max(c.y for c in sl) - min(c.y for c in sl)))
print('PROFILE', ' '.join(f'{i}:{w:.2f}/{d:.2f}' for i, w, d in prof))
if NECK <= 0:
    cand = [(w * d, i) for i, w, d in prof if 0.55 * N <= i <= 0.85 * N and w > 0]
    NECK = (min(cand)[1] + 0.5) / N
neck_z = lo.z + H * NECK
print('NECK', round(NECK, 3), 'z', round(neck_z, 3))

# the original head = everything above the neck; remember its box, then delete it
above = [c for c in co if c.z > neck_z]
hlo = Vector((min(c[i] for c in above) for i in range(3))); hhi = Vector((max(c[i] for c in above) for i in range(3)))
bm = bmesh.new(); bm.from_mesh(body.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > neck_z], context='VERTS')
bm.to_mesh(body.data); bm.free(); body.data.update()
print('OLD_HEAD box', tuple(round(x, 3) for x in hlo), tuple(round(x, 3) for x in hhi))

# the new head: same width as the old one, bottom of its neck stub at the cut, centred over the old head's footprint
head = load(arg('--head'), HROTZ); head.name = 'robot_head'
a, b = bounds(head)
sw = (hhi.x - hlo.x) / (b.x - a.x) * HMUL
pivot = Vector(((hlo.x + hhi.x) / 2, (hlo.y + hhi.y) / 2, neck_z))
head.data.transform(Matrix.Scale(sw, 4) @ Matrix.Translation(-Vector(((a.x + b.x) / 2, (a.y + b.y) / 2, a.z))))
head.data.update()
head.location = pivot - Vector((0, 0, SINK))  # sink the neck stub into the torso so the neck stays short
print('HEAD scale', round(sw, 3), 'pivot', tuple(round(x, 3) for x in pivot))

# optional: the separately generated, sharper torso laid over the body's own torso (covers it slightly larger)
TORSO = arg('--torso')
torso = None
if TORSO:
    z0, z1 = float(arg('--torso-z0', '0.48')), float(arg('--torso-z1', '0.72')); xr = float(arg('--torso-x', '0.15'))
    band = [c for c in [v.co for v in body.data.vertices] if z0 <= c.z <= z1 and abs(c.x) < xr]
    tlo = Vector((min(c[i] for c in band) for i in range(3))); thi = Vector((max(c[i] for c in band) for i in range(3)))
    torso = load(TORSO, float(arg('--torso-rotz', '-90'))); torso.name = 'robot_torso'
    a, b = bounds(torso)
    st = (thi.x - tlo.x) / (b.x - a.x) * float(arg('--torso-mul', '1.08'))
    torso.data.transform(Matrix.Scale(st, 4) @ Matrix.Translation(-(a + b) / 2))
    torso.data.update()
    torso.location = (tlo + thi) / 2 + Vector((0, float(arg('--torso-dy', '0')), float(arg('--torso-dz', '0'))))
    bpy.context.view_layer.objects.active = torso
    print('TORSO band', tuple(round(x, 3) for x in tlo), tuple(round(x, 3) for x in thi), 'scale', round(st, 3))

def decimate(o, tris):
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    r = max(0.002, min(1, tris / n))
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('d', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = r; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons: p.use_smooth = True
    print('DEC', o.name, n, '->', sum(len(p.vertices) - 2 for p in o.data.polygons))
for o in bpy.context.scene.objects: o.select_set(False)
decimate(body, BT); decimate(head, HT)
if torso: decimate(torso, int(arg('--torso-tris', '20000')))
for img in bpy.data.images:
    if img.size[0] > TEX: img.scale(TEX, max(1, round(img.size[1] * TEX / img.size[0])))
bpy.ops.export_scene.gltf(filepath=arg('--out'), export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=90, export_materials='EXPORT')
print('ROBOT', arg('--out'))
sys.stdout.flush(); os._exit(0)
