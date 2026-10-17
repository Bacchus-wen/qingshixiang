"""Give the robot's head a real pivot (headless): an empty 'robot_head' at the neck (the head object's origin) with
the head mesh ('robot_head_mesh', badges stay parented to it) as its child. Web packing (meshopt quantization) moves
a mesh node's origin to its bounding-box centre; the empty keeps the neck pivot for nodding/turning.
  Blender -b --factory-startup -P tools/blender/robot_pivot.py -- --in robot.glb --out robot_p.glb"""
import bpy, sys, os
A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=arg('--in'))
head = bpy.data.objects['robot_head']
piv = bpy.data.objects.new('robot_head_pivot', None); bpy.context.collection.objects.link(piv)
piv.matrix_world = head.matrix_world.copy()
mw = head.matrix_world.copy(); head.parent = piv; head.matrix_world = mw
head.name = 'robot_head_mesh'; piv.name = 'robot_head'
print('PIVOT', tuple(round(x, 3) for x in piv.matrix_world.translation), 'children', [c.name for c in piv.children])
bpy.ops.export_scene.gltf(filepath=arg('--out'), export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=92, export_materials='EXPORT')
sys.stdout.flush(); os._exit(0)
