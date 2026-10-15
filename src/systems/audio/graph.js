import { DEFAULTS, clamp, random, mixState, createStorm } from './control.js';

// The same native Web Audio graph is used in realtime and OfflineAudioContext.
// Audio time owns scheduling: deterministic shot frame time must not accelerate it.
export function createSoundscape(ac, { levels = {}, muted = false, seed = 0x5eed } = {}) {
  const rng = random(seed), noiseRng = random(seed ^ 0xa16b);
  const params = { ...DEFAULTS };
  for (const key of Object.keys(params)) if (key in levels) params[key] = clamp(levels[key], 0, 1, params[key]);
  const nodes = new Set(), sources = new Set();
  let disposed = false, activeVoices = 0;
  const start = ac.currentTime;
  const keep = (n) => { nodes.add(n); return n; };
  const gain = (v = 1) => { const n = keep(ac.createGain()); n.gain.value = v; return n; };
  function filter(type, frequency, q = 0.7) {
    const n = keep(ac.createBiquadFilter()); n.type = type;
    n.frequency.value = frequency; n.Q.value = q; return n;
  }
  function source(n, at, end) {
    keep(n); sources.add(n);
    n.start(at);
    if (end !== undefined) n.stop(end);
    return n;
  }
  function noiseBuffer(seconds, channels = 2, impulse = false) {
    const b = ac.createBuffer(channels, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
    for (let c = 0; c < channels; c++) {
      const data = b.getChannelData(c); let low = 0;
      for (let i = 0; i < data.length; i++) {
        const white = noiseRng() * 2 - 1;
        low += 0.12 * (white - low);
        const t = i / ac.sampleRate;
        data[i] = impulse ? low * Math.exp(-t * 3.5) * Math.min(1, t / 0.015) : white;
      }
      if (impulse) for (const [delay, amp] of [[0.047, 0.5], [0.091, -0.3], [0.163, 0.2], [0.277, -0.12]]) {
        data[Math.floor((delay + c * 0.006) * ac.sampleRate)] += amp;
      }
    }
    return b;
  }
  const noise = noiseBuffer(3.7);
  const master = gain(muted ? 0 : params.master);
  const highpass = filter('highpass', 28);
  const compressor = keep(ac.createDynamicsCompressor());
  compressor.threshold.value = -10; compressor.knee.value = 8;
  compressor.ratio.value = 6; compressor.attack.value = 0.006; compressor.release.value = 0.25;
  const mix = gain();
  mix.connect(highpass).connect(compressor).connect(master).connect(ac.destination);
  const reverb = keep(ac.createConvolver()); reverb.buffer = noiseBuffer(2.8, 2, true);
  const wet = gain(params.reverb);
  reverb.connect(filter('lowpass', 3900)).connect(wet).connect(mix);

  const rainBus = gain(), rainFilter = filter('lowpass', 12000);
  rainBus.connect(rainFilter); rainFilter.connect(mix); rainFilter.connect(reverb);
  const buses = {};
  for (const name of Object.keys(DEFAULTS).filter(k => k !== 'master' && k !== 'reverb')) {
    const bus = gain(params[name]); buses[name] = bus;
    if (['nearRain', 'farRain', 'drips'].includes(name)) bus.connect(rainBus);
    else { bus.connect(mix); bus.connect(reverb); }
  }
  // Individual source amplitudes leave substantial headroom before the compressor.
  function loopNoise(bus, type, hz, amplitude, q = 0.7) {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = filter(type, hz, q), level = gain(amplitude);
    s.connect(f).connect(level).connect(bus);
    source(s, start); return { s, f, level };
  }
  function tone(bus, hz, amplitude, type = 'sine') {
    const s = ac.createOscillator(); s.type = type; s.frequency.value = hz;
    const level = gain(amplitude); s.connect(level).connect(bus); source(s, start);
    return { s, level };
  }
  function lfo(param, hz, amplitude, phaseDelay = 0) {
    const s = ac.createOscillator(); s.frequency.value = hz;
    const level = gain(amplitude); s.connect(level).connect(param); source(s, start + phaseDelay);
  }
  loopNoise(buses.nearRain, 'highpass', 2600, 0.1);
  loopNoise(buses.farRain, 'lowpass', 850, 0.37);
  const wind = loopNoise(buses.wind, 'bandpass', 420, 0.17, 2.2);
  lfo(wind.f.frequency, 0.041, 230); lfo(wind.level.gain, 0.069, 0.08);
  const windAir = loopNoise(buses.wind, 'lowpass', 270, 0.1);
  lfo(windAir.level.gain, 0.027, 0.05);
  const lampGate = gain(); lampGate.connect(buses.lamp);
  for (const [hz, amp] of [[50, 0.045], [100, 0.026], [150, 0.012], [60, 0.009], [120, 0.008]]) tone(lampGate, hz, amp);

  const memoryGate = gain(0); memoryGate.connect(buses.memory);
  // Diffuse vowels and slow, detuned suspended voicings; no language or melody.
  for (const [hz, q, amp] of [[320, 2.5, 0.085], [720, 4, 0.07], [1180, 5, 0.035]]) {
    const voice = loopNoise(memoryGate, 'bandpass', hz, amp, q);
    lfo(voice.f.frequency, 0.037 + hz / 90000, hz * 0.12);
    lfo(voice.level.gain, 0.13 + hz / 19000, amp * 0.35);
  }
  for (const [i, hz] of [130.81, 174.61, 196, 261.63].entries()) {
    const voice = tone(memoryGate, hz, 0.018);
    voice.s.detune.value = i % 2 ? 5 : -5;
    lfo(voice.s.detune, 0.019 + i * 0.006, 3);
    lfo(voice.level.gain, 0.023 + i * 0.007, 0.009);
  }

  // A bounded voice owns and releases every transient node after it ends.
  function voice(bus, at, duration, amplitude, pan = 0, attack = 0.008) {
    if (disposed || (!('startRendering' in ac) && activeVoices >= 48)) return null;
    activeVoices++;
    const owned = [], oscillators = [];
    const own = n => { keep(n); owned.push(n); return n; };
    const env = own(ac.createGain()), panner = own(ac.createStereoPanner());
    panner.pan.value = clamp(pan, -1, 1);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(amplitude, at + attack);
    env.gain.exponentialRampToValueAtTime(0.00001, at + duration);
    env.gain.setValueAtTime(0, at + duration + 0.01);
    env.connect(panner).connect(bus);
    function add(type, hz, endHz, q = 1) {
      let s, f;
      if (type === 'noise') {
        s = own(ac.createBufferSource()); s.buffer = noise; s.loop = true;
        f = own(ac.createBiquadFilter()); f.type = 'bandpass'; f.frequency.setValueAtTime(hz, at); f.Q.value = q;
        f.frequency.exponentialRampToValueAtTime(endHz || hz, at + duration);
        s.connect(f).connect(env);
      } else {
        s = own(ac.createOscillator()); s.type = type; s.frequency.setValueAtTime(hz, at);
        s.frequency.exponentialRampToValueAtTime(endHz || hz, at + duration);
        s.connect(env);
      }
      sources.add(s); oscillators.push(s);
      if (type === 'noise') s.start(at, rng() * 2); else s.start(at);
      s.stop(at + duration + 0.02);
      return s;
    }
    function finish() {
      const last = oscillators.at(-1);
      if (!last) return;
      last.onended = () => {
        for (const n of owned) { n.disconnect(); nodes.delete(n); sources.delete(n); }
        activeVoices--;
      };
    }
    return { add, env, finish };
  }
  function transient(name, at, level = 1, options = {}) {
    if (level <= 0) return;
    const pan = options.pan ?? (rng() * 1.6 - 0.8);
    if (name === 'grain') {
      const v = voice(buses.nearRain, at, 0.035 + rng() * 0.035, 0.025 * level, pan, 0.002);
      if (v) { v.add('noise', 4000 + rng() * 4500, 2300, 0.8); v.finish(); }
    } else if (name === 'drip') {
      const hz = 850 + rng() * 1500;
      const v = voice(buses.drips, at, 0.16 + rng() * 0.12, 0.12 * level, pan, 0.003);
      if (v) { v.add('sine', hz * 0.55, hz); v.add('noise', 3000, 1400, 2); v.finish(); }
    } else if (name === 'crackle') {
      const v = voice(buses.lamp, at, 0.025 + rng() * 0.06, 0.14 * level, 0.35, 0.001);
      if (v) { v.add('noise', 3600, 700, 0.6); v.finish(); }
      lampGate.gain.setValueAtTime(0.08, at);
      lampGate.gain.setTargetAtTime(1, at + 0.06, 0.08);
    } else if (name === 'gust') {
      const v = voice(buses.wind, at, 3.4, 0.15 * level, pan, 0.9);
      if (v) { v.add('noise', 620, 190, 7); v.finish(); }
    } else if (name === 'thunder') {
      const v = voice(buses.thunder, at, 4.8, 0.8 * level, pan * 0.5, 0.42);
      if (v) { v.add('noise', 95, 40, 0.55); v.add('noise', 210, 65, 0.8); v.finish(); }
    } else if (name === 'servo') {
      const duration = clamp(options.duration, 0.2, 3, 1.2);
      const v = voice(buses.servo, at, duration, 0.075 * level, pan, 0.04);
      if (v) {
        v.add('sawtooth', 72, 118); v.add('noise', 1700, 580, 1.7);
        // Mechanical stalls interrupt the envelope without discontinuous edges.
        for (const part of [0.27, 0.53, 0.76]) {
          const t = at + duration * part;
          v.env.gain.setTargetAtTime(0.003, t, 0.005);
          v.env.gain.setTargetAtTime(0.045 * level, t + 0.035, 0.012);
        }
        v.env.gain.setTargetAtTime(0.00001, at + duration * 0.85, duration * 0.04);
        v.finish();
      }
    } else if (name === 'click') {
      const v = voice(buses.click, at, 0.055, 0.18 * level, pan, 0.001);
      if (v) { v.add('noise', 2400, 700, 1); v.add('sine', 1450, 360); v.finish(); }
    } else if (name === 'whine') {
      const duration = clamp(options.duration, 0.15, 3, 1.5);
      const v = voice(buses.whine, at, duration, 0.1 * level, pan, Math.min(0.16, duration * 0.3));
      if (v) { v.add('sine', 1200, 4600); v.add('noise', 2200, 5400, 9); v.finish(); }
    }
  }

  const storm = createStorm(rng);
  const next = { grain: start + 0.1, drip: start + 0.45, crackle: start + 1.8, gust: start + 5 };
  const intervals = { grain: [0.035, 0.13], drip: [0.8, 2.9], crackle: [2.5, 7], gust: [9, 22] };
  const lastTargets = new WeakMap();
  function target(param, value, at, tau = 0.35) {
    if (lastTargets.get(param) === value) return;
    if (!lastTargets.has(param)) param.setValueAtTime(value, at);
    else param.setTargetAtTime(value, at, tau);
    lastTargets.set(param, value);
  }
  function update(at, world = {}, memory = {}) {
    if (disposed) return;
    const state = mixState(world, memory);
    target(master.gain, muted ? 0 : clamp(params.master), at, 0.04);
    target(wet.gain, clamp(params.reverb), at);
    for (const [name, bus] of Object.entries(buses)) target(bus.gain, clamp(params[name]), at);
    target(rainBus.gain, state.rain, at, 0.24);
    target(rainFilter.frequency, state.cutoff, at, 0.3);
    target(memoryGate.gain, state.memory, at, 1.2);
    const thunder = storm(at, world.lightning);
    if (thunder) transient('thunder', thunder.at, 0.55 + thunder.level * 0.45);
    for (const name of Object.keys(next)) {
      // Never catch up a hidden/background tab with a burst of stale events.
      if (next[name] < at - 0.15) next[name] = at;
      while (next[name] < at + 0.12) {
        if (!['grain', 'drip'].includes(name) || state.rain > 0) transient(name, Math.max(at, next[name]));
        const [min, max] = intervals[name];
        next[name] += min + rng() * (max - min);
      }
    }
  }
  return {
    params,
    update,
    play(name, options = {}) {
      if (disposed || !['servo', 'click', 'whine'].includes(name)) return false;
      transient(name, ac.currentTime + 0.005, clamp(options.gain, 0, 1, 1), options);
      return true;
    },
    // Used by the offline score as well as future timeline-driven interactions.
    schedule(name, at, options = {}) {
      if (!['servo', 'click', 'whine'].includes(name) || disposed) return false;
      transient(name, Math.max(start, at), clamp(options.gain, 0, 1, 1), options); return true;
    },
    setMuted(value) { muted = !!value; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const s of sources) { s.onended = null; try { s.stop(); } catch { /* already stopped */ } }
      for (const n of nodes) n.disconnect();
      sources.clear(); nodes.clear();
    },
  };
}
