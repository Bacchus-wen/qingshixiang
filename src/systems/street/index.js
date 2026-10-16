import * as THREE from 'three/webgpu';
import { makeSurface } from '../../materials/surface.js';
import { syncWet } from '../../materials/wet.js';
import { memoryMaskCPU, amberNode } from '../../materials/memory.js';
import { buildDetails } from './details.js';
import { setupPassingCar } from './passing.js';
import { mergeStatic } from './merge.js';
import { loadBuildingTextures, createWallMaterial, createWindowMaterial, createShutterMaterial, createShopMaterial, buildingMemory, buildingMemoryCPU } from './cc-materials.js';
import { wallData, roomQuad, occupyWindows, addWindowIronwork, addShopInteriors } from './cc-geometry.js';

// The lane: one narrow street running -Z, crossing a wider road at z = CROSS_Z. The present is dim/cold; rooms regain warmth inside the memory cone.
// Layout is seeded so every run builds the same street.
export const LANE = { halfRoad: 3.4, walk: 1.6, curb: 0.14, zStart: 14, zEnd: -70, crossZ: -42, crossHalf: 4.5 };

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (mat.userData.ccWall) wallData(m);
  parent.add(m);
  return m;
}

export default {
  name: 'street',
  async init(ctx) {
    const { scene } = ctx;
    const root = this.root = new THREE.Group(); root.name = 'street';
    scene.add(root);
    scene.background = new THREE.Color(0x030304);

    const ccTextures = this.ccTextures = await loadBuildingTextures();
    const facadeMaterial = createWallMaterial(ccTextures, ctx.params);
    const windowMaterial = createWindowMaterial(ccTextures, ctx.params);
    const shopMaterials = {
      kitchen: createShopMaterial(ccTextures.shop_ramen, ctx.params, 'kitchen'),
      shelves: createShopMaterial(ccTextures.shelves, ctx.params, 'shelves'),
    };
    const M = this.mats = {
      road: makeSurface('asphalt_02', { scale: 3, tone: 0.55, puddles: 0.55, porosity: 0.7, metal: 0 }),
      walk: makeSurface('concrete_slab_wall_02', { scale: 1.6, tone: 0.6, puddles: 0.25, metal: 0 }),
      wallA: facadeMaterial, wallB: facadeMaterial, wallC: facadeMaterial,
      shutter: createShutterMaterial(ccTextures),
      rust: makeSurface('green_metal_rust', { scale: 1.2, tone: 0.7, streaks: 0.3 }),
      void: new THREE.MeshStandardNodeMaterial({ color: 0x050505, roughness: 0.9 }),
      glass: windowMaterial,
    };
    const mask = buildingMemory(ctx.params);
    M.brickSeal = makeSurface('brick_4', { scale: 1.4, tone: 0.75, metal: 0, streaks: 0.4 });
    M.brickSeal.maskNode = mask.lessThan(0.45); // dissolves (with the cone's grain) inside the memory
    if (ctx.params.get('memdbg') !== null) for (const k of ['road', 'walk']) M[k].emissiveNode = amberNode().mul(mask).mul(3);
    const L = LANE;
    const len = L.zStart - L.zEnd;

    // ground: road + raised sidewalks + cross road
    // ground slabs are thin boxes (rotated planes broke the box-mapped normal frame; boxes share the walkway path)
    const road = box(L.halfRoad * 2, 0.04, len, M.road, 0, -0.02, (L.zStart + L.zEnd) / 2, root);
    road.castShadow = false;
    const cross = box(120, 0.04, L.crossHalf * 2, M.road, 0, -0.018, L.crossZ, root);
    cross.castShadow = false;
    for (const side of [-1, 1]) {
      for (const [z0, z1] of [[L.zStart, L.crossZ + L.crossHalf], [L.crossZ - L.crossHalf, L.zEnd]]) {
        const d = z0 - z1;
        box(L.walk, L.curb, d, M.walk, side * (L.halfRoad + L.walk / 2), L.curb / 2, (z0 + z1) / 2, root);
      }
    }

    // road markings: worn paint (pale, rough), barely there in the rain
    const paint = new THREE.MeshStandardNodeMaterial({ color: 0x5d5d5b, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let z = L.zStart - 2; z > L.zEnd + 2; z -= 6) {
      if (Math.abs(z - L.crossZ) < L.crossHalf + 1) continue;
      if (Math.random && ((z * 7919) % 5 === 0)) continue; // a few dashes are gone
      box(0.12, 0.004, 2.4, paint, 0, 0.002, z, root).castShadow = false;
    }
    for (let k = -6; k <= 6; k++) box(0.45, 0.004, 3.2, paint, k * 0.9, 0.003, L.crossZ + L.crossHalf + 2.2, root).castShadow = false;
    const grate = new THREE.MeshStandardNodeMaterial({ color: 0x0c0c0c, roughness: 0.4, metalness: 0.8 });
    for (let z = 10; z > L.zEnd; z -= 11) for (const sd of [-1, 1]) box(0.35, 0.01, 0.8, grate, sd * (L.halfRoad - 0.25), 0.004, z + sd * 2.5, root).castShadow = false;
    // facades
    const r = rng(1937);
    const walls = [M.wallA, M.wallB, M.wallC];
    this.facades = [];
    this.shutters = [];
    const windows = [];
    const frontX = L.halfRoad + L.walk;
    for (const side of [-1, 1]) {
      for (const [z0, z1] of [[L.zStart + 6, L.crossZ + L.crossHalf], [L.crossZ - L.crossHalf, L.zEnd - 10]]) {
        let z = z0;
        while (z > z1 + 2) {
          const w = Math.min(4.5 + r() * 5, z - z1);
          const h = 7 + Math.floor(r() * 4) * 3.1 + (r() < 0.15 ? 9 : 0);
          const depth = 9;
          const inset = r() * 0.35;
          const zc = z - w / 2;
          const mat = walls[Math.floor(r() * walls.length)];
          const x = side * (frontX + inset + depth / 2);
          // Separate RNG: facade choices must not shift buildings, home, signs, micro-story or wind anchors.
          const detailRng = rng(7103 + this.facades.length * 97);
          const tiles = [0, 1, 1, 2, 3, 3, 5, 6, 6, 7];
          const tile = tiles[Math.floor(detailRng() * tiles.length)];
          const data = [tile, tile === 6 ? 2.2 : tile === 5 ? 2.8 : 3.5, 0.78 + detailRng() * 0.22, detailRng() * 100];
          const facadeBox = (...args) => wallData(box(...args), data);
          // upper mass, ground storey cut back to make a shop recess
          facadeBox(depth, h - 3.2, w - 0.06, mat, x, 3.2 + (h - 3.2) / 2, zc, root);
          facadeBox(depth - 1.2, 3.2, w - 0.06, mat, x + side * 0.6, 1.6, zc, root);
          const f = { side, z: zc, w, h, frontX: side * (frontX + inset), shop: r() < 0.8 };
          // the home across the street from the robot: a plain door, no shop (see story/fragment.js)
          if (side > 0 && z0 > -42 && zc - w / 2 < -14.2 && zc + w / 2 > -14.2) { f.shop = false; f.home = true; }
          this.facades.push(f);
          if (f.shop) {
            // roller shutter hangs from the box at the top; a gap at the bottom shows the dark shop behind
            const open = r();
            const shutterH = open < 0.25 ? 1.9 : open < 0.5 ? 2.45 : 2.8;
            const sw = w - 0.9;
            // Interior quads are added after buildDetails assigns the story shop names.
            if (r() < 0.3) {
              // sealed with fresh brick (a gap left at the top); in the past the brick is not there
              const bk = box(0.24, 2.55, sw, M.brickSeal, f.frontX + side * 1.12, 1.275, zc, root);
              bk.userData.dynamic = true;
            } else {
              const sh = box(0.08, shutterH, sw, M.shutter, f.frontX + side * 1.1, 2.8 - shutterH / 2, zc, root);
              sh.userData.dynamic = true;
              this.shutters.push({ mesh: sh, h: shutterH, lift: 0, hold: 0, center: new THREE.Vector3(f.frontX + side * 1.1, 1.4, zc) });
            }
            box(0.5, 0.25, sw + 0.3, M.rust, f.frontX + side * 0.95, 2.95, zc, root); // shutter box
          }
          // silhouette detail: parapet, rooftop clutter, balconies on some floors
          facadeBox(depth + 0.1, 0.5, w + 0.02, mat, x, h + 0.25, zc, root);
          if (r() < 0.55) box(1.4, 1.1, 1.4, M.rust, x + side * (r() - 0.5) * 3, h + 1.05, zc + (r() - 0.5) * (w - 1.6), root); // water tank
          if (r() < 0.35) { const ax = x + side * (r() - 0.5) * 4; box(0.06, 3 + r() * 3, 0.06, M.rust, ax, h + 2.5, zc, root); box(1.2, 0.04, 0.04, M.rust, ax, h + 3.6, zc, root); }
          for (let fl = 1; fl * 3.1 + 3.2 < h - 1.5; fl++) {
            if (r() < 0.3) {
              const by = 3.2 + (fl - 1) * 3.1 + 0.1, bw = Math.min(w - 1, 2.6), bz = zc + (r() - 0.5) * (w - bw - 0.4);
              box(0.9, 0.12, bw, M.wallC, f.frontX - side * 0.45, by, bz, root);          // slab
              box(0.04, 0.95, bw, M.rust, f.frontX - side * 0.88, by + 0.5, bz, root);    // railing
            }
          }
          // Existing window layout; shared ray-box interior material and merged physical ironwork.
          for (let fl = 1; fl * 3.1 + 3.2 < h - 0.8; fl++) {
            const y = 3.2 + (fl - 1) * 3.1 + 1.7;
            const nWin = Math.max(1, Math.floor(w / 2.2));
            for (let k = 0; k < nWin; k++) {
              if (r() < 0.12) continue;
              const wz = zc - w / 2 + (k + 0.5) * (w / nWin);
              const index = windows.length;
              const room = roomQuad(root, M.glass, f, y, wz, 1.1, 1.3, -0.065,
                [Math.floor(detailRng() * 16), 0, 1.8 + detailRng() * 1.2, index % 19 === 7 ? 0 : 1]);
              windows.push({ mesh: room, side, z: wz, y });
              if (!ctx.params.has('ccnodetails')) addWindowIronwork(root, f, y, wz, index, M, box);
              // sill, lintel and side frames so windows read as openings, not stickers
              box(0.16, 0.07, 1.3, M.wallC, f.frontX - side * 0.08, y - 0.7, wz, root);
              facadeBox(0.08, 0.1, 1.24, mat, f.frontX - side * 0.04, y + 0.7, wz, root);
              for (const e of [-1, 1]) box(0.08, 1.3, 0.06, M.rust, f.frontX - side * 0.04, y, wz + e * 0.58, root);
            }
          }
          z -= w;
        }
      }
    }
    // the far end of the lane is closed by a block of taller buildings and a skyline of silhouettes, so a
    // lightning flash never shows an empty grey rectangle of sky
    for (let k = -3; k <= 3; k++) {
      const h = 14 + ((k * 7919) % 5 + 5) % 5 * 3.5;
      box(7.5, h, 6, M.wallC, k * 7.6, h / 2, L.zEnd - 18, root);
      const t = 22 + ((k * 104729) % 7 + 7) % 7 * 4;
      box(9, t, 8, M.wallA, k * 9.3 + 4, t / 2, L.zEnd - 45, root);
    }
    const occupied = occupyWindows(windows);
    await buildDetails(ctx, root, this.facades, M, r);
    const shopCount = addShopInteriors(root, this.facades, shopMaterials, box, M);
    ctx.api.street.buildings = { windows: windows.length, occupied, shops: shopCount, debug: ctx.params.get('ccmemory') || 'cone' };
    ctx.api.street.facades = this.facades; // { side, z, w, h, frontX, shop, home, signName } for the neon layer
    this.passing = await setupPassingCar(ctx, root); // marks itself dynamic: never merged
    if (ctx.params.get('nomerge') === null) mergeStatic(root);

    // night sky environment for glossy reflections: faint, cold, almost black
    // v2 environment: a night sky with the city glow on the horizon (fills facades with a cold blue, gives the
    // wet road something to reflect besides black)
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0.02, 0.026, 0.05);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 10, 32, 1, true), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.16, 0.1, 0.12), side: THREE.BackSide }));
    band.position.y = 3; envScene.add(band);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.035, 0.05, 0.1), side: THREE.BackSide }));
    top.scale.set(50, 12, 50); top.position.y = 34; envScene.add(top);
    const pm = new THREE.PMREMGenerator(ctx.renderer);
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.9;
    // moonlight through the rain clouds: one weak, cold, shadowless key from high behind the robot's wall
    const moon = new THREE.DirectionalLight(0x8ea3c8, 0.32);
    moon.position.set(-20, 30, 10); scene.add(moon, moon.target);
  },
  update(dt, t, ctx) {
    syncWet(ctx.world);
    this.passing?.(dt);
    // the near lamp fails now and then (the audio crackles on these drops); the vending panel flickers rarely
    const st = ctx.api.street;
    if (st && !ctx.isShot) { // shots stay deterministic
      this.lampT = (this.lampT ?? 6) - dt;
      if (this.lampT < 0) { this.lampFail = 0.25 + Math.random() * 0.9; this.lampT = 7 + Math.random() * 14; }
      let k = 1;
      if (this.lampFail > 0) { this.lampFail -= dt; k = Math.sin(t * 57) * Math.sin(t * 23) > 0 ? 0.12 : 0.85; }
      st.lamp.intensity = 650 * k;
      this.vmT = (this.vmT ?? 11) - dt;
      if (this.vmT < 0) { this.vmFail = 0.15 + Math.random() * 0.2; this.vmT = 15 + Math.random() * 20; }
      const vk = (this.vmFail ?? 0) > 0 ? ((this.vmFail -= dt), 0.3) : 1;
      st.vmLight.intensity = 14 * vk;
    }
    // the abandoned car: door shuts and lamps come on while lit; back to the present half a beat after
    const pc = ctx.api.pastCar;
    if (pc) {
      const m = memoryMaskCPU(pc.center, ctx.memory);
      if (m > 0.35) pc.grace = 0.8; else pc.grace = Math.max(0, pc.grace - dt);
      const target = m > 0.35 || pc.grace > 0 ? 1 : 0;
      pc.past += Math.sign(target - pc.past) * Math.min(Math.abs(target - pc.past), dt * (target ? 0.6 : 1.2));
      const e = pc.past * pc.past * (3 - 2 * pc.past);
      if (pc.pivot) pc.pivot.rotation.y = -0.873 * e; // 50 degrees
      pc.glow.value = e * Math.max(m, 0.15);
    }
    // shutters rise slowly while the eye holds on them and fall back half a beat after the light leaves
    for (const s of this.shutters) {
      const m = buildingMemoryCPU(ctx.params, memoryMaskCPU(s.center, ctx.memory));
      // lit for 0.6 s -> rise; once the light leaves, stay up for a 0.8 s grace, then fall (half a beat late)
      if (m > 0.35) { s.hold = Math.min(s.hold + dt, 1); s.grace = 0.8; } else { s.grace = Math.max(0, (s.grace ?? 0) - dt); if (s.grace === 0) s.hold = 0; }
      const target = s.hold > 0.6 ? 0.85 : 0;
      const k = target > s.lift ? 0.25 : (s.grace > 0 ? 0 : 0.5);
      s.lift += Math.sign(target - s.lift) * Math.min(Math.abs(target - s.lift), k * dt);
      const h = s.h * (1 - s.lift);
      s.mesh.scale.y = Math.max(0.02, 1 - s.lift);
      s.mesh.position.y = 2.8 - h / 2;
    }
  },
};
