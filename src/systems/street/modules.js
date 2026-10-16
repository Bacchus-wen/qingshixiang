import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// v3 facade modules: Tripo HD models made part by part (GPT Image 2.5 reference -> image-to-multiview ->
// multiview-to-model, detailed geometry + HD PBR), decimated and aligned in headless Blender
// (tools/blender/optimize_tripo.py: back face at local z=0, street side +Z, bottom at y=0).
// They replace some of the procedural windows: enclosed balconies with security cages, window + cage + AC units.
// Instanced per sub-mesh, so 40 modules cost a handful of draw calls.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const rand = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

export async function placeModules(ctx, root, windows, facades) {
  if (ctx.params.has('nomodules')) return;
  const kinds = {};
  for (const k of ['balcony', 'window_ac']) {
    try { kinds[k] = (await loader.loadAsync(`/models/v2/m_${k}.glb`)).scene; } catch (e) { console.warn('[modules] missing', k, e); }
  }
  const r = rand(0x5eed17);
  const place = { balcony: [], window_ac: [] };
  const used = new Set();
  for (const w of windows) {
    const f = facades.find((ff) => ff.side === w.side && Math.abs(ff.z - w.z) <= ff.w / 2 + 0.01);
    if (!f || f.home) continue;
    const floorY = w.y - 1.7;
    const key = `${w.side}:${Math.round(w.z / 2.6)}:${Math.round(floorY)}`;
    if (used.has(key) || r() > 0.42) continue;
    const kind = f.w >= 3.2 && r() < 0.55 && kinds.balcony ? 'balcony' : kinds.window_ac ? 'window_ac' : null;
    if (!kind) continue;
    used.add(key);
    const y = kind === 'balcony' ? floorY + 0.05 : w.y - 0.95;
    place[kind].push({ x: f.frontX, y, z: w.z, side: w.side, flip: r() < 0.5 });
    w.mesh.removeFromParent(); // the module brings its own window
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0;
  for (const [kind, list] of Object.entries(place)) {
    const src = kinds[kind]; if (!src || !list.length) continue;
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const inst = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      inst.castShadow = true; inst.receiveShadow = true; inst.userData.dynamic = true; inst.name = `module_${kind}_${o.name}`;
      list.forEach((L, i) => {
        p.set(L.x, L.y, L.z);
        e.set(0, L.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0); q.setFromEuler(e);
        s.set(L.flip ? -1 : 1, 1, 1); // mirrored variants (bars and stains read differently)
        m.compose(p, q, s).multiply(o.matrixWorld);
        inst.setMatrixAt(i, m);
      });
      inst.computeBoundingSphere();
      root.add(inst); n++;
    });
  }
  ctx.api.street.modules = { balcony: place.balcony.length, window_ac: place.window_ac.length, draws: n };
}
