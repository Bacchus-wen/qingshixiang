import * as THREE from 'three/webgpu';
import { makeSurface } from '../../materials/surface.js';
import { syncWet } from '../../materials/wet.js';
import { memoryMask, memoryMaskCPU, pastWindowGlow, amberNode } from '../../materials/memory.js';
import { buildDetails } from './details.js';
import { mergeStatic } from './merge.js';

// The lane: one narrow street running -Z, crossing a wider road at z = CROSS_Z. Everything achromatic.
// Layout is seeded so every run builds the same street.
export const LANE = { halfRoad: 3.4, walk: 1.6, curb: 0.14, zStart: 14, zEnd: -70, crossZ: -42, crossHalf: 4.5 };

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
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

    const M = this.mats = {
      road: makeSurface('asphalt_02', { scale: 3, tone: 0.55, puddles: 0.55, porosity: 0.7, metal: 0 }),
      walk: makeSurface('concrete_slab_wall_02', { scale: 1.6, tone: 0.6, puddles: 0.25, metal: 0 }),
      wallA: makeSurface('concrete_wall_001', { scale: 5, tone: 0.75, metal: 0, streaks: 0.8 }),
      wallB: makeSurface('brick_4', { scale: 2.2, tone: 0.6, metal: 0, streaks: 0.6 }),
      wallC: makeSurface('concrete_slab_wall_02', { scale: 3.5, tone: 0.85, metal: 0, streaks: 0.8 }),
      shutter: makeSurface('corrugated_iron', { scale: 1.4, tone: 0.7, streaks: 0.4 }),
      rust: makeSurface('green_metal_rust', { scale: 1.2, tone: 0.7, streaks: 0.3 }),
      void: new THREE.MeshStandardNodeMaterial({ color: 0x050505, roughness: 0.9 }),
      glass: new THREE.MeshStandardNodeMaterial({ color: 0x0b0c0d, roughness: 0.08, metalness: 0 }),
    };
    // the past, inside the eye's cone: lit windows, lit shops (amber only)
    const mask = memoryMask();
    M.glass.emissiveNode = amberNode().mul(mask).mul(ctx.params.get('noglow') !== null ? 1 : pastWindowGlow()).mul(2.2);
    M.void.emissiveNode = amberNode().mul(mask).mul(0.9);
    if (ctx.params.get('memdbg') !== null) for (const k of ['wallA', 'wallB', 'wallC', 'road', 'walk']) M[k].emissiveNode = amberNode().mul(mask).mul(3);
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

    // facades
    const r = rng(1937);
    const walls = [M.wallA, M.wallB, M.wallC];
    this.facades = [];
    this.shutters = [];
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
          // upper mass, ground storey cut back to make a shop recess
          box(depth, h - 3.2, w - 0.06, mat, x, 3.2 + (h - 3.2) / 2, zc, root);
          box(depth - 1.2, 3.2, w - 0.06, mat, x + side * 0.6, 1.6, zc, root);
          const f = { side, z: zc, w, h, frontX: side * (frontX + inset), shop: r() < 0.8 };
          // the home across the street from the robot: a plain door, no shop (see story/fragment.js)
          if (side > 0 && z0 > -42 && zc - w / 2 < -14.2 && zc + w / 2 > -14.2) { f.shop = false; f.home = true; }
          this.facades.push(f);
          if (f.shop) {
            // roller shutter hangs from the box at the top; a gap at the bottom shows the dark shop behind
            const open = r();
            const shutterH = open < 0.25 ? 1.9 : open < 0.5 ? 2.45 : 2.8;
            const sw = w - 0.9;
            box(0.12, 2.8, sw, M.void, f.frontX + side * 1.3, 1.4, zc, root);
            const sh = box(0.08, shutterH, sw, M.shutter, f.frontX + side * 1.1, 2.8 - shutterH / 2, zc, root);
            sh.userData.dynamic = true;
            box(0.5, 0.25, sw + 0.3, M.rust, f.frontX + side * 0.95, 2.95, zc, root); // shutter box
            this.shutters.push({ mesh: sh, h: shutterH, lift: 0, hold: 0, center: new THREE.Vector3(f.frontX + side * 1.1, 1.4, zc) });
          }
          // silhouette detail: parapet, rooftop clutter, balconies on some floors
          box(depth + 0.1, 0.5, w + 0.02, mat, x, h + 0.25, zc, root);
          if (r() < 0.55) box(1.4, 1.1, 1.4, M.rust, x + side * (r() - 0.5) * 3, h + 1.05, zc + (r() - 0.5) * (w - 1.6), root); // water tank
          if (r() < 0.35) { const ax = x + side * (r() - 0.5) * 4; box(0.06, 3 + r() * 3, 0.06, M.rust, ax, h + 2.5, zc, root); box(1.2, 0.04, 0.04, M.rust, ax, h + 3.6, zc, root); }
          for (let fl = 1; fl * 3.1 + 3.2 < h - 1.5; fl++) {
            if (r() < 0.3) {
              const by = 3.2 + (fl - 1) * 3.1 + 0.1, bw = Math.min(w - 1, 2.6), bz = zc + (r() - 0.5) * (w - bw - 0.4);
              box(0.9, 0.12, bw, M.wallC, f.frontX - side * 0.45, by, bz, root);          // slab
              box(0.04, 0.95, bw, M.rust, f.frontX - side * 0.88, by + 0.5, bz, root);    // railing
            }
          }
          // windows: dark recessed glass rows
          for (let fl = 1; fl * 3.1 + 3.2 < h - 0.8; fl++) {
            const y = 3.2 + (fl - 1) * 3.1 + 1.7;
            const nWin = Math.max(1, Math.floor(w / 2.2));
            for (let k = 0; k < nWin; k++) {
              if (r() < 0.12) continue;
              const wz = zc - w / 2 + (k + 0.5) * (w / nWin);
              box(0.06, 1.3, 1.1, M.glass, f.frontX - side * 0.03, y, wz, root);
            }
          }
          z -= w;
        }
      }
    }
    await buildDetails(ctx, root, this.facades, M, r);
    if (ctx.params.get('nomerge') === null) mergeStatic(root);

    // night sky environment for glossy reflections: faint, cold, almost black
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0b0c0e);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicNodeMaterial({ color: 0x1c1e22, side: THREE.BackSide }));
    glow.scale.set(50, 10, 50); glow.position.y = 30; envScene.add(glow);
    const pm = new THREE.PMREMGenerator(ctx.renderer);
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.42;
  },
  update(dt, t, ctx) {
    syncWet(ctx.world);
    // shutters rise slowly while the eye holds on them and fall back half a beat after the light leaves
    for (const s of this.shutters) {
      const m = memoryMaskCPU(s.center, ctx.memory);
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
