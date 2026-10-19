// Probe the generated robot for a soft neck rig: where the eye is, where the head box sits on the body.
// Reads the source GLB, places it exactly like tools/lod-build.mjs (height 1.05 m, origin bottom centre, no turn),
// samples the base colour at every vertex and writes orthographic point images (side / front / top of the head,
// 1 px = 1 mm, 5 cm grid) plus the eye's centre and facing direction.
//   node --preserve-symlinks --preserve-symlinks-main ~/Tools/node/robot-rig-probe.mjs <in.glb> <outdir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';

const [IN, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN);
const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
const b = getBounds(scene), H = b.max[1] - b.min[1], k = 1.05 / H, cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
console.log('bounds', b, 'k', k);
const pts = []; // [x, y, z, r, g, b]
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), N = prim.getAttribute('NORMAL');
    const img = prim.getMaterial()?.getBaseColorTexture();
    let pix = null, W = 0, Hh = 0;
    if (img) {
      const { data, info } = await sharp(Buffer.from(img.getImage())).resize(2048, 2048, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      pix = data; W = info.width; Hh = info.height; var ch = info.channels;
    }
    const p = [0, 0, 0], uv = [0, 0], n = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, p);
      const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
      let r = 200, g = 200, bb = 200;
      if (pix && UV) { UV.getElement(i, uv); const u = Math.min(W - 1, Math.max(0, Math.floor((uv[0] % 1 + 1) % 1 * W))), v = Math.min(Hh - 1, Math.max(0, Math.floor((uv[1] % 1 + 1) % 1 * Hh))); const o = (v * W + u) * ch; r = pix[o]; g = pix[o + 1]; bb = pix[o + 2]; }
      if (N) N.getElement(i, n);
      pts.push([(x - cx) * k, (y - y0) * k, (z - cz) * k, r, g, bb, n[0], n[1], n[2]]);
    }
  }
}
console.log('vertices', pts.length);
// eye: the bright orange lens core (same test as the shader in src/systems/shop/index.js), on the face only
const eye = pts.filter(([x, y, z, r, g, bb]) => r / 255 > 0.8 && g / 255 > 0.3 && g / 255 < 0.62 && bb / 255 < 0.35 && y > 0.78 && z > 0.0);
const avg = (a, i) => a.reduce((s, q) => s + q[i], 0) / a.length;
if (eye.length) {
  const c = [0, 1, 2].map((i) => avg(eye, i)), nrm = [6, 7, 8].map((i) => avg(eye, i)), L = Math.hypot(...nrm);
  const ext = [0, 1, 2].map((i) => [Math.min(...eye.map((q) => q[i])), Math.max(...eye.map((q) => q[i]))]);
  console.log('EYE', eye.length, 'centre', c.map((v) => v.toFixed(4)).join(' '), 'normal', nrm.map((v) => (v / L).toFixed(3)).join(' '), 'extent', JSON.stringify(ext.map((e) => e.map((v) => +v.toFixed(4)))));
}
// horizontal slices: x/z extent and vertex count per 1 cm
for (let y = 0.5; y < 1.06; y += 0.01) {
  const s = pts.filter((q) => q[1] >= y && q[1] < y + 0.01); if (!s.length) continue;
  const ex = (i) => [Math.min(...s.map((q) => q[i])), Math.max(...s.map((q) => q[i]))].map((v) => v.toFixed(3)).join('..');
  console.log('slice', y.toFixed(2), 'n', s.length, 'x', ex(0), 'z', ex(2));
}
// orthographic point images, 1 px = 1 mm, farthest-first so the near surface wins
async function view(name, hor, ver, depth, sign, range) {
  const [h0, h1, v0, v1] = range, W = Math.round((h1 - h0) * 1000), Hh = Math.round((v1 - v0) * 1000);
  const buf = Buffer.alloc(W * Hh * 3, 40), zb = new Float32Array(W * Hh).fill(-1e9);
  for (const q of pts) {
    const u = Math.floor((q[hor] - h0) * 1000), v = Math.floor((v1 - q[ver]) * 1000); if (u < 0 || v < 0 || u >= W || v >= Hh) continue;
    const d = sign * q[depth];
    for (let du = 0; du < 2; du++) for (let dv = 0; dv < 2; dv++) { const uu = u + du, vv = v + dv; if (uu >= W || vv >= Hh) continue; const o = vv * W + uu; if (d > zb[o]) { zb[o] = d; buf[o * 3] = q[3]; buf[o * 3 + 1] = q[4]; buf[o * 3 + 2] = q[5]; } }
  }
  for (let u = 0; u < W; u++) for (let v = 0; v < Hh; v++) { const x = h0 + u / 1000, y = v1 - v / 1000; if (Math.abs(x / 0.05 - Math.round(x / 0.05)) < 0.0006 || Math.abs(y / 0.05 - Math.round(y / 0.05)) < 0.0006) { const o = (v * W + u) * 3; const big = Math.abs(x / 0.1 - Math.round(x / 0.1)) < 0.0006 || Math.abs(y / 0.1 - Math.round(y / 0.1)) < 0.0006; buf[o] = big ? 255 : 120; buf[o + 1] = big ? 60 : 120; buf[o + 2] = big ? 60 : 160; } }
  await sharp(buf, { raw: { width: W, height: Hh, channels: 3 } }).png().toFile(`${OUT}/${name}.png`);
  console.log('wrote', name, W, Hh);
}
// side: z to the right (face at +z), y up, looking from +x
await view('side', 2, 1, 0, 1, [-0.36, 0.36, 0.45, 1.06]);
await view('front', 0, 1, 2, 1, [-0.32, 0.32, 0.45, 1.06]);
await view('back', 0, 1, 2, -1, [-0.32, 0.32, 0.45, 1.06]);
// cross-section slabs through the neck (2 cm thick): side cut at x = 0, front cut at z = 0, and a top view of
// everything under 0.80 m (the neck from above, shoulders around it)
const all = pts.slice();
const only = (f) => { pts.length = 0; for (const q of all) if (f(q)) pts.push(q); };
only((q) => Math.abs(q[0] - (+process.env.SX || 0)) < 0.01); await view('cut-side', 2, 1, 0, 1, [-0.36, 0.36, 0.45, 1.06]);
only((q) => Math.abs(q[2] - (+process.env.SZ || 0)) < 0.01); await view('cut-front', 0, 1, 2, 1, [-0.32, 0.32, 0.45, 1.06]);
only((q) => q[1] < 0.8 && q[1] > 0.6); await view('top-under-head', 0, 2, 1, 1, [-0.32, 0.32, -0.36, 0.36]);
pts.length = 0; for (const q of all) pts.push(q);
