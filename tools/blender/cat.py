"""Deterministic rigid cat, metres; Blender 5.2, no rig/textures/modifiers.

Run from project root: Blender -b -P tools/blender/cat.py
Blender Z up / -Y forward exports as glTF Y up / +Z forward, like robot.glb.
The cat root is on the ground; every named empty is an animation pivot.
Sleeping is a runtime pose of this same model. Optimize without quantization.
"""
import math
import os
from pathlib import Path
import sys
import traceback

import bpy
import bmesh
from mathutils import Vector


class Shape:
    def __init__(self):
        self.vertices = []
        self.faces = []

    def tube(self, points, widths, heights=None, sides=10):
        """Elliptical sections, with tangent-aligned frames and capped ends."""
        heights = widths if heights is None else heights
        pts = [Vector(p) for p in points]
        start = len(self.vertices)
        for j, p in enumerate(pts):
            tangent = (pts[min(j + 1, len(pts) - 1)] - pts[max(0, j - 1)]).normalized()
            ref = Vector((1, 0, 0)) if abs(tangent.x) < .9 else Vector((0, 1, 0))
            u = (ref - tangent * tangent.dot(ref)).normalized()
            v = tangent.cross(u).normalized()
            for i in range(sides):
                a = math.tau * i / sides
                self.vertices.append(tuple(p + u * (widths[j] * math.cos(a))
                                           + v * (heights[j] * math.sin(a))))
        self.faces.append(tuple(start + i for i in reversed(range(sides))))
        for j in range(len(pts) - 1):
            for i in range(sides):
                a = start + j * sides + i
                b = start + j * sides + (i + 1) % sides
                self.faces.append((a, b, b + sides, a + sides))
        self.faces.append(tuple(start + (len(pts) - 1) * sides + i for i in range(sides)))

    def ellipsoid(self, center, radii, sides=10, bands=6):
        x, y, z = center
        rx, ry, rz = radii
        points, widths, heights = [], [], []
        for j in range(bands + 1):
            a = -math.pi / 2 + math.pi * j / bands
            r = max(.012, math.cos(a))
            points.append((x, y + ry * math.sin(a), z))
            widths.append(rx * r)
            heights.append(rz * r)
        self.tube(points, widths, heights, sides)

    def mesh(self, name, parent, material, smooth=True):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        mesh.materials.append(material)
        for poly in mesh.polygons:
            poly.use_smooth = smooth
        return obj


def pivot(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj


def material(name, gray, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (gray, gray, gray, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (gray, gray, gray, 1)
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Specular IOR Level'].default_value = .38
    return mat


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fur = material('cat_fur', .085, .48)
    muzzle = material('cat_muzzle', .14, .56)
    inner = material('cat_inner_ear', .045, .58)
    nose = material('cat_nose', .018, .26)
    eye = material('cat_eye', .024, .18)  # no coloured/emissive eyes
    root = pivot('cat')
    body = pivot('body', root, (0, 0, .29))
    body['role'] = 'ribcage pivot; lower and fold limbs for sleeping'
    s = Shape()
    # Narrow waist, visible shoulder blades, high haunch: a lean adult, not a kitten.
    s.tube([(0, -.255, .018), (0, -.195, .013), (0, -.095, .012),
            (0, .045, .025), (0, .145, .018), (0, .23, -.008)],
           [.035, .079, .089, .064, .093, .042],
           [.060, .108, .114, .080, .108, .055], sides=12)
    for side in (-1, 1):
        s.ellipsoid((side * .056, -.15, .048), (.026, .081, .069), sides=8, bands=4)
    s.mesh('ribcage', body, fur)

    head = pivot('head', body, (0, -.225, .075))
    s = Shape()
    s.ellipsoid((0, -.015, -.013), (.044, .073, .060))  # neck
    s.ellipsoid((0, -.065, .026), (.073, .074, .064), sides=12)
    s.mesh('skull', head, fur)
    s = Shape()
    for side in (-1, 1):
        s.ellipsoid((side * .022, -.123, .000), (.027, .032, .023), sides=8, bands=4)
    s.ellipsoid((0, -.111, -.021), (.031, .032, .014), sides=8, bands=4)
    s.mesh('muzzle', head, muzzle)
    s = Shape()
    s.vertices = [(-.012, -.148, .007), (.012, -.148, .007), (0, -.154, -.005), (0, -.140, .002)]
    s.faces = [(0, 1, 2), (0, 3, 1), (1, 3, 2), (2, 3, 0)]
    s.mesh('nose', head, nose, False)
    for side, suffix in ((-1, 'l'), (1, 'r')):
        ear = pivot('ear_' + suffix, head, (side * .048, -.043, .067))
        s = Shape()
        s.vertices = [(-.026, -.019, 0), (.026, -.019, 0),
                      (side * .019, -.002, .082), (-.025, .014, 0), (.025, .014, 0)]
        s.faces = [(0, 1, 2), (3, 2, 4), (0, 2, 3), (1, 4, 2), (0, 3, 4, 1)]
        s.mesh('ear_shell_' + suffix, ear, fur, False)
        s = Shape()
        s.vertices = [(-.017, -.0195, .010), (.017, -.0195, .010),
                      (side * .014, -.007, .065)]
        s.faces = [(0, 1, 2)]
        s.mesh('ear_inner_' + suffix, ear, inner, False)
        s = Shape()
        s.ellipsoid((side * .049, -.116, .033), (.014, .006, .006), sides=8, bands=4)
        s.mesh('eye_' + suffix, head, eye)

    # Each limb is one rigid shape: shoulder/hip, tapered shank, ankle and paw.
    for front, y in ((True, -.17), (False, .16)):
        for side, suffix in ((-1, 'l'), (1, 'r')):
            name = 'leg_' + ('f' if front else 'b') + suffix
            leg = pivot(name, body, (side * .061, y, -.026))
            s = Shape()
            if front:
                pts = [(0, 0, .015), (0, .014, -.09), (0, -.006, -.204), (0, -.014, -.233)]
                radii = [.031, .023, .012, .014]
            else:
                pts = [(0, 0, .025), (0, -.033, -.075), (0, .030, -.157), (0, -.012, -.233)]
                radii = [.046, .032, .015, .014]
            s.tube(pts, radii, sides=8)
            s.ellipsoid((0, -.027, -.243), (.023, .038, .021), sides=8, bands=4)
            s.mesh(name + '_mesh', leg, fur)

    parent = body
    for i in range(5):
        tail = pivot('tail_' + str(i), parent, (0, .225, .022) if i == 0 else (0, .096, 0))
        s = Shape()
        r = .021 - i * .0034
        s.tube([(0, -.004, 0), (0, .048, 0), (0, .100, 0)],
               [r, r - .001, .002 if i == 4 else r - .0034], sides=8)
        s.mesh('tail_mesh_' + str(i), tail, fur)
        parent = tail

    # Enforce the budget and pivot contract at real export, not merely in py_compile.
    required = {'body': 'cat', 'head': 'body', 'ear_l': 'head', 'ear_r': 'head',
                **{n: 'body' for n in ('leg_fl', 'leg_fr', 'leg_bl', 'leg_br')},
                **{'tail_' + str(i): 'body' if i == 0 else 'tail_' + str(i - 1) for i in range(5)}}
    for name, parent_name in required.items():
        obj = bpy.data.objects[name]
        assert obj.type == 'EMPTY' and obj.parent.name == parent_name, name
    triangles = 0
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
    assert triangles < 4000, f'Triangle budget exceeded: {triangles}'
    bpy.context.view_layer.update()
    floor = min((obj.matrix_world @ v.co).z for obj in bpy.data.objects
                if obj.type == 'MESH' for v in obj.data.vertices)
    assert abs(floor) < .002, f'Feet do not meet root ground: {floor}'
    out = Path('assets/models/cat.glb')
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', export_yup=True,
                              export_animations=False, export_texcoords=False,
                              export_tangents=False, export_extras=True)
    print(f'CAT_EXPORTED {out} TRIANGLES {triangles} BYTES {out.stat().st_size}')


if __name__ == '__main__':
    try:
        build()
    except Exception:
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
    sys.stdout.flush(); os._exit(0)
