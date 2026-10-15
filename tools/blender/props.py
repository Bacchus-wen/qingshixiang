"""Deterministic, texture-free street props. Run from the project root:
Blender -b --factory-startup -P tools/blender/props.py -- --out assets/models/props

Authoring coordinates: Z up, front -Y, metres. glTF export converts to +Y up.
Each GLB has an identity root at the centre of its ground-plane bounding box.
Named child meshes keep independent material slots for runtime replacement.
No external assets, image textures, random modifiers, or paid services.
"""
import argparse
from collections import defaultdict
import math
import os
from pathlib import Path
import random
import sys
import traceback

import bpy
from mathutils import Matrix, Vector

SEED = 73147
TAU = math.tau
M = {}


def material(name, value, roughness, metalness=0.0, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (value, value, value, 1)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (value, value, value, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['IOR'].default_value = 1.46
    return mat


def init_materials():
    for name, values in {
        'paint': (.27, .64, .35),
        'paint_chipped': (.12, .82, .55),
        'rubber': (.025, .93, 0),
        'glass': (.15, .25, 0, .24),
        'metal_dark': (.065, .69, .72),
        'metal_edge': (.34, .38, .85),
        'plastic': (.075, .72, 0),
        'paper': (.36, .98, 0),
        'paper_ink': (.11, .99, 0),
        'cloth': (.105, .96, 0),
        'panel': (.52, .49, 0),
        'bulb': (.72, .28, 0),
    }.items():
        M[name] = material(name, *values)


def mesh(name, verts, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj['part'] = name
    data.materials.append(M[mat])
    for poly in data.polygons:
        poly.use_smooth = smooth
    return obj


def bevel(obj, width=.012, segments=2):
    mod = obj.modifiers.new('soft_worn_edges', 'BEVEL')
    mod.width = width
    mod.segments = segments
    return obj


def box(name, pos, size, mat, edge=.008):
    x, y, z = (v / 2 for v in size)
    verts = [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
             (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)]
    faces = [(3,2,1,0), (0,1,5,4), (1,2,6,5), (2,3,7,6),
             (3,0,4,7), (4,5,6,7)]
    obj = mesh(name, verts, faces, mat)
    obj.location = pos
    if edge:
        bevel(obj, min(edge, min(size) * .22))
    return obj


def tube(name, points, radius, mat, sides=6, caps=True):
    """Parallel-ish frames, adequate for short bent metal tubes; no curves to export."""
    points = [Vector(p) for p in points]
    verts, faces = [], []
    for i, p in enumerate(points):
        tangent = (points[min(i+1, len(points)-1)] - points[max(i-1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((0, 1, 0))
        u = tangent.cross(ref).normalized()
        v = tangent.cross(u).normalized()
        for j in range(sides):
            a = TAU * j / sides
            verts.append(tuple(p + radius * (math.cos(a)*u + math.sin(a)*v)))
    for i in range(len(points)-1):
        for j in range(sides):
            k = i*sides+j
            n = i*sides+(j+1)%sides
            faces.append((k, n, n+sides, k+sides))
    if caps:
        faces += [tuple(reversed(range(sides))), tuple(range(len(verts)-sides, len(verts)))]
    return mesh(name, verts, faces, mat, smooth=True)


def rod(name, a, b, radius, mat, sides=8):
    return tube(name, [a, b], radius, mat, sides)


def ring(name, centre, major, minor, mat, axis='Z', segments=32, sides=6):
    verts, faces = [], []
    for i in range(segments):
        a = TAU*i/segments
        for j in range(sides):
            b = TAU*j/sides
            r = major + minor*math.cos(b)
            p = (r*math.cos(a), r*math.sin(a), minor*math.sin(b))
            if axis == 'X':
                p = (p[2], p[0], p[1])
            elif axis == 'Y':
                p = (p[0], p[2], -p[1])
            verts.append(tuple(centre[k]+p[k] for k in range(3)))
    for i in range(segments):
        for j in range(sides):
            faces.append((i*sides+j, ((i+1)%segments)*sides+j,
                          ((i+1)%segments)*sides+(j+1)%sides, i*sides+(j+1)%sides))
    return mesh(name, verts, faces, mat, True)


def sheet(name, verts, faces, mat, thickness=.003):
    obj = mesh(name, verts, faces, mat)
    if thickness:
        mod = obj.modifiers.new('sheet_thickness', 'SOLIDIFY')
        mod.thickness = thickness
        mod.offset = 0
    return obj


def rotate_objects(objects, angle, axis, pivot=(0, 0, 0)):
    transform = (Matrix.Translation(Vector(pivot)) @ Matrix.Rotation(angle, 4, axis)
                 @ Matrix.Translation(-Vector(pivot)))
    bpy.context.view_layer.update()
    for obj in objects:
        obj.matrix_world = transform @ obj.matrix_world


def car():
    # Lower sill hull; cabin sides are constructed separately, leaving an actual door opening.
    levels = [(.23, .71, 1.91), (.42, .86, 2.04), (.69, .86, 2.04), (.78, .80, 1.94)]
    verts = [(x*w, y*l, z) for z,w,l in levels for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    faces = [(3,2,1,0), (12,13,14,15)]
    for k in range(3):
        for j in range(4):
            faces.append((k*4+j,k*4+(j+1)%4,(k+1)*4+(j+1)%4,(k+1)*4+j))
    bevel(mesh('body', verts, faces, 'paint'), .028)
    # Dark opening occupies the waist-to-roof region and is not occluded by a cabin box.
    box('body', (0, .08, .80), (1.43, 1.86, .08), 'rubber')
    box('body', (0, -1.42, .84), (1.60, 1.10, .13), 'paint', .045)
    box('body', (0, 1.55, .85), (1.60, .90, .16), 'paint', .03)
    for y in [-2.06, 2.06]:
        box('body', (0,y,.47), (1.69,.08,.14), 'metal_dark', .025)
    box('body', (0,-2.055,.70), (.78,.028,.15), 'metal_dark')
    for x in [-.60, .60]:
        box('body', (x,-2.05,.75), (.33,.035,.16), 'glass', .018)
        box('body', (x,2.05,.73), (.30,.025,.12), 'plastic')
    for x in [-.27,-.18,-.09,0,.09,.18,.27]:
        box('body', (x,-2.075,.70), (.025,.012,.11), 'metal_edge', 0)
    # Seats, dashboard, wheel visible through the open left-hand door.
    for x in [-.38,.38]:
        box('body', (x,.04,.91), (.52,.57,.16), 'plastic', .045)
        seat = box('body', (x,.31,1.09), (.52,.14,.47), 'plastic', .04)
        seat.rotation_euler.x = -.12
    box('body', (0,-.66,.99), (1.42,.22,.15), 'plastic')
    ring('body', (-.39,-.52,1.12), .14,.013,'rubber', 'Y', 20)
    # Cabin pillars and closed side windows; left front window travels with its door.
    for s in [-1,1]:
        rod('body',(s*.81,-.83,.88),(s*.66,-.42,1.43),.034,'paint')
        rod('body',(s*.81,1.10,.88),(s*.66,.76,1.43),.038,'paint')
        rod('body',(s*.80,.31,.82),(s*.67,.27,1.43),.027,'paint')
        box('body',(s*.82,.70,.83),(.055,.74,.24),'paint')
        sheet('glass',[(s*.80,.36,.96),(s*.80,1.00,.96),
                       (s*.665,.73,1.39),(s*.665,.32,1.39)],[(0,1,2,3)],'glass')
        if s == 1:
            box('body',(s*.82,-.26,.83),(.055,1.04,.24),'paint')
            sheet('glass',[(.80,-.78,.97),(.80,.26,.97),(.665,.25,1.39),
                           (.665,-.40,1.39)],[(0,1,2,3)],'glass')
    sheet('glass',[(-.65,.78,1.40),(.65,.78,1.40),(.79,1.08,.94),(-.79,1.08,.94)],
          [(0,1,2,3)],'glass')
    # Roof is a deformed grid: a low, broad rainwater depression, not a box on top.
    verts, faces = [], []
    nx, ny = 10, 10
    for j in range(ny+1):
        y = -.43 + 1.21*j/ny
        for i in range(nx+1):
            x = -.69 + 1.38*i/nx
            dent = .085*math.exp(-((x-.12)/.37)**2-((y-.20)/.37)**2)
            z = 1.46 + .025*(1-(x/.69)**2) - dent
            verts.append((x,y,z))
    for j in range(ny):
        for i in range(nx):
            a = j*(nx+1)+i
            faces.append((a,a+1,a+nx+2,a+nx+1))
    sheet('body',verts,faces,'paint',.018)
    # Broken windshield: separated radial shards with a missing impact centre.
    def windshield(u,v):
        return Vector(((u-.5)*(1.58-.26*v), -.84+.41*v, .94+.47*v))
    impact = Vector((.62,.42))
    border = [(0,0),(.28,0),(.74,0),(1,0),(1,.48),(1,1),(.59,1),(.20,1),(0,1),(0,.42)]
    for i in range(len(border)):
        a, b = Vector(border[i]), Vector(border[(i+1)%len(border)])
        aa, bb = impact+(a-impact)*.16, impact+(b-impact)*.16
        # Thin gaps between panes are the primary fracture; dark branches accent the reading.
        va = a*.987 + impact*.013
        vb = b*.987 + impact*.013
        points = [windshield(*p) for p in [va,vb,bb,aa]]
        sheet('glass',points,[(0,1,2,3)],'glass',.002)
        line = [windshield(*a),windshield(*(impact+(a-impact)*.49)),windshield(*aa)]
        line = [p+Vector((0,-.003,.003)) for p in line]
        tube('glass_cracks',line,.0022,'metal_dark',4)
    before = set(bpy.context.scene.objects)
    box('door_fl',(-.825,-.25,.84),(.055,1.08,.29),'paint',.018)
    sheet('door_fl',[(-.81,-.78,.98),(-.81,.26,.98),(-.67,.25,1.39),(-.67,-.40,1.39)],
          [(0,1,2,3)],'glass')
    for a,b in [((-.81,-.78,.97),(-.67,-.40,1.40)),
                ((-.67,-.40,1.40),(-.67,.26,1.40)),
                ((-.67,.26,1.40),(-.81,.27,.97))]:
        rod('door_fl',a,b,.018,'paint')
    box('door_fl',(-.865,.11,.91),(.025,.15,.027),'metal_edge')
    box('door_fl',(-.93,-.65,1.05),(.19,.12,.08),'metal_dark')
    rotate_objects(set(bpy.context.scene.objects)-before,math.radians(50),'Z',(-.825,-.79,.72))
    # Roll body toward the two deflated driver-side tyres. Wheels stay grounded independently.
    rotate_objects(list(bpy.context.scene.objects),math.radians(-2.3),'Y',(0,0,.42))
    for s in [-1,1]:
        for y, suffix in [(-1.30,'f'),(1.31,'r')]:
            name = 'wheel_'+suffix+('l' if s == -1 else 'r')
            flat = s == -1
            zc = .225 if flat else .325
            tyre = ring(name,(s*.84,y,zc),.235,.095,'rubber','X',28,8)
            for v in tyre.data.vertices:
                dz = v.co.z-zc
                if flat:
                    v.co.z = max(.018, zc+dz*.76)
                    v.co.x += s*.028*max(0, -dz/.33)
            rod(name,(s*.76,y,zc),(s*.96,y,zc),.165,'metal_dark',20)
            ring(name,(s*.968,y,zc),.125,.012,'metal_edge','X',20)
            for k in range(5):
                a = TAU*k/5
                rod(name,(s*.972,y,zc),(s*.972,y+.13*math.cos(a),zc+.13*math.sin(a)),.016,'metal_edge')
    # Patches are shallow geometry, not textures.
    for x,y in [(.55,-1.61),(-.52,-1.13),(.46,1.60)]:
        mesh('body',[(x,y,.915),(x+.17,y+.035,.916),(x+.11,y+.12,.916),(x-.04,y+.09,.915)],
             [(0,1,2,3)],'paint_chipped')


def vending():
    # Outer dimensions 0.90 x 0.75 x 1.85 m; visible recesses have actual depth.
    box('body',(0,.315,.925),(.90,.12,1.85),'paint',.025)
    box('body',(-.42,0,.925),(.06,.63,1.85),'paint',.014)
    for z in [.045,1.805]:
        box('body',(0,0,z),(.90,.75,.09),'paint',.016)
    # Right wall is a closed deformed sheet: broad inward impact with a sharp crease.
    verts, faces = [], []
    n, m = 8, 12
    for j in range(m+1):
        z = .09+1.67*j/m
        for i in range(n+1):
            y = -.375+.69*i/n
            dent = .075*math.exp(-((y+.02)/.18)**2-((z-.78)/.30)**2)
            dent += .017*math.exp(-((y+.08)/.045)**2-((z-.90)/.34)**2)
            verts.append((.45-dent,y,z))
    for j in range(m):
        for i in range(n):
            a=j*(n+1)+i
            faces.append((a,a+1,a+n+2,a+n+1))
    sheet('body',verts,faces,'paint',.012)
    box('body',(0,-.312,.96),(.79,.06,1.58),'metal_dark')
    box('body',(-.075,-.350,1.14),(.62,.045,1.16),'rubber')
    box('panel',(-.075,-.375,1.15),(.55,.010,1.08),'panel',.012)
    for z in [.82,1.15,1.48]:
        box('display_shelves',(-.075,-.387,z-.13),(.53,.012,.016),'metal_dark',0)
        for x in [-.25,-.09,.07]:
            box('display_products',(x,-.390,z),(.085,.018,.17),'plastic',.014)
            box('display_products',(x,-.402,z+.005),(.075,.004,.065),'paper',0)
    for i in range(6):
        z = 1.49-i*.135
        rod('buttons',(.32,-.354,z),(.32,-.392,z),.027,'metal_edge',12)
    box('buttons',(.32,-.374,.60),(.075,.015,.018),'rubber',0)
    # Black recessed pocket, raised lip and top flap frame the delivery aperture.
    box('pickup',(0,-.318,.29),(.63,.012,.24),'rubber')
    for x in [-.335,.335]:
        box('pickup',(x,-.352,.29),(.035,.046,.28),'metal_dark')
    box('pickup',(0,-.355,.16),(.69,.04,.04),'metal_edge')
    flap=box('pickup',(0,-.355,.40),(.65,.055,.055),'paint')
    flap.rotation_euler.x=-.25
    for i in range(9):
        box('vent',(-.29+i*.07,-.377,.075),(.036,.01,.024),'metal_dark',0)


def umbrella(broken=False):
    radius=.57 if broken else .62
    sectors, subdivisions, rings=8,4,5
    def point(a,r):
        scallop=1-.06*math.sin(4*a)**2*r**3
        if broken:
            z=.30*r**1.35 + .07*math.sin(a*3+.3)*r + .025*math.sin(a*9)*r*r
            if 1.5<a<3.8:
                z-=.17*r*r
        else:
            z=1.02-.30*r**1.45-.026*math.sin(4*a)**2*r
        return (radius*r*math.cos(a)*scallop,radius*r*math.sin(a)*scallop,z)
    for sector in range(sectors):
        verts,faces=[],[]
        for j in range(rings+1):
            for i in range(subdivisions+1):
                a=TAU*(sector+i/subdivisions)/sectors
                verts.append(point(a,max(.018,j/rings)))
        for j in range(rings):
            for i in range(subdivisions):
                # Ragged, genuinely open holes; no transparent decal.
                if (sector==2 and j in [2,3] and i in [1,2]) or (broken and sector==4 and j>=3):
                    continue
                a=j*(subdivisions+1)+i
                faces.append((a,a+1,a+subdivisions+2,a+subdivisions+1))
        sheet('canopy',verts,faces,'cloth',.002)
        a=TAU*sector/sectors
        pts=[point(a,j/rings) for j in range(rings+1)]
        if broken and sector in [2,5]:
            # Exactly two broken ribs: missing connection and displaced bent outer fragment.
            tube('ribs',pts[:3],.006,'metal_edge')
            end=Vector(pts[3])+Vector((.06,-.025,-.035))
            tube('ribs',[end,end+Vector((.07,.025,-.05)),Vector(pts[-1])+Vector((.10,0,-.06))],.005,'metal_dark')
        else:
            tube('ribs',pts,.006,'metal_edge')
        hub=(0,0,.21 if broken else .72)
        rod('ribs',hub,pts[3],.0045,'metal_dark',5)
    if broken:
        tube('shaft',[(0,0,0),(0,0,.40),(.055,0,.80)],.012,'metal_edge',10)
        handle_start=Vector((.055,0,.80))
        pts=[handle_start+Vector((.065*(1-math.cos(math.pi*i/12)),0,.065*math.sin(math.pi*i/12))) for i in range(13)]
        tube('handle',pts,.022,'rubber',8)
        rotate_objects(list(bpy.context.scene.objects),math.radians(73),'Y')
    else:
        rod('shaft',(0,0,.12),(0,0,1.08),.012,'metal_edge',10)
        pts=[(.065*(1-math.cos(math.pi*i/12)),0,.12-.065*math.sin(math.pi*i/12)) for i in range(13)]
        tube('handle',pts,.022,'rubber',8)
        rotate_objects(list(bpy.context.scene.objects),math.radians(32),'Y')


def ac_unit():
    box('housing',(0,.025,.40),(.88,.32,.57),'paint',.026)
    box('fan_recess',(-.13,-.145,.40),(.51,.022,.51),'rubber',.06)
    rod('fan',(-.13,-.17,.40),(-.13,-.21,.40),.06,'metal_edge',16)
    for k in range(7):
        a=TAU*k/7
        verts=[]
        for r,angle,y in [(.055,a,-.191),(.19,a+.15,-.185),(.205,a+.48,-.198),(.09,a+.55,-.206)]:
            verts.append((-.13+r*math.cos(angle),y,.40+r*math.sin(angle)))
        sheet('fan',verts,[(0,1,2,3)],'metal_dark',.007)
    for r in [.095,.145,.195,.24]:
        ring('grille',(-.13,-.226,.40),r,.0045,'metal_edge','Y',32,5)
    for k in range(8):
        a=TAU*k/8
        rod('grille',(-.13,-.232,.40),(-.13+.24*math.cos(a),-.232,.40+.24*math.sin(a)),.004,'metal_dark',5)
    for i in range(10):
        box('grille',(.32,-.145,.19+i*.044),(.11,.018,.014),'metal_dark',0)
    for x in [-.31,.31]:
        box('brackets',(x,.02,.085),(.045,.48,.04),'metal_dark')
        box('brackets',(x,.235,.25),(.045,.035,.37),'metal_dark')
        rod('brackets',(x,-.15,.09),(x,.23,.40),.014,'metal_dark')
        box('feet',(x,0,.126),(.09,.16,.04),'rubber')
    tube('pipes',[(.43,.12,.27),(.54,.12,.27),(.57,.18,.23),(.57,.26,.17)],.018,'metal_edge')


def debris():
    # A collapsed carton: creased corrugation and folded flaps, open ends.
    x,y=-.67,0
    verts=[(x-.31,y-.21,.035),(x+.30,y-.22,.02),(x+.29,y+.22,.035),(x-.30,y+.21,.02),
           (x-.25,y-.18,.13),(x+.27,y-.17,.10),(x+.23,y+.19,.18),(x-.28,y+.17,.16),
           (x-.02,y-.18,.07),(x-.02,y+.18,.10)]
    sheet('carton',verts,[(0,1,5,8,4),(3,7,9,6,2),(4,8,9,7),(8,5,6,9)],'paper',.006)
    sheet('carton',[(x-.25,y-.18,.13),(x+.27,y-.17,.10),(x+.34,y-.39,.025),(x-.20,y-.40,.04)],
          [(0,1,2,3)],'paper',.005)
    sheet('carton',[(x-.28,y+.17,.16),(x+.23,y+.19,.18),(x+.12,y+.36,.02),(x-.34,y+.30,.035)],
          [(0,1,2,3)],'paper',.005)
    rod('carton',(x-.02,y-.17,.075),(x-.02,y+.17,.105),.003,'paper_ink',4)
    # An open plastic crate with actual lattice openings on all four sides.
    cx,cy=.12,.16
    box('crate',(cx,cy,.035),(.46,.36,.035),'plastic')
    for z in [.065,.15,.235,.29]:
        for yy in [-.18,.18]:
            box('crate',(cx,cy+yy,z),(.46,.018,.018),'plastic',.003)
        for xx in [-.23,.23]:
            box('crate',(cx+xx,cy,z),(.018,.36,.018),'plastic',.003)
    for i in range(7):
        xx=cx-.216+i*.072
        for yy in [-.18,.18]:
            box('crate',(xx,cy+yy,.17),(.012,.016,.24),'plastic',.002)
    for i in range(5):
        yy=cy-.16+i*.08
        for xx in [-.23,.23]:
            box('crate',(cx+xx,yy,.17),(.016,.012,.24),'plastic',.002)
    # Buckled bicycle wheel lying almost flat, with hub and individually visible spokes.
    before=set(bpy.context.scene.objects)
    center=(.68,-.30,.06)
    ring('bicycle_wheel',center,.31,.018,'rubber',segments=40)
    rim=ring('bicycle_wheel',center,.286,.009,'metal_edge',segments=40)
    for v in rim.data.vertices:
        a=math.atan2(v.co.y-center[1],v.co.x-center[0])
        v.co.z+=.012*math.sin(3*a)
    rod('bicycle_wheel',(.68,-.30,.025),(.68,-.30,.095),.024,'metal_dark',12)
    for i in range(24):
        a=TAU*i/24
        rod('bicycle_wheel',(.68,-.30,.055+(.025 if i%2 else -.025)),
            (.68+.284*math.cos(a),-.30+.284*math.sin(a),.06+.012*math.sin(3*a)),.0018,'metal_edge',4)
    rotate_objects(set(bpy.context.scene.objects)-before,.12,'Y',center)
    # Wet, thin flyers have curled corners and small geometry-only ink marks.
    rng=random.Random(SEED)
    for layer in range(8):
        cx=-.03+rng.uniform(-.035,.035)
        cy=-.44+rng.uniform(-.025,.025)
        z=.012+layer*.0035
        verts=[(cx-.145,cy-.105,z),(cx+.145,cy-.105,z+.006),
               (cx+.145,cy+.105,z+.013),(cx-.145,cy+.105,z-.003),(cx,cy,z-.004)]
        sheet('flyers',verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'paper',.001)
        if layer==7:
            for i in range(5):
                box('flyers',(cx-.02,cy-.064+i*.025,z+.006),(.17 if i else .22,.006,.0008),'paper_ink',0)


def lamp_head():
    # Shallow old pressed-metal hood, with an open underside and visible tube.
    verts=[(-.40,-.17,.13),(.40,-.17,.13),(.40,.17,.13),(-.40,.17,.13),
           (-.31,-.11,.25),(.31,-.11,.25),(.31,.11,.25),(-.31,.11,.25)]
    hood=sheet('shade',verts,[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],'paint',.012)
    bevel(hood,.012)
    box('reflector',(0,0,.175),(.65,.23,.015),'metal_edge')
    for y in [-.17,.17]:
        box('shade',(0,y,.13),(.80,.015,.028),'metal_dark')
    for x in [-.28,.28]:
        box('sockets',(x,0,.12),(.06,.09,.08),'plastic')
    rod('bulb',(-.26,0,.10),(.26,0,.10),.026,'bulb',16)
    tube('mount',[(.28,.09,.21),(.46,.12,.24),(.54,.12,.24)],.034,'metal_dark',10)


def traffic_light():
    box('housing',(0,.04,.49),(.32,.24,.98),'metal_dark',.035)
    box('face',(0,-.092,.49),(.275,.025,.91),'plastic',.018)
    for name,z,value in [('lamp_r',.79,.24),('lamp_y',.49,.40),('lamp_g',.19,.18)]:
        M[name]=material(name,value,.31)
        rod(name,(0,-.108,z),(0,-.129,z),.101,name,24)
        ring('bezels',(0,-.131,z),.107,.009,'rubber','Y',24)
        # Half-cylinder visor, open at the bottom, with a battered projecting rim.
        verts,faces=[],[]
        for y in [-.108,-.285]:
            for i in range(13):
                a=math.pi*i/12
                verts.append((.125*math.cos(a),y,z+.125*math.sin(a)))
        for i in range(12):
            faces.append((i,i+1,i+14,i+13))
        sheet('visors',verts,faces,'metal_dark',.008)
    for z in [.23,.76]:
        box('mount',(0,.22,z),(.11,.16,.055),'metal_dark')
        ring('mount',(0,.30,z),.055,.011,'metal_edge',segments=16)


def bake_and_pack(asset):
    """Apply every modifier, then combine by semantic part, reducing GLB node overhead."""
    objects=list(bpy.context.scene.objects)
    for obj in objects:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.update()
    points=[obj.matrix_world @ v.co for obj in objects for v in obj.data.vertices]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    offset=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    groups=defaultdict(list)
    for obj in objects:
        obj.location-=offset
        groups[obj['part']].append(obj)
    root=bpy.data.objects.new(asset,None)
    bpy.context.collection.objects.link(root)
    root['units']='metres'
    root['seed']=SEED
    for name, group in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:
            obj.select_set(True)
        obj=group[0]
        bpy.context.view_layer.objects.active=obj
        if len(group)>1:
            bpy.ops.object.join()
        # Every part uses the common origin; no negative scale or unbaked object rotation.
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        obj.name=name
        obj.data.name=name+'_mesh'
        obj.parent=root
        # Consistent outward normals after hand-built sheets and lofts.
        import bmesh
        bm=bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
    count=0
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            obj.data.calc_loop_triangles()
            count+=len(obj.data.loop_triangles)
    root['triangles']=count
    return count, tuple(round(high[i]-low[i],4) for i in range(3))


def verify_glb(path):
    """Read the actual exported container, not just the pre-export Blender mesh."""
    import json
    import struct
    with path.open('rb') as stream:
        magic,version,length=struct.unpack('<4sII',stream.read(12))
        if magic!=b'glTF' or version!=2 or length!=path.stat().st_size:
            raise RuntimeError('Invalid GLB: '+str(path))
        size,kind=struct.unpack('<I4s',stream.read(8))
        if kind!=b'JSON':
            raise RuntimeError('Missing GLB JSON chunk')
        doc=json.loads(stream.read(size))
    if doc.get('images') or doc.get('textures'):
        raise RuntimeError('Unexpected image/texture in '+str(path))
    for mat in doc.get('materials',[]):
        rgba=mat.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])
        if max(rgba[:3])-min(rgba[:3])>1e-6:
            raise RuntimeError('Non-grayscale material: '+mat.get('name','?'))
    required={
        'car': {'body','door_fl','glass','wheel_fl','wheel_fr','wheel_rl','wheel_rr'},
        'vending': {'panel'}, 'lamp_head': {'bulb'},
        'traffic_light': {'lamp_r','lamp_y','lamp_g'},
        'debris': {'carton','crate','bicycle_wheel','flyers'},
    }
    names={node.get('name') for node in doc.get('nodes',[])}
    missing=required.get(path.stem,set())-names
    if missing:
        raise RuntimeError('Missing named parts: '+str(sorted(missing)))
    triangles=0
    for item in doc.get('meshes',[]):
        for prim in item['primitives']:
            if prim.get('mode',4)!=4:
                raise RuntimeError('Non-triangle primitive in '+str(path))
            count=doc['accessors'][prim['indices']]['count'] if 'indices' in prim else doc['accessors'][prim['attributes']['POSITION']]['count']
            triangles+=count//3
    return triangles


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',default='assets/models/props')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1.0
    init_materials()
    builders=[('car',car),('vending',vending),
              ('umbrella_broken',lambda: umbrella(True)),('umbrella_open',umbrella),
              ('ac_unit',ac_unit),('debris',debris),('lamp_head',lamp_head),('traffic_light',traffic_light)]
    total_bytes=total_triangles=0
    for name,builder in builders:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        # Purge mesh datablocks to keep the repeated export session small.
        for data in list(bpy.data.meshes):
            if data.users==0:
                bpy.data.meshes.remove(data)
        random.seed(SEED)
        builder()
        _,bounds=bake_and_pack(name)
        path=out/(name+'.glb')
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',
                                  use_selection=True,export_yup=True,export_apply=True,
                                  export_texcoords=False,export_normals=True,
                                  export_materials='EXPORT',export_animations=False,
                                  export_cameras=False,export_lights=False,export_extras=True)
        size=path.stat().st_size
        triangles=verify_glb(path)
        total_bytes+=size
        total_triangles+=triangles
        print(f'{name}: {size:,} bytes; {triangles:,} triangles; XYZ metres {bounds}',flush=True)
        if size>=400_000:
            raise RuntimeError(f'{path}: exceeds strict 400 KB budget ({size} bytes)')
    if total_bytes>=2_500_000 or total_triangles>=60_000:
        raise RuntimeError(f'Pack exceeds budget: {total_bytes} bytes / {total_triangles} triangles')
    print(f'PASS: {len(builders)} GLBs, {total_bytes:,} bytes, {total_triangles:,} triangles',flush=True)


if __name__=='__main__':
    try:
        main()
    except BaseException:
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
