"""Texture prep for the shop room (headless Blender only for its bundled numpy + image IO; no scene work).

  Blender -b --factory-startup -P tools/blender/tex_prep.py -- seamless <in.png> <out.png> [blend 0.25]
  Blender -b --factory-startup -P tools/blender/tex_prep.py -- resize <in.png> <out.png> <maxpx>

seamless: the classic offset-and-feather fix for generated "tileable" textures that are not quite: blend the image with
a copy shifted by half its size, weighted so the original wins in the middle and the shifted copy (whose wrap edges are
the original's continuous centre) wins at the borders. Then the tile repeats without a visible seam.
Output is written as PNG; the shell converts to JPEG with sips.
"""
import bpy, sys, os
import numpy as np

A = sys.argv[sys.argv.index('--') + 1:]
cmd, src, dst = A[0], A[1], A[2]
img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
if cmd == 'seamless':
    bw = float(A[3]) if len(A) > 3 else 0.25
    sh = np.roll(np.roll(px, h // 2, axis=0), w // 2, axis=1)
    # weight = 1 in the centre region, falling smoothly to 0 within bw of each edge
    def ramp(n):
        t = np.minimum(np.arange(n) + 0.5, n - np.arange(n) - 0.5) / n  # 0 at edges, 0.5 in the middle
        x = np.clip(t / bw, 0, 1)
        return x * x * (3 - 2 * x)
    wgt = np.outer(ramp(h), ramp(w))[..., None]
    out = px * wgt + sh * (1 - wgt)
    out[..., 3] = 1
    o = bpy.data.images.new('o', w, h); o.pixels = out.ravel().tolist()
elif cmd == 'resize':
    m = int(A[3]); s = m / max(w, h)
    if s < 1: img.scale(max(1, round(w * s)), max(1, round(h * s)))
    o = img
o.filepath_raw = dst; o.file_format = 'PNG'; o.save()
print('TEX', cmd, dst, o.size[0], o.size[1])
sys.stdout.flush(); os._exit(0)
