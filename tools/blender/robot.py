"""Broken surveyor robot, seated against a wall. Rigid named parts (no skinning) so three.js can animate
the eye iris and the head. Achromatic Principled materials only.

  Blender -b --factory-startup -P tools/blender/robot.py -- --out assets/models/robot.glb [--preview renders/robot.png]
  or with blender-live:  blender-live exec tools/blender/robot.py   (uses defaults, keeps the scene for renders)
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Euler, Matrix

R = random.Random(7)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default

# ---------------------------------------------------------------- helpers
def mat(name, base, rough, metal=0.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (base, base, base, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit is not None:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = 1.0
    return m

def obj_from(mesh_fn, name, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.object.select_all(action='DESELECT')
    mesh_fn()
    o = bpy.context.active_object
    o.name = name
    o.location = loc
    o.rotation_euler = Euler(rot)
    if material:
        o.data.materials.clear(); o.data.materials.append(material)
    if parent:
        o.parent = parent
    return o

def bevel(o, w=0.01, seg=2):
    m = o.modifiers.new('bevel', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'
    return o

def smooth(o):
    for p in o.data.polygons: p.use_smooth = True
    return o

def cut(target, cutter_fn, n, size, seed):
    """Knock jagged chunks out of a shell: boolean-difference with irregular icospheres."""
    rr = random.Random(seed)
    dims = target.dimensions
    for i in range(n):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size * (0.6 + rr.random() * 0.7))
        c = bpy.context.active_object
        c.scale = (1 + rr.random(), 0.6 + rr.random() * 0.6, 1 + rr.random())
        c.rotation_euler = (rr.random() * 3, rr.random() * 3, rr.random() * 3)
        c.matrix_world = target.matrix_world @ Matrix.Translation(Vector(cutter_fn(rr, dims))) @ c.matrix_basis
        b = target.modifiers.new(f'crack{i}', 'BOOLEAN'); b.operation = 'DIFFERENCE'; b.object = c; b.solver = 'EXACT'
        c.hide_render = True; c.hide_viewport = True
        c['cutter'] = True
    return target

def empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = Euler(rot)
    if parent: o.parent = parent
    return o

def tube(name, pts, radius, material, parent=None):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = radius; cu.bevel_resolution = 2
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    if parent: o.parent = parent
    return o

def taper_box(name, size, top_scale=(1, 1), material=None, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.02):
    """Box whose top face is scaled (x, y) relative to the bottom: torsos, limb shells, feet."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        if v.co.z > 0:
            v.co.x *= top_scale[0]; v.co.y *= top_scale[1]
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = Euler(rot)
    if material: o.data.materials.append(material)
    if parent: o.parent = parent
    bevel(o, bev, 3)
    return o

# ---------------------------------------------------------------- materials (achromatic)
M = {}
def materials():
    M['shell'] = mat('shell_ceramic', 0.62, 0.38)          # dirty off-white ceramic (grey in our world)
    M['shell_dark'] = mat('shell_dark', 0.08, 0.45)
    M['frame'] = mat('frame_metal', 0.22, 0.42, 0.9)       # oxidised dark steel
    M['joint'] = mat('joint_metal', 0.45, 0.3, 1.0)
    M['rubber'] = mat('rubber', 0.03, 0.75)
    M['cable'] = mat('cable', 0.05, 0.55)
    M['lens'] = mat('lens_glass', 0.02, 0.04)
    M['iris'] = mat('iris_blade', 0.12, 0.35, 1.0)
    M['eye_core'] = mat('eye_core', 0.9, 0.2, 0.0, emit=(1.0, 0.62, 0.32))
    M['dead'] = mat('eye_dead', 0.01, 0.15)

# ---------------------------------------------------------------- head with the working eye
def build_head(root):
    """Angular helmet; the working eye is a theodolite-like lens barrel protruding from the face."""
    head = empty('head', root)
    skull = taper_box('head_shell', (0.19, 0.22, 0.2), (0.86, 0.9), M['shell'], head, loc=(0, 0.01, 0.0), bev=0.045)
    smooth(skull)
    cut(skull, lambda rr, d: (-0.06 + rr.random() * 0.03, 0.02 + rr.random() * 0.05, 0.07 + rr.random() * 0.03), 2, 0.04, 11)
    taper_box('head_inner', (0.17, 0.2, 0.18), (0.86, 0.9), M['frame'], head, loc=(0, 0.015, 0.0), bev=0.03)
    face = taper_box('face_plate', (0.16, 0.03, 0.12), (0.92, 1.0), M['shell_dark'], head, loc=(0, -0.105, -0.01), bev=0.012)
    seam = obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), 'head_seam', M['frame'], head, loc=(0, -0.002, 0.06))
    seam.scale = (0.172, 0.2, 0.006)
    for side in (-1, 1):
        taper_box(f'cheek_{side}', (0.02, 0.12, 0.09), (1, 0.8), M['shell_dark'], head, loc=(side * 0.098, -0.01, -0.03), bev=0.006)
    ant = obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.006, depth=0.08), 'antenna_broken', M['joint'], head,
                   loc=(-0.06, 0.05, 0.13), rot=(0.35, -0.45, 0))
    # dead eye: a small sensor, lens shattered (dark, set into the face plate)
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.016, depth=0.012),
             'eye_dead', M['dead'], head, loc=(-0.045, -0.122, 0.0), rot=(math.radians(90), 0, 0))
    # working eye: barrel with knurled rings, 8 iris blades at the front, emissive core, lens
    eye = empty('eye', head, loc=(0.035, -0.17, 0.004))
    barrel = obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.032, depth=0.075),
                      'eye_barrel', M['frame'], eye, loc=(0, 0.03, 0), rot=(math.radians(90), 0, 0))
    bevel(barrel, 0.003, 2)
    for k, (yy, rr_) in enumerate(((0.055, 0.036), (0.02, 0.035), (-0.004, 0.038))):
        ring = obj_from(lambda: bpy.ops.mesh.primitive_torus_add(major_radius=rr_, minor_radius=0.0045, major_segments=40, minor_segments=8),
                        f'eye_ring_{k}', M['joint'], eye, loc=(0, yy, 0), rot=(math.radians(90), 0, 0))
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.02, depth=0.004),
             'eye_core', M['eye_core'], eye, loc=(0, 0.004, 0), rot=(math.radians(90), 0, 0))
    for i in range(8):
        a = i / 8 * math.tau
        # pivot on the barrel rim; three.js rotates 'iris_k' about the barrel axis to swing the blade out
        piv = empty(f'iris_{i}', eye, loc=(0.027 * math.cos(a), -0.006, 0.027 * math.sin(a)), rot=(0, -a, 0))
        blade = obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), f'iris_blade_{i}', M['iris'], piv,
                         loc=(-0.014, 0, 0.004), rot=(0, math.radians(22), 0))
        blade.scale = (0.03, 0.0012, 0.014)
        if i == 5:  # bent, stuck blade
            blade.rotation_euler = Euler((math.radians(14), math.radians(38), 0))
    lens = obj_from(lambda: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.026),
                    'eye_lens', M['lens'], eye, loc=(0, -0.002, 0))
    lens.scale = (1, 0.3, 1); smooth(lens)
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.035, depth=0.12),
             'neck', M['frame'], head, loc=(0, 0.02, -0.14))
    return head

# ---------------------------------------------------------------- body
def limb(name, a, b, r, shell=True, parent=None, crack_seed=None):
    """Segment from a to b: dark frame rod, optional ceramic sleeve, joint ball at a."""
    a, b = Vector(a), Vector(b)
    d = b - a
    mid = (a + b) / 2
    rot = d.to_track_quat('Z', 'Y').to_euler()
    grp = empty(name, parent, loc=mid, rot=rot)
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=r * 0.45, depth=d.length),
             name + '_frame', M['frame'], grp)
    if shell:
        s = taper_box(name + '_shell', (r * 2, r * 1.6, d.length * 0.78), (0.82, 0.85), M['shell'], grp, bev=r * 0.35)
        smooth(s)
        if crack_seed is not None:
            cut(s, lambda rr, dd: (r * (0.4 + rr.random() * 0.5), -r * 0.5, (rr.random() - 0.5) * d.length * 0.6), 2, r * 0.7, crack_seed)
    j = obj_from(lambda: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=r * 0.62),
                 name + '_joint', M['joint'], parent, loc=a)
    smooth(j)
    return grp

def build_body(root):
    pelvis = obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), 'pelvis', M['shell_dark'], root, loc=(0, 0.04, 0.13))
    pelvis.scale = (0.3, 0.2, 0.14); bevel(pelvis, 0.03, 3)
    torso = empty('torso', root, loc=(0, 0.06, 0.2), rot=(math.radians(-14), 0, math.radians(-4)))
    chest = taper_box('chest_shell', (0.3, 0.2, 0.26), (1.25, 1.1), M['shell'], torso, loc=(0, 0, 0.36), bev=0.035)
    smooth(chest)
    cut(chest, lambda rr, d: ((rr.random() - 0.2) * 0.14, -0.1, (rr.random() - 0.3) * 0.12), 3, 0.06, 21)
    back = taper_box('back_plate', (0.32, 0.06, 0.3), (1.15, 1.0), M['shell_dark'], torso, loc=(0, 0.11, 0.36), bev=0.02)
    # abdomen: exposed segmented spine stack between chest and pelvis
    for k in range(4):
        seg = obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.075 - k * 0.004, depth=0.035),
                       f'abdomen_{k}', M['frame'] if k % 2 else M['joint'], torso, loc=(0, 0.02, 0.06 + k * 0.045))
        seg.scale = (1.25, 0.9, 1); bevel(seg, 0.006, 2)
    for side in (-1, 1):
        obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.012, depth=0.2), f'abdomen_piston_{side}', M['joint'], torso,
                 loc=(side * 0.1, 0.0, 0.13), rot=(0, side * 0.12, 0))
    # exposed ribs and spine behind the broken chest plate
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.03, depth=0.46), 'spine', M['frame'], torso, loc=(0, 0.03, 0.25))
    for k in range(5):
        rib = obj_from(lambda: bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.008, major_segments=24, minor_segments=6),
                       f'rib_{k}', M['frame'], torso, loc=(0, 0.0, 0.1 + k * 0.065))
        rib.scale = (1.15, 0.75, 1)
    core = obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.035, depth=0.02),
                    'chest_light', mat('chest_core', 0.9, 0.2, 0.0, emit=(0.9, 0.9, 0.9)), torso, loc=(0.05, -0.1, 0.33), rot=(math.radians(90), 0, 0))
    # collar + head
    obj_from(lambda: bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.018), 'collar', M['joint'], torso, loc=(0, 0, 0.47))
    head = build_head(torso)
    head.location = (0.01, -0.01, 0.66)
    head.rotation_euler = Euler((math.radians(24), math.radians(-6), math.radians(18)))
    # right arm: hangs, forearm rests across the thigh, hand on the ground
    sh = Vector((0.21, 0.02, 0.62))
    limb('upperarm_R', (0.22, 0.04, 0.58), (0.26, -0.02, 0.3), 0.05, parent=root, crack_seed=31)
    limb('forearm_R', (0.26, -0.02, 0.3), (0.2, -0.3, 0.16), 0.045, parent=root, crack_seed=33)
    hand = obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), 'hand_R', M['frame'], root, loc=(0.2, -0.36, 0.13))
    hand.scale = (0.07, 0.1, 0.03); bevel(hand, 0.01)
    for f in range(4):
        fing = obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.008, depth=0.07), f'finger_{f}', M['frame'], root,
                        loc=(0.175 + f * 0.017, -0.43, 0.11), rot=(math.radians(70 + f * 5), 0, 0))
    # engraved height marks on the right forearm (the story's memory, kept as geometry)
    for k in range(7):
        t = 0.2 + k * 0.09
        p = Vector((0.26, -0.02, 0.3)).lerp(Vector((0.2, -0.3, 0.16)), t)
        m = obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), f'mark_{k}', M['shell_dark'], root, loc=p + Vector((0.0, 0.0, 0.043)))
        m.scale = (0.05 if k % 3 else 0.075, 0.004, 0.002)
        m.rotation_euler = Euler((math.radians(-26), 0, math.radians(-12)))
    # left shoulder: torn socket with cables spilling to the ground
    stub = obj_from(lambda: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.06), 'shoulder_L_stub', M['joint'], root, loc=(-0.22, 0.05, 0.6))
    cut(stub, lambda rr, d: (-0.05, -0.01, -0.02), 1, 0.05, 41)
    for c in range(5):
        rr = random.Random(50 + c)
        pts = [Vector((-0.23, 0.05, 0.6)), Vector((-0.3 - rr.random() * 0.05, 0.0, 0.42)), Vector((-0.33 - rr.random() * 0.1, -0.05 - rr.random() * 0.1, 0.12)),
               Vector((-0.35 - rr.random() * 0.25, -0.15 - rr.random() * 0.25, 0.012))]
        tube(f'cable_L_{c}', pts, 0.006 + rr.random() * 0.006, M['cable'], root)
    # legs: right extended, left knee raised
    limb('thigh_R', (0.1, 0.0, 0.12), (0.12, -0.44, 0.13), 0.065, parent=root, crack_seed=61)
    limb('shin_R', (0.12, -0.44, 0.13), (0.13, -0.86, 0.07), 0.055, parent=root)
    limb('thigh_L', (-0.1, 0.0, 0.12), (-0.13, -0.36, 0.38), 0.065, parent=root)
    limb('shin_L', (-0.13, -0.36, 0.38), (-0.12, -0.62, 0.06), 0.055, parent=root, crack_seed=63)
    for side, p in (('R', (0.13, -0.92, 0.05)), ('L', (-0.12, -0.68, 0.04))):
        foot = taper_box(f'foot_{side}', (0.1, 0.2, 0.07), (0.8, 0.55), M['shell_dark'], root, loc=p, rot=(math.radians(-70), 0, 0), bev=0.018)
        obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), f'sole_{side}', M['rubber'], foot, loc=(0, 0, -0.04)).scale = (0.1, 0.2, 0.012)

def build(out=None, preview=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials()
    root = empty('robot')
    build_body(root)
    if out:
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        for o in bpy.data.objects:
            o.select_set(not o.get('cutter'))
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, use_selection=True)
        print('EXPORTED', out)

if __name__ == '__main__':
    build(arg('--out', 'assets/models/robot.glb'))
    if '-b' in sys.argv and arg('--keep') is None:
        sys.stdout.flush(); os._exit(0)
