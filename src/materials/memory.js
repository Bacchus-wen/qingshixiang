import * as THREE from 'three/webgpu';
import {
  uniform, positionWorld, dot, length, smoothstep, float, vec3, mx_noise_float, time, color, hash, floor, step,
} from 'three/tsl';

// The memory cone as TSL: where the robot's eye looks, the past shows through.
// One set of uniforms, synced once per frame from ctx.memory (see syncMemory), read by every past/present material.
// The street's mains: before the robot's eye first opens the old wiring keeps tripping (lamps, the few surviving
// neon tubes, the vending machine and the last lit windows drop out in stuttering bursts); once the eye has opened
// the power holds. 0..1, driven by systems/street. Multiply present-day emissives by it.
export const mains = uniform(1);

export const mem = {
  origin: uniform(new THREE.Vector3()),
  dir: uniform(new THREE.Vector3(0, 0, -1)),
  cosAngle: uniform(Math.cos(0.3)),
  range: uniform(40),
  strength: uniform(0),
  amber: uniform(new THREE.Color(1.0, 0.58, 0.28)),
};

export function syncMemory(m) {
  mem.origin.value.copy(m.origin);
  mem.dir.value.copy(m.dir);
  mem.cosAngle.value = Math.cos(m.angle);
  mem.range.value = m.range;
  mem.strength.value = m.strength;
}

// 0..1: how much "past" shows at world position P. The edge is ragged world-space grain ("failed development"),
// fixed in world space so TRAA does not smear it.
export function memoryMask(P = positionWorld) {
  const v = P.sub(mem.origin);
  const d = length(v);
  const c = dot(v.div(d.max(1e-3)), mem.dir);
  const grain = mx_noise_float(P.mul(3.1)).mul(0.5).add(mx_noise_float(P.mul(17.0)).mul(0.25));
  const edge = mem.cosAngle.add(grain.mul(0.035).mul(float(1).sub(mem.strength).add(0.4)));
  const inCone = smoothstep(edge, edge.add(0.025), c);
  const reach = float(1).sub(smoothstep(mem.range.mul(0.55), mem.range, d));
  return inCone.mul(reach).mul(mem.strength);
}

// CPU twin for per-object decisions (shutters rising, figures spawning). Same maths, no grain.
const _v = new THREE.Vector3();
export function memoryMaskCPU(p, m) {
  _v.copy(p).sub(m.origin);
  const d = _v.length();
  if (d < 1e-3 || d > m.range) return 0;
  const c = _v.divideScalar(d).dot(m.dir);
  const ca = Math.cos(m.angle);
  const t = THREE.MathUtils.smoothstep(c, ca, ca + 0.03);
  return t * m.strength * (1 - THREE.MathUtils.smoothstep(d, m.range * 0.55, m.range));
}

// Past light for windows: some windows were lit back then. Per-window hash on a world grid.
export function pastWindowGlow(P = positionWorld) {
  const cell = floor(P.mul(vec3(0.8, 0.32, 0.8)));
  const lit = step(0.45, hash(cell.x.mul(13.1).add(cell.y.mul(71.7)).add(cell.z.mul(31.3)).abs()));
  const flick = mx_noise_float(vec3(time.mul(0.6), cell.x, cell.z)).mul(0.15).add(0.85);
  return lit.mul(flick);
}

export const amberNode = () => color(mem.amber);
