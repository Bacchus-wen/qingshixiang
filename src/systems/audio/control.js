export const DEFAULTS = Object.freeze({
  master: 0.65, nearRain: 0.48, farRain: 0.65, drips: 0.28,
  wind: 0, lamp: 0.2, thunder: 0.65, memory: 0.32,
  servo: 0.42, click: 0.3, shutter: 0.5, whine: 0.14, reverb: 0.22,
  dog: 0.12, radio: 0.45, alley: 0.16,
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

// A fresh reveal takes 2.5 s. A departing beam latches silence even when the
// visual strength is still falling through nonzero values; only a rise reopens it.
export function createMemoryGate() {
  let previous = 0, previousAt, enteredAt = null, cut = false, trough = 0;
  return (at, value) => {
    const strength = clamp(value);
    const dt = previousAt === undefined ? 0 : at - previousAt;
    const drop = previous - strength;
    if (strength === 0 || drop > 0.2 || (dt > 0 && drop > 0.00001 && drop / dt > 0.7)) {
      cut = true; enteredAt = null; trough = strength;
    } else if (strength > 0 && (!cut || strength > trough + 0.01 || previous === 0)) {
      if (enteredAt === null) enteredAt = at;
      cut = false;
    }
    if (cut) trough = Math.min(trough, strength);
    previous = strength; previousAt = at;
    return cut || enteredAt === null ? 0 : strength * clamp((at - enteredAt) / 2.5);
  };
}

// Compare actual scene light samples, not an independent random flicker clock.
export function createLampContact() {
  let previous, previousAt, maximum = 0, lastCrackle = -Infinity;
  return (at, intensity) => {
    if (!Number.isFinite(intensity)) {
      previous = undefined; previousAt = undefined;
      return { level: 0, crackle: 0 };
    }
    const current = Math.max(0, intensity);
    maximum = Math.max(maximum, current);
    const dt = at - previousAt;
    const drop = previous > 0 ? (previous - current) / previous : 0;
    const crackle = dt > 0 && dt <= 0.2 && drop >= 0.18 && at - lastCrackle >= 0.06 ? drop : 0;
    if (crackle) lastCrackle = at;
    previous = current; previousAt = at;
    return { level: maximum > 0 ? Math.sqrt(current / maximum) : 0, crackle };
  };
}
