import * as THREE from 'three/webgpu';
import { uniform, positionWorld, floor, float, vec3, pow, abs, dot, normalView, positionViewDirection, lights, normalize, cameraPosition, normalWorld, mix } from 'three/tsl';
import { memoryMask, memoryMaskCPU } from '../../materials/memory.js';

// Per-system uniforms keep ?only=traffic independent of ghosts initialization.
export function lifeState() { return { debug: uniform(0), flood: uniform(0), crowd: uniform(1) }; }
export const fullFlood = ctx => (ctx.memory?.floodNow ?? ctx.memory?.flood ?? 0) > .5;
export function syncLife(state, ctx, population) {
  state.debug.value = ctx.params?.get('memlife') === '1' ? 1 : 0;
  // floodNow also includes the robot's automatic surge, not just story flood.
  state.flood.value = fullFlood(ctx) ? 1 : THREE.MathUtils.clamp(ctx.memory?.floodNow ?? ctx.memory?.flood ?? 0, 0, 1);
  state.crowd.value = fullFlood(ctx) ? 1 : population;
  return state.debug.value > 0 || (state.crowd.value > 0 && (state.flood.value > 0 || (ctx.memory?.strength > 0 && ctx.memory?.range > 0)));
}
export function lifeMask(state, at = positionWorld) {
  return memoryMask(at).max(state.flood).mul(state.crowd).max(state.debug);
}
export function inMemory(center, radius, ctx, state, broad) {
  if (state.debug.value || state.flood.value) return true;
  const m = ctx.memory, d = center.distanceTo(m.origin);
  broad.origin.copy(m.origin); broad.dir.copy(m.dir);
  broad.angle = Math.min(Math.PI, Math.acos(Math.max(-1, Math.cos(m.angle) - .10)) + Math.asin(Math.min(1, radius / Math.max(d, .001))));
  broad.range = m.range + radius + .5;
  return d <= radius || memoryMaskCPU(center, broad) > 0;
}
export function coverage(mask) {
  const cell = floor(positionWorld.mul(64));
  const x = cell.x.add(cell.z.mul(3)), y = cell.y.add(cell.z.mul(2));
  const parity = v => v.sub(floor(v.div(2)).mul(2));
  const bayer = (a,b) => parity(a.add(b)).mul(2).add(parity(b));
  const threshold = bayer(x,y).mul(4).add(bayer(floor(x.div(2)),floor(y.div(2)))).add(.5).div(16);
  return mask.greaterThan(threshold);
}
export function silhouette(state, tint, brightness = 1) {
  // v3 (Grok r17): the remembered people are people -- dark clothes that take the real light (signs, shop openings,
  // the beam), with only a thin neon edge left of the old hologram look
  const material = new THREE.MeshStandardNodeMaterial({ roughness: .75, metalness: .05, side: THREE.DoubleSide });
  material.colorNode = mix(vec3(0.09, 0.085, 0.085), tint.mul(0.25), 0.35);
  const V = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(float(1).sub(abs(dot(normalWorld, V))), 6.0);
  material.emissiveNode = tint.mul(rim.mul(0.9).add(0.01)).mul(brightness);
  material.maskNode = coverage(lifeMask(state));
  return material;
}
const fallback = ['#24e9ee', '#ff3ba7', '#b572ff', '#63ed75', '#ffe6bf'];
export function streetTint(ctx, position, out) {
  let nearest, best = Infinity;
  for (const sign of ctx.api.neon?.signs || []) {
    if (Math.sign(sign.x) !== Math.sign(position.x)) continue;
    const d = (sign.x-position.x)**2 + (sign.z-position.z)**2 + (sign.y-1.2)**2 * .3;
    if (d < best) { best = d; nearest = sign; }
  }
  return out.set(nearest?.tint || fallback[((Math.floor(-position.z / 7) + (position.x > 0 ? 2 : 0)) % fallback.length + fallback.length) % fallback.length]);
}
