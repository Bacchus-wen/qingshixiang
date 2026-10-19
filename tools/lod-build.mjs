// Web levels of detail for raw Tripo models -- without the broken look of the old Blender decimation:
//   L0 = the raw generated mesh, every triangle, original texture resolution (only quantised + compressed)
//   L1.. = meshopt simplification that keeps UV seams intact (never pulls a triangle across texture charts), each with
//          its measured geometric error in metres and a matching texture resolution. The runtime shows a coarser level
//          only while its error stays under one screen pixel, so the switch is not visible.
// Placement is done here (rotate about up, scale to real size, origin at the bottom centre) and is identical for every
// level; the bottom and top contact surfaces are locked so things standing on/under a model touch at every level.
//
//   node tools/lod-build.mjs --name crt_tv --in raw.glb --size 0.5 [--axis long] [--rotz 0] [--levels 0.5:2048,2:1024,4:512]
//        [--out assets/models/shop/lod] [--probe]
// Writes <out>/<name>/L0.glb, L1.glb, ... and <out>/<name>/lod.json. Needs ~/Tools/node (gltf-transform, meshoptimizer)
// and the gltf-transform CLI with KTX-Software (toktx) for the KTX2 textures.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, cloneDocument, prune, dedup, quantize, meshopt, textureCompress, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier as S, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const A = process.argv.slice(2), arg = (n, d) => (A.includes(n) ? A[A.indexOf(n) + 1] : d);
const NAME = arg('--name'), IN = arg('--in'), SIZE = +arg('--size', '1'), AXIS = arg('--axis', 'long'), ROTZ = +arg('--rotz', '0');
const LEVELS = arg('--levels', '0.5:2048,2:1024,6:512').split(',').map((s) => { const [e, t] = s.split(':'); return { errMM: +e, tex: +t }; });
const OUT = path.join(arg('--out', 'assets/models/shop/lod'), NAME), PROBE = A.includes('--probe'), UVW = +arg('--uvw', '100'); // texture-coordinate weight for permissive levels
const GT = path.join(os.homedir(), 'Tools/bin/gltf-transform');
await Promise.all([S.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// ---- load + place (positions/normals only; the mesh itself is untouched) ------------------------------------------
const doc = await io.read(IN);
const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
const prims = []; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) prims.push(p);
for (const node of root.listNodes()) { // bake node transforms into the vertices
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix(); if (m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9)) continue;
  const nm = normalMatrix(m);
  for (const p of mesh.listPrimitives()) { xform(p.getAttribute('POSITION'), (x, y, z) => mul(m, x, y, z)); const n = p.getAttribute('NORMAL'); if (n) xform(n, (x, y, z) => norm(mul3(nm, x, y, z))); }
}
for (const node of root.listNodes()) node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
const a = (ROTZ * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), rot = (x, y, z) => [x * c + z * s, y, -x * s + z * c]; // Blender rotz -> glTF yaw
const done = new Set();
for (const p of prims) for (const k of ['POSITION', 'NORMAL']) { const acc = p.getAttribute(k); if (acc && !done.has(acc)) { done.add(acc); xform(acc, rot); } }
let b = getBounds(scene); const d = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
const k = SIZE / { long: Math.max(d[0], d[2]), height: d[1], width: d[0], depth: d[2] }[AXIS], cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
done.clear();
for (const p of prims) { const acc = p.getAttribute('POSITION'); if (!done.has(acc)) { done.add(acc); xform(acc, (x, y, z) => [(x - cx) * k, (y - y0) * k, (z - cz) * k]); } }
b = getBounds(scene); const ext = Math.max(...[0, 1, 2].map((i) => b.max[i] - b.min[i])), H = b.max[1] - b.min[1];

// texel density at full resolution (texels per metre on the surface): sqrt(texel area / world area), colour texture
const tex0 = Math.max(...root.listTextures().map((t) => t.getSize()?.[0] || 0), 1);
let uvA = 0, wA = 0;
for (const p of prims) {
  const P = p.getAttribute('POSITION').getArray(), U = p.getAttribute('TEXCOORD_0')?.getArray(), I = p.getIndices()?.getArray(); if (!U || !I) continue;
  const T = p.getMaterial()?.getBaseColorTexture()?.getSize()?.[0] || tex0;
  for (let t = 0; t < I.length; t += 3) {
    const [i0, i1, i2] = [I[t], I[t + 1], I[t + 2]];
    const ax = P[3 * i1] - P[3 * i0], ay = P[3 * i1 + 1] - P[3 * i0 + 1], az = P[3 * i1 + 2] - P[3 * i0 + 2], bx = P[3 * i2] - P[3 * i0], by = P[3 * i2 + 1] - P[3 * i0 + 1], bz = P[3 * i2 + 2] - P[3 * i0 + 2];
    wA += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
    uvA += Math.abs((U[2 * i1] - U[2 * i0]) * (U[2 * i2 + 1] - U[2 * i0 + 1]) - (U[2 * i2] - U[2 * i0]) * (U[2 * i1 + 1] - U[2 * i0 + 1])) / 2 * T * T;
  }
}
const texelsPerM0 = Math.sqrt(uvA / Math.max(wA, 1e-9));
const tris = (dd) => { let n = 0; for (const m of dd.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? 0) / 3; return n; };
console.log(`${NAME}: raw ${tris(doc)} tris, ${d.map((x) => (x * k).toFixed(3)).join(' x ')} m, textures ${tex0}px, ${texelsPerM0.toFixed(0)} texels/m`);

// ---- levels ------------------------------------------------------------------------------------------------------
// No contact locks: planar contacts (flat bottoms, bench and shelf tops) simplify without moving off their plane, and
// edge collapses only ever keep original vertices, so a coarse level's lowest point can only be at or above L0's. Each
// level records that lowest point (minY); the runtime lowers the level by it, so every level stands where L0 stands.
// UV seams are kept by default. A mesh whose UV charts are so fragmented that this stalls (no real reduction) is
// simplified "permissively": seams may collapse where the texture-coordinate error (weighted) stays small.
function simplifyDoc(dd, errM, prevTris) {
  let worst = 0, permissive = false;
  for (const m of dd.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const P = p.getAttribute('POSITION').getArray(), I = new Uint32Array(p.getIndices().getArray());
    const U = p.getAttribute('TEXCOORD_0')?.getArray(), n = P.length / 3;
    let [out, e] = S.simplifyWithAttributes(I, P, 3, new Float32Array(n), 1, [0], null, 0, errM / ext, ['Prune']);
    const share = (prevTris ?? I.length / 3) * (I.length / 3) / tris(doc); // previous level's triangles for this primitive
    if (U && out.length / 3 > 0.8 * share && out.length / 3 > 4000) { // stalled: seams leave nothing to collapse
      const attr = new Float32Array(n * 2); attr.set(U.subarray(0, n * 2));
      [out, e] = S.simplifyWithAttributes(I, P, 3, attr, 2, [UVW, UVW], null, 0, errM / ext, ['Prune', 'Permissive']); permissive = true;
    }
    worst = Math.max(worst, e * ext);
    p.setIndices(p.getIndices().clone().setArray(out.length / 3 > 0 ? out : I));
  }
  return [worst, permissive];
}
function minY(dd) {
  let lo = Infinity;
  for (const m of dd.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const P = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray();
    for (let t = 0; t < I.length; t++) { const y = P[3 * I[t] + 1]; if (y < lo) lo = y; }
  }
  return lo;
}
const levels = [{ file: 'L0.glb', tris: tris(doc), errM: 0, tex: tex0, texelsPerM: texelsPerM0, minY: +minY(doc).toFixed(5) }];
const docs = [doc];
for (const L of LEVELS) {
  const prev = levels[levels.length - 1], dd = cloneDocument(doc), [e, perm] = simplifyDoc(dd, L.errMM / 1000, prev.tris), t = tris(dd);
  const tex = Math.min(L.tex, tex0);
  if (t > prev.tris * 0.8 && tex >= prev.tex) { console.log(`  skip ${L.errMM} mm: ${t} tris (no real saving)`); continue; }
  levels.push({ file: `L${levels.length}.glb`, tris: t, errM: +e.toFixed(5), tex, texelsPerM: texelsPerM0 * tex / tex0, minY: +minY(dd).toFixed(5), permissive: perm || undefined });
  docs.push(dd);
  console.log(`  L${levels.length - 1}: target ${L.errMM} mm -> ${t} tris (${(t / levels[0].tris * 100).toFixed(1)}%), error ${(e * 1000).toFixed(2)} mm, lowest point +${(levels.at(-1).minY * 1000).toFixed(2)} mm, textures ${tex}px${perm ? ', permissive' : ''}`);
}
if (PROBE) process.exit(0);

// ---- write: textures to KTX2 (UASTC + RDO, zstd), geometry quantised + meshopt ----------------------------------
mkdirSync(OUT, { recursive: true });
const tmp = path.join(os.tmpdir(), `lod_${NAME}`); mkdirSync(tmp, { recursive: true });
for (const [i, L] of levels.entries()) {
  const dd = docs[i];
  await dd.transform(prune(), dedup());
  if (L.tex < tex0) await dd.transform(textureCompress({ encoder: sharp, resize: [L.tex, L.tex], targetFormat: 'png' }));
  const t0 = path.join(tmp, `t${i}.glb`), t1 = path.join(tmp, `t${i}b.glb`), t2 = path.join(tmp, `t${i}c.glb`);
  await io.write(t0, dd);
  // fine levels (full or 2K textures): UASTC + RDO for every map. Coarse levels (1K and below, only ever seen minified):
  // ETC1S for colour and roughness/metal (a quarter of the bytes), UASTC for normals (ETC1S breaks normal maps)
  const lam = [1, 2, 3, 4][Math.min(i, 3)];
  if (L.tex > 1024) {
    execFileSync(GT, ['uastc', t0, t1, '--slots', '{baseColorTexture,emissiveTexture}', '--level', '2', '--rdo', '--rdo-lambda', String(lam), '--zstd', '18'], { stdio: 'ignore' });
    execFileSync(GT, ['uastc', t1, t2, '--slots', '{normalTexture,metallicRoughnessTexture,occlusionTexture}', '--level', '2', '--rdo', '--rdo-lambda', String(Math.max(1, lam - 1)), '--zstd', '18'], { stdio: 'ignore' });
  } else {
    execFileSync(GT, ['etc1s', t0, t1, '--slots', '{baseColorTexture,emissiveTexture,metallicRoughnessTexture,occlusionTexture}', '--quality', '255', '--compression', '4'], { stdio: 'ignore' });
    execFileSync(GT, ['uastc', t1, t2, '--slots', '{normalTexture}', '--level', '2', '--rdo', '--rdo-lambda', '3', '--zstd', '18'], { stdio: 'ignore' });
  }
  const fd = await io.read(t2);
  // 16-bit positions (0.02 mm on a 1 m model), 12-bit normals, 14-bit UVs (a quarter texel on an 8K texture)
  await fd.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }));
  await io.write(path.join(OUT, L.file), fd);
  L.bytes = statSync(path.join(OUT, L.file)).size;
  console.log(`  wrote ${L.file}: ${(L.bytes / 1048576).toFixed(1)} MB`);
}
rmSync(tmp, { recursive: true, force: true });
const meta = { name: NAME, source: IN, size: SIZE, axis: AXIS, rotz: ROTZ, dims: d.map((x) => +(x * k).toFixed(4)), radius: +(Math.hypot(...d.map((x) => x * k)) / 2).toFixed(4), levels };
writeFileSync(path.join(OUT, 'lod.json'), JSON.stringify(meta, null, 1));
console.log('LOD', NAME, levels.map((L) => `${L.file} ${L.tris} tris ${(L.bytes / 1048576).toFixed(1)} MB`).join(' | '));

function xform(acc, f) { const arr = acc.getArray(); for (let i = 0; i < arr.length; i += 3) { const r = f(arr[i], arr[i + 1], arr[i + 2]); arr[i] = r[0]; arr[i + 1] = r[1]; arr[i + 2] = r[2]; } acc.setArray(arr); }
function mul(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
function mul3(n, x, y, z) { return [n[0] * x + n[3] * y + n[6] * z, n[1] * x + n[4] * y + n[7] * z, n[2] * x + n[5] * y + n[8] * z]; }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function normalMatrix(m) {
  const [a_, b_, c_, d_, e_, f_, g_, h_, i_] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A_ = e_ * i_ - f_ * h_, B_ = -(d_ * i_ - f_ * g_), C_ = d_ * h_ - e_ * g_, det = a_ * A_ + b_ * B_ + c_ * C_ || 1;
  const inv = [A_, -(b_ * i_ - c_ * h_), b_ * f_ - c_ * e_, B_, a_ * i_ - c_ * g_, -(a_ * f_ - c_ * d_), C_, -(a_ * h_ - b_ * g_), a_ * e_ - b_ * d_].map((v) => v / det);
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}
