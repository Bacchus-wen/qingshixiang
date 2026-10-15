import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapse every static mesh under `root` into one mesh per material (draw calls: thousands -> dozens).
// Meshes with userData.dynamic (shutters, anything animated) are left alone.
const KEEP = ['position', 'normal', 'uv'];
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.dynamic || o.isInstancedMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.length > 1) return; // multi-material meshes stay as they are
    const key = mats[0];
    if (!groups.has(key)) groups.set(key, { geoms: [], cast: false });
    const e = groups.get(key);
    e.geoms.push(g); e.cast ||= o.castShadow;
    remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  let n = 0;
  for (const [mat, e] of groups) {
    const merged = mergeGeometries(e.geoms, false);
    if (!merged) { console.warn('[merge] failed for', mat.name); continue; }
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = e.cast; m.receiveShadow = true; m.name = `merged_${mat.name || n}`;
    root.add(m); n++;
  }
  console.log(`[street] merged ${remove.length} meshes into ${n}`);
}
