"""Deterministic relocation props: the small things a street leaves behind.
Run from the project root, outside the Codex sandbox:
Blender -b --factory-startup -P tools/blender/props2.py -- --out assets/models/props2

Uses the local props.py geometry/packing conventions. Metres, Z up, front -Y;
glTF converts to Y up. Every identity root is centred on its lowest bounds.
Wall props also have bottom origins: place laundry at second-floor height in JS.
No simulation, external assets, textures, fonts, paid tools or random modifiers.
Each GLB must be < 300,000 bytes; the eight together must be < 2,000,000.
Notice papers have front-facing UVs (U right, V up), independent paper_* nodes
and materials, ready for CanvasTexture. Do not merge these nodes at runtime.
"""
import argparse
import json
import math
import os
from pathlib import Path
import sys
import traceback

# Avoid bytecode side effects; shared helpers stay in the existing script.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import props as base
import bpy
from mathutils import Vector

TAU = math.tau
M = base.M
box, rod, tube, ring = base.box, base.rod, base.tube, base.ring
mesh, sheet = base.mesh, base.sheet
SEED = 73148
ORDER = ('laundry', 'bicycle', 'planters', 'shoe', 'chair_stool',
         'notice_board', 'boxes_moving', 'mailbox')


def materials():
    base.init_materials()
    for name, values in {
        'wet_cloth': (.095, .78, 0), 'cloth_faded': (.22, .88, 0),
        'clay': (.22, .96, 0), 'clay_break': (.36, 1, 0),
        'soil': (.035, 1, 0), 'dry_wood': (.11, .98, 0),
        'cardboard': (.25, .95, 0), 'tape': (.31, .60, 0),
        'twine': (.42, .93, 0), 'sack': (.32, .87, 0),
        'sack_weave': (.20, .96, 0), 'shoe_upper': (.16, .86, 0),
        'shoe_sole': (.35, .90, 0), 'notice_back': (.075, .92, 0),
    }.items():
        M[name] = base.material(name, *values)
    for key in ('wet_cloth', 'cloth_faded', 'paper', 'sack'):
        M[key].use_backface_culling = False


def uv_grid(name, verts, faces, uvs, mat):
    """Open, double-sided sheet; vertex UVs survive normal recalculation/packing."""
    obj = mesh(name, verts, faces, mat)
    layer = obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[obj.data.loops[li].vertex_index]
    return obj


def cloth_piece(name, cx, width, length, kind, mat, phase):
    # Top edge is clipped to the rail; folds narrow and hang almost vertically.
    # A shirt has dropped sleeves/neck; trousers have a real gap between legs.
    nx, nz = 12, 12
    verts, faces, uvs = [], [], []
    for j in range(nz + 1):
        v = j / nz
        if kind == 'shirt':
            half = width * (.5 if v < .29 else .33)
        else:
            half = width * (.5 - .025 * v)
        for i in range(nx + 1):
            u = i / nx
            q = u * 2 - 1
            x = cx + q * half + .016 * v * math.sin(v * 4 + phase)
            sag = .065 * (1 - q*q) * (1 - .6*v)
            z = 1.43 - length*v - sag
            if kind == 'shirt':
                z -= .075 * max(0, 1-abs(q)*3) * (1-v)**5
            # Wet fabric: close folds, very little billow, uneven heavy hem.
            y = -.51 + (.018+.016*v)*math.sin(u*TAU*3+phase) + .025*v*v
            z += .018*v*v*math.sin(u*TAU*2+phase)
            verts.append((x, y, z))
            uvs.append((u, 1-v))
    for j in range(nz):
        for i in range(nx):
            if kind == 'trousers' and j >= 4 and i in (5, 6):
                continue
            a = j*(nx+1)+i
            faces.append((a, a+nx+1, a+nx+2, a+1))  # front -Y
    obj = uv_grid(name, verts, faces, uvs, mat)
    obj['fabric'] = 'wet, gravity-draped; no simulation'
    for side in (-1, 1):
        x = cx + side*width*.38
        box('laundry_pegs', (x, -.513, 1.435), (.018, .034, .065), 'dry_wood', .002)


def laundry():
    rod('laundry_rail', (-1.12,-.50,1.45), (1.12,-.50,1.45), .018, 'metal_dark')
    for x in (-1.01, 1.01):
        box('wall_brackets', (x,.025,1.25), (.08,.055,.39), 'metal_dark', .004)
        tube('wall_brackets', [(x,0,1.12),(x,-.5,1.43),(x,0,1.43)], .012, 'metal_dark')
        for z in (1.11, 1.39):
            rod('mount_bolts', (x,-.006,z),(x,-.015,z),.012,'metal_edge',8)
    cloth_piece('garment_shirt', -.70, .60, .71, 'shirt', 'wet_cloth', .1)
    cloth_piece('garment_trousers', -.04, .43, .94, 'trousers', 'cloth_faded', 1.3)
    cloth_piece('garment_towel', .61, .51, .84, 'towel', 'wet_cloth', 2.2)


def bicycle():
    # Author upright, then rotate the whole bicycle onto its left side.
    before = set(bpy.context.scene.objects)
    rear, front = (-.54,0,.34), (.55,0,.34)
    for label, centre in (('rear', rear), ('front', front)):
        cx, _, cz = centre
        def wheel_point(a, radius):
            buckle = math.exp(-((a-2.15)/.38)**2) if label == 'rear' else 0
            r = radius * (1-.20*buckle)
            return (cx+r*math.cos(a), .075*buckle, cz+r*math.sin(a))
        for radius, thickness, mat in ((.31,.021,'rubber'),(.284,.010,'metal_edge')):
            pts = [wheel_point(TAU*i/40, radius) for i in range(41)]
            tube('wheel_'+label, pts, thickness, mat, 6, caps=False)
        rod('wheel_'+label, (cx,-.055,cz),(cx,.055,cz),.022,'metal_dark')
        for i in range(16):
            a = TAU*i/16
            rod('wheel_'+label,(cx,.035 if i%2 else -.035,cz),
                wheel_point(a,.284),.0018,'metal_edge',4)
    crank, seat, head_lo, head_hi = (-.12,0,.32),(-.28,0,.76),(.34,0,.60),(.29,0,.78)
    for a,b in ((rear,seat),(seat,crank),(crank,rear),(seat,head_hi),
                (head_lo,crank),(head_lo,head_hi)):
        rod('frame',a,b,.016,'paint_chipped')
    for side in (-1,1):
        y = side*.045
        tube('fork',[(head_hi[0],y,head_hi[2]),(.37,y,.55),(.55,y,.34)],.012,'metal_dark')
        rod('rear_stays',(-.28,y,.76),(-.54,y,.34),.010,'metal_dark')
    rod('saddle_post',(-.28,0,.73),(-.30,0,.86),.013,'metal_edge')
    box('saddle',(-.32,0,.865),(.23,.14,.047),'rubber',.015)
    tube('handlebar',[(.27,0,.76),(.24,0,.93),(.24,-.23,.95)],.013,'metal_edge')
    rod('handlebar',(.24,0,.93),(.24,.23,.95),.013,'metal_edge')
    for side in (-1,1):
        rod('grips',(.24,side*.15,.944),(.24,side*.25,.954),.021,'rubber')
    ring('chainring',(-.12,-.055,.32),.091,.008,'metal_dark','Y',24,5)
    tube('chain',[(-.12,-.067,.414),(-.54,-.067,.385),(-.59,-.067,.34),
                  (-.54,-.067,.295),(-.12,-.067,.226),(-.026,-.067,.32),
                  (-.12,-.067,.414)],.004,'metal_dark',4,False)
    rod('cranks',(-.12,-.08,.32),(.01,-.08,.28),.009,'metal_edge')
    rod('cranks',(-.12,.08,.32),(-.25,.08,.36),.009,'metal_edge')
    box('pedals',(.01,-.13,.28),(.08,.10,.025),'rubber',.003)
    box('pedals',(-.25,.13,.36),(.08,.10,.025),'rubber',.003)
    for y in (-.08,.08):
        rod('rear_rack',(-.74,y,.72),(-.38,y,.72),.008,'metal_dark')
        rod('rear_rack',(-.65,y,.72),(-.54,y,.34),.006,'metal_dark')
    for x in (-.70,-.60,-.50,-.40):
        rod('rear_rack',(x,-.08,.72),(x,.08,.72),.006,'metal_dark')
    base.rotate_objects(list(set(bpy.context.scene.objects)-before),math.radians(78),'X')


def lathe(name, cx, cy, profile, mat, segments=20):
    """Closed profile makes a true pot wall/lip/inner cavity, not a solid cone."""
    verts = [(cx+r*math.cos(TAU*i/segments),cy+r*math.sin(TAU*i/segments),z)
             for r,z in profile for i in range(segments)]
    faces = []
    for k in range(len(profile)):
        nxt = (k+1)%len(profile)
        for i in range(segments):
            j = (i+1)%segments
            faces.append((k*segments+i,k*segments+j,nxt*segments+j,nxt*segments+i))
    return mesh(name,verts,faces,mat)


def planters():
    for n,(cx,cy,r,h) in enumerate(((-.63,0,.17,.27),(-.12,.025,.20,.34),(.43,.03,.16,.26))):
        if n == 2:
            continue
        profile = [(r*.64,.02),(r,.94*h),(r*1.04,h),(r*.85,h),
                   (r*.81,.91*h),(r*.53,.055)]
        lathe('pot_'+str(n),cx,cy,profile,'clay')
        # Soil sits below the rolled lip, exposing the empty rim.
        rod('soil_'+str(n),(cx,cy,.07),(cx,cy,h*.77),r*.77,'soil',20)
        for k in range(4):
            a = k*2.4+n
            bx,by = cx+.035*math.cos(a), cy+.035*math.sin(a)
            tip=(bx+.10*math.cos(a),by+.085*math.sin(a),h+.29+.055*(k%2))
            tube('dead_branches_'+str(n),[(bx,by,h*.73),(bx,by,h+.11),tip],.006,'dry_wood',5)
            rod('dead_branches_'+str(n),(bx,by,h+.12),
                (bx-.07*math.sin(a),by+.06*math.cos(a),h+.23),.003,'dry_wood',4)
    # Third pot: jagged standing remnant plus detached curved ceramic shards.
    cx, cy, radius = .43, .03, .16
    n = 18
    heights = [.075,.08,.055,.06,.10,.22,.26,.25,.23,.20,.17,.15,.13,.12,.11,.10,.08,.07]
    verts=[]
    for k in range(4):
        for i in range(n):
            a=TAU*i/n
            outer = radius if k in (1,2) else .105
            r=outer-(.018 if k in (2,3) else 0)
            z=heights[i] if k in (1,2) else .025
            verts.append((cx+r*math.cos(a),cy+r*math.sin(a),z))
    faces=[]
    for k in range(4):
        for i in range(n):
            faces.append((k*n+i,k*n+(i+1)%n,((k+1)%4)*n+(i+1)%n,((k+1)%4)*n+i))
    obj=mesh('pot_broken',verts,faces,'clay')
    obj.data.materials.append(M['clay_break'])
    for poly in obj.data.polygons:
        if n <= poly.index < 2*n:
            poly.material_index=1
    for k in range(5):
        x=.30+.087*k
        y=-.19-.07*(k%2)
        shard=sheet('pot_shards',[(x-.05,y,.008),(x+.045,y-.023,.012),
                                 (x+.06,y+.035,.028),(x-.025,y+.058,.04)],
                    [(0,1,2,3)],'clay_break',.009)
        base.rotate_objects([shard],.43*k,'Z',(x,y,0))
    # Flattened spilled earth and one fallen stem connect fragments to the pot.
    soil=rod('spilled_soil',(.45,-.07,.008),(.45,-.07,.018),.19,'soil',18)
    soil.scale.y=.65
    tube('fallen_branch',[(.42,.05,.07),(.56,-.14,.025),(.79,-.22,.009)],.006,'dry_wood',5)


def shoe():
    # Child-sized 18 cm trainer: shaped toe, sole, hollow ankle, two loose laces.
    segments=24
    def outline(a):
        # Toe points -Y; broad toe and narrower heel.
        width=.039*(1-.22*math.sin(a))
        return width*math.cos(a), .086*math.sin(a)
    verts=[]
    for z,scale in ((.006,.97),(.018,1),(.027,.96)):
        for i in range(segments):
            x,y=outline(TAU*i/segments)
            verts.append((x*scale,y*scale,z))
    faces=[tuple(reversed(range(segments)))]
    for k in range(2):
        for i in range(segments):
            j=(i+1)%segments
            faces.append((k*segments+i,k*segments+j,(k+1)*segments+j,(k+1)*segments+i))
    faces.append(tuple(range(2*segments,3*segments)))
    mesh('shoe_sole',verts,faces,'shoe_sole')
    verts=[]
    for k in range(4):
        for i in range(segments):
            a=TAU*i/segments
            x,y=outline(a)
            if k==0:
                p=(x*.96,y*.96,.025)
            elif k==1:
                p=(x*.88,y*.87,.047+.022*(math.sin(a)+1)/2)
            elif k==2:
                p=(.023*math.cos(a),.031+.028*math.sin(a),.071+.006*math.sin(a))
            else:
                p=(.019*math.cos(a),.031+.024*math.sin(a),.036)
            verts.append(p)
    faces=[]
    for k in range(3):
        for i in range(segments):
            j=(i+1)%segments
            faces.append((k*segments+i,k*segments+j,(k+1)*segments+j,(k+1)*segments+i))
    mesh('shoe_upper',verts,faces,'shoe_upper',True)
    box('shoe_insole',(0,.032,.032),(.032,.044,.004),'rubber',.002)
    sheet('shoe_tongue',[(-.018,-.037,.051),(.018,-.037,.051),(.017,.018,.075),(-.017,.018,.075)],
          [(0,1,2,3)],'cloth_faded',.001)
    for i in range(3):
        y=-.033+i*.013
        z=.056+i*.006
        rod('shoelaces',(-.020,y,z),(.020,y+.008,z+.004),.0015,'twine',5)
        rod('shoelaces',(.020,y,z),(-.020,y+.008,z+.004),.0015,'twine',5)
    tube('shoelaces',[(0,.002,.071),(-.027,.008,.054),(-.05,-.01,.014),(-.061,-.04,.006)],.0014,'twine',5)
    tube('shoelaces',[(0,.002,.071),(.027,.02,.05),(.044,.006,.012),(.060,.025,.006)],.0014,'twine',5)
    for y in (-.06,-.03,0,.03,.06):
        box('sole_tread',(0,y,.005),(.057,.006,.003),'rubber',0)


def chair_stool():
    # Plastic stool: actual open grip slot, splayed square legs and reinforcing ribs.
    cx=-.42
    for x,w in ((cx-.10,.14),(cx+.10,.14)):
        box('stool',(x,0,.43),(w,.32,.036),'plastic',.008)
    for y in (-.11,.11):
        box('stool',(cx,y,.43),(.07,.10,.036),'plastic',.006)
    for sx in (-1,1):
        for sy in (-1,1):
            tube('stool',[(cx+sx*.12,sy*.11,.414),(cx+sx*.17,sy*.15,.018)],.023,'plastic',4)
        rod('stool',(cx+sx*.155,-.14,.15),(cx+sx*.155,.14,.15),.010,'plastic',4)
    for sy in (-1,1):
        rod('stool',(cx-.15,sy*.14,.15),(cx+.15,sy*.14,.15),.010,'plastic',4)
    # Folding chair: crossed steel side frames with visible pivot rivets.
    cx=.33
    for sx in (-1,1):
        x=cx+sx*.225
        tube('chair_frame',[(x,-.29,.02),(x,.18,.48),(x,.26,.83)],.013,'metal_dark')
        tube('chair_frame',[(x,.29,.02),(x,-.20,.43),(x,-.23,.46)],.013,'metal_dark')
        rod('chair_pivots',(x-.017,-.025,.28),(x+.017,-.025,.28),.022,'metal_edge',10)
        for y in (-.29,.29):
            box('chair_feet',(x,y,.017),(.048,.055,.032),'rubber',.005)
    for y,z in ((-.20,.43),(.18,.46),(.26,.82)):
        rod('chair_frame',(cx-.225,y,z),(cx+.225,y,z),.012,'metal_dark')
    sheet('chair_seat',[(cx-.21,-.22,.45),(cx+.21,-.22,.45),
                        (cx+.21,.19,.47),(cx-.21,.19,.47)],[(0,1,2,3)],'cloth_faded',.008)
    sheet('chair_back',[(cx-.21,.214,.62),(cx+.21,.214,.62),
                        (cx+.21,.26,.81),(cx-.21,.26,.81)],[(0,1,2,3)],'cloth_faded',.009)


def paper(name, cx, y, cz, width, height, angle=0, curl=.012, mat='paper'):
    # Unique material avoids changing all notices when assigning a JS texture.
    key=name+'_material'
    M[key]=M[mat].copy()
    M[key].name=key
    M[key].use_backface_culling=False
    nx,nz=3,4
    verts,uvs,faces=[],[],[]
    for j in range(nz+1):
        v=j/nz
        for i in range(nx+1):
            u=i/nx
            x=(u-.5)*width
            z=(v-.5)*height
            # Curl toward the viewer only at the bottom/free corners.
            yy=y-curl*(1-v)**3*(.25+.75*abs(2*u-1))
            verts.append((cx+x*math.cos(angle)-z*math.sin(angle),yy,
                          cz+x*math.sin(angle)+z*math.cos(angle)))
            uvs.append((u,v))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i
            faces.append((a,a+1,a+nx+2,a+nx+1))
    obj=uv_grid(name,verts,faces,uvs,key)
    obj['texture_hint']='CanvasTexture; flipY=false for glTF; U right, V up; front -Y in Blender'
    return obj


def notice_board():
    box('board_back',(0,.025,.61),(1.56,.075,1.08),'notice_back',.008)
    for x in (-.81,.81):
        box('board_frame',(x,0,.61),(.055,.13,1.20),'metal_dark',.006)
    for z in (.025,1.195):
        box('board_frame',(0,0,z),(1.67,.13,.055),'metal_dark',.006)
    box('rain_hood',(0,-.055,1.245),(1.76,.30,.025),'paint_chipped',.006)
    specs=[(-.54,.92,.26,.35,-.08),(-.21,.91,.29,.37,.025),(.15,.88,.31,.40,-.04),
           (.52,.91,.27,.32,.09),(-.52,.48,.30,.35,.07),(-.16,.46,.30,.39,-.055),
           (.22,.43,.29,.36,.04),(.54,.45,.23,.30,-.07),(.02,.66,.22,.20,.12)]
    for i,(x,z,w,h,a) in enumerate(specs):
        y=-.023-i*.003
        paper(f'paper_{i:02d}',x,y,z,w,h,a,.010+.002*(i%3))
        for side in (-1,1):
            localx=side*w*.34
            localz=h*.45
            px=x+localx*math.cos(a)-localz*math.sin(a)
            pz=z+localx*math.sin(a)+localz*math.cos(a)
            rod('notice_pins',(px,y-.003,pz),(px,y-.008,pz),.005,'metal_edge',6)


def carton(name, center, size, tilt=0):
    before=set(bpy.context.scene.objects)
    x,y,z=center
    w,d,h=size
    box(name,center,size,'cardboard',.008)
    # Lid seam and faded packing tape; no generated text baked into materials.
    box(name+'_seam',(x,y,z+h/2+.001),(w*.91,.003,.0015),'paper_ink',0)
    box(name+'_tape',(x,y,z+h/2+.002),(.065,d,.002),'tape',0)
    for yy in (y-d/2-.001,y+d/2+.001):
        box(name+'_tape',(x,yy,z),(.065,.002,h),'tape',0)
    # Two taut loops with a small crossing knot. Packed to one semantic group.
    for xx in (x-w*.28,x+w*.28):
        tube('box_twine',[(xx,y-d/2-.004,z-h/2+.008),
                         (xx,y-d/2-.004,z+h/2+.006),(xx,y+d/2+.004,z+h/2+.006),
                         (xx,y+d/2+.004,z-h/2+.008),(xx,y-d/2-.004,z-h/2+.008)],
             .003,'twine',4,False)
    tube('box_twine',[(x-w/2-.004,y,z-h/2+.008),(x-w/2-.004,y,z+h/2+.008),
                      (x+w/2+.004,y,z+h/2+.008),(x+w/2+.004,y,z-h/2+.008)],.003,'twine',4)
    paper(name+'_label',x+w*.17,y-d/2-.004,z+h*.08,w*.27,h*.27,.02,.003)
    base.rotate_objects(list(set(bpy.context.scene.objects)-before),tilt,'Z',center)


def moving_sack(cx,cy):
    # Low-resolution bulging woven sack, gathered neck, asymmetric folds.
    profile=[(.16,.12,.018),(.235,.17,.10),(.23,.175,.32),
             (.18,.14,.48),(.055,.045,.57),(.08,.035,.64)]
    n=20
    def point(k,i):
        rx,ry,z=profile[k]
        a=TAU*i/n
        fold=1+.065*math.sin(5*a+k*.7)
        return (cx+rx*math.cos(a)*fold+.012*k,cy+ry*math.sin(a)*fold,z)
    verts=[point(k,i) for k in range(len(profile)) for i in range(n)]
    faces=[tuple(reversed(range(n)))]
    for k in range(len(profile)-1):
        for i in range(n):
            faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
    faces.append(tuple(range((len(profile)-1)*n,len(profile)*n)))
    mesh('moving_sack',verts,faces,'sack',True)
    # Sparse woven stripes follow the same bulges; no heavyweight texture maps.
    for i in range(0,n,2):
        pts=[]
        a=TAU*i/n
        for k in range(1,5):
            p=point(k,i)
            pts.append((p[0]+.002*math.cos(a),p[1]+.002*math.sin(a),p[2]))
        tube('sack_weave',pts,.0022,'sack_weave',4)
    for k in (1,2,3):
        pts=[point(k,i) for i in range(n+1)]
        tube('sack_weave',pts,.0026,'sack_weave',4,False)
    ring('sack_tie',(cx+.048,cy,.575),.053,.004,'twine',segments=16,sides=5)
    tube('sack_tie',[(cx+.07,cy-.04,.58),(cx+.13,cy-.10,.53),(cx+.10,cy-.14,.47)],.003,'twine',5)


def boxes_moving():
    carton('box_lower',(-.24,.02,.235),(.64,.48,.45),.025)
    carton('box_upper',(-.25,.045,.64),(.49,.40,.34),-.09)
    carton('box_small',(-.70,-.13,.15),(.29,.32,.27),.12)
    moving_sack(.39,.035)


def mailbox():
    # Open top is built from individual panels: letters really emerge from a cavity.
    box('mailbox_back',(0,.075,.24),(.38,.024,.48),'paint_chipped',.006)
    box('mailbox_base',(0,-.025,.025),(.38,.22,.025),'metal_dark',.004)
    for x in (-.18,.18):
        box('mailbox_sides',(x,-.025,.20),(.022,.22,.36),'paint_chipped',.004)
    door=box('mailbox_door',(0,-.14,.195),(.336,.018,.34),'paint',.006)
    door.rotation_euler.x=math.radians(-7)
    # Raised, bent rain flap is visibly ajar above the overfull stack.
    sheet('mailbox_lid',[(-.205,.08,.49),(.205,.08,.49),(.205,-.18,.56),(-.205,-.18,.54)],
          [(0,1,2,3)],'metal_dark',.012)
    for i in range(9):
        x=.014*math.sin(i*2.1)
        y=.048-i*.018
        z=.32+.022*(i%3)
        angle=-.09+.025*i
        paper(f'letter_{i:02d}',x,y,z,.265,.27,angle,.006,'paper')
        # Envelope flap lines on the viewer-facing sheet, below the lip or exposed.
        top=z+.135
        tube('envelope_seams',[(x-.12,y-.002,top-.018),(x,y-.004,top-.08),
                               (x+.12,y-.002,top-.018)],.0012,'paper_ink',4)
    box('mailbox_label',(0,-.166,.24),(.15,.008,.047),'paper',.003)
    rod('mailbox_lock',(0,-.159,.13),(0,-.171,.13),.018,'metal_edge',12)
    box('keyhole',(0,-.173,.13),(.003,.001,.012),'rubber',0)
    for x in (-.13,.13):
        rod('mailbox_mounts',(x,.059,.455),(x,.054,.455),.012,'metal_edge',8)


BUILDERS = dict(zip(ORDER, (laundry,bicycle,planters,shoe,chair_stool,
                            notice_board,boxes_moving,mailbox)))
REQUIRED = {
    'laundry': {'laundry_rail','garment_shirt','garment_trousers','garment_towel'},
    'bicycle': {'frame','wheel_rear','wheel_front','saddle'},
    'planters': {'pot_0','pot_1','pot_broken','pot_shards'},
    'shoe': {'shoe_upper','shoe_sole','shoelaces'},
    'chair_stool': {'stool','chair_frame','chair_seat','chair_back'},
    'notice_board': {'board_back'} | {f'paper_{i:02d}' for i in range(9)},
    'boxes_moving': {'box_lower','box_upper','box_small','moving_sack'},
    'mailbox': {'mailbox_door','mailbox_lid'} | {f'letter_{i:02d}' for i in range(9)},
}


def verify(path):
    triangles=base.verify_glb(path)
    # Also inspect the exported notice primitives, rather than trusting authoring UVs.
    import struct
    with path.open('rb') as stream:
        stream.seek(12)
        size,kind=struct.unpack('<I4s',stream.read(8))
        doc=json.loads(stream.read(size))
    nodes={node.get('name'):node for node in doc.get('nodes',[])}
    missing=REQUIRED[path.stem]-nodes.keys()
    if missing:
        raise RuntimeError(f'{path}: missing semantic nodes {sorted(missing)}')
    if path.stem=='notice_board':
        for name in sorted(REQUIRED['notice_board']-{'board_back'}):
            node=nodes[name]
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                if 'TEXCOORD_0' not in primitive['attributes']:
                    raise RuntimeError(f'{path}: {name} lost its UVs')
    return triangles


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',default='assets/models/props2')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1
    base.SEED=SEED
    materials()
    total=0
    for name in ORDER:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        for data in list(bpy.data.meshes):
            if data.users==0:
                bpy.data.meshes.remove(data)
        BUILDERS[name]()
        _,bounds=base.bake_and_pack(name)
        bpy.context.view_layer.update()
        # Reject floating origins/non-finite geometry before handing assets to JS.
        points=[obj.matrix_world @ v.co for obj in bpy.context.scene.objects
                if obj.type=='MESH' for v in obj.data.vertices]
        if not points or any(not math.isfinite(c) for p in points for c in p):
            raise RuntimeError(f'{name}: invalid mesh coordinates')
        if abs(min(p.z for p in points))>1e-5:
            raise RuntimeError(f'{name}: root is not at the bottom')
        path=out/(name+'.glb')
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
                                  export_yup=True,export_apply=True,export_texcoords=True,
                                  export_normals=True,export_materials='EXPORT',
                                  export_animations=False,export_cameras=False,
                                  export_lights=False,export_extras=True)
        size=path.stat().st_size
        triangles=verify(path)
        total+=size
        print(f'{name}: {size:,} bytes; {triangles:,} triangles; XYZ metres {bounds}',flush=True)
        if size>=300_000:
            raise RuntimeError(f'{name}: must be < 300,000 bytes; got {size:,}')
    if total>=2_000_000:
        raise RuntimeError(f'props2: must be < 2,000,000 bytes; got {total:,}')
    print(f'PASS: {len(ORDER)} GLBs; {total:,} bytes; grayscale; bottom roots; notice UVs',flush=True)


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
