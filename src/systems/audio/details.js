import { clamp, random } from './control.js';
import { alleyPresence, createDogClock, createRadioListener } from './details-control.js';

// Quiet location details, with independent random streams so they cannot shift
// existing rain/thunder cues. No AudioContext, timers or assets are created here.
export function createDetails(ac, { mix, rain, params, seed, onEvent }) {
  const start = ac.currentTime;
  const dogRng = random(seed ^ 0xd096), radioRng = random(seed ^ 0x7ad10);
  const noiseRng = random(seed ^ 0xa11e7);
  const nodes = new Set(), sources = new Set();
  let disposed = false;
  const keep = n => { nodes.add(n); return n; };
  const gain = value => { const n = keep(ac.createGain()); n.gain.value = value; return n; };
  const filter = (type, hz, q = 0.7) => {
    const n = keep(ac.createBiquadFilter()); n.type = type;
    n.frequency.value = hz; n.Q.value = q; return n;
  };
  const targets = new WeakMap();
  function target(param, value, at, tau = 0.15) {
    if (targets.get(param) === value) return;
    if (!targets.has(param)) param.setValueAtTime(value, at);
    else param.setTargetAtTime(value, at, tau);
    targets.set(param, value);
  }

  // Six-second, low-frequency diffuse tail, plus a wall reflection one beat
  // later. Feed only rain; the output gate silences even stored reverberation.
  const impulse = ac.createBuffer(2, Math.ceil(ac.sampleRate * 6), ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c); let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ac.sampleRate;
      low += (1 - Math.exp(-2 * Math.PI * 800 / ac.sampleRate)) * (noiseRng() * 2 - 1 - low);
      data[i] = low * Math.exp(-t * 1.15) * Math.min(1, t / 0.08);
    }
  }
  const alleyVerb = keep(ac.createConvolver()); alleyVerb.buffer = impulse;
  const delay = keep(ac.createDelay(1)); delay.delayTime.value = 0.31;
  const alleyGate = gain(0);
  rain.connect(delay).connect(alleyVerb).connect(filter('lowpass', 850)).connect(alleyGate).connect(mix);

  // Low, rough voiced burst. A fixed broadband/formant component breaks up the
  // glottal pulse; no clean pitch sweep or cartoon "boing" oscillator.
  const bark = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.34), ac.sampleRate);
  const barkData = bark.getChannelData(0);
  let phase = 0, breath = 0;
  for (let i = 0; i < barkData.length; i++) {
    const t = i / ac.sampleRate;
    breath += 0.2 * (noiseRng() * 2 - 1 - breath);
    phase += 2 * Math.PI * (103 + 8 * Math.sin(t * 31) - 12 * t) / ac.sampleRate;
    const throat = Math.tanh(2.6 * Math.sin(phase)) * (0.68 + 0.32 * Math.sin(phase * 3));
    const env = Math.min(1, t / 0.025) * Math.exp(-t * 13) * Math.min(1, (0.34 - t) / 0.04);
    barkData[i] = (throat * 0.65 + breath * 0.35) * env * 0.09;
  }
  const dogBus = gain(0), dogDry = gain(0.18), dogWet = gain(0.8);
  const dogVerb = keep(ac.createConvolver()); dogVerb.buffer = impulse;
  dogBus.connect(dogDry).connect(mix);
  dogBus.connect(dogVerb).connect(filter('lowpass', 1050)).connect(dogWet).connect(mix);
  const dogClock = createDogClock(dogRng, start);
  function dogCall(group) {
    onEvent?.({ name: 'dog-group', ...group });
    for (let i = 0; i < group.count; i++) {
      const at = group.at + i * group.spacing;
      const s = keep(ac.createBufferSource()); s.buffer = bark;
      s.playbackRate.value = 0.92 + dogRng() * 0.12;
      const f = filter('lowpass', 900);
      const p = keep(ac.createStereoPanner()); p.pan.value = 0.48;
      s.connect(f).connect(p).connect(dogBus); sources.add(s);
      s.onended = () => {
        for (const n of [s, f, p]) { n.disconnect(); nodes.delete(n); }
        sources.delete(s);
      };
      s.start(at);
      onEvent?.({ name: 'dog', at, groupAt: group.at });
    }
  }

  // Mono band-limited noise with changing formants and uneven syllable groups:
  // a badly tuned indoor radio, never recorded speech or a recognizable tune.
  const radioNoise = ac.createBuffer(1, Math.ceil(ac.sampleRate * 3.71), ac.sampleRate);
  const samples = radioNoise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = noiseRng() * 2 - 1;
  const radioSource = keep(ac.createBufferSource()); radioSource.buffer = radioNoise; radioSource.loop = true;
  const formant = filter('bandpass', 960, 0.8), radioEnvelope = gain(0);
  const radioFilter = filter('lowpass', 750), radioLevel = gain(0);
  const radioPan = keep(ac.createStereoPanner());
  radioSource.connect(formant).connect(radioEnvelope).connect(radioFilter).connect(radioLevel).connect(radioPan).connect(mix);
  sources.add(radioSource); radioSource.start(start);
  const listener = createRadioListener();
  let nextSyllable = start + 0.8, syllablesLeft = 0;

  return {
    update(at, memory = {}, camera) {
      if (disposed) return;
      target(dogBus.gain, clamp(params.dog), at);
      target(alleyGate.gain, clamp(params.alley) * alleyPresence(memory.strength), at, 0.06);
      const radio = listener(camera, memory);
      target(radioLevel.gain, clamp(params.radio) * radio.gain, at, 0.12);
      target(radioFilter.frequency, radio.cutoff, at, 0.12);
      target(radioPan.pan, radio.pan, at, 0.08);
      const group = dogClock(at);
      if (group && params.dog > 0) dogCall(group);
      if (nextSyllable < at - 0.15) { nextSyllable = at + 0.5; syllablesLeft = 0; }
      while (nextSyllable < at + 0.12) {
        if (!syllablesLeft) syllablesLeft = 4 + Math.floor(radioRng() * 7);
        const time = Math.max(at, nextSyllable), duration = 0.09 + radioRng() * 0.16;
        const amplitude = 0.005 + radioRng() * 0.005;
        formant.frequency.setTargetAtTime(650 + radioRng() * 1050, time, 0.025);
        radioEnvelope.gain.setValueAtTime(0, time);
        radioEnvelope.gain.linearRampToValueAtTime(amplitude, time + 0.025);
        radioEnvelope.gain.linearRampToValueAtTime(amplitude * 0.6, time + duration * 0.65);
        radioEnvelope.gain.linearRampToValueAtTime(0, time + duration);
        if (params.radio > 0) onEvent?.({ name: 'radio-syllable', at: time, duration });
        nextSyllable = time + duration + 0.045 + radioRng() * 0.09;
        if (--syllablesLeft === 0) nextSyllable += 1.4 + radioRng() * 4.6;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rain.disconnect(delay);
      for (const s of sources) { s.onended = null; try { s.stop(); } catch { /* ended */ } }
      for (const n of nodes) n.disconnect();
      sources.clear(); nodes.clear();
    },
  };
}
