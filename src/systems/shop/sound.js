import * as THREE from 'three/webgpu';
import { memoryMaskCPU } from '../../materials/memory.js';

// The shop's sound (v4). Recordings (CC0, Freesound; CREDITS.md) for what a synthesiser would fake badly -- the street
// at dusk, the busy street of the past, a pencil on plaster, a fluorescent tube, a CRT switching on, static, a bicycle
// bell, demolition far off -- and Web Audio synthesis for everything that has to follow the picture exactly: the
// clock's tick on each swing, the radio's tune, the test-card tone, the robot's servos, the tube's hum, the room.
//   present : a quiet room (50 Hz mains, air), the evening street outside through the half-open shutter (muffled
//             once inside), now and then a machine on the demolition site
//   past    : wherever the beam falls the shop is alive -- the street outside busy, a radio playing a tune, TVs with
//             their static and test tone, the clock ticking, a bicycle bell
//   robot   : servos when the head turns, a whine as the eye opens, a relay click when it fails, the power dying
// ctx.api.audio.play(name, { pos, gain }) for one-shots from the other systems.
const FILES = ['dusk_loop', 'past_street_loop', 'tv_static_loop', 'tube_flicker', 'tv_on', 'pencil', 'bike_bell', 'demolition_far'];
const REC = ['relay_a', 'relay_b', 'dog_far_a']; // from the v3 set (assets/audio/rec, CREDITS.md)
const TUBE_SLICES = [[1.75, 1.15], [7.75, 1.5], [17.15, 1.3]], CLICKS = [[0.48, 0.25], [5.08, 0.25], [6.48, 0.25], [12.88, 0.3]];
// a tune for the radio: an old-style pentatonic melody (G A B D E), written for this piece; [semitones from G4, beats]
const TUNE = [[7, 1], [9, 0.5], [7, 0.5], [4, 1], [2, 1], [4, 1.5], [7, 0.5], [9, 1], [12, 1], [9, 2],
  [12, 1], [14, 0.5], [12, 0.5], [9, 1], [7, 1], [9, 1], [4, 1], [7, 2], [2, 1], [4, 0.5], [2, 0.5], [0, 1], [-3, 1], [0, 3], [null, 1]];

export default {
  name: 'shopsound',
  async init(ctx) {
    this.ctx = ctx; this.buffers = new Map(); this.muted = ctx.params.has('mute'); this.cam = new THREE.Vector3(); this._v = new THREE.Vector3(); this._r = new THREE.Vector3();
    const self = this;
    ctx.api.audio = {
      play: (name, opts = {}) => (self.ac?.state === 'running' ? self.play(name, opts) : false),
      get state() { return self.ac?.state || 'locked'; },
      // record the mix (tools/audio-capture.mjs): start() then stop() -> base64 webm/opus
      startRecording() { const d = self.ac.createMediaStreamDestination(); self.master.connect(d); self.rec = new MediaRecorder(d.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 }); self.recChunks = []; self.rec.ondataavailable = (e) => self.recChunks.push(e.data); self.rec.start(1000); return true; },
      async stopRecording() { await new Promise((r) => { self.rec.onstop = r; self.rec.stop(); }); const b = new Blob(self.recChunks, { type: 'audio/webm' }); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); },
      meter() { const a = self.meterA; if (!a) return null; const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s = 0, pk = 0; for (const v of d) { s += v * v; pk = Math.max(pk, Math.abs(v)); } return { rmsDb: +(10 * Math.log10(s / d.length + 1e-12)).toFixed(1), peak: +pk.toFixed(3) }; },
    };
    this.unlock = () => {
      try {
        if (!this.ac) { this.ac = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ latencyHint: 'interactive' }); this.build(); this.load(); }
        if (this.ac.state !== 'running') this.ac.resume().catch(() => {});
      } catch (e) { console.warn('[sound] unavailable', e.message); }
    };
    addEventListener('pointerdown', this.unlock, { capture: true, passive: true });
    addEventListener('keydown', this.unlock, { capture: true });
  },
  async load() {
    const base = `${import.meta.env.BASE_URL}audio/`;
    await Promise.all([...FILES.map((n) => [n, `shop/${n}.mp3`]), ...REC.map((n) => [n, `rec/${n}.mp3`])].map(async ([n, url]) => {
      try { const r = await fetch(base + url); this.buffers.set(n, await this.ac.decodeAudioData(await r.arrayBuffer())); } catch (e) { console.warn('[sound] missing', n); }
    }));
    // loops start silent; update() sets their levels
    for (const [n, out] of [['dusk_loop', this.duskIn], ['past_street_loop', this.pastIn], ['tv_static_loop', this.staticIn]]) {
      const b = this.buffers.get(n); if (!b) continue;
      const s = this.ac.createBufferSource(); s.buffer = b; s.loop = true; s.connect(out); s.start(this.ac.currentTime + 0.05, Math.random() * b.duration);
    }
  },
  build() {
    const ac = this.ac, g = (v = 0) => { const n = ac.createGain(); n.gain.value = v; return n; };
    const master = this.master = g(this.muted ? 0 : 1.4); // the mix sits around -26 LUFS while looking: a quiet piece, not a whisper
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp).connect(ac.destination);
    this.meterA = ac.createAnalyser(); this.meterA.fftSize = 2048; comp.connect(this.meterA); // level meter for tools (api.audio.meter)
    // a small room: a short convolution tail for everything inside the shop
    const room = this.room = ac.createConvolver(); { const L = Math.floor(ac.sampleRate * 0.9), ir = ac.createBuffer(2, L, ac.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2) * (i < 60 ? i / 60 : 1); }
      room.buffer = ir; }
    const roomOut = g(0.32); room.connect(roomOut).connect(master); this.roomSend = room;
    // street outside (present) -- muffled when the listener is inside; the busy past street the same way, louder in the beam
    const lp = (f) => { const n = ac.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; return n; };
    this.duskIn = g(0); this.duskLP = lp(2400); this.duskIn.connect(this.duskLP).connect(master);
    this.pastIn = g(0); this.pastLP = lp(1800); this.pastIn.connect(this.pastLP).connect(master); this.pastLP.connect(g(0.4)).connect(room);
    this.staticIn = g(0); { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 0.6; const lw = lp(9000); this.staticIn.connect(lw).connect(bp); this.staticPan = ac.createStereoPanner(); bp.connect(this.staticPan).connect(master); this.staticPan.connect(g(0.5)).connect(room); } // (low-passed: no 15.7 kHz line whine)
    // the room itself: 50 Hz mains and its harmonics, faint brown air
    { const hum = g(0); this.humG = hum; for (const [f, a] of [[50, 0.5], [100, 0.35], [150, 0.12]]) { const o = ac.createOscillator(); o.frequency.value = f; const og = g(a); o.connect(og).connect(hum); o.start(); }
      hum.connect(master);
      const n = this.noise(4), src = ac.createBufferSource(); src.buffer = n; src.loop = true; const f = lp(260), air = g(0.025); src.connect(f).connect(air).connect(master); src.start(); }
    // fluorescent hum (tube on): a buzzy 100 Hz through a mid band
    { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
      this.tubeG = g(0); o.connect(bp).connect(this.tubeG); this.tubeG.connect(master); this.tubeG.connect(room); o.start(); }
    // test-card tone (1 kHz), from the most present TV
    { const o = ac.createOscillator(); o.frequency.value = 1000; this.toneG = g(0); this.tonePan = ac.createStereoPanner(); o.connect(this.toneG).connect(this.tonePan).connect(master); this.tonePan.connect(g(0.4)).connect(room); o.start(); }
    // head servo: a filtered sawtooth whose level follows how fast the head turns
    { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 180; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 4;
      this.servoG = g(0); this.servoO = o; o.connect(bp).connect(this.servoG).connect(master); this.servoG.connect(room); o.start(); }
    // the radio's tune (synthesised in a tinny box: band-limited, a little distortion and hiss), level = beam on a radio
    { this.radioG = g(0); this.radioPan = ac.createStereoPanner();
      const shaper = ac.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); } shaper.curve = curve;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380; const lo = lp(3200);
      this.radioBus = g(0.9); this.radioBus.connect(shaper).connect(hp).connect(lo).connect(this.radioG).connect(this.radioPan).connect(master); this.radioPan.connect(g(0.5)).connect(room);
      const hs = ac.createBufferSource(); hs.buffer = this.noise(2); hs.loop = true; const hsg = g(0.02); hs.connect(hsg).connect(hp); hs.start();
      this.tuneT = ac.currentTime + 0.5; this.tuneI = 0; }
  },
  noise(sec) { const ac = this.ac, b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } return b; },
  pan(pos) { // stereo position and distance gain of a world point for the current camera
    if (!pos) return [0, 1];
    const cam = this.ctx.camera; this._v.copy(pos).sub(cam.position); const d = this._v.length();
    this._r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    return [THREE.MathUtils.clamp(this._v.dot(this._r) / Math.max(d, 0.3), -0.9, 0.9), 1 / (1 + d * d * 0.08)];
  },
  // one-shot from a buffer slice, positioned
  shot(name, at, dur, { pos, gain = 1, rate = 1, wet = 0.35 } = {}) {
    const b = this.buffers.get(name); if (!b) return;
    const ac = this.ac, s = ac.createBufferSource(), gg = ac.createGain(), p = ac.createStereoPanner();
    const [pn, dg] = this.pan(pos); p.pan.value = pn; s.buffer = b; s.playbackRate.value = rate;
    const t = ac.currentTime, d = Math.min(dur ?? b.duration, b.duration - (at || 0));
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(gain * dg, t + 0.02); gg.gain.setValueAtTime(gain * dg, t + Math.max(0.03, d - 0.12)); gg.gain.linearRampToValueAtTime(0, t + d);
    s.connect(gg).connect(p).connect(this.master); if (wet) { const w = ac.createGain(); w.gain.value = wet; p.connect(w).connect(this.roomSend); }
    s.start(t, at || 0, d + 0.05);
  },
  synthClick(freq, { pos, gain = 1, decay = 0.05 } = {}) { // a wooden tick: a noise burst through a resonance
    const ac = this.ac, s = ac.createBufferSource(); s.buffer = this.clickBuf ??= this.noise(0.1);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 9;
    const gg = ac.createGain(), p = ac.createStereoPanner(), [pn, dg] = this.pan(pos); p.pan.value = pn;
    const t = ac.currentTime; gg.gain.setValueAtTime(gain * dg * 2.5, t); gg.gain.exponentialRampToValueAtTime(0.001, t + decay);
    s.connect(bp).connect(gg).connect(p).connect(this.master); const w = ac.createGain(); w.gain.value = 0.6; p.connect(w).connect(this.roomSend);
    s.start(t); s.stop(t + decay + 0.05);
  },
  tone(f0, f1, dur, { gain = 0.2, type = 'sine' } = {}) { // a pitched sweep (eye whine, power dying)
    const ac = this.ac, o = ac.createOscillator(), gg = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(gain, t + 0.08); gg.gain.setValueAtTime(gain, t + dur * 0.7); gg.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(gg).connect(this.master); gg.connect(this.roomSend); o.start(t); o.stop(t + dur + 0.05);
  },
  play(name, opts = {}) {
    const r = Math.random;
    switch (name) {
      case 'tube': { const [a, d] = r() < 0.5 ? TUBE_SLICES[Math.floor(r() * TUBE_SLICES.length)] : CLICKS[Math.floor(r() * CLICKS.length)]; this.shot('tube_flicker', a, d, { pos: new THREE.Vector3(0.1, 2.9, -0.55), gain: 0.5 * (opts.gain ?? 1) }); break; }
      case 'tvzap': this.shot('tv_on', 0.25, 1.4, { pos: opts.pos, gain: 0.55 }); break;
      case 'tick': this.synthClick(this.tock ? 1650 : 2300, { pos: opts.pos, gain: 0.28 * (opts.gain ?? 1), decay: 0.06 }); this.tock = !this.tock; break;
      case 'pencil': { const a = r() * 8.2; this.shot('pencil', a, 1.2 + r() * 0.4, { pos: opts.pos, gain: 0.9 }); break; }
      case 'click': this.shot('relay_a', 0, undefined, { gain: 0.5 }); break;
      // v5: the shops across the road, each once when the beam first rests on it (synthesised: they follow the picture)
      case 'bowls': [0, 0.17, 0.26, 0.55].forEach((d, i) => setTimeout(() => this.synthClick(2700 + 500 * (i % 3), { pos: opts.pos, gain: 0.32, decay: 0.16 }), d * 1000)); break; // china knocking on china
      case 'tinks': [0, 0.22, 0.5].forEach((d, i) => setTimeout(() => this.synthClick(4300 + 700 * i, { pos: opts.pos, gain: 0.26, decay: 0.22 }), d * 1000)); break; // a spanner set down on a tray
      case 'snips': for (let i = 0; i < 6; i++) setTimeout(() => this.synthClick(5200, { pos: opts.pos, gain: 0.22, decay: 0.025 }), (Math.floor(i / 2) * 0.42 + (i % 2) * 0.07) * 1000); break; // scissors
      case 'sewing': for (let i = 0; i < 26; i++) setTimeout(() => this.synthClick(1700 + (i % 2) * 300, { pos: opts.pos, gain: 0.18, decay: 0.03 }), i * 70); break; // a treadle machine
      case 'tvshow': this.shot('tv_on', 0.25, 1.4, { pos: opts.pos, gain: 0.35 }); break; // the set's click and hum; the show's tune follows the beam (radio)
      case 'bell': this.shot('bike_bell', 0, 3.4, { pos: opts.pos, gain: 0.22, wet: 0.15 }); break;
      case 'servo': opts.short ? this.tone(300, 380, 0.3, { gain: 0.035, type: 'sawtooth' }) : this.tone(240, 420, 0.7, { gain: 0.05, type: 'sawtooth' }); break;
      case 'rattle': // a door shaken in its frame by the wind: four soft wooden knocks
        [0, 0.09, 0.16, 0.29].forEach((d, i) => setTimeout(() => this.synthClick(190 + 60 * (i % 2), { pos: opts.pos, gain: 0.5 - 0.08 * i, decay: 0.11 }), d * 1000)); break;
      case 'whine': this.tone(900, 2600, 2.4, { gain: 0.035 }); break;
      case 'glitch': { // its picture losing lock (story.js turn): a contact's pop -- 40 ms of hiss through a band -- and, on the
        // tear, a low detuned hum dying away (Codex's review: the stepped square chirps read as an electronic alarm)
        const ac = this.ac, t0 = ac.currentTime, g = (opts.short ? 0.12 : 0.22) * (opts.gain ?? 1);
        const src = ac.createBufferSource(); src.buffer = this.clickBuf ??= this.noise(0.1);
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.9; const ng = ac.createGain();
        ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(g, t0 + 0.012); ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06); // (12 ms attack: no click)
        src.connect(bp).connect(ng).connect(this.master); src.start(t0); src.stop(t0 + 0.06);
        if (!opts.short) {
          const hg = ac.createGain(); hg.gain.setValueAtTime(0.0001, t0); hg.gain.exponentialRampToValueAtTime(0.05, t0 + 0.12); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1); // (swelling with the tear, dying as the picture settles)
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(hg).connect(this.master);
          for (const f of [55, 57.6, 110.9]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t0); o.stop(t0 + 1.15); }
        }
        break; }
      case 'powerdown': this.tone(1800, 120, 3.2, { gain: 0.05 }); this.shot('relay_b', 0, undefined, { gain: 0.4 }); break;
      case 'streetlamp': this.shot('relay_b', 0, undefined, { gain: 0.25, rate: 0.8, wet: 0.1 }); break;
      case 'dog': this.shot('dog_far_a', 0, undefined, { gain: 0.2, wet: 0 }); break;
      case 'page': { // a page turned: a soft paper swish (noise swept through a band, quick)
        const ac = this.ac, src = ac.createBufferSource(); src.buffer = this.clickBuf ??= this.noise(0.1); src.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; const gg = ac.createGain(), p = ac.createStereoPanner(), [pn, dg] = this.pan(opts.pos); p.pan.value = pn;
        const t = ac.currentTime; bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 0.28);
        gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.35 * dg, t + 0.06); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        src.connect(bp).connect(gg).connect(p).connect(this.master); const w = ac.createGain(); w.gain.value = 0.5; p.connect(w).connect(this.roomSend); src.start(t); src.stop(t + 0.4); break; }
      default: return false;
    }
    return true;
  },

  update(dt, t, ctx) {
    if (!this.ac || this.ac.state !== 'running') return;
    const ac = this.ac, now = ac.currentTime, m = ctx.memory, set = (p, v, tau = 0.3) => p.setTargetAtTime(v, now, tau);
    const cam = ctx.camera.position, inside = THREE.MathUtils.smoothstep(2.6 - cam.z, -0.2, 0.6); // 0 outside .. 1 inside
    const story = ctx.api.story, phase = story?.phase, atmo = ctx.api.atmo;
    const quiet = phase === 'title' ? 0 : phase === 'end' ? Math.max(0, 1 - Math.max(0, story.t - 6.5) / 4) : 1; // the street a while into the black, then silence before the card
    // present
    set(this.duskIn.gain, 0.5 * quiet * (1 - 0.45 * inside)); set(this.duskLP.frequency, 2400 - 1600 * inside, 0.5);
    set(this.humG.gain, 0.006 * inside * quiet);
    const L = ctx.api.shop?.lights; set(this.tubeG.gain, L ? 0.012 * Math.min(1, L.tube.intensity / 5.5) * quiet : 0, 0.02);
    // past: the street, louder where the beam falls (its strength), the radio by the radios in the beam
    const past = Math.min(1, m.strength ?? 0);
    const intimate = 1;
    set(this.pastIn.gain, 0.55 * past * past * quiet * intimate, 0.6);
    let radio = 0, rpos = null;
    const shop = ctx.api.shop;
    // the music: in the shop, the closed tube radios in the beam play it (act one); across the road, the TV show in the
    // electronics shop's window (story.radioPos, act two)
    if (shop && past > 0.05) for (const o of Object.values(shop.placed)) {
      if (o.userData.layout?.glb !== 'tube_radio_closed.glb') continue;
      o.getWorldPosition(this._v); this._v.y += 0.2; const k = memoryMaskCPU(this._v, m); if (k > radio) { radio = k; rpos = (rpos ?? new THREE.Vector3()).copy(this._v); }
    }
    if (story?.radioPos && past > 0.05) { const k = memoryMaskCPU(story.radioPos, m); if (k > radio) { radio = k; rpos = story.radioPos; } }
    if (story?.benchTune > 0 && story.benchPos && story.benchTune > radio) { radio = story.benchTune; rpos = story.benchPos; } // its own radio, on the bench
    this.radioLevel = (this.radioLevel ?? 0) + (radio - (this.radioLevel ?? 0)) * Math.min(1, dt * 1.5);
    const call = story?.tuneCall ?? 0; if ((call > this.radioLevel || phase === 'turn') && story?.radioPos) rpos = story.radioPos; // the song calling from across the road (while it listens, only from there: a radio in the beam had taken the song over)
    const cut = (phase === 'fade' && story.t > 2.3) || phase === 'end'; // the light dies: the song stops mid-phrase
    set(this.radioG.gain, cut ? 0 : 0.32 * Math.max(this.radioLevel, call) * quiet * intimate * (1 - 0.45 * (story?.interference ?? 0)), cut ? 0.012 : 0.2); if (rpos) set(this.radioPan.pan, this.pan(rpos)[0], 0.25); // (the static takes over as its picture tears; the song keeps its place across the road -- Codex transition-7: a comment had swallowed this pan)
    // the tune keeps playing (silently when nobody looks), so the radio comes back mid-phrase like a real one
    while (this.tuneT < now + 0.25) {
      const [st, beats] = TUNE[this.tuneI % TUNE.length], dur = beats * 0.42;
      if (st !== null) {
        const o = ac.createOscillator(), gg = ac.createGain(), vib = ac.createOscillator(), vg = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = 392 * Math.pow(2, st / 12); vib.frequency.value = 5.6; vg.gain.value = o.frequency.value * 0.012; vib.connect(vg).connect(o.frequency);
        gg.gain.setValueAtTime(0, this.tuneT); gg.gain.linearRampToValueAtTime(0.16, this.tuneT + 0.06); gg.gain.setTargetAtTime(0.09, this.tuneT + 0.1, 0.2); gg.gain.linearRampToValueAtTime(0, this.tuneT + dur);
        o.connect(gg).connect(this.radioBus); o.start(this.tuneT); o.stop(this.tuneT + dur + 0.02); vib.start(this.tuneT); vib.stop(this.tuneT + dur + 0.02);
        if (this.tuneI % 2 === 0) { const b = ac.createOscillator(), bg = ac.createGain(); b.type = 'triangle'; b.frequency.value = 98 * Math.pow(2, (st % 12) / 12); bg.gain.setValueAtTime(0.18, this.tuneT); bg.gain.exponentialRampToValueAtTime(0.001, this.tuneT + 0.5); b.connect(bg).connect(this.radioBus); b.start(this.tuneT); b.stop(this.tuneT + 0.55); }
      }
      this.tuneT += dur; this.tuneI++;
    }
    // TVs: static and the test tone from the most present set
    let tv = null; for (const s of ctx.api.past?.tvs || []) if (!tv || s.presence > tv.presence) tv = s;
    const tvp = tv ? tv.presence * quiet : 0, snow = tv && Math.round(tv.chan.value) === 1;
    const itf = story?.interference ?? 0; // (act one to act two: the song across the road losing its signal)
    set(this.staticIn.gain, Math.max(0.22 * tvp * (snow ? 1 : 0.25), 0.09 * itf)); set(this.toneG.gain, tv && !snow && Math.round(tv.chan.value) === 0 ? 0.012 * tvp : 0, 0.08);
    if (tv && !(itf > 0.05)) { const pn = this.pan(tv.c)[0]; set(this.staticPan.pan, pn); set(this.tonePan.pan, pn); } else if (itf > 0.05) set(this.staticPan.pan, 0);
    // the robot's head: servo noise with its angular speed
    const rig = shop?.rig; if (rig) { const w = (Math.abs(rig.yaw - (this.yaw0 ?? rig.yaw)) + Math.abs(rig.pitch - (this.pitch0 ?? rig.pitch)) + 0.6 * Math.abs(rig.body - (this.body0 ?? rig.body))) / Math.max(dt, 1e-3); this.yaw0 = rig.yaw; this.pitch0 = rig.pitch; this.body0 = rig.body; // (the body's turn on the stool too)
      set(this.servoG.gain, Math.min(0.05, w * 0.03) * quiet, 0.05); set(this.servoO.frequency, 160 + Math.min(260, w * 220), 0.05); }
    // now and then: a machine on the demolition site (present), a bicycle bell going past (past)
    this.nextDemo = (this.nextDemo ?? 25) - dt; if (this.nextDemo < 0 && phase !== 'title') { this.nextDemo = 40 + Math.random() * 40; this.shot('demolition_far', 0, 13.9, { gain: 0.16 * quiet * (1 - 0.4 * inside), wet: 0 }); }
    this.nextBell = (this.nextBell ?? 9) - dt * past; if (this.nextBell < 0) { this.nextBell = 14 + Math.random() * 16; this.shot('bike_bell', 0, 3.4, { pos: new THREE.Vector3(5 - Math.random() * 10, 1, 8), gain: 0.18 * past, wet: 0.15 }); } // on the street
    // story moments
    if (phase !== this.lastPhase) {
      if (phase === 'fade') this.play('powerdown');
      if (phase === 'end') { this.endT = 0; }
      this.lastPhase = phase;
    }
    if (phase === 'end') { this.endT += dt; if (this.endT > 3.5 && !this.lamped) { this.lamped = true; this.play('streetlamp'); } if (this.endT > 4.5 && !this.dug) { this.dug = true; this.shot('demolition_far', 0, 6, { gain: 0.3, wet: 0 }); } } // a digger somewhere down the street // a digger somewhere down the street
    void atmo;
  },
};
