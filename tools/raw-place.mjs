// Place a raw Tripo GLB for the scene WITHOUT touching its mesh: no decimation, no welding, no re-triangulation.
// Only the vertex positions are transformed (rotate about the up axis, uniform scale to a real-world size, origin at
// the bottom centre) and normals rotated with them, so the file behaves like the old prepared models in the layout.
//   node tools/raw-place.mjs --in raw.glb --out placed.glb --size 0.55 [--axis long|height|width|depth] [--rotz -90]
// --rotz is in the Blender convention used by tools/blender/prep_model.py (Z up): three.js yaw = same angle about +Y.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const A = process.argv.slice(2), arg = (n, d) => (A.includes(n) ? A[A.indexOf(n) + 1] : d);
const IN = arg('--in'), OUT = arg('--out'), SIZE = +arg('--size', '1'), AXIS = arg('--axis', 'long'), ROTZ = +arg('--rotz', '0');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];

// bake every node transform into its mesh first, so all positions are in one (scene) frame
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  const isIdentity = m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);
  if (isIdentity) continue;
  const nm = normalMatrix(m);
  for (const prim of mesh.listPrimitives()) {
    xform(prim.getAttribute('POSITION'), (x, y, z) => mul(m, x, y, z, 1));
    const n = prim.getAttribute('NORMAL'); if (n) xform(n, (x, y, z) => norm(mul3(nm, x, y, z)));
  }
}
for (const node of root.listNodes()) { node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); }

// rotate about +Y (glTF is Y-up; Blender's Z rotation by the same angle maps to this), then measure
const a = (ROTZ * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
// Blender: x' = x c - y s, y' = x s + y c (Z up). glTF y_b = -z_g: x' = x c + z s, z' = -x s + z c
const rot = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
const seen = new Set();
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const p = prim.getAttribute('POSITION'); if (seen.has(p)) continue; seen.add(p);
  xform(p, rot);
  const n = prim.getAttribute('NORMAL'); if (n && !seen.has(n)) { seen.add(n); xform(n, rot); }
}
const b = getBounds(scene), d = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const ref = { long: Math.max(d[0], d[2]), height: d[1], width: d[0], depth: d[2] }[AXIS];
const k = SIZE / ref, cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
seen.clear();
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const p = prim.getAttribute('POSITION'); if (seen.has(p)) continue; seen.add(p);
  xform(p, (x, y, z) => [(x - cx) * k, (y - y0) * k, (z - cz) * k]);
}
await io.write(OUT, doc);
const b2 = getBounds(scene);
let tris = 0; for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
console.log('PLACE', OUT, 'tris', tris, 'dims_m', [0, 1, 2].map((i) => +(b2.max[i] - b2.min[i]).toFixed(3)).join(' '));

function xform(acc, f) {
  const arr = acc.getArray(), t = new Float32Array(3);
  for (let i = 0; i < arr.length; i += 3) { const r = f(arr[i], arr[i + 1], arr[i + 2]); arr[i] = r[0]; arr[i + 1] = r[1]; arr[i + 2] = r[2]; }
  acc.setArray(arr);
}
function mul(m, x, y, z, w) { return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w]; }
function mul3(n, x, y, z) { return [n[0] * x + n[3] * y + n[6] * z, n[1] * x + n[4] * y + n[7] * z, n[2] * x + n[5] * y + n[8] * z]; }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function normalMatrix(m) { // inverse transpose of the upper 3x3 (column-major)
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A_ = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A_ + b * B + c * C || 1;
  const inv = [A_, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]; // transpose
}
