// Look inside a generated model in the frame the scene uses (placed exactly like tools/lod-build.mjs from the entry in
// tools/lod-models.json: turned, scaled to its real size, origin at the bottom centre, facing +z). Writes orthographic
// point images coloured by the base-colour texture (front = looking at -z from +z, side = from +x, top = from +y),
// with a 5 cm grid (10 cm lines red), plus optional slab cuts, so parts (a TV screen, fan blades, a pendulum) can be
// located in model space. Prints the bounding box of vertices matching an optional colour test.
//   node --preserve-symlinks --preserve-symlinks-main ~/Tools/node/model-probe.mjs <name> <outdir> [--cut x:0.0:0.01]
//        [--match "r>0.8&&g<0.5"] [--within "z>0.1"]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const A = process.argv.slice(2), arg = (n, d) => (A.includes(n) ? A[A.indexOf(n) + 1] : d);
const [NAME, OUT] = A;
const ROOT = path.resolve(path.dirname(fs.realpathSync(process.argv[1])), '..');
const entry = arg('--file') ? { name: NAME, in: arg('--file'), size: +arg('--size', '1'), axis: arg('--axis', 'height'), rotz: +arg('--rotz', '0') }
  : JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/lod-models.json'), 'utf8')).models.find((m) => m.name === NAME);
if (!entry) throw new Error(`no model ${NAME} in tools/lod-models.json`);
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.isAbsolute(entry.in) ? entry.in : path.join(ROOT, entry.in));
const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
const a = ((entry.rotz || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
const pts = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0');
    const img = prim.getMaterial()?.getBaseColorTexture();
    let pix = null, W = 0, H = 0, ch = 4;
    if (img) { const r = await sharp(Buffer.from(img.getImage())).resize(2048, 2048, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }); pix = r.data; W = r.info.width; H = r.info.height; ch = r.info.channels; }
    const p = [0, 0, 0], uv = [0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, p);
      let x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
      [x, z] = [x * c + z * s, -x * s + z * c];
      let r = 200, g = 200, b = 200;
      if (pix && UV) { UV.getElement(i, uv); const u = Math.min(W - 1, Math.max(0, Math.floor(((uv[0] % 1) + 1) % 1 * W))), v = Math.min(H - 1, Math.max(0, Math.floor(((uv[1] % 1) + 1) % 1 * H))); const o = (v * W + u) * ch; r = pix[o]; g = pix[o + 1]; b = pix[o + 2]; }
      pts.push([x, y, z, r, g, b]);
    }
  }
}
// placement: like lod-build (bounds after the turn, scale by the chosen axis, origin bottom centre)
const lo = (arr, i) => arr.reduce((t, q) => Math.min(t, q[i]), Infinity), hi = (arr, i) => arr.reduce((t, q) => Math.max(t, q[i]), -Infinity);
const mn = [0, 1, 2].map((i) => lo(pts, i)), mx = [0, 1, 2].map((i) => hi(pts, i));
const d = [0, 1, 2].map((i) => mx[i] - mn[i]);
const k = entry.size / { long: Math.max(d[0], d[2]), height: d[1], width: d[0], depth: d[2] }[entry.axis || 'long'];
const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, y0 = mn[1];
for (const q of pts) { q[0] = (q[0] - cx) * k; q[1] = (q[1] - y0) * k; q[2] = (q[2] - cz) * k; }
const ext = [0, 1, 2].map((i) => [lo(pts, i), hi(pts, i)]);
console.log(NAME, 'vertices', pts.length, 'extent', JSON.stringify(ext.map((e) => e.map((v) => +v.toFixed(3)))));
// colour test
const test = arg('--match'), within = arg('--within');
if (test) {
  const f = new Function('r', 'g', 'b', 'x', 'y', 'z', `return (${test}) && (${within || 'true'});`);
  const hit = pts.filter((q) => f(q[3] / 255, q[4] / 255, q[5] / 255, q[0], q[1], q[2]));
  if (hit.length) {
    const he = [0, 1, 2].map((i) => [lo(hit, i), hi(hit, i)]);
    const cen = [0, 1, 2].map((i) => hit.reduce((t, q) => t + q[i], 0) / hit.length);
    console.log('MATCH', hit.length, 'bbox', JSON.stringify(he.map((e) => e.map((v) => +v.toFixed(4)))), 'centroid', cen.map((v) => v.toFixed(4)).join(' '));
    if (A.includes('--pca')) { // principal axes of the matched points (power iteration on the covariance)
      const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const q of hit) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (q[i] - cen[i]) * (q[j] - cen[j]) / hit.length;
      const axes = []; let M = C.map((r) => r.slice());
      for (let n = 0; n < 3; n++) {
        let v = [1, 0.3, 0.2]; for (let it = 0; it < 200; it++) { const w = [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]); const L = Math.hypot(...w) || 1; v = w.map((x) => x / L); }
        const lam = [0, 1, 2].reduce((t, i) => t + v[i] * (M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]), 0);
        axes.push([lam, v]); M = M.map((r, i) => r.map((x, j) => x - lam * v[i] * v[j]));
      }
      for (const [lam, v] of axes) console.log('PCA', 'sd', Math.sqrt(Math.max(0, lam)).toFixed(4), 'axis', v.map((x) => x.toFixed(4)).join(' '));
    }
  } else console.log('MATCH none');
}
const PX = +arg('--px', 1000); // pixels per metre
async function view(name, hor, ver, depth, sign, list, flipH = false) {
  const h0 = ext[hor][0] - 0.02, h1 = ext[hor][1] + 0.02, v0 = ext[ver][0] - 0.02, v1 = ext[ver][1] + 0.02;
  const W = Math.round((h1 - h0) * PX), H = Math.round((v1 - v0) * PX);
  const buf = Buffer.alloc(W * H * 3, 40), zb = new Float32Array(W * H).fill(-1e9);
  for (const q of list) {
    let u = Math.floor((q[hor] - h0) * PX); if (flipH) u = W - 1 - u;
    const v = Math.floor((v1 - q[ver]) * PX); if (u < 0 || v < 0 || u >= W || v >= H) continue;
    const dd = sign * q[depth];
    for (let du = 0; du < 2; du++) for (let dv = 0; dv < 2; dv++) { const uu = u + du, vv = v + dv; if (uu >= W || vv >= H) continue; const o = vv * W + uu; if (dd > zb[o]) { zb[o] = dd; buf[o * 3] = q[3]; buf[o * 3 + 1] = q[4]; buf[o * 3 + 2] = q[5]; } }
  }
  const grid = (val) => { const f10 = Math.abs(val / 0.1 - Math.round(val / 0.1)) * 0.1 < 0.6 / PX, f5 = Math.abs(val / 0.05 - Math.round(val / 0.05)) * 0.05 < 0.6 / PX; return f10 ? 2 : f5 ? 1 : 0; };
  for (let u = 0; u < W; u++) for (let v = 0; v < H; v++) {
    const x = h0 + (flipH ? W - 1 - u : u) / PX, y = v1 - v / PX, gl = Math.max(grid(x), grid(y));
    if (gl) { const o = (v * W + u) * 3; buf[o] = gl === 2 ? 255 : 110; buf[o + 1] = gl === 2 ? 60 : 110; buf[o + 2] = gl === 2 ? 60 : 150; }
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${OUT}/${NAME}-${name}.png`);
  console.log('wrote', `${OUT}/${NAME}-${name}.png`, W, H, `h ${h0.toFixed(3)}..${h1.toFixed(3)} v ${v0.toFixed(3)}..${v1.toFixed(3)}${flipH ? ' (h flipped)' : ''}`);
}
// front: viewer at +z looking -z (image right = -x... flipped so image right = +x is the model's left as seen from the front)
await view('front', 0, 1, 2, 1, pts, true);
await view('side', 2, 1, 0, 1, pts);
await view('top', 0, 2, 1, 1, pts);
for (const cut of [].concat(A.filter((x, i) => A[i - 1] === '--cut'))) {
  const [ax, cen, hw] = cut.split(':'); const ai = 'xyz'.indexOf(ax), cc = +cen, w = +hw;
  const sl = pts.filter((q) => Math.abs(q[ai] - cc) < w);
  if (ai === 0) await view(`cut-x${cc}`, 2, 1, 0, 1, sl);
  if (ai === 1) await view(`cut-y${cc}`, 0, 2, 1, 1, sl);
  if (ai === 2) await view(`cut-z${cc}`, 0, 1, 2, 1, sl, true);
}
