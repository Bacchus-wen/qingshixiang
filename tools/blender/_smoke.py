# Smoke test: build a bevelled box and export it as glb. Usage: Blender -b -P tools/blender/_smoke.py -- <out.glb>
import bpy, sys
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1)
bpy.context.object.modifiers.new('bevel', 'BEVEL').width = 0.05
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True)
print('EXPORTED', out)
