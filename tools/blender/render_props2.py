"""Render the eight exported relocation props as a labelled 4 x 2 inspection sheet.
Run from the project root AFTER props2.py, outside the Codex sandbox:
Blender -b --factory-startup -P tools/blender/render_props2.py
Arguments after --: --input assets/models/props2 --out renders/props2_sheet.png

Imports the actual GLBs, never rebuilds or modifies them. Each cell fits its
asset independently (shoe enlarged); captions report original W / D / H metres.
Neutral grayscale light, dark cards, no white studio, no external dependencies.
"""
import argparse
import math
import os
from pathlib import Path
import sys
import traceback

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import render_props as base
import bpy
from mathutils import Vector

ORDER = ('laundry', 'bicycle', 'planters', 'shoe', 'chair_stool',
         'notice_board', 'boxes_moving', 'mailbox')
WIDTH, HEIGHT = 2560, 1440


def emission(name, gray):
    mat=base.matte(name,gray,1)
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Emission Color'].default_value=(gray,gray,gray,1)
    bsdf.inputs['Emission Strength'].default_value=1
    return mat


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',default='assets/models/props2')
    parser.add_argument('--out',default='renders/props2_sheet.png')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    directory,output=Path(args.input),Path(args.out)
    paths={name:directory/(name+'.glb') for name in ORDER}
    missing=[str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise RuntimeError('Generate props2 first; missing: '+', '.join(missing))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    engines={item.identifier for item in scene.render.bl_rna.properties['engine'].enum_items}
    engine=next((name for name in ('BLENDER_EEVEE_NEXT','BLENDER_EEVEE') if name in engines),None)
    if engine is None:
        raise RuntimeError('This Blender build has no Eevee renderer')
    scene.render.engine=engine
    if hasattr(scene,'eevee') and hasattr(scene.eevee,'taa_render_samples'):
        scene.eevee.taa_render_samples=64
    scene.render.resolution_x=WIDTH
    scene.render.resolution_y=HEIGHT
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGB'
    scene.render.film_transparent=False
    scene.render.filepath=str(output)
    scene.render.use_file_extension=True
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=0
    scene.view_settings.gamma=1
    world=bpy.data.worlds.new('props2_neutral_world')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.07,.07,.07,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    scene.world=world

    data=bpy.data.cameras.new('props2_inspection_camera')
    camera=bpy.data.objects.new('props2_inspection_camera',data)
    scene.collection.objects.link(camera)
    camera.location=(0,-18,11)
    base.aim(camera,(0,0,0))
    data.type='ORTHO'
    data.sensor_fit='HORIZONTAL'
    data.ortho_scale=15.4
    data.clip_end=100
    scene.camera=camera
    rotation=camera.rotation_euler.to_matrix()
    right=rotation @ Vector((1,0,0))
    up=rotation @ Vector((0,1,0))
    toward_camera=rotation @ Vector((0,0,1))
    ink=emission('inspection_ink',.62)
    dim=emission('inspection_dimensions',.32)
    card=emission('inspection_card',.026)

    def caption(name,text,x,y,size,mat=ink):
        base.label(name,text,right*x+up*y+toward_camera*3.8,
                   camera.rotation_euler,size,mat)

    for index,name in enumerate(ORDER):
        before=set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(paths[name]))
        imported=sorted(set(scene.objects)-before,key=lambda obj:obj.name)
        meshes=[obj for obj in imported if obj.type=='MESH']
        if not meshes:
            raise RuntimeError('No visible meshes in '+str(paths[name]))
        low,high=base.limits(base.corners(meshes))
        dims=high-low
        group=bpy.data.objects.new('inspection_'+name,None)
        scene.collection.objects.link(group)
        for obj in imported:
            if obj.parent not in imported:
                transform=obj.matrix_world.copy()
                obj.parent=group
                obj.matrix_world=transform
        # Slight oblique views reveal bracket depth and chair frame construction.
        group.rotation_euler.z=math.radians(-12 if name in ('laundry','notice_board','mailbox') else 16)
        if name=='shoe':
            group.rotation_euler.z=math.radians(-30)
        points=base.corners(meshes)
        px=[right.dot(p) for p in points]
        py=[up.dot(p) for p in points]
        pz=[toward_camera.dot(p) for p in points]
        span_x,span_y=max(px)-min(px),max(py)-min(py)
        factor=min(3.05/max(span_x,1e-6),2.18/max(span_y,1e-6))
        projected_center=(right*((max(px)+min(px))/2)
                          +up*((max(py)+min(py))/2)
                          +toward_camera*((max(pz)+min(pz))/2))
        col,row=index%4,index//4
        cell_x=(col-1.5)*3.65
        cell_y=1.65-row*3.35
        group.scale=(factor,)*3
        group.location=right*cell_x+up*(cell_y+.20)-projected_center*factor
        bpy.context.view_layer.update()
        # Each background card is behind its own mesh projection. No floor hides
        # fallen spokes, the bottom of the shoe, or small ceramic fragments.
        points=base.corners(meshes)
        back=min(toward_camera.dot(p) for p in points)-.25
        bpy.ops.mesh.primitive_plane_add(size=2)
        panel=bpy.context.object
        panel.name='card_'+name
        panel.rotation_euler=camera.rotation_euler
        panel.scale=(1.76,1.57,1)
        panel.location=right*cell_x+up*cell_y+toward_camera*back
        panel.data.materials.append(card)
        caption('label_'+name,f'{index+1:02d}  {name}',cell_x,cell_y-1.12,.16)
        caption('size_'+name,f'{dims.x:.3f} / {dims.y:.3f} / {dims.z:.3f} m',
                cell_x,cell_y-1.36,.105,dim)
        print(f'INSPECT {name}: W/D/H {dims.x:.3f}/{dims.y:.3f}/{dims.z:.3f} m; '
              f'view scale {factor:.3f}; {paths[name].stat().st_size:,} bytes',flush=True)

    caption('sheet_title','SILVER HALIDE / TRACES OF HOME',0,3.83,.24)
    caption('sheet_subtitle','RELOCATION PROPS 02 / NEUTRAL LIGHT / EXPORTED GLB',0,3.49,.12,dim)
    caption('sheet_footer','INDIVIDUALLY FITTED VIEWS / CAPTIONS: WIDTH, DEPTH, HEIGHT IN METRES / NO BAKED TEXT',
            0,-3.73,.115,dim)
    # Broad neutral sources cover the whole grid evenly. Only inspection labels
    # and cards emit; imported prop materials retain their original values.
    base.area('inspection_key',(-5,-9,12),(0,0,0),2600,10)
    base.area('inspection_fill',(7,-5,6),(0,0,0),1700,9)
    base.area('inspection_rim',(0,5,10),(0,0,0),2800,11)
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.render.render(write_still=True)
    if not output.is_file() or output.stat().st_size==0:
        raise RuntimeError('Render produced no image: '+str(output))
    print(f'RENDERED {output}: {WIDTH} x {HEIGHT}; {len(ORDER)} assets; {engine}',flush=True)


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
