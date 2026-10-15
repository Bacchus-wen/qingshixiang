"""Render the exported props in one labelled row, at a common metre scale.
Run from project root AFTER props.py, outside the Codex sandbox:
Blender -b --factory-startup -P tools/blender/render_props.py
Optional arguments after --: --input assets/models/props --out renders/props_sheet.png
Only the inspection scene has lights, a floor and labels; source GLBs are untouched.
"""
import argparse
import math
import os
from pathlib import Path
import sys
import traceback

import bpy
from mathutils import Vector

ORDER = ['car', 'vending', 'umbrella_broken', 'umbrella_open',
         'ac_unit', 'debris', 'lamp_head', 'traffic_light']


def corners(objects):
    bpy.context.view_layer.update()
    return [obj.matrix_world @ Vector(p) for obj in objects
            if obj.type == 'MESH' for p in obj.bound_box]


def limits(points):
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
            Vector(tuple(max(p[i] for p in points) for i in range(3))))


def matte(name, gray, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (gray, gray, gray, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, location, target, energy, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = (1, 1, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)


def label(name, body, position, rotation, size, mat):
    data = bpy.data.curves.new(name, 'FONT')
    data.body = body
    data.align_x = 'CENTER'
    data.align_y = 'CENTER'
    data.size = size
    data.extrude = 0
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = rotation
    data.materials.append(mat)
    return obj


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', default='assets/models/props')
    parser.add_argument('--out', default='renders/props_sheet.png')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    directory, output = Path(args.input), Path(args.out)
    paths = {p.stem: p for p in sorted(directory.glob('*.glb'))}
    missing = [name for name in ORDER if name not in paths]
    if missing:
        raise RuntimeError('Generate the full prop pack first; missing: '+', '.join(missing))
    names = ORDER + sorted(set(paths)-set(ORDER))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    # Blender 4.2+ and 5.x expose different Eevee identifiers.
    engines = {item.identifier for item in scene.render.bl_rna.properties['engine'].enum_items}
    engine = next((key for key in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'] if key in engines), None)
    if engine is None:
        raise RuntimeError('This Blender build has no Eevee render engine')
    scene.render.engine = engine
    if hasattr(scene, 'eevee'):
        if hasattr(scene.eevee, 'taa_render_samples'):
            scene.eevee.taa_render_samples = 64
        if hasattr(scene.eevee, 'use_gtao'):
            scene.eevee.use_gtao = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.render.use_file_extension = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    world = bpy.data.worlds.new('neutral_midgray_world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .18, .18, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    scene.world = world
    all_meshes, placements = [], []
    cursor = 0.0
    for name in names:
        before = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(paths[name]))
        imported = list(set(scene.objects)-before)
        roots = [obj for obj in imported if obj.parent not in imported]
        group = bpy.data.objects.new('sheet_'+name, None)
        bpy.context.collection.objects.link(group)
        for obj in roots:
            old_world = obj.matrix_world.copy()
            obj.parent = group
            obj.matrix_world = old_world
        if name == 'car':
            group.rotation_euler.z = math.radians(55)
        elif name == 'lamp_head':
            # Show the underside and named tube, which the top-down camera would hide.
            group.rotation_euler.x = math.radians(-115)
            group.rotation_euler.z = math.radians(-12)
        elif name in ['vending', 'ac_unit', 'traffic_light']:
            group.rotation_euler.z = math.radians(-18)
        points = corners(imported)
        if not points:
            raise RuntimeError('No visible meshes in '+str(paths[name]))
        low, high = limits(points)
        width = high.x-low.x
        slot_width = max(width, .95)
        group.location += Vector((cursor+slot_width/2-(low.x+high.x)/2,
                                  -(low.y+high.y)/2, -low.z+.012))
        placements.append((name, group, slot_width, cursor+slot_width/2))
        cursor += slot_width+.36
        all_meshes.extend(obj for obj in imported if obj.type == 'MESH')
    # Centre the entire row, preserving actual relative prop sizes.
    row_width = cursor-.36
    for _,group,_,_ in placements:
        group.location.x -= row_width/2
    points = corners(all_meshes)
    low, high = limits(points)
    centre = (low+high)/2
    camera_data = bpy.data.cameras.new('inspection_camera')
    camera = bpy.data.objects.new('inspection_camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = centre+Vector((0, -16, 10))
    aim(camera, centre)
    camera_data.type = 'ORTHO'
    camera_data.clip_end = 200
    scene.camera = camera
    rotation = camera.rotation_euler.to_matrix()
    right = rotation @ Vector((1,0,0))
    up = rotation @ Vector((0,1,0))
    toward_camera = rotation @ Vector((0,0,1))
    px = [right.dot(p-centre) for p in points]
    py = [up.dot(p-centre) for p in points]
    lower, upper = min(py), max(py)
    text_mat = matte('sheet_label_ink', .035, 1)
    for name,group,slot_width,slot_center in placements:
        x = slot_center-row_width/2-centre.x
        text_size = min(.14, slot_width/(len(name)*.64))
        # Camera-facing labels share one baseline, rather than following each object's depth.
        pos = centre+right*x+up*(lower-.30)+toward_camera*4
        label('label_'+name, name, pos, camera.rotation_euler, text_size, text_mat)
    title_pos = centre+up*(upper+.42)+toward_camera*4
    label('sheet_title', 'SILVER HALIDE / STREET PROPS / METRES', title_pos,
          camera.rotation_euler, .19, text_mat)
    label('sheet_subtitle', f'{len(names)} ASSETS  /  NEUTRAL LIGHT / NO EMISSION  /  SAME SCALE',
          centre+up*(lower-.61)+toward_camera*4,
          camera.rotation_euler, .12, text_mat)
    # Fit the projection, including caption bands, with a generous print-style margin.
    aspect = 1600/900
    frame_mid_y = (upper+.68+lower-.82)/2
    camera.location += up*frame_mid_y
    # With horizontal sensor fit, ortho_scale is the frame WIDTH, not height.
    camera_data.sensor_fit = 'HORIZONTAL'
    camera_data.ortho_scale = max(max(px)-min(px)+.8,
                                  (upper+.68-(lower-.82))*aspect)*1.09
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,0))
    floor = bpy.context.object
    floor.name = 'inspection_floor'
    floor.data.materials.append(matte('midgray_floor', .18, .84))
    # Broad key/fill/rim: all neutral white, no per-prop lighting or hidden emission.
    area('key',(-row_width*.22,-5,8),centre,1900,8)
    area('fill',(row_width*.30,-2,5),centre,1000,7)
    area('rim',(0,5,7),centre,2100,9)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError('Render did not produce '+str(output))
    print(f'RENDERED {output}: 1600 x 900; {len(names)} assets; {engine}', flush=True)


if __name__ == '__main__':
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
