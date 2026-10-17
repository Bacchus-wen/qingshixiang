"""Stick the robot's badges onto its parts as real geometry (headless): the chrome "上海" script on the radio-head's
face panel, the red enamel "人民电器" plate on the chest (design sheet). The generated head is turned inside its own
frame, so the face direction is searched: yaw sweep, the direction with the most flat forward-facing hits wins; the
badge goes to the flat hit nearest the wanted (u, v) on that face. Badges are parented to their part.

  Blender -b --factory-startup -P tools/blender/robot_badges.py -- --in robot.glb --out robot_b.glb
        --head-img shanghai.png --body-img plaque.png [--head-uv 0.25,0.82] [--body-uv 0.7,0.3]
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix
A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=arg('--in'))
objs = {o.name: o for o in bpy.context.scene.objects}
print('OBJECTS', list(objs))

def badge_mat(name, img_path, metal, rough, clip):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(img_path)
    nt.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    if clip:
        nt.links.new(tx.outputs['Alpha'], bs.inputs['Alpha'])
        try: m.blend_method = 'CLIP'; m.alpha_threshold = 0.5
        except Exception: pass
    bs.inputs['Metallic'].default_value = metal; bs.inputs['Roughness'].default_value = rough
    return m

def place(obj, u, v, W, H, mat, off, yaw_range):
    mw = obj.matrix_world; inv = mw.inverted()
    vs = [mw @ x.co for x in obj.data.vertices]
    lo = Vector((min(p.x for p in vs), min(p.y for p in vs), min(p.z for p in vs))); hi = Vector((max(p.x for p in vs), max(p.y for p in vs), max(p.z for p in vs)))
    ctr = (lo + hi) / 2; rad = (hi - lo).length / 2
    deps = bpy.context.evaluated_depsgraph_get()
    def scan(d, N):
        d = d.normalized(); up = Vector((0, 0, 1)); r = up.cross(d).normalized(); uu = d.cross(r).normalized()  # r = viewer's right when facing the part
        hits = []
        for j in range(N + 1):
            for i in range(N + 1):
                a = (i / N - 0.5) * 2 * rad; b = (j / N - 0.5) * 2 * rad
                o = ctr + r * a + uu * b + d * rad * 1.5
                ok, loc, nor, idx = obj.ray_cast(inv @ o, (inv.to_3x3() @ (-d)).normalized(), distance=rad * 4)
                if not ok: continue
                nw = (mw.to_3x3().inverted().transposed() @ nor).normalized(); lw = mw @ loc
                hits.append((i / N, j / N, lw, nw, nw.dot(d)))
        return hits, r, uu
    best = None
    for deg in range(int(yaw_range[0]), int(yaw_range[1]) + 1, 2):  # yaw sweep about up, from Blender's -Y (= three.js +Z, the robot's front); + turns to the robot's left (+X)
        th = math.radians(deg)
        d = Vector((math.sin(th), -math.cos(th), 0))
        hits, _, _ = scan(d, 18)
        flat = sum(1 for h in hits if h[4] > 0.97)
        if best is None or flat > best[0]: best = (flat, d)
    d = best[1]
    hits, r, uu = scan(d, 40)
    flat = [h for h in hits if h[4] > 0.97]
    # the dominant plane: depth along d; keep hits within 6 mm of the median depth
    deps_ = sorted(h[2].dot(d) for h in flat); med = deps_[len(deps_) // 2]
    plane = [h for h in flat if abs(h[2].dot(d) - med) < 0.006]
    i0 = min(h[0] for h in plane); i1 = max(h[0] for h in plane); j0 = min(h[1] for h in plane); j1 = max(h[1] for h in plane)
    # wanted spot must leave room for the badge: prefer hits whose neighbourhood (badge corners) is also on the plane
    def ok_area(h):
        c = h[2]; n = h[3]; rr = r - n * r.dot(n); rr.normalize(); vv = n.cross(rr)
        for sx in (-0.5, 0.5):
            for sy in (-0.5, 0.5):
                p = c + rr * sx * W + vv * sy * H + n * 0.05
                ok, loc, nor, idx = obj.ray_cast(inv @ p, (inv.to_3x3() @ (-n)).normalized(), distance=0.12)
                if not ok or abs((mw @ loc - c).dot(n)) > 0.008: return False
        return True
    cand = sorted(plane, key=lambda h: ((h[0] - i0) / max(i1 - i0, 1e-6) - u) ** 2 + ((h[1] - j0) / max(j1 - j0, 1e-6) - v) ** 2)
    h = next((c for c in cand if ok_area(c)), cand[0])
    c, n = h[2], h[3]
    print('FACE', obj.name, 'yaw', round(math.degrees(math.atan2(d.x, -d.y)), 1), 'flat', len(plane), 'at', tuple(round(x, 3) for x in c), 'n', tuple(round(x, 2) for x in n))
    # badge quad facing n, upright
    rr = r - n * r.dot(n); rr.normalize(); vv = n.cross(rr).normalized()
    me = bpy.data.meshes.new('badge_' + obj.name); bm = bmesh.new()
    uv_l = bm.loops.layers.uv.new('UVMap')
    pts = [c + n * off + rr * sx * W / 2 + vv * sy * H / 2 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    vts = [bm.verts.new(p) for p in pts]; f = bm.faces.new(vts)
    for loop, (uu_, vv_) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): loop[uv_l].uv = (uu_, vv_)
    bm.to_mesh(me); bm.free()
    b = bpy.data.objects.new('badge_' + obj.name, me); bpy.context.collection.objects.link(b)
    me.materials.append(mat)
    b.parent = obj; b.matrix_parent_inverse = obj.matrix_world.inverted()
    return b

hu = [float(x) for x in arg('--head-uv', '0.25,0.82').split(',')]; bu = [float(x) for x in arg('--body-uv', '0.7,0.3').split(',')]
hy = [float(x) for x in arg('--head-yaw', '0,44').split(',')]; by = [float(x) for x in arg('--body-yaw', '-14,14').split(',')]
place(objs['robot_head'], *hu, 0.075, 0.0375, badge_mat('badge_shanghai', arg('--head-img'), 0.85, 0.3, True), 0.0015, hy)
place(objs['robot_body'], *bu, 0.07, 0.035, badge_mat('badge_plaque', arg('--body-img'), 0.2, 0.45, False), 0.002, by)
bpy.ops.export_scene.gltf(filepath=arg('--out'), export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=92, export_materials='EXPORT')
print('OUT', arg('--out'))
sys.stdout.flush(); os._exit(0)
