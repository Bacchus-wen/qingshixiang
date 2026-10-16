import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapse static meshes by material AND attribute layout. Custom facade data must survive.
// Dynamic shutters/cables and instanced meshes are kept. Source geometry is often shared by GLB clones.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    // Tangents are unnecessary here (normal basis is reconstructed in world space).
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k) && !k.startsWith('cc')) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(inverseRoot.clone().multiply(o.matrixWorld));
    const layout = Object.entries(g.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => `${k}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join('|');
    const key = `${o.material.uuid}/${layout}`;
    if (!groups.has(key)) groups.set(key, { mat: o.material, geoms: [], meshes: [], cast: false, receive: false });
    const e = groups.get(key);
    e.geoms.push(g); e.meshes.push(o); e.cast ||= o.castShadow; e.receive ||= o.receiveShadow;
  });
  let n = 0, count = 0;
  for (const e of groups.values()) {
    const merged = mergeGeometries(e.geoms, false);
    for (const g of e.geoms) g.dispose();
    if (!merged) { console.warn('[merge] failed; retaining originals', e.mat.name); continue; }
    for (const o of e.meshes) o.removeFromParent();
    count += e.meshes.length;
    const m = new THREE.Mesh(merged, e.mat);
    m.castShadow = e.cast; m.receiveShadow = e.receive; m.name = `merged_${e.mat.name || n}`;
    m.layers.enable(1);
    root.add(m); n++;
  }
  console.log(`[street] merged ${count} meshes into ${n}`);
}
