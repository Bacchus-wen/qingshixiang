"""Find the paper tags in the generated tag sheet (light cards on a dark background, 4 x 3 grid) and print their UV
rectangles as JSON ([u0, v0, u1, v1], v from the bottom as three.js uses it), row by row.
  Blender -b --factory-startup -P tools/blender/tag_rects.py -- tags.png 4 3"""
import bpy, sys, os, json
import numpy as np
A = sys.argv[sys.argv.index('--') + 1:]
img = bpy.data.images.load(A[0]); cols, rows = int(A[1]), int(A[2])
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)  # row 0 = bottom
lum = px[..., :3].mean(axis=2)
mask = lum > 0.45
out = []
for r in range(rows):          # top row first
    y0, y1 = int(h * (rows - 1 - r) / rows), int(h * (rows - r) / rows)
    for c in range(cols):
        x0, x1 = int(w * c / cols), int(w * (c + 1) / cols)
        m = mask[y0:y1, x0:x1]
        ys, xs = np.where(m)
        # robust bounds: ignore stray bright pixels (1st/99th percentile), then shrink 1% to stay inside the card
        bx0, bx1 = np.percentile(xs, 1), np.percentile(xs, 99); by0, by1 = np.percentile(ys, 1), np.percentile(ys, 99)
        u0, u1 = (x0 + bx0) / w, (x0 + bx1) / w; v0, v1 = (y0 + by0) / h, (y0 + by1) / h
        out.append([round(u0, 4), round(v0, 4), round(u1, 4), round(v1, 4)])
print('RECTS', json.dumps(out))
sys.stdout.flush(); os._exit(0)
