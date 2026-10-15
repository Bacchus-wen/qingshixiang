export const DEFAULTS = Object.freeze({
  master: 0.65, nearRain: 0.48, farRain: 0.65, drips: 0.28,
  wind: 0.34, lamp: 0.15, thunder: 0.65, memory: 0.18,
  servo: 0.42, click: 0.3, whine: 0.14, reverb: 0.22,
});

export function clamp(value, lo = 0, hi = 1, fallback = 0) {
  return Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;
}

export function random(seed = 0x5eed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function mixState(world = {}, memory = {}) {
  const strength = clamp(memory.strength);
  return {
    rain: clamp(world.rain, 0, 1, 1) * (1 - strength * 0.84),
    cutoff: 12000 * (1 - strength) + 850 * strength,
    memory: strength,
  };
}

// One thunder per lightning cluster; a sustained signal never repeats.
export function createStorm(rng) {
  let armed = true, last = -Infinity;
  return (time, lightning) => {
    const level = clamp(lightning);
    if (level < 0.05) armed = true;
    if (!armed || level < 0.15) return null;
    armed = false;
    if (time - last < 7) return null;
    last = time;
    return { at: time + 2 + rng() * 4, level };
  };
}

export function measure(channels) {
  let sum = 0, peak = 0, n = 0, finite = true;
  for (const samples of channels) for (const x of samples) {
    if (!Number.isFinite(x)) finite = false;
    sum += x * x; peak = Math.max(peak, Math.abs(x)); n++;
  }
  return { rms: Math.sqrt(sum / Math.max(1, n)), peak, finite };
}
