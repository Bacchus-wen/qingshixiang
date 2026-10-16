import { clamp, random } from './control.js';

export const RECORDINGS = Object.freeze([
  'rain_roof_loop', 'rain_puddle_loop', 'gutter_drip_loop', 'city_far_loop',
  'wind_loop', 'radio_loop', 'wind_gust', 'thunder_roll',
  'dog_far_a', 'dog_far_b', 'relay_a', 'relay_b', 'relay_c',
]);

// Optional injection returns an AudioBuffer; useful for serverless offline scores.
// Resolve URLs only on HTTP(S) pages, avoiding failed /audio fetches on about:blank
// and in Node. Each failed asset is independent and never rejects readiness.
export function createRecordings(ac, { params, rain, mix, reverb, seed, onEvent, loadBuffer } = {}) {
  const nodes = new Set(), sources = new Set(), buffers = new Map(), loops = new Map();
  const rng = random(seed ^ 0x7ec), abort = new AbortController();
  let disposed = false, activeVoices = 0;
  const keep = n => { nodes.add(n); return n; };
  const gain = value => { const n = keep(ac.createGain()); n.gain.value = value; return n; };
  const targets = new WeakMap();
  function target(param, value, at, tau = 0.25) {
    if (targets.get(param) === value) return;
    param.setTargetAtTime(value, at, tau);
    targets.set(param, value);
  }
  // Separate destinations preserve the existing rain filter and its alley send.
  const rainOut = gain(clamp(params.rec)), dryOut = gain(clamp(params.rec)), wetOut = gain(clamp(params.rec));
  rainOut.connect(rain); dryOut.connect(mix); wetOut.connect(reverb);
  const specs = {
    rain_roof_loop: { pan: -0.25, rain: true },
    rain_puddle_loop: { pan: 0, rain: true },
    gutter_drip_loop: { pan: 0.22, rain: true },
    city_far_loop: { pan: 0, cutoff: 1500 },
    wind_loop: { pan: 0.05, cutoff: 2100 },
    radio_loop: { pan: -0.4, cutoff: 1600, wet: 0.15 },
  };
  const state = { world: {}, memory: {} };
  function loopLevel(name) {
    const m = clamp(state.memory.strength), flood = clamp(state.memory.floodNow);
    switch (name) {
      case 'rain_roof_loop': return 0.4 * clamp(params.nearRain);
      case 'rain_puddle_loop': return 0.3 * clamp(params.farRain);
      case 'gutter_drip_loop': return 0.22 * clamp(params.drips);
      case 'city_far_loop': return (0.018 + 0.42 * m) * clamp(params.memory);
      case 'wind_loop': return (0.12 + 0.65 * clamp(state.world.windGust, 0, 1, 0.2)) * clamp(params.wind);
      case 'radio_loop': return m * (0.08 + 0.06 * flood) * clamp(params.radio);
      default: return 0;
    }
  }
  function startLoop(name, buffer) {
    if (buffer.duration <= 0.12) return;
    const spec = specs[name], s = keep(ac.createBufferSource()), level = gain(0);
    const pan = keep(ac.createStereoPanner()); pan.pan.value = spec.pan;
    s.buffer = buffer; s.loop = true; s.loopStart = 0.06; s.loopEnd = buffer.duration - 0.06;
    s.connect(level).connect(pan);
    let output = pan;
    if (spec.cutoff) {
      const f = keep(ac.createBiquadFilter()); f.type = 'lowpass'; f.frequency.value = spec.cutoff;
      output = output.connect(f);
    }
    output.connect(spec.rain ? rainOut : dryOut);
    if (spec.wet) output.connect(gain(spec.wet)).connect(wetOut);
    sources.add(s); loops.set(name, level);
    const at = ac.currentTime;
    target(level.gain, loopLevel(name), at, 0.6);
    s.start(at, s.loopStart);
  }
  const ready = Promise.all(RECORDINGS.map(async name => {
    try {
      let buffer;
      if (loadBuffer) buffer = await loadBuffer(name, ac, abort.signal);
      else {
        if (!/^https?:$/.test(globalThis.location?.protocol || '') || !globalThis.fetch) return;
        const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}audio/rec/${name}.mp3`, { signal: abort.signal });
        if (!response.ok) return;
        buffer = await ac.decodeAudioData(await response.arrayBuffer());
      }
      if (disposed || !buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0.12) return;
      if (specs[name]) startLoop(name, buffer);
      buffers.set(name, buffer);
    } catch { /* optional recording: synthesis remains available */ }
  })).then(() => [...buffers.keys()]);

  function play(name, at, { level = 1, pan = 0, cutoff = 6000, wet = 0.15, dry = 1 } = {}) {
    const buffer = buffers.get(name);
    if (disposed || !buffer || clamp(params.rec) === 0 || level <= 0 ||
        (!('startRendering' in ac) && activeVoices >= 16)) return false;
    activeVoices++;
    const owned = [], own = n => { keep(n); owned.push(n); return n; };
    const s = own(ac.createBufferSource()), env = own(ac.createGain());
    const f = own(ac.createBiquadFilter()), p = own(ac.createStereoPanner());
    s.buffer = buffer; f.type = 'lowpass'; f.frequency.value = cutoff; p.pan.value = clamp(pan, -1, 1);
    const duration = buffer.duration - 0.12;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + Math.min(0.008, duration / 4));
    env.gain.setValueAtTime(level, at + Math.max(duration / 2, duration - 0.04));
    env.gain.linearRampToValueAtTime(0, at + duration);
    s.connect(f).connect(env).connect(p);
    for (const [amount, bus] of [[dry, dryOut], [wet, wetOut]]) {
      const send = own(ac.createGain()); send.gain.value = amount; p.connect(send).connect(bus);
    }
    sources.add(s);
    s.onended = () => {
      for (const n of owned) { n.disconnect(); nodes.delete(n); }
      sources.delete(s); activeVoices--;
    };
    s.start(at, 0.06, duration);
    onEvent?.({ name: `rec:${name}`, at, level });
    return true;
  }
  function variant(prefix) {
    const names = RECORDINGS.filter(name => name.startsWith(prefix) && buffers.has(name));
    return names[Math.floor(rng() * names.length)];
  }
  let gustArmed = true;
  return {
    ready,
    has: name => buffers.has(name),
    synthScale: name => buffers.has(name) ? 1 - 0.35 * clamp(params.rec) : 1,
    play,
    dog(at) { return play(variant('dog_far_'), at, { level: 0.22 * clamp(params.dog), pan: 0.48, cutoff: 900, dry: 0.18, wet: 0.8 }); },
    relay(at, level = 1, pan = -0.15) { return play(variant('relay_'), at, { level: level * 0.24 * clamp(params.click), pan, cutoff: 4200 }); },
    update(at, world = {}, memory = {}) {
      if (disposed) return;
      state.world = world; state.memory = memory;
      for (const bus of [rainOut, dryOut, wetOut]) target(bus.gain, clamp(params.rec), at, 0.04);
      for (const [name, level] of loops) target(level.gain, loopLevel(name), at);
      const gust = clamp(world.windGust, 0, 1, 0.2);
      if (gust < 0.35) gustArmed = true;
      if (gustArmed && gust > 0.55) {
        gustArmed = false; // missed/unloaded cues never replay later
        play('wind_gust', at, { level: 0.55 * clamp(params.wind), cutoff: 2100 });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; abort.abort();
      for (const s of sources) { s.onended = null; try { s.stop(); } catch { /* ended */ } }
      for (const n of nodes) n.disconnect();
      sources.clear(); nodes.clear(); buffers.clear(); loops.clear();
    },
  };
}
