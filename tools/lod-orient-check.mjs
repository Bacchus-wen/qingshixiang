// Orientation check: which yaw (0/90/180/270, Blender rotz convention) makes the raw model match the old prepared GLB
// (assets/generated/shop/prep/<name>.glb). Compares 8x8x8 occupancy grids of sampled vertices in each bounding box.
//   node tools/lod-orient-check.mjs tools/lod-models.json
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync, existsSync } from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const cfg = JSON.parse(readFileSync(process.argv[2] || 'tools/lod-models.json'));
async function points(file) {
  const doc = await io.read(file), pts = [];
  for (const node of doc.getRoot().listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const m = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) { const arr = p.getAttribute('POSITION').getArray(); const step = Math.max(1, Math.floor(arr.length / 3 / 60000));
      for (let i = 0; i < arr.length / 3; i += step) { const x = arr[3 * i], y = arr[3 * i + 1], z = arr[3 * i + 2];
        pts.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]); } } }
  return pts;
}
function grid(pts, rotz) {
  const a = (rotz * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), q = pts.map(([x, y, z]) => [x * c + z * s, y, -x * s + z * c]);
  const lo = [0, 1, 2].map((i) => Math.min(...q.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...q.map((p) => p[i]))), N = 8, g = new Uint8Array(N * N * N);
  for (const p of q) { const ix = p.map((v, i) => Math.min(N - 1, Math.floor(((v - lo[i]) / (hi[i] - lo[i] || 1)) * N))); g[ix[0] * N * N + ix[1] * N + ix[2]] = 1; }
  return g;
}
const iou = (A, B) => { let i = 0, u = 0; for (let k = 0; k < A.length; k++) { i += A[k] & B[k]; u += A[k] | B[k]; } return i / (u || 1); };
for (const m of cfg.models) {
  const old = `assets/generated/shop/prep/${m.name}.glb`; if (!existsSync(old)) { console.log(m.name.padEnd(18), 'no old prep'); continue; }
  const P = await points(m.in), G = grid(await points(old), 0);
  const sc = [0, -90, 180, 90].map((r) => [r, iou(grid(P, r), G)]).sort((x, y) => y[1] - x[1]);
  const cur = m.rotz || 0, best = sc[0][0];
  console.log(m.name.padEnd(18), 'best rotz', String(best).padStart(4), 'iou', sc[0][1].toFixed(2), 'next', sc[1][0], sc[1][1].toFixed(2), best === cur ? '' : `  <- config has ${cur}`);
}
