import * as THREE from 'three/webgpu';
import { makeSurface } from '../../materials/surface.js';
import { syncWet } from '../../materials/wet.js';
import { buildDetails } from './details.js';

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
          this.facades.push(f);
          if (f.shop) {
            const open = r();
            const shutterH = open < 0.25 ? 0.9 : open < 0.55 ? 1.9 : 2.75;
            const sw = w - 0.9;
            box(0.12, 2.8 - shutterH + 0.05, sw, M.void, f.frontX + side * 1.15, shutterH + (2.8 - shutterH) / 2, zc, root);
            box(0.08, shutterH, sw, M.shutter, f.frontX + side * 1.1, shutterH / 2, zc, root);
            box(0.5, 0.25, sw + 0.3, M.rust, f.frontX + side * 0.95, 2.95, zc, root); // shutter box
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
    buildDetails(ctx, root, this.facades, M, r);

    // night sky environment for glossy reflections: faint, cold, almost black
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0b0c0e);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicNodeMaterial({ color: 0x1c1e22, side: THREE.BackSide }));
    glow.scale.set(50, 10, 50); glow.position.y = 30; envScene.add(glow);
    const pm = new THREE.PMREMGenerator(ctx.renderer);
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.3;
  },
  update(dt, t, ctx) { syncWet(ctx.world); },
};
