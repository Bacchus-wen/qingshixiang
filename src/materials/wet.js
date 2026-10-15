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

// Puddle coverage from low-frequency noise: values above a threshold collect water. Soft rims.
export function puddleMask(xz, coverage = 0.5) {
  const n = mx_fractal_noise_float(vec3(xz.mul(0.11), 3.7), 3, 2.0, 0.5).mul(0.5).add(0.5);
  const th = float(0.68).sub(float(coverage).mul(0.15));
  return smoothstep(th, th.add(0.06), n).mul(wetUniforms.wetness);
}

// Rain ripples: jittered cells, each spawning a damped expanding ring; returns a world-xz normal tilt.
export const rippleNormal = Fn(([xz]) => {
  const g = vec2(0).toVar();
  for (let L = 0; L < 3; L++) {
    const s = [2.4, 3.1, 1.9][L];
    const q = xz.mul(s).add(L * 7.31);
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
export function wetLayer({ albedo, roughness, porosity = 0.6, puddle = float(0), ripple = vec2(0), vertical = float(0), worldPos }) {
  const w = wetUniforms.wetness;
  const dark = mix(float(1), float(0.45), w.mul(porosity));
  const a1 = albedo.mul(dark);
  const film = clamp(roughness.mul(0.18).add(0.05), 0.05, 0.32);
  const r1 = mix(roughness, film, w.mul(0.92));
  // vertical rain streaks: thin wet runs darken and smooth the wall
  const streak = smoothstep(0.55, 0.8, mx_noise_float(vec3(worldPos.x.mul(9), worldPos.y.mul(0.35).sub(time.mul(0.25)), worldPos.z.mul(9)))).mul(vertical).mul(w);
  const a2 = mix(a1, a1.mul(0.55), max(puddle, streak.mul(0.6)));
  const r2 = mix(mix(r1, r1.mul(0.5), streak), float(0.03), puddle);
  const nxy = ripple.mul(mix(float(0.25), float(1), puddle)).mul(w);
  return { albedo: a2, roughness: r2, puddle, nxy };
}
