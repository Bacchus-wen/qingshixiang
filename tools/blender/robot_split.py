# Blender (-b): cut the stool off the generated robot (Tripo fused robot and stool into one surface), close both cuts,
# write the two as separate meshes ("robot", "stool") in one GLB, in model space (tools/lod-build.mjs's frame: x = the
# robot's left, y = up, z = forward, origin bottom centre, height 1.05 m). The source GLB is not changed.
#   Blender -b --python tools/blender/robot_split.py -- assets/generated/compare/studio/robot-h3.1-8k.glb \
#       assets/generated/derived/robot-split/robot_split.glb <render dir for the checks>
# How (2026-10-21, after several passes, each checked in the renders it writes):
#  - the seat: its centre and turn from the legs and its flat top, its top a plane fitted to the up-facing wood (under
#    half a millimetre of spread). The stool is the legs and rungs and everything of the seat at or below that plane;
#    all that stands on it -- the robot, the cables lying on the seat -- is cut where it meets it.
#  - Tripo sank those cables into the wood (trenches up to 3 cm deep): the seat's top skin inside the rim is replaced by
#    one flat plate (rounded like the seat's corners), its texture baked from straight above (the wood that shows; the
#    rest from the other half of the seat, turned half round). The rim and the sides stay as generated; black cable ends
#    sunk in the rim are removed.
#  - both cuts are closed (holes_fill), their texture coordinates the affine map that most of the rim agrees with.
import bpy, bmesh, math, os, sys
import numpy as np
IN, OUT, RD = sys.argv[sys.argv.index('--') + 1:][:3]
os.makedirs(RD, exist_ok=True)
K = 1.070883                                   # the source to 1.05 m tall (its bounding box is already centred, min y 0)
C = (-0.098, -0.139); ANG = math.radians(-19.8); HS = 0.20   # the seat: centre (model x, z), turn, half-size + margin
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN, merge_vertices=True)  # (UV seams split vertices in the file: joined, the only open edges are the cut)
ob = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
for o in bpy.context.selected_objects: o.select_set(False)
ob.select_set(True); bpy.context.view_layer.objects.active = ob
ob.scale = (ob.scale[0] * K, ob.scale[1] * K, ob.scale[2] * K)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
co, si = math.cos(ANG), math.sin(ANG)
# the base colour, sampled at 2K, for telling the stool's wood from what lies on it (cables black, red, cream; metal grey)
mat = ob.data.materials[0]
img = next(n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links))
small = img.copy(); small.scale(2048, 2048)
px = np.empty(2048 * 2048 * 4, np.float32); small.pixels.foreach_get(px); px = px.reshape(2048, 2048, 4)[:, :, :3]
bm0 = bmesh.new(); bm0.from_mesh(ob.data); bm0.faces.ensure_lookup_table()
uvl = bm0.loops.layers.uv.active
F = len(bm0.faces)
cen = np.array([f.calc_center_median()[:] for f in bm0.faces]); nz = np.array([f.normal.z for f in bm0.faces])
xm, ym, zm = cen[:, 0], cen[:, 2], -cen[:, 1]
dx, dz = xm - C[0], zm - C[1]; lx, lz = dx * co + dz * si, -dx * si + dz * co
inside = (np.abs(lx) < HS) & (np.abs(lz) < HS)
edge_band = np.maximum(np.abs(lx), np.abs(lz)) > 0.155          # the seat's rounded rim
cand = inside & (ym >= 0.25) & (ym < 0.345)
uvc = np.zeros((F, 2))
for i in np.nonzero(cand)[0]:
    f = bm0.faces[int(i)]; uvc[i] = np.mean([l[uvl].uv[:] for l in f.loops], axis=0)
c = px[np.clip((uvc[:, 1] % 1) * 2047, 0, 2047).astype(int), np.clip((uvc[:, 0] % 1) * 2047, 0, 2047).astype(int)]
mx_, mn_ = c.max(1), c.min(1); sat = (mx_ - mn_) / np.maximum(mx_, 1e-4)
hue = np.zeros(F); r, g, b = c[:, 0], c[:, 1], c[:, 2]
with np.errstate(invalid='ignore', divide='ignore'):
    hr = np.where(mx_ == r, ((g - b) / np.maximum(mx_ - mn_, 1e-4)) % 6, np.where(mx_ == g, (b - r) / np.maximum(mx_ - mn_, 1e-4) + 2, (r - g) / np.maximum(mx_ - mn_, 1e-4) + 4)) * 60
hue = hr
wood = (hue > 12) & (hue < 48) & (sat > 0.22) & (mx_ > 0.06) & (mx_ < 0.75)
# the seat top is flat: a plane fitted to its up-facing wood (seen in the first passes: spread under half a millimetre)
top0 = inside & (nz > 0.9) & (ym > 0.312) & (ym < 0.322) & ~edge_band
A_ = np.c_[np.ones(int(top0.sum())), xm[top0], zm[top0]]; pl, *_ = np.linalg.lstsq(A_, ym[top0], rcond=None)
hgt = ym - (pl[0] + pl[1] * xm + pl[2] * zm)
flat = inside & (nz > 0.95) & (np.abs(hgt) < 0.001)
# the seat's true centre: the middle of its flat top (the first guess, from the legs, was a few millimetres off)
mxl, mzl = (lx[flat].min() + lx[flat].max()) / 2, (lz[flat].min() + lz[flat].max()) / 2
C = (C[0] + mxl * co - mzl * si, C[1] + mxl * si + mzl * co)
dx, dz = xm - C[0], zm - C[1]; lx, lz = dx * co + dz * si, -dx * si + dz * co
inside = (np.abs(lx) < HS) & (np.abs(lz) < HS); edge_band = np.maximum(np.abs(lx), np.abs(lz)) > 0.155
hx, hz = np.abs(lx[flat]).max(), np.abs(lz[flat]).max(); half = max(hx, hz)   # (the seat is a little narrower front to back)
print('seat centre (model x, z) %.4f %.4f, flat top half-sizes %.4f x %.4f' % (C[0], C[1], hx, hz), flush=True)
INNER0 = half - 0.012
rel = np.maximum(np.abs(lx) - (hx - half), np.abs(lz) - (hz - half))   # distance measure that treats the rectangle as the square
print('seat plane y = %.4f + %.4f x + %.4f z; flat top within %.4f m of the seat centre' % (pl[0], pl[1], pl[2], half))
# the stool: legs and rungs, and everything of the seat at or below its top (within its own square); all that stands
# on the seat -- the robot, the cables lying on it -- is above the plane, and is cut where it meets it
on_seat = (np.abs(lx) < half + 0.012) & (np.abs(lz) < half + 0.012)
stool = (inside & (ym < 0.25)) | (on_seat & (hgt < 0.0015))
print('first stool', int(stool.sum()))
# islands: a piece of one label that does not touch the main body of its own label, inside the zone, takes the other
adj = [[] for _ in range(F)]
for e in bm0.edges:
    lf = e.link_faces
    if len(lf) == 2: a, b2 = lf[0].index, lf[1].index; adj[a].append(b2); adj[b2].append(a)
def flip_islands(label, main_seed):
    seen = np.zeros(F, bool); flipped = 0
    # the main body: flood from a seed far from the zone
    st_ = [main_seed]; seen[main_seed] = True
    while st_:
        x = st_.pop()
        for y in adj[x]:
            if not seen[y] and stool[y] == label: seen[y] = True; st_.append(y)
    for i in np.nonzero(cand & (stool == label) & ~seen)[0]:
        stool[i] = not label; flipped += 1
    return flipped
leg = int(np.nonzero(inside & (ym < 0.05))[0][0]); head = int(np.argmax(ym))
print('stool bits that were not the stool:', flip_islands(True, leg), ' wood that was robot:', flip_islands(False, head))
# debris: cable stubs and the like that Tripo fused into the seat at both ends -- not joined to the robot, so they would
# stay behind on the stool when it turns. Non-wood pieces of the stool that stand above the seat top: removed (and the
# seat closed over them like the other cuts). Told apart by height, not colour: the stubs are dirty brown like the wood
debris = np.zeros(F, bool); seen = np.zeros(F, bool); nd = 0
# the seat top as a plane (fitted to its flat, up-facing wood), and what stands more than a few millimetres above it
pool = stool & inside & ~edge_band & (hgt > 0.0025)
for i0 in np.nonzero(pool)[0]:
    if seen[i0]: continue
    comp = [int(i0)]; seen[i0] = True; k = 0
    while k < len(comp):
        x = comp[k]; k += 1
        for y in adj[x]:
            if pool[y] and not seen[y]: seen[y] = True; comp.append(y)
    if hgt[comp].max() > 0.004: debris[comp] = True; nd += 1
print('debris pieces on the seat:', nd, 'faces', int(debris.sum()))
# a clean seat top: Tripo sank the cables lying on the seat into the wood (trenches up to 3 cm deep, a rise of fillet
# round each). Inside the rim, the whole top skin of the seat and what hangs from it goes, down to 2.5 cm, and one flat
# patch closes it (the wood's texture runs on from the rim); what hung over the front edge outside the seat goes too.
lmax = rel
reskin = stool & (lmax < half - 0.012) & (hgt > -0.025)
overhang = stool & (lmax > half + 0.003) & (ym > 0.25) & (hgt > -0.06)
# black cable ends sunk in the front rim: not wood-coloured, in pieces of 30 faces or more (the rim's own dark specks are
# single faces)
dark = stool & (lmax > INNER0 - 0.003) & (hgt > -0.035) & ~wood & cand
seen_ = np.zeros(F, bool)
for i0 in np.nonzero(dark)[0]:
    if seen_[i0]: continue
    comp = [int(i0)]; seen_[i0] = True; k = 0
    while k < len(comp):
        x = comp[k]; k += 1
        for y in adj[x]:
            if dark[y] and not seen_[y]: seen_[y] = True; comp.append(y)
    if len(comp) >= 30: overhang[comp] = True
print('seat top skin replaced: %d faces; stool pieces outside the seat removed: %d faces' % (int(reskin.sum()), int(overhang.sum())))
mask = stool & ~debris & ~reskin & ~overhang
print('boundary edges before the cut:', sum(1 for e in bm0.edges if e.is_boundary))
bm0.free()
print('stool faces', int(mask.sum()), 'robot faces', int((~mask).sum()))
# ---- the seat top's look, baked from straight above in the seat's own frame (its flat wood only: where the robot sat
# and the cables lay there is no wood, and the hole is filled from the other half of the seat, turned half round) ----
INNER = half - 0.012; BAKE = 1024; EXT = INNER + 0.003           # the new top: 3 mm under the rim (in the rectangle measure)
EXX, EXZ = EXT + (hx - half), EXT + (hz - half)
flatw = np.nonzero(stool & (nz > 0.7) & (hgt > -0.004) & (hgt < 0.0015) & (rel < half + 0.006))[0]   # the top and its rim (no trench walls)
fl = ob.copy(); fl.data = ob.data.copy(); bpy.context.scene.collection.objects.link(fl)
bmf = bmesh.new(); bmf.from_mesh(fl.data); bmf.faces.ensure_lookup_table()
keepf = np.zeros(F, bool); keepf[flatw] = True
bmesh.ops.delete(bmf, geom=[f for f, k in zip(bmf.faces, keepf) if not k], context='FACES'); bmf.to_mesh(fl.data); bmf.free()
scb = bpy.context.scene
scb.render.engine = 'BLENDER_WORKBENCH'; scb.display.shading.light = 'FLAT'; scb.display.shading.color_type = 'TEXTURE'
scb.view_settings.view_transform = 'Standard'; scb.render.film_transparent = True
scb.render.resolution_x = scb.render.resolution_y = BAKE; scb.render.image_settings.color_mode = 'RGBA'
camb = bpy.data.objects.new('bakecam', bpy.data.cameras.new('bakecam')); scb.collection.objects.link(camb); scb.camera = camb
camb.data.type = 'ORTHO'; camb.data.ortho_scale = 2 * EXT
# camera above the seat centre, looking down, its image x along the seat's +lx, image up along the seat's -lz
cxb, cyb = C[0], -C[1]; ztop = pl[0] + pl[1] * C[0] + pl[2] * C[1]
camb.location = (cxb, cyb, ztop + 0.5)
# seat axes in Blender: lx dir = (co, -si) in (x_b, y_b)?  model (x, z) -> Blender (x, -z); lx = dx co + dz si
ex_b = np.array([co, -si])                                       # Blender direction of +lx (image right)
ang_b = math.atan2(ex_b[1], ex_b[0])
camb.rotation_euler = (0, 0, ang_b)
ob.hide_render = True
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o is not fl: o.hide_render = True
scb.render.filepath = os.path.join(RD, 'seat_bake_raw.png'); bpy.ops.render.render(write_still=True)
fl.hide_render = True
raw = bpy.data.images.load(os.path.join(RD, 'seat_bake_raw.png'))
im = np.empty(BAKE * BAKE * 4, np.float32); raw.pixels.foreach_get(im); im = im.reshape(BAKE, BAKE, 4)
have = im[:, :, 3] > 0.5; seen0 = float(have.mean())
rot = im[::-1, ::-1]; rh = have[::-1, ::-1]
fill = ~have & rh; im[fill] = rot[fill]; have |= fill               # the other half of the seat, turned half round
for _ in range(64):                                                  # what is still missing: grown in from the edges
    if have.all(): break
    acc = np.zeros_like(im); n = np.zeros(have.shape)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(np.roll(im, dy, 0), dx, 1); sv = np.roll(np.roll(have, dy, 0), dx, 1)
        acc[sv] += sh[sv]; n[sv] += 1
    grow = ~have & (n > 0); im[grow] = acc[grow] / n[grow][:, None]; have |= grow
im[:, :, 3] = 1
seat_img = bpy.data.images.new('seat_top', BAKE, BAKE); seat_img.pixels.foreach_set(im.ravel())
seat_img.filepath_raw = os.path.join(RD, 'seat_top.png'); seat_img.file_format = 'PNG'; seat_img.save()
print('seat top baked: %.0f%% wood seen, the rest filled' % (100 * seen0), flush=True)
bpy.data.objects.remove(fl); scb.render.film_transparent = False; ob.hide_render = False

st = ob.copy(); st.data = ob.data.copy(); bpy.context.scene.collection.objects.link(st)
ob.name = ob.data.name = 'robot'; st.name = st.data.name = 'stool'

def keep(o, keep_mask, cap_up):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f, k in zip(bm.faces, keep_mask) if not k], context='FACES')
    uv = bm.loops.layers.uv.active
    bnd = [e for e in bm.edges if e.is_boundary]
    # the UV of each cut vertex, from the old face it belongs to
    vuv = {}
    for e in bnd:
        for v in e.verts:
            if v.index not in vuv:
                l = next(iter(v.link_loops), None)
                if l is not None: vuv[v] = l[uv].uv.copy()
    if o is st:  # the cut round the new top (and the tenon stubs under it) stays open: the plate covers it
        def lm(e):
            m = (e.verts[0].co + e.verts[1].co) / 2; dx_, dz_ = m.x - C[0], -m.y - C[1]
            return max(abs(dx_ * co + dz_ * si) - (hx - half), abs(-dx_ * si + dz_ * co) - (hz - half))
        bnd = [e for e in bnd if lm(e) > INNER + 0.003]
    new = bmesh.ops.holes_fill(bm, edges=bnd, sides=0)['faces']
    print(o.name, 'cut edges', len(bnd), 'holes closed', len(new))
    worst = 0
    for f in new:
        # texture coordinates across the patch: the affine map (x, z) -> uv that best fits its rim, so the wood (or
        # metal) around the hole runs on across it; flat, facing up on the seat, down under the robot
        V = [v for v in f.verts if v in vuv]
        if len(V) >= 3:
            A = np.array([[v.co.x, v.co.y, v.co.z, 1.0] for v in V]); B = np.array([[vuv[v].x, vuv[v].y] for v in V])
            M, *_ = np.linalg.lstsq(A, B, rcond=None); res = np.abs(A @ M - B).max()
            if res > 0.02 and len(V) >= 12:
                # the rim crosses several texture charts: the map that most of it agrees with (RANSAC), so the patch
                # carries on one chart instead of an average of all
                rng = np.random.default_rng(1); best = None
                for _ in range(400):
                    idx = rng.choice(len(V), 4, replace=False); Mi, *_ = np.linalg.lstsq(A[idx], B[idx], rcond=None)
                    inl = np.abs(A @ Mi - B).max(1) < 0.004
                    if best is None or inl.sum() > best.sum(): best = inl
                if best.sum() >= 8:
                    M, *_ = np.linalg.lstsq(A[best], B[best], rcond=None); res = np.abs(A[best] @ M - B[best]).max()
                    if len(V) > 200: print('  %s patch: one chart for %d of %d rim vertices' % (o.name, int(best.sum()), len(V)), flush=True)
            worst = max(worst, res)
            if len(V) > 200: print('  %s patch: %d rim vertices, fit %.4f' % (o.name, len(V), res), flush=True)
            if res > 0.02: M = np.array([[0, 0], [0, 0], [0, 0], B.mean(0)])  # rim spans two charts: one colour, the rim's average
            for l in f.loops: l[uv].uv = tuple(np.array([l.vert.co.x, l.vert.co.y, l.vert.co.z, 1.0]) @ M)
        if (f.normal.z > 0) != cap_up: f.normal_flip()
    tri = bmesh.ops.triangulate(bm, faces=new)['faces']
    print(o.name, 'patch triangles', len(tri), 'worst rim fit (uv units)', round(float(worst), 4))
    bm.to_mesh(o.data); bm.free(); o.data.update()
keep(st, mask, True)
keep(ob, ~(stool | debris), False)  # (what the stool lost to its new top and its tidied edge goes nowhere)
mat_top = bpy.data.materials.new('seat_top'); mat_top.use_nodes = True
bsdf = mat_top.node_tree.nodes['Principled BSDF']; tex = mat_top.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = seat_img
mat_top.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.78; bsdf.inputs['Metallic'].default_value = 0.0
st.data.materials.append(mat_top); mi = len(st.data.materials) - 1
bmp = bmesh.new(); bmp.from_mesh(st.data); uvp = bmp.loops.layers.uv.active
# a rounded rectangle, inside the seat's own rounded corners (|lx| + |lz| on the flat top tells their radius)
rc = max(0.004, ((hx + hz) - (np.abs(lx[flat]) + np.abs(lz[flat])).max()) / (2 - math.sqrt(2)) - (half - EXT))
print('seat corner radius %.4f m; plate %.4f x %.4f, corners %.4f' % (rc + (half - EXT), EXX, EXZ, rc), flush=True)
outline = []
for k, (sx, sz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
    ccx, ccz = sx * (EXX - rc), sz * (EXZ - rc); a0 = [0, 0.5, 1, 1.5][k] * math.pi
    for j in range(9):
        a = a0 + 0.5 * math.pi * j / 8; outline.append((ccx + rc * math.cos(a), ccz + rc * math.sin(a)))
verts = []
for a_, b_ in outline:
    xm_ = C[0] + a_ * co - b_ * si; zm_ = C[1] + a_ * si + b_ * co
    verts.append(bmp.verts.new((xm_, -zm_, pl[0] + pl[1] * xm_ + pl[2] * zm_ - 0.0003)))
f0 = bmp.faces.new(verts); f0.material_index = mi
if f0.normal.z < 0: f0.normal_flip()
for f in bmesh.ops.triangulate(bmp, faces=[f0])['faces']:
    f.material_index = mi
    for l in f.loops:
        q = l.vert.co; dx_, dz_ = q.x - C[0], -q.y - C[1]; a_ = dx_ * co + dz_ * si; b_ = -dx_ * si + dz_ * co
        l[uvp].uv = ((a_ + EXT) / (2 * EXT), (EXT - b_) / (2 * EXT))   # (the bake's up is the seat's -lz)
bmp.to_mesh(st.data); bmp.free()
for o in (ob, st): print(o.name, len(o.data.polygons), 'faces; validate fixed:', o.data.validate(verbose=False))
# export both, in model space (glTF +y up)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_image_format='AUTO', export_materials='EXPORT', export_normals=True, export_texcoords=True)
print('wrote', OUT, os.path.getsize(OUT))
# checks: the stool alone from above and from its side, textured; the robot from below
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 1000
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'
def shot(name, loc, rot, scale, show):
    for o in (ob, st): o.hide_render = o not in show
    cam.location = loc; cam.rotation_euler = rot; cam.data.ortho_scale = scale
    sc.render.filepath = os.path.join(RD, name); bpy.ops.render.render(write_still=True)
cx, cy = C[0], -C[1]
shot('stool_top.png', (cx, cy, 2.0), (0, 0, 0), 0.5, [st])
shot('stool_persp.png', (cx + 1.2, cy - 1.2, 1.2), (math.radians(55), 0, math.radians(45)), 0.6, [st])
shot('stool_edge_front.png', (cx + 0.02, cy - 0.55, 0.42), (math.radians(80), 0, 0), 0.2, [st])
shot('stool_corner.png', (cx - 0.45, cy - 0.45, 0.62), (math.radians(60), 0, math.radians(-45)), 0.22, [st])
shot('robot_below.png', (cx, cy, -1.0), (math.radians(180), 0, 0), 0.75, [ob])
shot('both_front.png', (cx, -3.0, 0.35), (math.radians(90), 0, 0), 0.9, [ob, st])
os._exit(0)
