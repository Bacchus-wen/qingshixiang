// Scheduling/routing/lifecycle contracts only. This fake does not render DSP.
import assert from 'node:assert/strict';
import { DEFAULTS } from './control.js';
import { createRecordings, RECORDINGS } from './recordings.js';
import { createSoundscape } from './graph.js';

class Param {
  value = 0;
  events = [];
  setValueAtTime(value, at) { this.events.push({ value, at, kind: 'set' }); }
  setTargetAtTime(value, at, tau) { this.events.push({ value, at, tau, kind: 'target' }); }
  linearRampToValueAtTime(value, at) { this.events.push({ value, at, kind: 'linear' }); }
  exponentialRampToValueAtTime(value, at) { this.events.push({ value, at, kind: 'exponential' }); }
  cancelScheduledValues() {}
}
class Node {
  connections = [];
  constructor(kind) {
    this.kind = kind;
    for (const key of ['gain', 'frequency', 'Q', 'pan', 'playbackRate', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param();
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
  start(...args) { this.started = args; this.startCount = (this.startCount || 0) + 1; }
  stop() { this.stopped = true; }
}
export class Context {
  sampleRate = 1000;
  currentTime = 0;
  nodes = [];
  destination = new Node('destination');
  node(kind) { const node = new Node(kind); this.nodes.push(node); return node; }
  createGain() { return this.node('gain'); }
  createBufferSource() { return this.node('source'); }
  createStereoPanner() { return this.node('pan'); }
  createBiquadFilter() { return this.node('filter'); }
  createOscillator() { return this.node('oscillator'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createConvolver() { return this.node('convolver'); }
  createDelay() { return this.node('delay'); }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / rate, getChannelData: c => data[c] };
  }
}
const clip = name => ({ name, duration: name.endsWith('_loop') ? 36 : 6 });
const setup = loadBuffer => {
  const ac = new Context(), params = { ...DEFAULTS }, events = [];
  const outputs = { rain: ac.createGain(), mix: ac.createGain(), reverb: ac.createGain() };
  const layer = createRecordings(ac, { ...outputs, params, seed: 19, loadBuffer, onEvent: e => events.push(e) });
  return { ac, params, events, layer, outputs };
};
const { ac, params, layer, events, outputs } = setup(async name => {
  if (name === 'relay_b') throw new Error('missing clip');
  if (name === 'relay_c') return null;
  return clip(name);
});
const loaded = await layer.ready;
assert.equal(loaded.length, RECORDINGS.length - 2, 'one failed file must not block others');
const loopSources = ac.nodes.filter(n => n.loop);
assert.equal(loopSources.length, 6);
for (const s of loopSources) {
  assert.equal(s.loopStart, 0.06); assert.equal(s.loopEnd, 35.94);
  assert.deepEqual(s.started, [0, 0.06], 'start after MP3 head padding');
}
const loopGain = name => loopSources.find(n => n.buffer.name === name).connections[0].gain.events.at(-1).value;
layer.update(0, { windGust: 0.2 }, { strength: 0 });
const cityPresent = loopGain('city_far_loop'), windCalm = loopGain('wind_loop');
assert.equal(loopGain('radio_loop'), 0, 'recorded radio must be absent in present');
layer.update(1, { windGust: 0.6 }, { strength: 1 });
assert(loopGain('city_far_loop') > cityPresent * 10);
assert(loopGain('wind_loop') > windCalm);
const radioMemory = loopGain('radio_loop');
layer.update(2, { windGust: 1 }, { strength: 1, floodNow: 1 });
assert(loopGain('radio_loop') > radioMemory);
layer.update(3, { windGust: 0.4 });
layer.update(4, { windGust: 0.7 });
assert.equal(events.filter(e => e.name === 'rec:wind_gust').length, 1);
layer.update(5, { windGust: 0.34 });
layer.update(6, { windGust: 0.56 });
assert.equal(events.filter(e => e.name === 'rec:wind_gust').length, 2);
layer.update(7);
assert.equal(loopGain('wind_loop'), windCalm, 'missing wind uses 0.2');
for (const name of ['rain_roof_loop', 'rain_puddle_loop', 'gutter_drip_loop']) {
  const source = loopSources.find(n => n.buffer.name === name);
  assert.equal(source.connections[0].connections[0].connections[0].connections[0], outputs.rain,
    'recorded rain must feed the shared rain duck/lowpass');
}
assert.equal(layer.synthScale('rain_roof_loop'), 0.65);
assert.equal(layer.synthScale('missing'), 1);
assert(layer.relay(8)); assert.equal(events.at(-1).name, 'rec:relay_a');
assert(layer.dog(9));
params.rec = 0; layer.update(10);
assert.equal(layer.synthScale('rain_roof_loop'), 1, 'A/B restores full synthesis');
assert.equal(layer.dog(10), false, 'A/B uses synthesized dog fallback');
assert.equal(layer.relay(10), false);
for (const out of Object.values(outputs)) {
  const sends = ac.nodes.filter(n => n.connections.includes(out));
  assert(sends.length && sends.every(n => n.gain.events.at(-1).value === 0));
}
params.rec = 1; layer.update(11);
// Completed transients must release nodes and free the bounded voice count.
for (const s of ac.nodes.filter(n => n.onended)) s.onended();
assert(layer.relay(12));
layer.dispose(); layer.dispose();
assert.equal(layer.relay(13), false);
assert(ac.nodes.filter(n => n.kind === 'source' && n.connections.length).length === 0);

let release;
const pending = new Promise(resolve => { release = resolve; });
let signal;
const late = setup((name, context, s) => { signal = s; return pending.then(() => clip(name)); });
late.layer.dispose(); release();
assert(signal.aborted);
assert.deepEqual(await late.layer.ready, []);
assert(!late.ac.nodes.some(n => n.started), 'late decode must not resurrect disposed sources');
const failed = setup(async () => { throw new Error('decode failed'); });
assert.deepEqual(await failed.layer.ready, []); failed.layer.dispose();
const serverless = setup(undefined);
assert.deepEqual(await serverless.layer.ready, [], 'Node without an audio server skips recordings');
serverless.layer.dispose();

// Integration: both thunders use the same scheduled timestamp; robot opening
// callers share a relay, failure clicks get another; recorded dogs replace groups.
const context = new Context(), cues = [];
const graph = createSoundscape(context, { loadBuffer: async name => clip(name), onEvent: e => cues.push(e) });
await graph.recordingsReady;
graph.update(0, { rain: 1, lightning: 0 }, { strength: 0 });
graph.update(1, { rain: 1, lightning: 1 }, { strength: 1 });
assert.equal(cues.find(e => e.name === 'thunder').at, cues.find(e => e.name === 'rec:thunder_roll').at);
graph.schedule('whine', 2); graph.schedule('servo', 2); graph.schedule('click', 4);
assert.equal(cues.filter(e => e.name.startsWith('rec:relay_')).length, 2);
assert(graph.schedule('relay', 6));
for (let i = 2; i < 1210; i++) graph.update(i / 10, {}, {});
const dogs = cues.filter(e => e.name === 'dog-group');
assert(dogs.length > 0 && dogs.every(e => e.recorded && e.count === 1));
assert.equal(cues.filter(e => e.name.startsWith('rec:dog_far_')).length, dogs.length);
graph.dispose();
assert(context.nodes.filter(n => n.started).every(n => n.stopped), 'dispose must stop every source');

// Exercise the real default fetch/decode path through the gesture adapter.
// No network, browser, server or audio device is started by this test.
const { default: template } = await import('./index.js');
const globals = ['AudioContext', 'addEventListener', 'removeEventListener', 'fetch', 'location'];
const original = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const gestures = new EventTarget(), requests = [], decodes = [];
let finishDownloads, created = 0;
const downloads = new Promise(resolve => { finishDownloads = resolve; });
const system = Object.create(template);
try {
  globalThis.location = { protocol: 'https:' };
  globalThis.addEventListener = gestures.addEventListener.bind(gestures);
  globalThis.removeEventListener = gestures.removeEventListener.bind(gestures);
  globalThis.AudioContext = class extends Context {
    state = 'suspended';
    constructor() { super(); created++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    async decodeAudioData(data) {
      decodes.push(data);
      if (data === 'relay_c') throw new Error('bad mp3');
      return clip(data);
    }
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const name = url.slice('/audio/rec/'.length, -4);
    await downloads;
    return { ok: name !== 'relay_b', arrayBuffer: async () => name };
  };
  const ctx = { params: new URLSearchParams(), api: {}, world: {}, memory: {} };
  await system.init(ctx);
  assert.equal(created, 0); assert.equal(requests.length, 0);
  gestures.dispatchEvent(new Event('pointerdown'));
  assert.equal(created, 1); assert.equal(requests.length, RECORDINGS.length);
  assert.equal(ctx.api.audio.state, 'running', 'resume must not wait for downloads');
  assert(ctx.api.audio.play('servo'), 'synthesis starts while recordings are pending');
  system.ac.currentTime = 3;
  finishDownloads();
  assert.equal((await system.graph.recordingsReady).length, RECORDINGS.length - 2);
  assert.equal(decodes.length, RECORDINGS.length - 1, 'HTTP failure skips decoding');
  const recordedLoops = system.ac.nodes.filter(n => n.buffer?.name && n.loop);
  assert(recordedLoops.every(n => n.started[0] === 3), 'late loops start at current audio time');
  gestures.dispatchEvent(new Event('keydown'));
  assert.equal(requests.length, RECORDINGS.length, 'later gesture must not reload clips');
  system.dispose();
  assert(requests.every(r => r.options.signal.aborted));
} finally {
  finishDownloads(); system.dispose();
  for (const key of globals) {
    const descriptor = original.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
console.log('PASS recordings: partial failures, loops/padding, rain route, memory/flood, gust hysteresis, rec A/B, late disposal, synced thunder/relay/dog');
console.log('PASS recording loader: gesture-only fetch, nonblocking resume, HTTP/decode fallback, late start, abort and no duplicate requests');
