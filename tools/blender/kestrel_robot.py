"""Assemble the waggles kestrel-k1 shells (CC BY-NC 4.0, thtbee_, https://github.com/thtbee/waggles; adapted:
re-assembled, posed seated, one forearm removed, decimated, eye transplanted) into our seated, broken survey robot,
keeping the node names the runtime expects ('robot' root, 'head', 'eye', 'eye_core', 'iris_i').

  Blender -b --factory-startup -P tools/blender/kestrel_robot.py -- --src reference/waggles/kestrel-k1/assets \
      --old assets/models/robot.glb --out assets/models/robot_k1.glb [--pose seated] [--decimate 1]

The shell files only hold one (left) side, each part in its own joint frame (mm, limb pointing down -Z, front -Y
after import). Joint offsets were read off the drum rings (tools: /tmp inspection), then tuned by eye.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix, Euler

A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
SRC, OLD, OUT = arg('--src'), arg('--old'), arg('--out')
DECIMATE = arg('--decimate', '1') == '1'
S = float(arg('--scale', '1.25')) * 0.001  # mm -> m, and a bigger robot than the reference (a survey machine)
R = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

parts = {}
for f in ('body/torso.glb', 'body/head.glb', 'body/limbs.glb', 'shells.glb'):
    for o in import_glb(os.path.join(SRC, f)):
        if o.type == 'MESH': parts[o.name] = o
        else: bpy.data.objects.remove(o)

# ---------- joint frames (mm, kestrel left side) ----------
J = {
    'body': None,
    'head': ('body', (0, 4, 428)),
    'L_shoulder': ('body', (-125, 0, 342)),
    'L_elbow': ('L_shoulder', (0, 0, -330)),
    'L_wrist': ('L_elbow', (0, 0, -262)),
    'L_hip': ('body', (-111.7, 0, -39)),
    'L_knee': ('L_hip', (0, 0, -440)),
    'L_ankle': ('L_knee', (0, 0, -420)),
}
FINGERS = {'idx': (-33, 46, 33), 'mid': (-11, 50, 36), 'rng': (11, 47, 34), 'lit': (31, 40, 28)}  # x, prox len, mid len
for k, (x, lp, lm) in FINGERS.items():
    J[f'L_{k}_prox'] = ('L_wrist', (x * 0.9, 0, 100))
    J[f'L_{k}_mid'] = (f'L_{k}_prox', (0, 0, lp))
    J[f'L_{k}_dist'] = (f'L_{k}_mid', (0, 0, lm))
J['L_th_meta'] = ('L_wrist', (44, -14, 28))
J['L_th_prox'] = ('L_th_meta', (0, 0, 50))
J['L_th_dist'] = ('L_th_prox', (0, 0, 36))

def frame_of(name):
    n = name.replace('shell_', '')
    if n.startswith(('torso', 'batt', 'pelvis')): return 'body'
    if n.startswith(('head', 'neck')): return 'head'
    if n.startswith(('shld', 'uarm')): return 'L_shoulder'
    if n.startswith(('elbw', 'farm', 'forearm')): return 'L_elbow'
    if n.startswith(('wrist', 'palm')): return 'L_wrist'
    if n.startswith(('hip_', 'thgh')): return 'L_hip'
    if n.startswith(('knee', 'shin')): return 'L_knee'
    if n.startswith(('ankl', 'foot')): return 'L_ankle'
    for k in FINGERS:
        for seg in ('prox', 'mid', 'dist'):
            if n.startswith(f'{k}_{seg}'): return f'L_{k}_{seg}'
    for seg in ('meta', 'prox', 'dist'):
        if n.startswith(f'th_{seg}'): return f'L_th_{seg}'
    return None

# ---------- seated, slumped pose (degrees, XYZ euler, relative to parent) ----------
POSE = {
    'body': (-14, 0, 4),
    'head': (20, 0, -12),
    'L_shoulder': (-8, 8, 0), 'L_elbow': (0, 0, 0),
    'R_shoulder': (-38, -10, 0), 'R_elbow': (-62, 0, 0), 'R_wrist': (20, 0, 10),
    'L_hip': (-78, 6, 4), 'L_knee': (22, 0, 0), 'L_ankle': (-20, 0, 0),
    'R_hip': (-112, -4, -6), 'R_knee': (104, 0, 0), 'R_ankle': (-10, 0, 0),
}
for side in ('L', 'R'):
    for k in FINGERS:
        POSE[f'{side}_{k}_prox'] = (38, 0, 0); POSE[f'{side}_{k}_mid'] = (52, 0, 0); POSE[f'{side}_{k}_dist'] = (40, 0, 0)
    POSE[f'{side}_th_meta'] = (20, 0, -20); POSE[f'{side}_th_prox'] = (25, 0, 0)

empties = {}
def make_empty(name, parent, loc, rot):
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e)
    if parent: e.parent = empties[parent]
    e.location = Vector(loc); e.rotation_mode = 'XYZ'; e.rotation_euler = Euler([R(a) for a in rot], 'XYZ')
    empties[name] = e
    return e

root = make_empty('robot', None, (0, 0, 0), (0, 0, 0))
order = ['body', 'head', 'L_shoulder', 'L_elbow', 'L_wrist', 'L_hip', 'L_knee', 'L_ankle'] + [k for k in J if k not in ('body', 'head', 'L_shoulder', 'L_elbow', 'L_wrist', 'L_hip', 'L_knee', 'L_ankle')]
for side in ('L', 'R'):
    for name in order:
        if name in ('body', 'head') and side == 'R': continue
        n = name if side == 'L' or not name.startswith('L_') else 'R_' + name[2:]
        if n in empties: continue
        spec = J[name]
        if spec is None: make_empty(n, 'robot', (0, 0, 0), POSE.get(n, (0, 0, 0))); continue
        par, loc = spec
        par = par if side == 'L' or not par.startswith('L_') else 'R_' + par[2:]
        loc = list(loc)
        rot = list(POSE.get(n, (0, 0, 0)))
        if side == 'R' and name.startswith('L_'):
            loc[0] = -loc[0]
            if n not in POSE:  # mirror the left pose: X rotations stay, Y/Z flip
                lr = POSE.get(name, (0, 0, 0)); rot = [lr[0], -lr[1], -lr[2]]
        make_empty(n, par, loc, rot)
# the body empty sits at the waist; joint locations are mm, so scale the whole rig on the root
for e in empties.values():
    if e is not root: e.location *= 1.0
root.scale = (S, S, S)

# ---------- attach parts (left frames), then mirrored copies for the right ----------
MIRROR = Matrix.Scale(-1, 4, (1, 0, 0))
for name, o in list(parts.items()):
    fr = frame_of(name)
    if fr is None: print('unplaced', name); bpy.data.objects.remove(o); continue
    o.parent = empties[fr]; o.matrix_parent_inverse = Matrix.Identity(4)
    if fr.startswith('L_'):
        c = o.copy(); c.data = o.data.copy(); scene.collection.objects.link(c)
        c.name = name + '_R'
        # mirror the mesh about the joint frame's YZ plane (local x -> -x), keep winding outward
        c.data.transform(MIRROR); c.data.flip_normals()
        c.location = Vector((-o.location.x, o.location.y, o.location.z))
        c.parent = empties['R_' + fr[2:]]; c.matrix_parent_inverse = Matrix.Identity(4)
        o.name = name + '_L'
    elif fr in ('body', 'head') and not name.endswith('_C'):
        pass  # torso/pelvis/head shells already hold both sides

# ---------- damage: the left forearm is gone (cables hang from the elbow), a few panels are missing ----------
def drop(pred):
    for o in [o for o in scene.objects if o.type == 'MESH' and pred(o)]: bpy.data.objects.remove(o)
def under(o, e):
    p = o.parent
    while p:
        if p.name == e: return True
        p = p.parent
    return False
drop(lambda o: under(o, 'L_wrist') or (under(o, 'L_elbow') and ('forearm' in o.name or 'farm' in o.name)))
drop(lambda o: o.name.startswith(('shell_shld_cap_accent_L', 'shell_thgh_accent_R', 'shell_batt_door_accent',
                                    # panels lost over the years: the knee drums, chest plates and a calf shell show what is under them
                                    'shell_batt_door_main', 'shell_shin_front_main_L', 'shell_uarm_biceps_main_R', 'shell_head_crown_accent')))

# ---------- materials by suffix (our runtime's robotMaterial keys) ----------
def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m
MAP = [('_glass', 'eye_dead'), ('_brass', 'frame_brass'), ('_knuckle', 'joint_metal'), ('_sub', 'shell_dark'), ('_accent', 'shell_accent'), ('_main', 'shell_ceramic')]
for o in scene.objects:
    if o.type != 'MESH': continue
    key = next((v for k, v in MAP if k in o.name), 'shell_ceramic')
    o.data.materials.clear(); o.data.materials.append(mat(key))

# ---------- decimate dense parts ----------
if DECIMATE:
    for o in [o for o in scene.objects if o.type == 'MESH']:
        n = len(o.data.vertices)
        small = any(k in o.name for k in ('idx_', 'mid_', 'rng_', 'lit_', 'th_', 'palm', 'wrist'))
        target = 260 if small else 1300
        if n > target:
            mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = max(0.08, target / n)
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            o.modifiers.clear(); o.data = me

# ---------- transplant our eye (iris, lens, core) onto the visor; align to the old robot's head/back ----------
bpy.context.view_layer.update()
old = import_glb(OLD)
old_eye = next(o for o in old if o.name == 'eye')
old_head_w = old_eye.parent.matrix_world.copy()   # (named 'head.001' here: our new rig already owns 'head')
old_back = max((o.matrix_world @ Vector(c)).y for o in old if o.type == 'MESH' for c in o.bound_box)
eye_children = [o for o in old if o is not old_eye and under(o, 'eye')]

# new head: rename the kestrel head empty to 'head' (the runtime animates it)
new_head = empties['head']
ew = old_eye.matrix_world.copy()
old_eye.parent = None; old_eye.matrix_world = ew
for o in old:
    if o is old_eye or o in eye_children: continue
    bpy.data.objects.remove(o, do_unlink=True)
new_head.name = 'head'

# ground the robot (lowest point on z=0) and push its back against the old robot's wall line
bpy.context.view_layer.update()
meshes = [o for o in scene.objects if o.type == 'MESH' and not under(o, 'eye') and o.name != 'eye']
lo = min((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
back = max((o.matrix_world @ Vector(c)).y for o in meshes for c in o.bound_box)
root.location.z -= lo
root.location.y += (old_back - back)
root.location.x += old_head_w.translation.x - new_head.matrix_world.translation.x
bpy.context.view_layer.update()

# eye: on the visor's right half, flush with its front; same orientation as the head
visor = [o for o in meshes if 'visor' in o.name]
vmin_y = min((o.matrix_world @ Vector(c)).y for o in visor for c in o.bound_box) if visor else new_head.matrix_world.translation.y - 0.08
vz = sum((o.matrix_world @ Vector(c)).z for o in visor for c in o.bound_box) / max(1, 8 * len(visor)) if visor else new_head.matrix_world.translation.z
hw = new_head.matrix_world
x_axis = (hw.to_3x3() @ Vector((1, 0, 0))).normalized()
target = Vector((hw.translation.x, vmin_y + 0.012, vz - 0.01)) + x_axis * 0.032
old_eye.parent = new_head
old_eye.matrix_world = Matrix.Translation(target) @ (hw.to_quaternion().to_matrix().to_4x4()) @ Matrix.Scale(float(arg('--eye', '0.72')), 4)
print('HEAD', tuple(round(x, 3) for x in new_head.matrix_world.translation), 'EYE', tuple(round(x, 3) for x in old_eye.matrix_world.translation),
      'verts', sum(len(o.data.vertices) for o in scene.objects if o.type == 'MESH'))

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_normals=True, export_texcoords=False)
sys.stdout.flush(); os._exit(0)
