import * as THREE from 'three/webgpu';
import {
  Fn, Loop, uniform, uniformArray, vec3, float, max, dot, inverseSqrt, smoothstep, positionWorld, normalWorld, abs,
} from 'three/tsl';
import { mains, memoryMaskCPU } from './memory.js';

// Neon that lights the world (v3). Real THREE lights cannot scale to dozens of signs (and changing their number
// recompiles every material), so the nearest NEON_SLOTS signs are fed to a uniform array each frame and every
// receiving surface (facades, road, sidewalk, props, robot, rain) evaluates them analytically: a soft, wrapped,
// two-sided emitter with smooth range falloff. The CPU decides each sign's power: surviving tubes at present-day
// power (and tripping with the mains), any sign inside the eye's memory cone at full colour.
export const NEON_SLOTS = 16;
const pos = uniformArray(Array.from({ length: NEON_SLOTS }, () => new THREE.Vector4(0, -100, 0, 1)), 'vec4'); // xyz, range
const col = uniformArray(Array.from({ length: NEON_SLOTS }, () => new THREE.Vector4()), 'vec4');           // rgb*power, facing x
export const neonGain = uniform(1.0);

// Irradiance from the active signs at world point P with world normal N (multiply by albedo).
export const neonIrradiance = Fn(([P, N]) => {
  const sum = vec3(0).toVar();
  Loop(NEON_SLOTS, ({ i }) => {
    const p = pos.element(i), c = col.element(i);
    const L = p.xyz.sub(P);
    const d2 = dot(L, L).add(0.12);
    const Ld = L.mul(inverseSqrt(d2));
    const wrap = dot(N, Ld).add(0.35).div(1.35).max(0);                           // soft: area emitter, wet surfaces
    // fascia signs face the street (facing.x = -side); blades/boxes radiate both ways (facing 0)
    const facing = c.w;
    const front = abs(facing).lessThan(0.5).select(float(1), max(Ld.x.mul(facing).negate(), 0).mul(0.75).add(0.25));
    const fall = float(1).div(d2.mul(0.55).add(1)).mul(smoothstep(p.w, p.w.mul(0.35), d2.sqrt()));
    sum.addAssign(c.rgb.mul(wrap).mul(front).mul(fall));
  });
  return sum.mul(neonGain);
});
export const neonLightAt = () => neonIrradiance(positionWorld, normalWorld);

// CPU side: called once per frame (from the neon system)
const _c = new THREE.Vector3(), _cam = new THREE.Vector3();
const COLOR = new THREE.Color();
export function updateNeonLights(ctx, signs, { pastMode = false } = {}) {
  ctx.camera.getWorldPosition(_cam);
  const cand = [];
  for (const s of signs) {
    _c.set(s.x, s.y, s.z);
    const memory = pastMode ? 1 : memoryMaskCPU(_c, ctx.memory);
    const now = s.alive ? 0.45 * (s.power ?? 1) * mains.value : 0;
    const k = Math.max(now, memory);
    if (k < 0.02) continue;
    const area = Math.min(4, (s.w ?? 1) * (s.h ?? 1));
    const strength = k * (0.9 + area * 0.55) * (s.kind === 'box' ? 0.7 : 1);
    const d = _c.distanceTo(_cam);
    cand.push({ s, strength, score: strength / (1 + d * d * 0.004) });
  }
  cand.sort((a, b) => b.score - a.score);
  for (let i = 0; i < NEON_SLOTS; i++) {
    const e = cand[i];
    if (!e) { pos.array[i].set(0, -100, 0, 1); col.array[i].set(0, 0, 0, 0); continue; }
    const s = e.s;
    COLOR.set(s.tint);
    // out from the face: light sits a little in front of the sign so the wall behind it is lit, not blacked out
    const facing = s.kind === 'blade' ? 0 : -s.side;
    pos.array[i].set(s.x + (facing ? facing * 0.25 : 0), s.y, s.z, 7 + Math.min(5, (s.w ?? 1) * 1.6));
    col.array[i].set(COLOR.r * e.strength, COLOR.g * e.strength, COLOR.b * e.strength, facing);
  }
}
