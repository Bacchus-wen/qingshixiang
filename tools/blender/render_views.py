"""Studio views of a GLB for side-by-side review against its reference image (headless).

  Blender -b --factory-startup -P tools/blender/render_views.py -- --in model.glb --out sheet.png [--ref ref.png] [--size 640]
         [--views fq,side,bq,top] [--bg 0.62]

Keeps the model's own materials (Tripo PBR), light grey seamless background like the product-render references, soft
3-point area lights, Eevee. Writes one horizontal strip (reference first, if given) and prints triangle count and size.
"""
import bpy, sys, os, math, subprocess
from mathutils import Vector

A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
SIZE = int(arg('--size', '640')); BG = float(arg('--bg', '0.62'))
VIEWS = arg('--views', 'fq,side,bq,top').split(',')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=arg('--in'))
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector((min(p[i] for p in pts) for i in range(3))); hi = Vector((max(p[i] for p in pts) for i in range(3)))
ctr, dims = (lo + hi) / 2, hi - lo
R = max(dims.length, 1e-3) * 0.5

sc = bpy.context.scene
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng else 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (BG, BG, BG, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.world = w
for i, (e, p) in enumerate([(3.0, (1.2, -1.6, 1.4)), (1.2, (-1.6, -0.8, 0.8)), (2.0, (0.3, 1.8, 1.6))]):
    l = bpy.data.lights.new(f'l{i}', 'AREA'); l.energy = 60 * e * (R / 0.5) ** 2; l.size = 2 * R
    lo_ = bpy.data.objects.new(f'l{i}', l); bpy.context.collection.objects.link(lo_)
    lo_.location = ctr + Vector(p) * (R * 3)
    lo_.rotation_euler = (ctr - lo_.location).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam
cam.data.angle = math.radians(30)
DIRS = {'fq': (0.75, -1.0, 0.45), 'front': (0, -1, 0.15), 'side': (1, 0, 0.15), 'bq': (-0.75, 1.0, 0.45), 'top': (0.3, -0.5, 1.4), 'lq': (-0.75, -1.0, 0.45),
        'px': (1, 0, 0.2), 'nx': (-1, 0, 0.2), 'py': (0, 1, 0.2), 'ny': (0, -1, 0.2)}  # px..ny: orientation probe (which side is the front)
outs = []
for i, v in enumerate(VIEWS):
    d = Vector(DIRS[v]).normalized()
    dist = R / math.tan(cam.data.angle / 2) * 1.08 * float(arg('--zoom', '1'))
    tgt = ctr.copy(); tz = arg('--tz')
    if tz is not None: tgt.z = lo.z + float(tz) * dims.z
    cam.location = tgt + d * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    f = f'/tmp/_rv_{os.getpid()}_{i}.png'; sc.render.filepath = f; bpy.ops.render.render(write_still=True); outs.append(f)
ins = []
ref = arg('--ref')
if ref:
    ins += ['-i', ref]
for f in outs:
    ins += ['-i', f]
n = len(outs) + (1 if ref else 0)
scale = ''.join(f'[{k}:v]scale=-2:{SIZE}[s{k}];' for k in range(n))
subprocess.run(['ffmpeg', '-v', 'error', '-y'] + ins + ['-filter_complex', scale + ''.join(f'[s{k}]' for k in range(n)) + f'hstack=inputs={n}', arg('--out')])
print('VIEWS', arg('--out'), 'tris', tris, 'dims_m', tuple(round(x, 3) for x in dims))
sys.stdout.flush(); os._exit(0)
