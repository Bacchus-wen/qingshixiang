import {
  uniform, time, float, vec2, vec3, floor, fract, length, sin, exp, clamp, mix, smoothstep, max, hash,
  mx_fractal_noise_float, mx_noise_float, Fn,
} from 'three/tsl';

// Shared wet-surface layer. One wetness value drives darkening, film roughness, puddles and ripple eligibility,
// so surfaces read wet even with ripples disabled (see threejs-rain-snow-and-wet-surfaces guidance).
export const wetUniforms = {
  wetness: uniform(1.0), // 0 dry .. 1 soaked
  rain: uniform(1.0),    // ripple spawn rate
};
export function syncWet(world) {
  wetUniforms.wetness.value = world.wetness;
  wetUniforms.rain.value = world.rain;
}

// Normalized FBM shared by the water field and the road's dry/rough patches.
export const wetFbm = xz => mx_fractal_noise_float(vec3(xz, 3.7), 3, 2.0, 0.5).mul(0.5).add(0.5).clamp(0, 1);

// Water level is a bias in the noise field, not a geometry displacement in metres.
// Optional inputs keep existing non-road callers independent of the lane profile.
export function puddleMask(xz, coverage = 0.5, { waterLevel = float(0), wetness = wetUniforms.wetness } = {}) {
  const n = wetFbm(xz.mul(0.11)).add(waterLevel);
  const th = float(0.68).sub(float(coverage).mul(0.15));
  return smoothstep(th, th.add(0.06), n).mul(wetness);
}

// Rain ripples: jittered cells, each spawning a damped expanding ring; returns a world-xz normal tilt.
// flow is downstream speed in m/s; zero preserves stationary rain away from gutters.
export const rippleNormal = Fn(([xz, flow = float(0)]) => {
  const g = vec2(0).toVar();
  const flowingXZ = xz.sub(vec2(0, time.mul(flow)));
  for (let L = 0; L < 3; L++) {
    const s = [2.4, 3.1, 1.9][L];
    const q = flowingXZ.mul(s).add(L * 7.31);
    const id = floor(q);
    const f = fract(q).sub(0.5);
    const h = hash(id.x.add(id.y.mul(57.0)).add(L * 13.0));
    const h2 = hash(id.x.mul(3.1).add(id.y.mul(17.0)).add(L * 29.0));
    const c = vec2(h, h2).sub(0.5).mul(0.5);
    const life = fract(time.mul(0.9 + L * 0.27).add(h));
    const on = smoothstep(h2.mul(0.7).add(0.2), h2.mul(0.7).add(0.3), wetUniforms.rain);
    const dv = f.sub(c);
    const d = length(dv);
    const r = life.mul(0.45);
    const ring = sin(d.sub(r).mul(42.0)).mul(exp(d.sub(r).abs().mul(-28.0))).mul(float(1).sub(life)).mul(on);
    g.addAssign(dv.div(max(d, 1e-3)).mul(ring));
  }
  return g.mul(0.35);
});

// Wet layer: porous darkening, water-film roughness, puddles (dark, smooth) and streaks on verticals.
export function wetLayer({ albedo, roughness, porosity = 0.6, puddle = float(0), ripple = vec2(0), vertical = float(0), worldPos, wetness = wetUniforms.wetness }) {
  const w = wetness;
  const dark = mix(float(1), float(0.45), w.mul(porosity));
  const a1 = albedo.mul(dark);
  const film = clamp(roughness.mul(0.18).add(0.05), 0.05, 0.32);
  const r1 = mix(roughness, film, w.mul(0.92));
  // vertical rain streaks: thin wet runs darken and smooth the wall
  const streak = smoothstep(0.55, 0.8, mx_noise_float(vec3(worldPos.x.mul(9), worldPos.y.mul(0.35).sub(time.mul(0.25)), worldPos.z.mul(9)))).mul(vertical).mul(w);
  const a2 = a1.mul(float(1).sub(max(puddle.mul(0.5), streak.mul(0.27))));
  const r2 = mix(mix(r1, r1.mul(0.5), streak), float(0.015), puddle);
  const nxy = ripple.mul(mix(float(0.25), float(1), puddle)).mul(w);
  return { albedo: a2, roughness: r2, puddle, nxy };
}

// Porous vertical facades: rain darkens them slightly but cannot form a mirror-like film.
// Separate from horizontal puddles so atlas walls and roller shutters obey the same wetness control.
export function verticalWetLayer({ albedo, roughness, worldPos }) {
  const streak = smoothstep(0.58, 0.85, mx_noise_float(vec3(worldPos.x.mul(7), worldPos.y.mul(0.28), worldPos.z.mul(7))));
  const w = wetUniforms.wetness;
  return {
    albedo: albedo.mul(float(1).sub(w.mul(0.1)).sub(streak.mul(w).mul(0.055))),
    roughness: roughness.sub(w.mul(0.05)).max(0.65),
  };
}
