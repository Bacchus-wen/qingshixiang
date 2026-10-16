import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { memoryMask } from '../../materials/memory.js';
import { positionWorld } from 'three/tsl';

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
  const MEMORY_ONLY = new Set(['fruit_stall', 'noodle_table', 'lanterns', 'kiosk']); // the street's life: only inside the eye's light
  for (const k of ['balcony', 'balcony_open', 'window_ac', 'awning', 'watertank', 'stall', 'ac_cluster', 'roof_shack', 'cable_box', 'lightbox_wall', 'drainpipe', ...MEMORY_ONLY]) {
    try { kinds[k] = (await loader.loadAsync(`/models/v2/m_${k}.glb`)).scene; } catch (e) { console.warn('[modules] missing', k, e); }
  }
  const r = rand(0x5eed17);
  const place = Object.fromEntries(Object.keys(kinds).map((k) => [k, []]));
  const used = new Set();
  for (const w of windows) {
    const f = facades.find((ff) => ff.side === w.side && Math.abs(ff.z - w.z) <= ff.w / 2 + 0.01);
    if (!f || f.home) continue;
    const floorY = w.y - 1.7;
    const key = `${w.side}:${Math.round(w.z / 2.6)}:${Math.round(floorY)}`;
    if (used.has(key) || r() > 0.42) continue;
    const bal = r() < 0.5 && kinds.balcony_open ? 'balcony_open' : 'balcony';
    const kind = f.w >= 3.2 && r() < 0.55 && kinds[bal] ? bal : kinds.window_ac ? 'window_ac' : null;
    if (!kind) continue;
    used.add(key);
    const y = kind.startsWith('balcony') ? floorY + 0.05 : w.y - 0.95;
    place[kind].push({ x: f.frontX, y, z: w.z, side: w.side, flip: r() < 0.5 });
    w.mesh.removeFromParent(); // the module brings its own window
  }
  // shop awnings (torn canvas over the shutter), rooftop water tanks + solar heaters, a couple of closed food stalls
  for (const f of facades) {
    if (f.shop && !f.home && kinds.awning && r() < 0.5) place.awning.push({ x: f.frontX, y: 2.45, z: f.z + (r() - 0.5) * Math.max(0, f.w - 3), side: f.side, flip: r() < 0.5 });
    if (kinds.watertank && r() < 0.6) place.watertank.push({ x: f.frontX + f.side * (2 + r() * 3), y: f.h + 0.5, z: f.z + (r() - 0.5) * Math.max(0, f.w - 2.6), side: f.side, flip: r() < 0.5 });
  }
  // v3 batch 2: AC clusters and drainpipes on the walls, junction boxes and dead light boxes at street level,
  // tin shacks on some roofs
  for (const f of facades) {
    const half = f.w / 2;
    if (kinds.ac_cluster && f.h > 9 && r() < 0.35) place.ac_cluster.push({ x: f.frontX, y: 3.2 + Math.floor(r() * 2) * 3.1 + 1.2, z: f.z + (r() < 0.5 ? -1 : 1) * (half - 0.95), side: f.side, flip: r() < 0.5 });
    if (kinds.drainpipe && r() < 0.5) place.drainpipe.push({ x: f.frontX - f.side * 0.12, y: f.h - 4.2, z: f.z + half - 0.2, side: f.side, flip: false });
    if (kinds.cable_box && !f.home && r() < 0.3) place.cable_box.push({ x: f.frontX, y: 1.1, z: f.z - half + 0.75, side: f.side, flip: r() < 0.5 });
    if (kinds.lightbox_wall && f.shop && !f.home && r() < 0.35) {
      // a blade sign: bracket (local -X) on the wall, face along the street
      place.lightbox_wall.push({ x: f.frontX - f.side * 0.63, y: 2.75, z: f.z + (r() < 0.5 ? -1 : 1) * (half - 0.35), side: f.side, ry: f.side > 0 ? Math.PI : 0, flip: false });
    }
    if (kinds.roof_shack && r() < 0.25) place.roof_shack.push({ x: f.frontX + f.side * (3.5 + r() * 2), y: f.h + 0.5, z: f.z + (r() - 0.5) * Math.max(0, f.w - 3.4), side: f.side, flip: r() < 0.5 });
  }
  // remembered life on the pavement, next to the shops it belonged to
  const W = 3.4 + 1.6;
  const near = (name) => facades.find((f) => (f.signName || '').includes(name));
  const noodle = near('面馆'), shop = near('副食') || near('粮油') || facades.find((f) => f.shop && f.side > 0 && !f.home);
  if (kinds.noodle_table && noodle) for (const dz of [-1.2, 0.9]) place.noodle_table.push({ x: noodle.side * (W - 1.0), y: 0.14, z: noodle.z + dz, side: noodle.side, flip: dz > 0 });
  if (kinds.fruit_stall && shop) place.fruit_stall.push({ x: shop.side * (W - 0.8), y: 0.14, z: shop.z, side: shop.side, flip: false });
  if (kinds.kiosk) place.kiosk.push({ x: -(W - 0.9), y: 0.14, z: -37.5, side: -1, flip: false });
  if (kinds.lanterns) for (const z of [-9, -19, -29]) place.lanterns.push({ x: 0, y: 4.4, z, side: 1, ry: 0, flip: false });
  if (kinds.stall) {
    const W = 3.4 + 1.6; // LANE.halfRoad + LANE.walk
    place.stall.push({ x: W - 0.2, y: 0.14, z: -29.6, side: 1, flip: false }, { x: -(W - 0.2), y: 0.14, z: -21.8, side: -1, flip: true });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0;
  for (const [kind, list] of Object.entries(place)) {
    const src = kinds[kind]; if (!src || !list.length) continue;
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      let mat = o.material;
      if (MEMORY_ONLY.has(kind)) {
        // glTF gives a plain MeshStandardMaterial; maskNode needs the node version
        const src0 = mat;
        mat = new THREE.MeshStandardNodeMaterial({ map: src0.map, normalMap: src0.normalMap, roughnessMap: src0.roughnessMap,
          metalnessMap: src0.metalnessMap, roughness: src0.roughness, metalness: src0.metalness, color: src0.color, side: src0.side });
        mat.maskNode = memoryMask(positionWorld).greaterThan(0.3);
      }
      const inst = new THREE.InstancedMesh(o.geometry, mat, list.length);
      inst.castShadow = true; inst.receiveShadow = true; inst.userData.dynamic = true; inst.name = `module_${kind}_${o.name}`;
      list.forEach((L, i) => {
        p.set(L.x, L.y, L.z);
        e.set(0, L.ry ?? (L.side > 0 ? -Math.PI / 2 : Math.PI / 2), 0); q.setFromEuler(e);
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
