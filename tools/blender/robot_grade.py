"""Colour-grade the assembled robot's base-colour textures (headless): Tripo's delighting left a pink/copper cast on
the bare steel. Pull reddish-pink hues and weakly saturated pixels toward neutral grey steel; leave brass (yellow),
rust (orange-brown), the green paint and the orange lens alone. Optionally lift the steel a little.

  Blender -b --factory-startup -P tools/blender/robot_grade.py -- --in robot_v2.glb --out robot_v2g.glb
        [--pink 0.35] [--grey 0.5] [--lift 1.08]
--pink: saturation kept for hues 320..15 deg; --grey: saturation kept where saturation < 0.3; --lift: value multiplier
for those neutralised pixels (steel reads lighter, like the design sheet).
"""
import bpy, sys, os
import numpy as np
A = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return A[A.index(n) + 1] if n in A else d
PINK, GREY, LIFT = float(arg('--pink', '0.35')), float(arg('--grey', '0.5')), float(arg('--lift', '1.08'))
RUST = float(arg('--rust', '1.0'))  # saturation kept for strong orange (rust) on the body only (not the head)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=arg('--in'))
base = {}
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for slot in o.material_slots:
        m = slot.material
        if not m or not m.use_nodes: continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for l in n.inputs['Base Color'].links:
                    if l.from_node.type == 'TEX_IMAGE' and l.from_node.image: base[l.from_node.image] = o.name
for img, owner in base.items():
    print('IMAGE', img.name, 'on', owner)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2); d = mx - mn
    s = np.where(mx > 1e-5, d / np.maximum(mx, 1e-5), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.zeros_like(mx)
    dd = np.maximum(d, 1e-6)
    hue = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) / 6.0
    hue = np.where(d < 1e-6, 0, hue)
    pink = ((hue > 320 / 360) | (hue < 15 / 360)).astype(np.float32)
    weak = np.clip((0.3 - s) / 0.15, 0, 1)  # 1 where saturation < 0.15, fading out by 0.3
    keep = 1 - pink * (1 - PINK)
    keep = keep * (1 - weak * (1 - GREY))
    if 'head' not in owner:
        rust = ((hue >= 15 / 360) & (hue < 40 / 360) & (s > 0.45)).astype(np.float32)
        keep = keep * (1 - rust * (1 - RUST))
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b)[..., None]
    out = lum + (rgb - lum) * keep[..., None]
    lift = 1 + (LIFT - 1) * np.maximum(pink, weak)[..., None]
    out = np.clip(out * lift, 0, 1)
    px[..., :3] = out
    img.pixels = px.ravel().tolist(); img.update()
    # make the exporter write the edited pixels (packed JPEG)
    img.pack()
    print('GRADED', img.name, w, h)
bpy.ops.export_scene.gltf(filepath=arg('--out'), export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=92, export_materials='EXPORT')
print('OUT', arg('--out'))
sys.stdout.flush(); os._exit(0)
