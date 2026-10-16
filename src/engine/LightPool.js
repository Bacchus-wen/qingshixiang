import * as THREE from 'three/webgpu';
import { mains, memoryMaskCPU } from '../materials/memory.js';

// A fixed pool of real point lights for the clustered (Forward+) renderer (v3, after cybercity's LightPool).
// Lights are created once and never toggled (that recompiles every material): unused slots get intensity 0 and are
// parked below the street. Candidates (signs, shop openings, ...) are re-ranked every few frames by what they
// actually throw now: surviving neon at present-day power (tripping with the mains), anything inside the eye's
// memory cone at full colour, everything else dark.
export class LightPool {
  constructor(scene, size) {
    this.size = size; this.cands = []; this.lights = []; this.assign = new Array(size).fill(-1); this.frame = 0;
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 0.01, 2);
      l.position.set(0, -500 - i, 0); l.castShadow = false; l.name = `pool_${i}`;
      scene.add(l); this.lights.push(l);
    }
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3();
  }
  // c: { pos: Vector3, color: Color|hex, intensity, distance, alive (0..1 present-day), power?: () => 0..1, importance? }
  add(c) {
    c.importance ??= 1; c.alive ??= 0;
    c.color = c.color?.isColor ? c.color : new THREE.Color(c.color ?? 0xffffff);
    c.k = 0; this.cands.push(c); return c;
  }
  rank(cam) {
    const cp = cam.getWorldPosition(this._v), fwd = cam.getWorldDirection(this._f);
    const scored = [];
    for (let i = 0; i < this.cands.length; i++) {
      const c = this.cands[i];
      if (c.k < 0.02) continue;
      const dx = c.pos.x - cp.x, dy = c.pos.y - cp.y, dz = c.pos.z - cp.z, d = Math.hypot(dx, dy, dz);
      if (d > 70) continue;
      const facing = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3);
      scored.push([c.importance * c.intensity * c.k * (facing > -0.2 ? 1 : 0.3) / (1 + d * d * 0.004), i]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < this.size; k++) this.assign[k] = k < scored.length ? scored[k][1] : -1;
  }
  update(ctx, { pastMode = false } = {}) {
    // power of every candidate this frame (cheap: CPU cone test)
    for (const c of this.cands) {
      const memory = pastMode ? 1 : memoryMaskCPU(c.pos, ctx.memory);
      const now = c.alive * mains.value * (c.power ? c.power() : 1);
      c.k = Math.max(now * 0.5, memory);
    }
    if (this.frame++ % 8 === 0) this.rank(ctx.camera);
    for (let s = 0; s < this.size; s++) {
      const l = this.lights[s], ci = this.assign[s];
      if (ci < 0) { if (l.intensity !== 0) { l.intensity = 0; l.position.set(0, -500 - s, 0); } continue; }
      const c = this.cands[ci];
      l.position.copy(c.pos); l.color.copy(c.color); l.distance = c.distance; l.intensity = c.intensity * c.k;
    }
  }
}
