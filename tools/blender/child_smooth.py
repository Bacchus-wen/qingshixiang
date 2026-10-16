import bpy, sys, os
A = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A[0])
keep = bpy.data.objects.get('person_2')
def under(o, r):
    while o:
        if o == r: return True
        o = o.parent
    return False
for o in list(bpy.context.scene.objects):
    if not under(o, keep): bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:
    bpy.context.view_layer.objects.active = o
    # weld, then round off the low-poly facets: subdivision + smooth shading
    me = o.data
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002); bm.to_mesh(me); bm.free()
    mod = o.modifiers.new('sub', 'SUBSURF'); mod.levels = 2; mod.render_levels = 2
    dg = bpy.context.evaluated_depsgraph_get()
    newme = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); o.modifiers.clear(); o.data = newme
    for p in o.data.polygons: p.use_smooth = True
print('CHILD', len(meshes), sum(len(o.data.polygons) for o in meshes))
bpy.ops.export_scene.gltf(filepath=A[1], export_format='GLB', export_apply=True, export_yup=True, export_materials='NONE')
sys.stdout.flush(); os._exit(0)
