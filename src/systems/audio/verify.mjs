// Pure control/scheduler checks. Real DSP is checked by tools/audio-render.mjs.
import assert from 'node:assert/strict';
import { mixState, createStorm, random, measure } from './control.js';

const dry = mixState({ rain: 0 }, { strength: 0 });
assert.equal(dry.rain, 0, 'zero rainfall must silence all rain buses');
const present = mixState({ rain: 1 }, { strength: 0 });
const memory = mixState({ rain: 1 }, { strength: 1 });
assert(memory.rain < present.rain * 0.3, 'memory must duck rain');
assert(memory.cutoff < present.cutoff / 4, 'memory must muffle rain');
assert.equal(present.memory, 0);
assert(memory.memory > 0);
assert(Object.values(mixState({ rain: NaN }, { strength: Infinity })).every(Number.isFinite));

const storm = createStorm(random(42));
assert.equal(storm(0, 0), null);
const first = storm(1, 1);
assert(first.at >= 3 && first.at <= 7, 'thunder must lag lightning by 2–6 seconds');
assert.equal(storm(1.1, 1), null, 'held lightning must not retrigger');
assert.equal(storm(1.2, 0.03), null);
assert.equal(storm(1.3, 1), null, 'multi-flash lightning must coalesce');
storm(12, 0);
assert(storm(13, 1), 'a later storm must re-arm');
const sequence = () => { const r = random(7); return Array.from({ length: 100 }, r); };
assert.deepEqual(sequence(), sequence(), 'shot/audio test scheduling must be deterministic');
assert.deepEqual(measure([new Float32Array([0.5, -0.5])]), { rms: 0.5, peak: 0.5, finite: true });
assert.equal(measure([new Float32Array([NaN])]).finite, false);
console.log('PASS audio control: rain/memory, finite inputs, thunder delay/debounce, seeded RNG, RMS');

// Exercise the adapter's failure/retry/disposal boundary without pretending Node
// renders Web Audio. The constructor deliberately fails as an unavailable device.
const { default: template } = await import('./index.js');
const original = Object.getOwnPropertyDescriptors(globalThis);
const events = new EventTarget();
let attempts = 0;
globalThis.addEventListener = events.addEventListener.bind(events);
globalThis.removeEventListener = events.removeEventListener.bind(events);
globalThis.AudioContext = class { constructor() { attempts++; throw new Error('device unavailable'); } };
try {
  const system = Object.create(template);
  const ctx = { params: new URLSearchParams('mute&volume=0.2&audio.wind=0.8'), api: {}, world: {}, memory: {} };
  await system.init(ctx);
  assert.equal(attempts, 0, 'initialization must wait for a gesture');
  assert.equal(ctx.api.audio.state, 'locked');
  assert.equal(ctx.api.audio.levels.master, 0.2);
  assert.equal(ctx.api.audio.levels.wind, 0.8);
  assert.equal(ctx.api.audio.play('servo'), false, 'locked effects must not queue');
  events.dispatchEvent(new Event('pointerdown'));
  assert.equal(attempts, 1);
  assert.equal(ctx.api.audio.state, 'unavailable');
  events.dispatchEvent(new Event('keydown'));
  assert.equal(attempts, 2, 'a failed start must retry on the next gesture');
  system.dispose(); system.dispose();
  events.dispatchEvent(new Event('pointerdown'));
  assert.equal(attempts, 2, 'dispose must remove gesture handlers');
  assert.equal(ctx.api.audio, undefined);
  console.log('PASS audio lifecycle: gesture gate, retry, URL levels, locked effects, idempotent disposal');
} finally {
  for (const key of ['addEventListener', 'removeEventListener', 'AudioContext']) {
    if (original[key]) Object.defineProperty(globalThis, key, original[key]);
    else delete globalThis[key];
  }
}
