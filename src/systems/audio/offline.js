import { DEFAULTS, measure } from './control.js';
import { createSoundscape } from './graph.js';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { RADIO_POSITION } from './details-control.js';

export async function renderOffline({
  seconds = 10, muted = false, levels = {}, memory = 'ramp', effects = true,
  storm = true, rain = 1, lamp = 650, seed = 0x5eed, windows = {},
  camera, memoryCone = {},
} = {}) {
  const ac = new OfflineAudioContext(2, Math.ceil(24000 * seconds), 24000);
  const events = [];
  const graph = createSoundscape(ac, { muted, levels, seed, onEvent: event => events.push(event) });
  try {
    for (let i = 0; i < seconds * 60; i++) {
      const t = i / 60;
      graph.update(t, { rain: typeof rain === 'function' ? rain(t) : rain, lightning: typeof storm === 'function' ? storm(t) : storm && i === 60 ? 1 : 0 }, {
        ...(typeof memoryCone === 'function' ? memoryCone(t) : memoryCone),
        strength: typeof memory === 'function' ? memory(t) : memory === 'ramp' ? Math.max(0, Math.min(1, (t - 4) / 3)) : memory,
      }, typeof lamp === 'function' ? lamp(t) : lamp, typeof camera === 'function' ? camera(t) : camera);
    }
    const score = Array.isArray(effects) ? effects : effects ? [
      { name: 'shutter', at: 0.6 }, { name: 'whine', at: 0.6 },
      { name: 'servo', at: 0.6 }, { name: 'click', at: 2.1 },
    ] : [];
    for (const { name, at, ...options } of score) graph.schedule(name, at, options);
    const buffer = await ac.startRendering();
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const stats = measure(channels);
    const spans = typeof windows === 'function' ? windows(events) : windows;
    const segments = Object.fromEntries(Object.entries(spans).map(([name, [from, to]]) => [name,
      measure(channels.map(c => c.subarray(Math.floor(from * ac.sampleRate), Math.floor(to * ac.sampleRate)))),
    ]));
    // Energy retained by a 180 Hz lowpass: measures actual rendered thunder,
    // not just oscillator/filter settings. Process each channel independently.
    let total = 0, lowEnergy = 0;
    const alpha = 1 - Math.exp(-2 * Math.PI * 180 / ac.sampleRate);
    for (const samples of channels) {
      let low = 0;
      for (const x of samples) { low += alpha * (x - low); total += x * x; lowEnergy += low * low; }
    }
    return { ...stats, seconds, segments, events, channelRms: channels.map(c => measure([c]).rms), lowRatio: total ? lowEnergy / total : 0 };
  } finally { graph.dispose(); }
}

export async function runOfflineTest({ muted = false } = {}) {
  const main = await renderOffline({ muted });
  console.log(`[audio-test] 10s RMS=${main.rms.toFixed(6)} peak=${main.peak.toFixed(6)} finite=${main.finite} mute=${muted}`);
  const silence = await renderOffline({ muted: true });
  const onlyRain = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, ['master', 'nearRain', 'farRain', 'drips'].includes(k) ? DEFAULTS[k] : 0]));
  const rain = await renderOffline({ seconds: 3, memory: 0, effects: false, storm: false, levels: onlyRain });
  const rememberedRain = await renderOffline({ seconds: 3, memory: 1, effects: false, storm: false, levels: onlyRain });
  const layers = {};
  // Sparse dogs need a minutes-long score, and alley is a rain send, not a source.
  // Their dedicated assertions are in runDetailsTest, invoked by audio-render.
  for (const name of Object.keys(DEFAULTS).filter(k => !['master', 'reverb', 'dog', 'alley'].includes(k))) {
    const levels = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, k === 'master' || k === name ? (k === 'wind' ? 0.25 : DEFAULTS[k]) : 0]));
    layers[name] = await renderOffline({ seconds: 10, memory: name === 'memory' ? 1 : 0, levels });
  }
  const audible = s => s.finite && s.rms > 0.000001 && s.peak < 0.98;
  const pass = (muted ? main.peak === 0 : audible(main)) && silence.peak === 0 &&
    rememberedRain.rms < rain.rms * 0.3 && Object.values(layers).every(audible);
  console.log(`[audio-test] mutePeak=${silence.peak} memoryRainRatio=${(rememberedRain.rms / rain.rms).toFixed(4)} layers=${Object.keys(layers).length} pass=${pass}`);
  if (!pass) console.error('[audio-test] FAILED', JSON.stringify({ main, silence, rain, rememberedRain, layers }));
  return { pass, main, silence, rain, rememberedRain, layers };
}

// Actual DSP regressions for visual-review item 8. Run in native offline Web
// Audio via tools/audio-render.mjs; no realtime device or game server is needed.
export async function runReviewTest() {
  const isolate = (...names) => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k,
    k === 'master' || names.includes(k) ? 1 : 0,
  ]));
  const base = { effects: false, storm: false, memory: 0, rain: 0, lamp: null };
  const results = {}, checks = {};
  // At max wet level, the complete remembered room must disappear within 50 ms.
  // Hold a nonzero residual strength to catch unintended reopening after the cut.
  const room = results.room = await renderOffline({ ...base, seconds: 9,
    levels: { ...isolate('memory'), reverb: 1 },
    memory: t => t < 3.5 ? 1 : t < 5.5 ? 0.35 : 1,
    windows: { early: [0.1, 0.35], mid: [1, 1.4], full: [2.6, 3.3],
      cut50ms: [3.55, 3.65], heldCut: [3.65, 5.5], reentry: [5.6, 5.85], restored: [8.1, 8.8] },
  });
  const w = room.segments;
  checks.memoryFade = w.early.rms < w.mid.rms * 0.5 && w.mid.rms < w.full.rms * 0.8 && w.full.rms > 0.001;
  checks.memoryCut50ms = w.cut50ms.rms < w.full.rms * 0.001 && w.heldCut.peak < 0.000001;
  checks.memoryReentry = w.reentry.rms < w.restored.rms * 0.25 && w.restored.rms > 0.001;
  const partial = results.partial = await renderOffline({ ...base, seconds: 4,
    levels: isolate('memory'), memory: 0.4, windows: { full: [2.7, 3.5] },
  });
  const full = results.full = await renderOffline({ ...base, seconds: 4,
    levels: isolate('memory'), memory: 1, windows: { full: [2.7, 3.5] },
  });
  const ratio = partial.segments.full.rms / full.segments.full.rms;
  checks.memoryTracksStrength = ratio > 0.35 && ratio < 0.45;

  const opening = results.opening = await renderOffline({ ...base, seconds: 3,
    levels: isolate('shutter', 'servo', 'whine'),
    // Match the current robot call order, then separately exercise explicit shutter.
    effects: [{ name: 'whine', at: 0.5 }, { name: 'servo', at: 0.5 },
      { name: 'shutter', at: 2 }, { name: 'servo', at: 2 }, { name: 'whine', at: 2 }],
    windows: { before: [0, 0.5], shutter: [0.51, 0.56], motor: [0.7, 1] },
  });
  const cues = opening.events.filter(e => ['shutter', 'servo', 'whine'].includes(e.name));
  checks.openingOrder = cues.length === 6 && [0.5, 2].every(at =>
    cues.filter(e => e.name === 'shutter' && Math.abs(e.at - at) < 1e-6).length === 1 &&
    cues.some(e => e.name === 'servo' && Math.abs(e.at - at - 0.09) < 1e-6) &&
    cues.some(e => e.name === 'whine' && Math.abs(e.at - at - 0.16) < 1e-6));
  checks.shutterAudible = opening.segments.before.peak === 0 && opening.segments.shutter.rms > 0.0001 && opening.segments.motor.rms > 0.0001;

  const lamp = results.lamp = await renderOffline({ ...base, seconds: 4,
    levels: isolate('lamp'), lamp: t => t < 1 ? 650 : t < 1.5 ? 65 : t < 2.5 ? 650 : 0,
  });
  const crackles = lamp.events.filter(e => e.name === 'crackle');
  checks.lampSync = crackles.length === 2 && crackles[0].at === 1 && crackles[1].at === 2.5 && lamp.rms > 0.0001;
  // The newly added intermittent radio is intentional; this check still guards
  // against the old sustained present-day wind/lamp drone.
  const quiet = results.quiet = await renderOffline({ ...base, seconds: 10, levels: { radio: 0, dog: 0 } });
  checks.noPresentDrone = quiet.peak === 0 && !quiet.events.some(e => e.name === 'crackle');

  const drips = results.drips = await renderOffline({ ...base, seconds: 28, rain: 1, levels: isolate('drips') });
  const times = drips.events.filter(e => e.name === 'drip').map(e => e.at);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  checks.sparseIrregularDrips = gaps.length >= 2 && gaps.every(g => g >= 3.5 && g <= 9) && Math.max(...gaps) - Math.min(...gaps) > 0.25 && drips.rms > 0.000001;

  const thunder = results.thunder = await renderOffline({ ...base, seconds: 13, storm: true, levels: isolate('thunder'),
    windows: { beforeMinimumDelay: [0, 3] },
  });
  const rumbles = thunder.events.filter(e => e.name === 'thunder');
  checks.thunderDelay = rumbles.length === 1 && rumbles[0].at >= 3 && rumbles[0].at <= 7 && thunder.segments.beforeMinimumDelay.peak === 0;
  checks.thunderLowEnd = thunder.rms > 0.0001 && thunder.lowRatio > 0.6;
  checks.finiteHeadroom = Object.values(results).every(r => r.finite && r.peak < 0.98);
  const pass = Object.values(checks).every(Boolean);
  console.log(`[audio-review-test] ${JSON.stringify(checks)}`);
  return { pass, checks, results };
}

// Run only in native OfflineAudioContext. Levels below are measured dBFS,
// including filters, stereo pan, room tails and the actual master output.
export async function runDetailsTest() {
  const isolate = (...names) => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k,
    k === 'master' ? 1 : names.includes(k) ? DEFAULTS[k] : 0,
  ]));
  const base = { effects: false, storm: false, memory: 0, rain: 0, lamp: null };
  const results = {}, checks = {};
  const dogs = results.dogs = await renderOffline({ ...base, seconds: 280, levels: isolate('dog'),
    windows: events => {
      const first = events.find(e => e.name === 'dog-group');
      if (!first) return {};
      const end = first.at + (first.count - 1) * first.spacing;
      return { before: [0, 40], call: [first.at, end + 0.5], tail: [end + 0.7, end + 3] };
    },
  });
  const groups = dogs.events.filter(e => e.name === 'dog-group');
  const barks = dogs.events.filter(e => e.name === 'dog');
  const gaps = groups.slice(1).map((g, i) => g.at - groups[i].at);
  checks.dogIntervals = groups.length >= 3 && groups[0].at >= 40 && groups[0].at <= 90 &&
    gaps.every(g => g >= 40 && g <= 90) && Math.max(...gaps) - Math.min(...gaps) > 1;
  checks.dogOneOrTwo = groups.every(g => (g.count === 1 || g.count === 2) &&
    barks.filter(b => b.groupAt === g.at).length === g.count);
  checks.dogDistantLevel = dogs.finite && dogs.peak < 10 ** (-36 / 20) &&
    dogs.segments.before?.peak === 0 && dogs.segments.call?.rms > 0.00001;
  checks.dogLongTail = dogs.segments.tail?.rms > 0.00000001;

  const camera = new PerspectiveCamera();
  camera.position.set(0, RADIO_POSITION.y, RADIO_POSITION.z);
  camera.lookAt(0, RADIO_POSITION.y, RADIO_POSITION.z - 1);
  const origin = camera.position.clone();
  const cone = { origin, dir: new Vector3().copy(RADIO_POSITION).sub(origin).normalize(), angle: 0.35, range: 40 };
  // Max slider settings and the same seeded syllables in every comparison.
  const radioOptions = { ...base, seconds: 16, camera, levels: { ...isolate('radio'), radio: 1 } };
  const dark = results.radioDark = await renderOffline(radioOptions);
  const lit = results.radioLit = await renderOffline({ ...radioOptions, memory: 1, memoryCone: cone });
  const away = results.radioAway = await renderOffline({ ...radioOptions, memory: 1,
    memoryCone: { ...cone, dir: cone.dir.clone().negate() },
  });
  camera.position.copy(RADIO_POSITION);
  const nearest = results.radioNearest = await renderOffline({ ...radioOptions, memory: 1, memoryCone: cone });
  checks.radioBelowMinus30dB = [dark, lit, away, nearest].every(r => r.finite &&
    r.rms > 0.000001 && r.rms < 10 ** (-30 / 20) && r.peak < 10 ** (-30 / 20));
  checks.radioLitRises = lit.rms > dark.rms * 1.5;
  checks.radioLocalConeOnly = Math.abs(dark.rms - away.rms) < dark.rms * 0.001;
  checks.radioLeftPan = dark.channelRms[0] > dark.channelRms[1] * 2;
  camera.position.set(0, RADIO_POSITION.y, RADIO_POSITION.z);
  camera.lookAt(0, RADIO_POSITION.y, RADIO_POSITION.z + 1);
  const turned = results.radioTurned = await renderOffline(radioOptions);
  checks.radioFollowsHeading = turned.channelRms[1] > turned.channelRms[0] * 2;
  camera.position.set(0, RADIO_POSITION.y, 8);
  const far = results.radioFar = await renderOffline(radioOptions);
  checks.radioDistance = far.rms < dark.rms * 0.15;
  const pulses = dark.events.filter(e => e.name === 'radio-syllable');
  checks.radioIntermittent = pulses.length > 8 && pulses.some((e, i) => i > 0 &&
    e.at - pulses[i - 1].at - pulses[i - 1].duration > 1.4);

  const tailOptions = { ...base, seconds: 8, rain: t => t < 1 ? 1 : 0,
    levels: { ...isolate('farRain', 'reverb'), alley: 1 }, windows: { tail: [4.5, 5.5] },
  };
  const present = results.alleyPresent = await renderOffline(tailOptions);
  const short = results.alleyOff = await renderOffline({ ...tailOptions, levels: { ...tailOptions.levels, alley: 0 } });
  const past = results.alleyPast = await renderOffline({ ...tailOptions, memory: t => t < 2 ? 0 : 1 });
  checks.alleyLongTail = present.segments.tail.rms > short.segments.tail.rms * 3;
  checks.alleyPresentOnly = past.segments.tail.rms < present.segments.tail.rms * 0.05;
  checks.detailsHeadroom = Object.values(results).every(r => r.finite && r.peak < 0.98);
  const pass = Object.values(checks).every(Boolean);
  console.log(`[audio-details-test] ${JSON.stringify(checks)}`);
  return { pass, checks, results };
}
