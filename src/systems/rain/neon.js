import { Fn, float, mix, smoothstep, uniform, uniformArray, vec3 } from 'three/tsl';
import { mains, memoryMaskCPU } from '../../materials/memory.js';

const LIMIT = 8;
const REFRESH = 0.5;
const RADIUS = 6; // metres; no colour contribution outside this local pool

export function createNeonState(THREE, enabled = true) {
  return {
    // xyz = world position / linear RGB; w = surviving circuit / source memory.
    positions: uniformArray(Array.from({ length: LIMIT }, () => new THREE.Vector4()), 'vec4'),
    colors: uniformArray(Array.from({ length: LIMIT }, () => new THREE.Vector4()), 'vec4'),
    past: uniform(0), enabled: uniform(enabled ? 1 : 0),
    selected: [], nextRefresh: -Infinity, lastTime: -Infinity,
    source: null, sourceCount: 0, color: new THREE.Color(), point: new THREE.Vector3(),
  };
}

export function syncNeon(state, ctx, camera, t) {
  const api = ctx.api.neon;
  const signs = api?.enabled === false ? undefined : api?.signs;
  state.past.value = api?.mode === 'past' || ctx.params.get('neon') === 'past' ? 1 : 0;
  // Simulation time only. Refresh immediately on initialization, removal or rewind.
  if (signs !== state.source || (signs?.length ?? 0) !== state.sourceCount || t < state.lastTime || t + 1e-9 >= state.nextRefresh) {
    const distance = s => (s.x - camera.x) ** 2 + (s.y - camera.y) ** 2 + (s.z - camera.z) ** 2;
    state.selected = (signs || []).slice().sort((a, b) => distance(a) - distance(b)).slice(0, LIMIT);
    state.source = signs; state.sourceCount = signs?.length ?? 0;
    state.nextRefresh = t + REFRESH;
    for (let i = 0; i < LIMIT; i++) {
      const sign = state.selected[i];
      if (sign) {
        state.positions.array[i].set(sign.x, sign.y, sign.z, sign.alive ? 1 : 0);
        state.color.set(sign.tint);
        state.colors.array[i].set(state.color.r, state.color.g, state.color.b, 0);
      } else {
        state.positions.array[i].set(0, 0, 0, 0);
        state.colors.array[i].set(0, 0, 0, 0);
      }
    }
  }
  state.lastTime = t;
  // Only eight source samples per frame; source activation must not lag the eye
  // by half a second. CPU twin omits the grain, receiver uses the exact TSL mask.
  for (let i = 0; i < state.selected.length; i++) {
    const sign = state.selected[i];
    state.positions.array[i].w = sign.alive ? 1 : 0;
    state.point.set(sign.x, sign.y, sign.z);
    state.colors.array[i].w = state.past.value || (ctx.memory ? memoryMaskCPU(state.point, ctx.memory) : 0);
  }
}

export function neonLight(state, p, mask) {
  return Fn(() => {
    const total = vec3(0).toVar();
    const receiverPast = mask.max(state.past);
    for (let i = 0; i < LIMIT; i++) {
      const source = state.positions.element(i), tint = state.colors.element(i);
      const delta = p.sub(source.xyz).toVar();
      const falloff = float(1).sub(smoothstep(0, RADIUS * RADIUS, delta.dot(delta))).pow(2);
      // Both the sign and rain must be in memory before a dead sign can light it.
      // Present-day survivors follow mains every frame; memory has its own power.
      const power = mix(source.w.mul(mains), float(1), tint.w.mul(receiverPast));
      total.addAssign(tint.rgb.mul(power).mul(falloff));
    }
    return total.mul(state.enabled);
  })();
}
