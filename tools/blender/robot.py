"""Broken surveyor robot, seated against a wall. Rigid named parts (no skinning) so three.js can animate
the eye iris and the head. Achromatic Principled materials only.

  Blender -b --factory-startup -P tools/blender/robot.py -- --out assets/models/robot.glb [--preview renders/robot.png]
  or with blender-live:  blender-live exec tools/blender/robot.py   (uses defaults, keeps the scene for renders)
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Euler

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
        # Local parenting also works before Blender refreshes matrix_world.
        c.parent = target
        c.location = cutter_fn(rr, dims)
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
    # Explicit tessellation keeps all hoses within the GLB budget.
    cu.resolution_u = 5; cu.render_resolution_u = 5
    cu.bevel_depth = radius; cu.bevel_resolution = 1; cu.use_fill_caps = True
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

def recess(target, name, loc, size, rot=(0, 0, 0)):
    """A shallow, real cut in target-local space; cutters never enter the GLB."""
    c = obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), name + '_cutter',
                 None, target, loc=loc, rot=rot)
    # Bake dimensions into vertices for a well-conditioned boolean operand.
    for v in c.data.vertices:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    mod = target.modifiers.new(name, 'BOOLEAN')
    mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'; mod.object = c
    c.hide_render = True; c.hide_viewport = True; c['cutter'] = True

def bolt(name, parent, loc, radius=0.004, normal=(0, -1, 0)):
    """Low-poly hex head and dark washer, mounted along the surface normal."""
    normal = Vector(normal).normalized()
    rot = normal.to_track_quat('Z', 'Y').to_euler()
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius * 1.45, depth=radius * 0.22),
             name + '_washer', M['rubber'], parent, loc=loc, rot=rot)
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=radius * 0.55),
             name, M['joint'], parent, loc=Vector(loc) + normal * radius * 0.28, rot=rot)

def rod(name, a, b, radius, material, parent, vertices=10):
    a, b = Vector(a), Vector(b)
    return obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b - a).length),
                    name, material, parent, loc=(a + b) / 2,
                    rot=(b - a).to_track_quat('Z', 'Y').to_euler())

def eye_hood(eye):
    """Thin open half-cylinder: shades the top, leaves iris and light path clear."""
    verts, faces = [], []
    steps = 16
    for k in range(steps + 1):
        a = math.pi * k / steps
        for radius, yy in ((0.040, -0.003), (0.040, -0.025),
                           (0.043, -0.003), (0.043, -0.025)):
            verts.append((radius * math.cos(a), yy, radius * math.sin(a)))
    for k in range(steps):
        i, j = k * 4, (k + 1) * 4
        faces.extend(((i, j, j + 1, i + 1), (i + 2, i + 3, j + 3, j + 2),
                      (i, i + 2, j + 2, j), (i + 1, j + 1, j + 3, i + 3)))
    faces.extend(((0, 1, 3, 2), (steps * 4, steps * 4 + 2, steps * 4 + 3, steps * 4 + 1)))
    # Reverse the strip winding: outside normals radial, inside normals inward.
    me = bpy.data.meshes.new('eye_hood'); me.from_pydata(verts, [], [face[::-1] for face in faces]); me.update()
    o = bpy.data.objects.new('eye_hood', me); bpy.context.collection.objects.link(o)
    o.parent = eye; me.materials.append(M['shell_dark'])

def finger(name, parent, loc, rot, length=0.07):
    """Three links inside the old straight finger envelope; two exposed knuckles."""
    grp = empty(name, parent, loc=loc, rot=rot)
    pitch = length / 3
    for k in range(3):
        rod(f'{name}_link_{k}', (0, 0, (k - 1.45) * pitch), (0, 0, (k - 0.55) * pitch),
            0.0075 - k * 0.0007, M['frame'], grp, vertices=8)
        taper_box(f'{name}_pad_{k}', (0.009, 0.003, pitch * 0.68), (0.85, 1), M['shell_dark'],
                  grp, loc=(0, -0.006, (k - 1) * pitch), bev=0.001)
    for k in range(2):
        rod(f'{name}_knuckle_{k}', (-0.007, 0, (k - 0.5) * pitch), (0.007, 0, (k - 0.5) * pitch),
            0.004, M['joint'], grp, vertices=8)
    return grp

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
    # Keep the shell_dark prefix so the existing runtime material mapper stays dark.
    M['oil'] = mat('shell_dark_oil_film', 0.045, 0.19, 0.35)

# ---------------------------------------------------------------- head with the working eye
def build_head(root):
    """Angular helmet; the working eye is a theodolite-like lens barrel protruding from the face."""
    head = empty('head', root)
    skull = taper_box('head_shell', (0.19, 0.22, 0.2), (0.86, 0.9), M['shell'], head, loc=(0, 0.01, 0.0), bev=0.045)
    smooth(skull)
    cut(skull, lambda rr, d: (-0.06 + rr.random() * 0.03, 0.02 + rr.random() * 0.05, 0.07 + rr.random() * 0.03), 2, 0.04, 11)
    taper_box('head_inner', (0.17, 0.2, 0.18), (0.86, 0.9), M['frame'], head, loc=(0, 0.015, 0.0), bev=0.03)
    face = taper_box('face_plate', (0.16, 0.03, 0.12), (0.92, 1.0), M['shell_dark'], head, loc=(0, -0.105, -0.01), bev=0.012)
    for k, (xx, zz, length, angle) in enumerate(((-0.041, -0.027, 0.035, -0.52),
                                                (-0.015, -0.032, 0.028, -0.65),
                                                (0.049, -0.033, 0.023, 0.42))):
        recess(face, f'face_scratch_{k}', (xx, -0.015, zz),
               (0.0014, 0.0026, length), rot=(0, angle, 0))
    for side in (-1, 1):
        recess(skull, f'helmet_seam_{side}', (side * 0.038, 0, 0.099), (0.002, 0.12, 0.004))
        bolt(f'face_fastener_{side}', face, (side * 0.057, -0.015, 0.033), radius=0.0028)
    # Small wet streaks on the cheek; no textures or extra coloured materials.
    for k in range(3):
        x = -0.053 + k * 0.005
        tube(f'face_oil_{k}', ((x, -0.0152, 0.011), (x + 0.002, -0.0152, -0.002),
                              (x + 0.001, -0.0152, -0.015 - k * 0.003)),
             0.00065, M['oil'], face)
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
    for k in range(7):
        obj_from(lambda: bpy.ops.mesh.primitive_torus_add(major_radius=0.033, minor_radius=0.0007,
                                                         major_segments=40, minor_segments=4),
                 f'eye_fine_ring_{k}', M['joint'], eye,
                 loc=(0, 0.027 + k * 0.0035, 0), rot=(math.pi / 2, 0, 0))
    for k in range(32):
        a = k * math.tau / 32
        inner = 0.0355 if k % 4 == 0 else 0.037
        rod(f'eye_scale_{k}', (inner * math.cos(a), -0.0084, inner * math.sin(a)),
            (0.040 * math.cos(a), -0.0084, 0.040 * math.sin(a)),
            0.00045, M['shell_dark'], eye, vertices=4)
    eye_hood(eye)
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
    for k in range(5):
        x = (k - 2) * 0.009
        tube(f'neck_wire_{k}', ((x, -0.015, -0.087), (x * 1.2, -0.024, -0.12),
                               (x * 1.1, -0.017, -0.155), (x, -0.004, -0.19)),
             0.0022, M['cable'] if k % 2 else M['frame'], head)
    for k, z in enumerate((-0.12, -0.164)):
        taper_box(f'neck_wire_clip_{k}', (0.045, 0.005, 0.005), material=M['rubber'],
                  parent=head, loc=(0, -0.019, z), bev=0.001)
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
        # Narrow seams follow the tapered sleeve, without changing its outline.
        recess(s, name + '_panel_seam', (0, -r * 0.768, -d.length * 0.18),
               (r * 1.40, r * 0.06, 0.0025))
        for side in (-1, 1):
            bolt(name + f'_rivet_{side}', s, (side * r * 0.52, -r * 0.76, -d.length * 0.14), radius=0.0028)
    # Telescoping actuator alongside each surviving limb, not a change of pose.
    x, y, length = r * 0.87, -r * 0.67, d.length
    rod(name + '_hydraulic_body', (x, y, -length * 0.31), (x, y, length * 0.03), r * 0.17, M['frame'], grp)
    rod(name + '_hydraulic_rod', (x, y, length * 0.01), (x, y, length * 0.35), r * 0.075, M['joint'], grp)
    rod(name + '_hydraulic_gland', (x, y, -0.003), (x, y, 0.009), r * 0.19, M['rubber'], grp)
    for k, z in enumerate((-length * 0.32, length * 0.35)):
        rod(name + f'_hydraulic_pin_{k}', (x - r * 0.26, y, z), (x + r * 0.18, y, z),
            r * 0.12, M['joint'], grp, vertices=8)
    for k in range(2):
        xx = -r * (0.71 + k * 0.15)
        tube(name + f'_hose_{k}', ((xx, -r * 0.58, -length * 0.42),
                                  (xx - r * 0.1, -r * 0.91, -length * 0.20),
                                  (xx - r * 0.08, -r * 0.85, length * 0.20),
                                  (xx, -r * 0.50, length * 0.42)),
             r * 0.055, M['cable'], grp)
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
    # Front skin slopes from y=-.10 to -.11; the cuts stay millimetres deep.
    slope = math.atan(0.01 / 0.26)
    for side in (-1, 1):
        recess(chest, f'chest_seam_{side}', (side * 0.115, -0.105, 0),
               (0.0025, 0.005, 0.17), rot=(slope, 0, 0))
        for k, z in enumerate((-0.067, 0.075)):
            bolt(f'chest_bolt_{side}_{k}', chest,
                 (side * 0.127, -0.105 - z * 0.01 / 0.26, z), radius=0.004)
    cut(chest, lambda rr, d: (-0.09, -0.119, 0.055), 1, 0.014, 92)
    for k in range(3):
        x = -0.096 + k * 0.009
        pts = [(x + dx, -0.105 - z * 0.01 / 0.26 - 0.0004, z)
               for dx, z in ((0, 0.061), (0.002, 0.025), (0.004, -0.016 - k * 0.006))]
        tube(f'chest_oil_{k}', pts, 0.0012, M['oil'], chest)
    back = taper_box('back_plate', (0.32, 0.06, 0.3), (1.15, 1.0), M['shell_dark'], torso, loc=(0, 0.11, 0.36), bev=0.02)
    # Slim, inset battery cassette: retained below the shoulders and within torso width.
    pack = taper_box('battery_pack', (0.22, 0.045, 0.20), (0.95, 1), M['frame'], torso,
                     loc=(0, 0.143, 0.36), bev=0.009)
    grille = taper_box('battery_grille', (0.165, 0.006, 0.115), material=M['shell_dark'],
                       parent=pack, loc=(0, 0.024, 0.012), bev=0.002)
    for k in range(7):
        recess(grille, f'battery_vent_{k}', (0, 0, -0.042 + k * 0.014), (0.137, 0.012, 0.005))
    for side in (-1, 1):
        taper_box(f'battery_strap_{side}', (0.012, 0.004, 0.18), material=M['rubber'],
                  parent=pack, loc=(side * 0.095, 0.023, 0), bev=0.001)
        for k, z in enumerate((-0.075, 0.075)):
            bolt(f'battery_bolt_{side}_{k}', pack, (side * 0.095, 0.026, z), normal=(0, 1, 0))
    tube('battery_feed', ((0.09, 0.14, 0.28), (0.12, 0.13, 0.25), (0.10, 0.08, 0.19)),
         0.005, M['cable'], torso)
    # abdomen: exposed segmented spine stack between chest and pelvis
    for k in range(4):
        seg = obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.075 - k * 0.004, depth=0.035),
                       f'abdomen_{k}', M['frame'] if k % 2 else M['joint'], torso, loc=(0, 0.02, 0.06 + k * 0.045))
        seg.scale = (1.25, 0.9, 1); bevel(seg, 0.006, 2)
    for side in (-1, 1):
        obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.012, depth=0.2), f'abdomen_piston_{side}', M['joint'], torso,
                 loc=(side * 0.1, 0.0, 0.13), rot=(0, side * 0.12, 0))
    # a chest plate torn loose, hanging from one hinge over the stomach
    hinge = empty('panel_hinge', torso, loc=(0.06, -0.115, 0.27), rot=(math.radians(-150), math.radians(12), math.radians(8)))
    panel = taper_box('panel_hanging', (0.13, 0.012, 0.16), (1.0, 1.0), M['shell'], hinge, loc=(0, 0, 0.08), bev=0.005)
    cut(panel, lambda rr, d: (0.060, 0, -0.050), 1, 0.012, 94)
    recess(panel, 'hanging_panel_score', (-0.017, -0.006, -0.016), (0.002, 0.003, 0.065), rot=(0, -0.55, 0))
    for side in (-1, 1):
        bolt(f'panel_rivet_{side}', panel, (side * 0.043, -0.006, 0.055), radius=0.003)
    # exposed ribs and spine behind the broken chest plate
    obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.03, depth=0.46), 'spine', M['frame'], torso, loc=(0, 0.03, 0.25))
    for k in range(5):
        rib = obj_from(lambda: bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.008, major_segments=24, minor_segments=6),
                       f'rib_{k}', M['frame'], torso, loc=(0, 0.0, 0.1 + k * 0.065))
        rib.scale = (1.15, 0.75, 1)
    core = obj_from(lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.035, depth=0.02),
                    'chest_light', mat('chest_core', 0.9, 0.2, 0.0, emit=(0.9, 0.9, 0.9)), torso, loc=(0.05, -0.1, 0.33), rot=(math.radians(90), 0, 0))
    # collar + head
    obj_from(lambda: bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.018, major_segments=32, minor_segments=8), 'collar', M['joint'], torso, loc=(0, 0, 0.47))
    head = build_head(torso)
    head.location = (0.01, -0.01, 0.66)
    head.rotation_euler = Euler((math.radians(24), math.radians(-6), math.radians(18)))
    # right arm: hangs, forearm rests across the thigh, hand on the ground
    sh = Vector((0.21, 0.02, 0.62))
    upperarm = limb('upperarm_R', (0.22, 0.04, 0.58), (0.26, -0.02, 0.3), 0.05, parent=root, crack_seed=31)
    shoulder = taper_box('shoulder_R_armor', (0.108, 0.090, 0.068), (0.90, 0.88), M['shell'],
                         upperarm, loc=(0, -0.003, -0.112), bev=0.014)
    recess(shoulder, 'shoulder_lap_seam', (0, -0.043, 0), (0.075, 0.004, 0.0025))
    cut(shoulder, lambda rr, d: (0.045, -0.036, 0.016), 1, 0.014, 95)
    for side in (-1, 1):
        bolt(f'shoulder_R_bolt_{side}', shoulder, (side * 0.031, -0.042, -0.008), radius=0.0032)
    limb('forearm_R', (0.26, -0.02, 0.3), (0.2, -0.3, 0.16), 0.045, parent=root, crack_seed=33)
    hand = obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), 'hand_R', M['frame'], root, loc=(0.2, -0.36, 0.13))
    hand.scale = (0.07, 0.1, 0.03); bevel(hand, 0.01)
    for f in range(3):
        finger(f'finger_{f}', root, (0.175 + f * 0.017, -0.43, 0.11), (math.radians(70 + f * 5), 0, 0))
    # Little finger is gone; its torn socket remains at the original finger base.
    missing = empty('finger_3_socket', root, loc=(0.226, -0.43, 0.11), rot=(math.radians(85), 0, 0))
    rod('finger_3_stump', (0, 0, -0.035), (0, 0, -0.024), 0.008, M['frame'], missing, vertices=8)
    rod('finger_3_broken_pin', (0, 0, -0.026), (0, 0, -0.020), 0.0026, M['joint'], missing, vertices=6)
    finger('thumb_R', root, (0.165, -0.390, 0.119), (math.radians(73), 0, -0.42), length=0.044)
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
    for side, p, angle in (('R', (0.12, -0.44, 0.171), 0.12),
                            ('L', (-0.13, -0.385, 0.408), 0.68)):
        knee = taper_box(f'knee_{side}_guard', (0.094, 0.096, 0.021), (0.82, 0.80), M['shell'],
                         root, loc=p, rot=(angle, 0, 0), bev=0.007)
        recess(knee, f'knee_{side}_seam', (0, 0.004, 0.0105), (0.063, 0.0025, 0.003))
        cut(knee, lambda rr, d: (0.039, -0.031, 0.008), 1, 0.009, 101 if side == 'R' else 102)
        for sign in (-1, 1):
            bolt(f'knee_{side}_bolt_{sign}', knee, (sign * 0.028, 0.018, 0.0105),
                 radius=0.003, normal=(0, 0, 1))
    for side, p in (('R', (0.13, -0.92, 0.05)), ('L', (-0.12, -0.68, 0.04))):
        foot = taper_box(f'foot_{side}', (0.1, 0.2, 0.07), (0.8, 0.55), M['shell_dark'], root, loc=p, rot=(math.radians(-70), 0, 0), bev=0.018)
        obj_from(lambda: bpy.ops.mesh.primitive_cube_add(size=1), f'sole_{side}', M['rubber'], foot, loc=(0, 0, -0.04)).scale = (0.1, 0.2, 0.012)

def validate_export():
    """Run by Blender at export time; static syntax checks cannot measure geometry."""
    objects = bpy.data.objects
    for name, parent in (('robot', None), ('torso', 'robot'), ('head', 'torso'), ('eye', 'head')):
        o = objects.get(name)
        if o is None or o.type != 'EMPTY' or (o.parent.name if o.parent else None) != parent:
            raise RuntimeError(f'Animation hierarchy changed: {name}')
    for k in range(8):
        pivot, blade = objects.get(f'iris_{k}'), objects.get(f'iris_blade_{k}')
        if (pivot is None or pivot.type != 'EMPTY' or pivot.parent != objects['eye']
                or blade is None or blade.type != 'MESH' or blade.parent != pivot):
            raise RuntimeError(f'Iris hierarchy changed: {k}')
    for name, parent in (('eye_core', 'eye'), ('eye_lens', 'eye'), ('chest_light', 'torso')):
        o = objects.get(name)
        if o is None or o.type != 'MESH' or o.parent != objects[parent]:
            raise RuntimeError(f'Required mesh changed: {name}')
    required = ('shell_ceramic', 'shell_dark', 'frame_metal', 'joint_metal', 'iris_blade',
                'lens_glass', 'rubber', 'cable', 'eye_core', 'eye_dead', 'chest_core')
    if any(bpy.data.materials.get(name) is None for name in required):
        raise RuntimeError('Required robot material missing')
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = 0
    for o in objects:
        if o.get('cutter') or o.type not in {'MESH', 'CURVE'}:
            continue
        evaluated = o.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    if triangles >= 70_000:
        raise RuntimeError(f'Robot exceeds triangle budget: {triangles} >= 70000')
    print('ROBOT_TRIANGLES', triangles)

def mesh_hoses():
    """Explicit conversion avoids relying on glTF's optional curve export setting."""
    curves = [o for o in bpy.data.objects if o.type == 'CURVE' and not o.get('cutter')]
    if curves:
        bpy.ops.object.select_all(action='DESELECT')
        for o in curves:
            o.select_set(True)
        bpy.context.view_layer.objects.active = curves[0]
        bpy.ops.object.convert(target='MESH')

def build(out=None, preview=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials()
    root = empty('robot')
    build_body(root)
    if out:
        mesh_hoses()
        validate_export()
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        for o in bpy.data.objects:
            o.select_set(not o.get('cutter'))
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, use_selection=True,
                                  export_texcoords=False, export_tangents=False, export_animations=False)
        size = os.path.getsize(out)
        if size >= 1_500_000:
            raise RuntimeError(f'Robot GLB exceeds size budget: {size} >= 1500000 bytes')
        print('EXPORTED', out, 'BYTES', size)

if __name__ == '__main__':
    try:
        build(arg('--out', 'assets/models/robot.glb'))
    except Exception:
        # Failed budget/export checks must also bypass Blender's crashing teardown.
        import traceback
        traceback.print_exc()
        if '-b' in sys.argv and arg('--keep') is None:
            sys.stdout.flush(); sys.stderr.flush(); os._exit(1)
        raise
    if '-b' in sys.argv and arg('--keep') is None:
        sys.stdout.flush(); os._exit(0)
