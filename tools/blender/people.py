"""Eight deterministic, texture-free pedestrian silhouettes for Blender 5.2.
Run at project root: Blender -b -P tools/blender/people.py
Metres, Z up, front -Y in Blender; glTF is Y up / front +Z (the street's forward).
Roots are at the feet. Limb origins are hips/shoulders, with hand markers in extras.
No modifiers, external assets, rigs, randomness, or manual .blend saves required.
"""
import json
import math
import os
from pathlib import Path
import struct
import sys
import traceback

import bpy
import bmesh
from mathutils import Vector

TAU = math.tau
MATERIAL = None


class Shape:
    """Small mesh accumulator; all points are in the person's authoring space."""
    def __init__(self):
        self.vertices = []
        self.faces = []

    def add(self, vertices, faces):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(offset + i for i in face) for face in faces)

    def loft(self, rings, sides=10):
        # (x, y, z, half-width, half-depth); shaped cross-sections, not cylinders.
        vertices = [(x + rx * math.cos(TAU * i / sides),
                     y + ry * math.sin(TAU * i / sides), z)
                    for x, y, z, rx, ry in rings for i in range(sides)]
        faces = [tuple(reversed(range(sides)))]
        for r in range(len(rings) - 1):
            for i in range(sides):
                a = r * sides + i
                b = r * sides + (i + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces.append(tuple((len(rings) - 1) * sides + i for i in range(sides)))
        self.add(vertices, faces)

    def ellipsoid(self, center, radii, sides=10, bands=6):
        x, y, z = center
        rx, ry, rz = radii
        rings = []
        for j in range(bands + 1):
            a = -math.pi / 2 + math.pi * j / bands
            # Small polar rings keep topology nondegenerate.
            r = max(.015, math.cos(a))
            rings.append((x, y, z + rz * math.sin(a), rx * r, ry * r))
        self.loft(rings, sides)

    def box(self, center, size):
        x, y, z = center
        a, b, c = (v / 2 for v in size)
        self.add([(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                  (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],
                 [(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)])

    def tube(self, points, radii, sides=8):
        points = [Vector(p) for p in points]
        vertices = []
        for j, p in enumerate(points):
            tangent = (points[min(j+1, len(points)-1)] - points[max(j-1, 0)]).normalized()
            reference = Vector((1, 0, 0)) if abs(tangent.x) < .9 else Vector((0, 1, 0))
            u = tangent.cross(reference).normalized()
            v = tangent.cross(u).normalized()
            for i in range(sides):
                a = TAU * i / sides
                vertices.append(tuple(p + radii[j] * (u * math.cos(a) + v * math.sin(a))))
        faces = [tuple(reversed(range(sides)))]
        for j in range(len(points)-1):
            for i in range(sides):
                a, b = j*sides+i, j*sides+(i+1) % sides
                faces.append((a, b, b+sides, a+sides))
        faces.append(tuple((len(points)-1)*sides+i for i in range(sides)))
        self.add(vertices, faces)

    def rod(self, a, b, r=.012, sides=6):
        self.tube([a, b], [r, r], sides)

    def wheel(self, center, radius):
        # Bicycle wheel in the YZ plane, including a visible empty centre.
        x, y, z = center
        vertices = []
        for i in range(20):
            a = TAU*i/20
            for j in range(4):
                b = TAU*j/4
                r = radius + .018*math.cos(b)
                vertices.append((x+.018*math.sin(b), y+r*math.cos(a), z+r*math.sin(a)))
        self.add(vertices, [(i*4+j, ((i+1)%20)*4+j,
                             ((i+1)%20)*4+(j+1)%4, i*4+(j+1)%4)
                            for i in range(20) for j in range(4)])
        for i in range(8):
            a = TAU*i/8
            self.rod(center, (x,y+radius*math.cos(a),z+radius*math.sin(a)), .004, 4)

    def emit(self, root, part, pivot=(0, 0, 0), hand=None, swing=0):
        data = bpy.data.meshes.new(root.name + '_' + part)
        origin = Vector(pivot)
        data.from_pydata([tuple(Vector(p)-origin) for p in self.vertices], [], self.faces)
        data.update()
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        data.materials.append(MATERIAL)
        obj = bpy.data.objects.new(root.name + '_' + part, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        obj.location = pivot
        obj['part'] = part
        obj['swing'] = swing
        if hand is not None:
            # Extras are explicitly glTF Y-up, independent of exporter node transforms.
            d = Vector(hand) - origin
            obj['hand'] = [d.x, d.z, -d.y]
        data.calc_loop_triangles()
        return obj, len(data.loop_triangles)


def build_person(index):
    names = ['umbrella_commuter', 'woman_with_bag', 'schoolchild', 'elder_with_cane',
             'bicycle_walker', 'carrying_child', 'phone_caller', 'moving_boxes']
    heights = [1.76, 1.67, 1.14, 1.60, 1.74, 1.72, 1.78, 1.80]
    h = heights[index]
    root = bpy.data.objects.new('person_' + str(index), None)
    bpy.context.collection.objects.link(root)
    root['role'] = names[index]
    root['height'] = h  # Body height, excluding umbrella/box; never normalize using props.
    root['front'] = '+Z'
    body = Shape()
    # The hunch is built into chest, neck and head, not an overall leaning root.
    lean = -.055 if index == 3 else -.018 if index in (4, 7) else 0
    shoulder = (.128 if index == 2 else .142) * h
    hem = .35 if index == 1 else .44 if index in (0, 3) else .49
    wide = 1.05 if index == 7 else .94 if index == 1 else 1.0
    body.loft([(0,.015*h,hem*h,.155*h*wide,.080*h),
               (0,.010*h,(hem+.035)*h,.153*h*wide,.081*h),
               (0,0,.60*h,.116*h*wide,.082*h),
               (0,lean*.5*h,.72*h,.139*h*wide,.100*h),
               (0,lean*h,.80*h,shoulder,.081*h),
               (0,lean*h,.835*h,.085*h,.060*h)], 12)
    body.loft([(0,lean*h,.82*h,.043*h,.042*h),
               (0,lean*h,.89*h,.042*h,.040*h)], 8)
    # Jaw, cheek, brow and skull have different sections; protruding nose gives a profile.
    head_y = (lean-.013)*h
    body.loft([(0,head_y-.009*h,.862*h,.034*h,.038*h),
               (0,head_y-.009*h,.883*h,.055*h,.053*h),
               (0,head_y,.933*h,.064*h,.061*h),
               (0,head_y+.007*h,.973*h,.056*h,.055*h),
               (0,head_y+.009*h,.993*h,.024*h,.031*h)], 10)
    body.ellipsoid((0,head_y-.061*h,.923*h),(.018*h,.021*h,.022*h), 6, 3)
    if index in (0, 3, 4):
        # Low crown and projecting brim, visibly different from a round placeholder head.
        body.loft([(0,head_y,.963*h,.070*h,.070*h),
                   (0,head_y+.003*h,1.0*h,.049*h,.053*h)], 10)
        body.box((0,head_y-.052*h,.963*h),(.145*h,.105*h,.014*h))
    elif index == 1:
        # Bob silhouette and bun behind the nape.
        body.loft([(0,head_y+.026*h,.87*h,.070*h,.050*h),
                   (0,head_y+.018*h,.95*h,.074*h,.065*h),
                   (0,head_y+.012*h,1.0*h,.032*h,.039*h)], 10)
        body.ellipsoid((0,head_y+.078*h,.92*h),(.034*h,.033*h,.035*h), 8, 4)
    else:
        body.loft([(0,head_y+.008*h,.955*h,.066*h,.064*h),
                   (-.009*h,head_y+.009*h,1.0*h,.035*h,.042*h)], 10)
    # Collar and lapels break the upper-body outline without texture/detail budgets.
    for side in (-1, 1):
        body.tube([(side*.04*h,lean*h,.84*h),(side*.075*h,(lean-.02)*h,.78*h)],
                  [.022*h,.014*h], 5)
    if index == 2:
        body.loft([(0,.10*h,.55*h,.11*h,.055*h),
                   (0,.115*h,.74*h,.12*h,.063*h),
                   (0,.105*h,.80*h,.075*h,.04*h)], 8)
        for side in (-1, 1):
            body.tube([(side*.085*h,-.062*h,.79*h),(side*.09*h,-.08*h,.67*h)], [.015*h]*2, 5)
    if index == 0:
        cx, cy, top, radius = .18*h, -.12*h, 1.25*h, .37*h
        vertices = [(cx,cy,top)]
        for r, drop in ((.55,.04),(1,.14)):
            for i in range(12):
                a = TAU*i/12
                vertices.append((cx+radius*r*math.cos(a),cy+radius*r*math.sin(a),top-drop*h))
        faces = [(0,1+i,1+(i+1)%12) for i in range(12)]
        faces += [(1+i,13+i,13+(i+1)%12,1+(i+1)%12) for i in range(12)]
        body.add(vertices, faces)
        body.rod((cx,cy,.69*h),(cx,cy,top+.025*h),.009)
    if index == 4:
        x = -.37*h
        rear, front = (x,.33*h,.32), (x,-.40*h,.32)
        body.wheel(rear,.32)
        body.wheel(front,.32)
        crank, saddle, stem = (x,-.015*h,.34), (x,.17*h,.80), (x,-.30*h,.83)
        for a, b in [(rear,crank),(rear,saddle),(saddle,crank),(saddle,stem),
                     (stem,crank),(stem,front)]:
            body.rod(a,b,.018)
        body.rod(saddle,(x,.17*h,.89),.014)
        body.box((x,.17*h,.90),(.16,.24,.045))
        body.rod(stem,(x,-.31*h,1.01),.015)
        body.rod((x-.13,-.31*h,1.01),(x+.16,-.31*h,1.01),.014)
    if index == 5:
        # Child sits across a hip: separate head, rounded jacket, two bent dangling legs.
        body.ellipsoid((.14*h,-.13*h,.69*h),(.085*h,.075*h,.13*h), 8, 5)
        body.ellipsoid((.14*h,-.14*h,.85*h),(.061*h,.060*h,.072*h), 10, 5)
        body.loft([(.14*h,-.13*h,.89*h,.065*h,.060*h),
                   (.14*h,-.13*h,.94*h,.03*h,.03*h)], 8)
        for x in (.09*h,.20*h):
            body.tube([(x,-.14*h,.61*h),(x,-.25*h,.55*h),(x,-.24*h,.43*h)],
                      [.037*h,.032*h,.023*h], 7)
            body.ellipsoid((x,-.27*h,.43*h),(.027*h,.047*h,.022*h), 6, 3)
        body.tube([(.08*h,-.14*h,.78*h),(-.03*h,-.10*h,.80*h)], [.025*h,.019*h], 6)
    if index == 7:
        # One large carton on the shoulder and a second smaller one on top.
        body.box((-.17*h,-.005*h,1.02*h),(.37*h,.32*h,.32*h))
        body.box((-.17*h,-.005*h,1.19*h),(.28*h,.28*h,.09*h))
        body.box((-.17*h,-.169*h,1.02*h),(.035*h,.006*h,.32*h))
    triangles = body.emit(root, 'body')[1]
    for side, suffix in ((-1,'l'),(1,'r')):
        hip = (side*.064*h,0,.52*h)
        leg = Shape()
        leg.loft([(side*.070*h,0,.075*h,.040*h,.037*h),
                  (side*.071*h,.012*h,.25*h,.046*h,.049*h),
                  (side*.064*h,-.008*h,.34*h,.048*h,.053*h),
                  (*hip,.064*h,.066*h)], 8)
        # Soles are exactly on z=0; toe points towards -Y.
        leg.loft([(side*.070*h,-.028*h,0,.046*h,.084*h),
                  (side*.070*h,-.028*h,.035*h,.047*h,.084*h),
                  (side*.070*h,-.008*h,.088*h,.036*h,.046*h)], 8)
        triangles += leg.emit(root, 'leg_'+suffix, hip, swing=.17 if index == 3 else .23)[1]
        shoulder_pos = (side*shoulder,lean*h,.795*h)
        elbow = (side*.17*h,-.01*h,.64*h)
        hand = (side*.17*h,-.035*h,.48*h)
        swing = .13
        if index == 0 and side == 1:
            elbow, hand, swing = (.20*h,-.01*h,.63*h),(.18*h,-.12*h,.73*h),0
        elif index == 3 and side == 1:
            elbow, hand, swing = (.18*h,-.08*h,.65*h),(.19*h,-.15*h,.53*h),.025
        elif index == 4 and side == -1:
            elbow, hand, swing = (-.23*h,-.12*h,.67*h),(-.37*h+.16,-.31*h,1.01),0
        elif index == 5:
            elbow = (side*.18*h,-.12*h,.63*h)
            hand = ((.16 if side == 1 else .02)*h,-.22*h,.62*h)
            swing = 0
        elif index == 6 and side == 1:
            elbow, hand, swing = (.24*h,-.055*h,.73*h),(.08*h,-.06*h,.93*h),0
        elif index == 7:
            elbow = (side*.23*h,-.08*h,.87*h)
            hand = ((-.29 if side == -1 else .015)*h,-.14*h,1.015*h)
            swing = 0
        elif index == 1 and side == 1:
            swing = .055
        arm = Shape()
        arm.tube([shoulder_pos, elbow, hand], [.054*h,.043*h,.028*h], 8)
        arm.ellipsoid(hand,(.029*h,.027*h,.039*h), 8, 4)
        if index == 3 and side == 1:
            arm.tube([hand,(hand[0],hand[1]-.045,.51*h),(hand[0],hand[1]-.06,.015)],
                     [.014,.013,.012], 6)
        if index == 6 and side == 1:
            arm.box((hand[0]+.015,hand[1]-.015,hand[2]),(.022,.07,.135))
        arm_obj, count = arm.emit(root, 'arm_'+suffix, shoulder_pos, hand, swing)
        triangles += count
        if index == 1 and side == 1:
            bag = Shape()
            x,y,z = hand
            bag.loft([(x,y,z-.31*h,.075*h,.038*h),(x,y,z-.12*h,.068*h,.034*h)],8)
            for dx in (-.055*h,.055*h):
                bag.rod((x+dx,y,z-.12*h),(x,y,z),.008)
            # Separate mesh attached to the same shoulder, hidden on the hand-holding side.
            obj, count = bag.emit(root, 'bag', shoulder_pos, hand, swing)
            obj['joint'] = 'arm_r'
            obj['hideWhenHolding'] = True
            triangles += count
    if triangles >= 3000:
        raise RuntimeError(f'{root.name}: {triangles} triangles exceeds strict < 3000 budget')
    root['triangles'] = triangles
    print(f'{root.name}: {names[index]}, {triangles} triangles', flush=True)


def finalize_glb(path):
    """Canonical child names within each root, and verify actual exported triangle budgets."""
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw)
    if (magic, version, length) != (b'glTF', 2, len(raw)):
        raise RuntimeError('Invalid GLB header')
    size, kind = struct.unpack_from('<I4s', raw, 12)
    if kind != b'JSON':
        raise RuntimeError('Missing JSON chunk')
    doc = json.loads(raw[20:20+size])
    nodes = doc['nodes']
    for node in nodes:
        part = node.get('extras', {}).get('part')
        if part:
            node['name'] = part
    for i in range(8):
        root = next(n for n in nodes if n.get('name') == f'person_{i}')
        children = [nodes[j] for j in root['children']]
        if not {'body','leg_l','leg_r','arm_l','arm_r'} <= {n['name'] for n in children}:
            raise RuntimeError('Missing body/limbs')
        count = 0
        for child in children:
            for prim in doc['meshes'][child['mesh']]['primitives']:
                if prim.get('mode',4) != 4:
                    raise RuntimeError('Expected triangles')
                accessor = prim.get('indices', prim['attributes']['POSITION'])
                count += doc['accessors'][accessor]['count']//3
        if count >= 3000:
            raise RuntimeError(f'person_{i}: exported {count} triangles')
    encoded = json.dumps(doc, separators=(',',':'), ensure_ascii=True).encode('utf8')
    encoded += b' ' * ((-len(encoded)) % 4)
    remainder = raw[20+size:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(remainder)) +
                     struct.pack('<I4s',len(encoded),b'JSON') + encoded + remainder)
    if path.stat().st_size > 2_000_000:
        raise RuntimeError('People pack exceeds 2 MB budget')


def main():
    global MATERIAL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    MATERIAL = bpy.data.materials.new('silhouette')
    MATERIAL.diffuse_color = (.035,.035,.035,1)
    MATERIAL.use_nodes = True
    bsdf = MATERIAL.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.035,.035,.035,1)
    bsdf.inputs['Roughness'].default_value = 1
    for i in range(8):
        build_person(i)
    path = Path('assets/models/people.glb')
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,
                              export_apply=True,export_texcoords=False,export_normals=True,
                              export_materials='EXPORT',export_animations=False,
                              export_cameras=False,export_lights=False,export_extras=True)
    finalize_glb(path)
    print(f'PASS: {path}, {path.stat().st_size:,} bytes, eight foot-origin people', flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
    sys.stderr.flush()
    sys.stdout.flush()
    os._exit(0)
