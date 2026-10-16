"""Bake ambient occlusion into a vertex colour (COLOR_0) of every mesh in a glb, so seams between shell panels, the
inside of the chest and the contact under the seated robot darken in the runtime (GTAO at 1 m radius cannot see
centimetre seams). The whole scene occludes itself, so panel-over-panel contact counts.

  Blender -b --factory-startup -P tools/blender/bake_ao.py -- --in renders/robot_k1_test.glb --out /tmp/k1_ao.glb \
      [--samples 64] [--floor 0.35] [--dist 0.25]
COLOR_0 = floor + (1 - floor) * ao  (floor keeps the darkest crevice from going black).
"""
import bpy, sys, os

A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
IN, OUT = arg('--in'), arg('--out')
SAMPLES, FLOOR, DIST = int(arg('--samples', '64')), float(arg('--floor', '0.35')), float(arg('--dist', '0.25'))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.world = scene.world or bpy.data.worlds.new('w')
scene.world.light_settings.distance = DIST  # AO ray length (m)
# a ground plane so the seated robot is occluded from below (removed before export)
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
ground = bpy.context.active_object

meshes = [o for o in scene.objects if o.type == 'MESH' and o is not ground]
for o in meshes:
    if not o.data.materials:
        o.data.materials.append(bpy.data.materials.new('bake'))
    for a in list(o.data.color_attributes):
        o.data.color_attributes.remove(a)
    ca = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    o.data.color_attributes.active_color = ca
    o.data.attributes.default_color_name = ca.name
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
for o in meshes:
    ca = o.data.color_attributes['Col']
    for d in ca.data:
        v = d.color[0]
        k = FLOOR + (1 - FLOOR) * v
        d.color = (k, k, k, 1.0)
bpy.data.objects.remove(ground, do_unlink=True)
print('BAKED', len(meshes), 'meshes')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_normals=True, export_texcoords=False,
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False)
sys.stdout.flush(); os._exit(0)
