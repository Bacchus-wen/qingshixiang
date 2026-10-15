import { DEFAULTS, clamp, random, mixState, createStorm, createMemoryGate, createLampContact } from './control.js';
import { createDetails } from './details.js';

// The same native Web Audio graph is used in realtime and OfflineAudioContext.
// Audio time owns scheduling: deterministic shot frame time must not accelerate it.
export function createSoundscape(ac, { levels = {}, muted = false, seed = 0x5eed, onEvent } = {}) {
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
  for (const name of Object.keys(DEFAULTS).filter(k => !['master', 'reverb', 'dog', 'radio', 'alley'].includes(k))) {
    const bus = gain(params[name]); buses[name] = bus;
    if (['nearRain', 'farRain', 'drips'].includes(name)) bus.connect(rainBus);
    else if (name !== 'memory') {
      // Broad bandpass noise still carries substantial upper-frequency energy.
      // Roll it off for both dry thunder and its room send, retaining the
      // existing >60% energy-through-180Hz-lowpass regression threshold.
      const output = name === 'thunder' ? bus.connect(filter('lowpass', 120)) : bus;
      output.connect(mix);
      if (name !== 'shutter') output.connect(reverb);
    }
  }
  const details = createDetails(ac, { mix, rain: rainFilter, params, seed, onEvent });
  // Individual source amplitudes leave substantial headroom before the compressor.
  function loopNoise(bus, type, hz, amplitude, q = 0.7) {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = filter(type, hz, q), level = gain(amplitude);
    s.connect(f).connect(level).connect(bus);
    source(s, start); return { s, f, level };
  }
  function lfo(param, hz, amplitude, phaseDelay = 0) {
    const s = ac.createOscillator(); s.frequency.value = hz;
    const level = gain(amplitude); s.connect(level).connect(param); source(s, start + phaseDelay);
  }
  // Near rain is only discrete drops on one dull sheet-metal surface.
  // The distant bed stays broad and diffuse; no sustained pitched present layer.
  loopNoise(buses.farRain, 'lowpass', 1000, 0.23);
  const wind = loopNoise(buses.wind, 'lowpass', 270, 0.1);
  lfo(wind.level.gain, 0.027, 0.05); // optional broadband air, disabled by default
  const lampGate = gain(0); lampGate.connect(buses.lamp);
  loopNoise(lampGate, 'highpass', 1800, 0.035);

  // Memory has its own reverb BEFORE the final gate. Cutting only the source
  // would leave the old room audible through the shared 2.8-second alley tail.
  const memoryRoom = gain();
  const memoryVerb = keep(ac.createConvolver()); memoryVerb.buffer = reverb.buffer;
  const memoryWet = gain(params.reverb);
  buses.memory.connect(memoryRoom);
  buses.memory.connect(memoryVerb).connect(filter('lowpass', 2400)).connect(memoryWet).connect(memoryRoom);
  // The shared 28 Hz highpass also rings after its input is cut. Give memory
  // the same DC protection BEFORE its gate and join at the compressor, so
  // neither the dry/wet filters nor the convolver can leak a post-cut tail.
  const memoryGate = gain(0);
  memoryRoom.connect(filter('highpass', 28)).connect(memoryGate).connect(compressor);
  // Warm, speech-shaped noise and market air, with no chord or intelligible speech.
  loopNoise(buses.memory, 'lowpass', 650, 0.1);
  for (const [hz, q, amp] of [[320, 1.2, 0.11], [720, 1.6, 0.09], [1180, 2, 0.045]]) {
    const voice = loopNoise(buses.memory, 'bandpass', hz, amp, q);
    lfo(voice.f.frequency, 0.037 + hz / 90000, hz * 0.12);
    lfo(voice.level.gain, 0.13 + hz / 19000, amp * 0.55);
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
    onEvent?.({ name, at, level });
    const pan = options.pan ?? (rng() * 1.6 - 0.8);
    if (name === 'grain') {
      const v = voice(buses.nearRain, at, 0.055, (0.16 + rng() * 0.1) * level, -0.25 + rng() * 0.12, 0.0015);
      if (v) { v.add('noise', 2600, 2600, 1.1); v.finish(); }
    } else if (name === 'drip') {
      const hz = 650 + rng() * 350;
      const v = voice(buses.drips, at, 0.16 + rng() * 0.12, 0.075 * level, pan, 0.003);
      if (v) { v.add('sine', hz * 0.55, hz); v.add('noise', 3000, 1400, 2); v.finish(); }
    } else if (name === 'crackle') {
      const v = voice(buses.lamp, at, 0.025 + rng() * 0.06, 0.24 * level, 0.35, 0.001);
      if (v) { v.add('noise', 3600, 700, 0.6); v.finish(); }
    } else if (name === 'thunder') {
      const v = voice(buses.thunder, at, 4.8, 0.8 * level, pan * 0.5, 0.42);
      if (v) { v.add('noise', 72, 36, 0.65); v.add('noise', 150, 48, 0.7); v.finish(); }
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
    } else if (name === 'shutter') {
      // One dry double-impact camera mechanism, finished before the motor starts.
      for (const [delay, amp, hz] of [[0, 0.24, 2100], [0.027, 0.13, 1100]]) {
        const v = voice(buses.shutter, at + delay, 0.028, amp * level, pan, 0.001);
        if (v) { v.add('noise', hz, hz * 0.6, 0.8); v.finish(); }
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
  const memoryEnvelope = createMemoryGate(), lampContact = createLampContact();
  const next = { grain: start + 0.1, drip: start + 3 + rng() * 4 };
  const intervals = { grain: [0.06, 0.19], drip: [3.5, 9] };
  let memoryRamp = { from: 0, to: 0, at: start, end: start };
  function setMemory(value, at) {
    if (value === memoryRamp.to) return;
    const r = memoryRamp;
    const held = r.from + (r.to - r.from) * clamp((at - r.at) / Math.max(0.00001, r.end - r.at));
    const p = memoryGate.gain;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(at);
    else { p.cancelScheduledValues(at); p.linearRampToValueAtTime(held, at); }
    p.setValueAtTime(held, at);
    p.linearRampToValueAtTime(value, at + 0.01); // 10 ms anti-click cut, including the room tail
    memoryRamp = { from: held, to: value, at, end: at + 0.01 };
  }
  const lastTargets = new WeakMap();
  function target(param, value, at, tau = 0.35) {
    if (lastTargets.get(param) === value) return;
    if (!lastTargets.has(param)) param.setValueAtTime(value, at);
    else param.setTargetAtTime(value, at, tau);
    lastTargets.set(param, value);
  }
  function update(at, world = {}, memory = {}, lampIntensity, camera) {
    if (disposed) return;
    const state = mixState(world, memory);
    target(master.gain, muted ? 0 : clamp(params.master), at, 0.04);
    target(wet.gain, clamp(params.reverb), at);
    target(memoryWet.gain, clamp(params.reverb), at);
    for (const [name, bus] of Object.entries(buses)) target(bus.gain, clamp(params[name]), at);
    target(rainBus.gain, state.rain, at, 0.24);
    target(rainFilter.frequency, state.cutoff, at, 0.3);
    details.update(at, memory, camera);
    setMemory(memoryEnvelope(at, state.memory), at);
    const contact = lampContact(at, lampIntensity);
    target(lampGate.gain, contact.level, at, 0.008);
    if (contact.crackle) transient('crackle', at, contact.crackle);
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
  // Existing robot callers issue whine + servo in the same frame. Group those
  // calls under one shutter, also accepting an explicit play('shutter') first.
  let openingAt = -Infinity;
  function cue(name, at, options = {}) {
    if (disposed || !['shutter', 'servo', 'click', 'whine'].includes(name)) return false;
    const level = clamp(options.gain, 0, 1, 1);
    if (level === 0) return true;
    if (name === 'shutter') openingAt = at;
    if (name === 'servo' || name === 'whine') {
      if (at < openingAt || at - openingAt > 0.25) {
        openingAt = at;
        transient('shutter', at, level, options);
      }
      at = Math.max(at, openingAt + (name === 'servo' ? 0.09 : 0.16));
    }
    transient(name, at, level, options);
    return true;
  }
  return {
    params,
    update,
    play(name, options = {}) { return cue(name, ac.currentTime + 0.005, options); },
    // Offline scores should schedule cues in request order, as realtime callers do.
    schedule(name, at, options = {}) { return cue(name, Math.max(start, at), options); },
    setMuted(value) { muted = !!value; },
    dispose() {
      if (disposed) return;
      disposed = true;
      details.dispose();
      for (const s of sources) { s.onended = null; try { s.stop(); } catch { /* already stopped */ } }
      for (const n of nodes) n.disconnect();
      sources.clear(); nodes.clear();
    },
  };
}
