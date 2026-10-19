// Look straight down the robot's lens axis: points of the source mesh within a slab around the lens, projected onto
// the lens plane at 5 px/mm, coloured by texture, grid every 1 cm. Prints the barrel / glass radii estimate.
//   node --preserve-symlinks --preserve-symlinks-main ~/Tools/node/lens-probe.mjs <robot.glb> <out.png>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';
const [IN, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN); const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
const b = getBounds(scene), k = 1.05 / (b.max[1] - b.min[1]), cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
const C = [0.1112, 0.8306, 0.1937], n0 = [0.305, -0.276, 0.912], L = Math.hypot(...n0), N = n0.map((v) => v / L);
const U = (() => { const up = [0, 1, 0]; const u = [up[1] * N[2] - up[2] * N[1], up[2] * N[0] - up[0] * N[2], up[0] * N[1] - up[1] * N[0]]; const l = Math.hypot(...u); return u.map((v) => v / l); })();
const V = [N[1] * U[2] - N[2] * U[1], N[2] * U[0] - N[0] * U[2], N[0] * U[1] - N[1] * U[0]];
const S = 5000, R = 0.08, W = Math.round(2 * R * S); const buf = Buffer.alloc(W * W * 3, 30), zb = new Float32Array(W * W).fill(-1e9);
const radial = [];
for (const node of root.listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'); const img = prim.getMaterial()?.getBaseColorTexture();
    const { data, info } = await sharp(Buffer.from(img.getImage())).resize(4096, 4096, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const p = [0, 0, 0], uv = [0, 0];
    for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p);
      const x = ((m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) - cx) * k, y = ((m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) - y0) * k, z = ((m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) - cz) * k;
      const d = [x - C[0], y - C[1], z - C[2]], h = d[0] * N[0] + d[1] * N[1] + d[2] * N[2];
      if (h < -0.06 || h > 0.05) continue;
      const a = d[0] * U[0] + d[1] * U[1] + d[2] * U[2], bb = d[0] * V[0] + d[1] * V[1] + d[2] * V[2]; if (Math.abs(a) > R || Math.abs(bb) > R) continue;
      UV.getElement(i, uv); const tu = Math.min(4095, Math.max(0, Math.floor(((uv[0] % 1) + 1) % 1 * 4096))), tv = Math.min(4095, Math.max(0, Math.floor(((uv[1] % 1) + 1) % 1 * 4096))); const o = (tv * 4096 + tu) * info.channels;
      const px = Math.floor((a + R) * S), py = Math.floor((R - bb) * S);
      for (let du = 0; du < 3; du++) for (let dv = 0; dv < 3; dv++) { const q = (py + dv) * W + px + du; if (px + du >= W || py + dv >= W) continue; if (h > zb[q]) { zb[q] = h; buf[q * 3] = data[o]; buf[q * 3 + 1] = data[o + 1]; buf[q * 3 + 2] = data[o + 2]; } }
      radial.push([Math.hypot(a, bb), h]);
    } } }
for (let px = 0; px < W; px++) for (let py = 0; py < W; py++) { const a = px / S - R, bb = R - py / S; if (Math.abs(a / 0.01 - Math.round(a / 0.01)) < 0.0002 * 100 / 2 / 1 && Math.abs(a / 0.01 - Math.round(a / 0.01)) * 0.01 < 0.0001) { const q = (py * W + px) * 3; buf[q] = 200; buf[q + 1] = 60; buf[q + 2] = 60; } if (Math.abs(bb / 0.01 - Math.round(bb / 0.01)) * 0.01 < 0.0001) { const q = (py * W + px) * 3; buf[q] = 200; buf[q + 1] = 60; buf[q + 2] = 60; } }
await sharp(buf, { raw: { width: W, height: W, channels: 3 } }).png().toFile(OUT);
// forward-most surface by radius (the barrel rim stands proud of the glass)
const bins = new Map(); for (const [r, h] of radial) { const k2 = Math.round(r * 500); bins.set(k2, Math.max(bins.get(k2) ?? -1, h)); }
console.log('radius_mm:front_h_mm', [...bins.entries()].sort((a, b) => a[0] - b[0]).filter(([k2]) => k2 % 3 === 0 && k2 <= 40).map(([k2, h]) => `${k2 * 2}:${(h * 1000).toFixed(0)}`).join(' '));
console.log('wrote', OUT, W, 'px; U', U.map((v) => v.toFixed(3)).join(','), 'V', V.map((v) => v.toFixed(3)).join(','));
