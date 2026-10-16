// Pure control/scheduler checks. Real DSP is checked by tools/audio-render.mjs.
import assert from 'node:assert/strict';
import { mixState, createStorm, random, measure, createMemoryGate, createLampContact } from './control.js';

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
  const ctx = { params: new URLSearchParams('mute&volume=0.2&audio.wind=0.8&audio.rec=0'), api: {}, world: {}, memory: {} };
  await system.init(ctx);
  assert.equal(attempts, 0, 'initialization must wait for a gesture');
  assert.equal(ctx.api.audio.state, 'locked');
  assert.equal(ctx.api.audio.levels.master, 0.2);
  assert.equal(ctx.api.audio.levels.wind, 0.8);
  assert.equal(ctx.api.audio.levels.rec, 0);
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

// Review-r2 controls, without a browser or audio device. Native DSP assertions
// (including post-reverb silence within 50 ms) live in tools/audio-render.mjs.
for (const fps of [30, 60, 144, 240]) {
  const gate = createMemoryGate();
  assert.equal(gate(0, 1), 0, 'even an initially open eye must fade in');
  assert.equal(gate(1.25, 1), 0.5);
  assert.equal(gate(2.5, 1), 1, 'memory reaches full strength in 2.5 seconds');
  assert.equal(gate(2.5 + 1 / fps, 1 - 0.9 / fps), 0, `fast fall must cut at ${fps} Hz`);
  assert.equal(gate(3, 0.4), 0);
  assert.equal(gate(4, 0.4), 0, 'residual visual strength must not reopen the room');
  // Small positive per-frame steps must eventually reopen, even at 240 Hz.
  for (let i = 1; i <= fps; i++) gate(4 + i / fps, 0.4 + 0.1 * i / fps);
  assert(gate(7.6, 0.5) > 0.49, 'a slow return must reopen the memory layer');
  assert.equal(gate(8, NaN), 0);
}
const dim = createMemoryGate();
dim(0, 1); dim(2.5, 1);
assert.equal(dim(3.5, 0.9), 0.9, 'gentle attenuation still follows strength');
const contact = createLampContact();
assert.equal(contact(0, 650).crackle, 0, 'first lamp sample is not a flicker');
assert.equal(contact(0.016, 640).crackle, 0, 'minor light drift is silent');
assert(contact(0.032, 64).crackle > 0.8);
assert.equal(contact(0.048, 64).crackle, 0, 'held dim lamp does not repeat');
assert.equal(contact(0.064, 650).crackle, 0, 'recovery is not a failing contact');
assert(contact(0.112, 0).crackle > 0.9);
assert.deepEqual(contact(1, undefined), { level: 0, crackle: 0 });
assert.equal(contact(2, 650).crackle, 0, 'missing street API can recover safely');
assert.equal(contact(12, 0).crackle, 0, 'background time gap is not a measured jump');
const delays = Array.from({ length: 24 }, (_, seed) => createStorm(random(seed * 817))(0, 1).at);
assert(delays.every(d => d >= 2 && d <= 6));
assert(Math.max(...delays) - Math.min(...delays) > 2, 'thunder delay must vary across seeds');
console.log('PASS review-r2 controls: 2.5s reveal, fast cut at 30–240Hz, reentry, lamp sync, 2–6s thunder');

const { createDogClock, createRadioListener, RADIO_POSITION, alleyPresence } = await import('./details-control.js');
const { PerspectiveCamera, Vector3, Group } = await import('three/webgpu');
for (const fps of [30, 60, 144]) {
  const calls = [], clock = createDogClock(random(1927));
  for (let frame = 0; frame < 900 * fps; frame++) {
    const call = clock(frame / fps);
    if (call) calls.push(call);
  }
  assert(calls.length >= 7);
  assert(calls[0].at >= 45 && calls[0].at <= 120);
  const intervals = calls.slice(1).map((c, i) => c.at - calls[i].at);
  assert(intervals.every(dt => dt >= 45 && dt <= 120), 'dog groups must stay 45–120s apart');
  assert(Math.max(...intervals) - Math.min(...intervals) > 10);
  assert(calls.every(c => [1, 2].includes(c.count) && c.spacing >= 0.55 && c.spacing <= 0.9));
  assert(calls.some(c => c.count === 1) && calls.some(c => c.count === 2));
}
const pausedDog = createDogClock(random(91));
assert.equal(pausedDog(0), null);
assert.equal(pausedDog(600), null, 'a background gap must not trigger a catch-up bark');
for (let i = 1; i < 39 * 60; i++) assert.equal(pausedDog(600 + i / 60), null);
const dogSequence = () => {
  const clock = createDogClock(random(81));
  return Array.from({ length: 6000 }, (_, i) => clock(i / 10)).filter(Boolean);
};
assert.deepEqual(dogSequence(), dogSequence());

const camera = new PerspectiveCamera();
camera.position.set(0, RADIO_POSITION.y, RADIO_POSITION.z);
camera.lookAt(0, RADIO_POSITION.y, RADIO_POSITION.z - 1);
const radioListener = createRadioListener();
const darkRadio = radioListener(camera);
assert(darkRadio.pan < -0.99, 'shop is left when facing down the street');
const origin = camera.position.clone();
const cone = { origin, dir: new Vector3().copy(RADIO_POSITION).sub(origin).normalize(), angle: 0.35, range: 40, strength: 1 };
const litRadio = radioListener(camera, cone);
assert.equal(litRadio.lit, 1);
assert(litRadio.gain > darkRadio.gain * 2 && litRadio.cutoff > darkRadio.cutoff * 2);
assert.equal(radioListener(camera, { ...cone, dir: cone.dir.clone().negate() }).gain, darkRadio.gain,
  'global memory strength alone must not brighten the radio');
assert.equal(radioListener(camera, { ...cone, range: 2 }).lit, 0, 'range matters as well as direction');
assert.equal(radioListener(camera, { ...cone, strength: 0 }).lit, 0);
camera.lookAt(0, RADIO_POSITION.y, RADIO_POSITION.z + 1);
assert(radioListener(camera).pan > 0.99, 'turning around swaps stereo sides');
camera.position.z = 8;
assert(radioListener(camera).gain < darkRadio.gain * 0.1, 'distance must attenuate the shop');
camera.position.copy(RADIO_POSITION);
assert.equal(radioListener(camera).pan, 0, 'coincident listener must not divide by zero');
assert(Object.values(radioListener()).every(Number.isFinite), 'missing camera/cone stays finite');

const parent = new Group(); parent.rotation.y = Math.PI;
const child = new PerspectiveCamera(); child.position.set(0, RADIO_POSITION.y, 24); parent.add(child);
assert(radioListener(child).pan > 0.99, 'camera parent transforms must affect stereo');
assert.equal(alleyPresence(0), 1);
assert(alleyPresence(0.1) > alleyPresence(0.2));
assert.equal(alleyPresence(0.35), 0);
assert.equal(alleyPresence(1), 0);
assert.equal(alleyPresence(NaN), 1);
console.log('PASS street detail controls: dog cadence/count/resume, radio local cone/range/position/stereo, present-only alley');

const { Context } = await import('./verify-recordings.mjs');
const { DEFAULTS } = await import('./control.js');
assert(DEFAULTS.passingCar > 0, 'passing car must have an independently adjustable level');
const { createPassingCarListener, createPassingCar } = await import('./passing.js');
const carListener = createPassingCarListener();
const carCamera = new PerspectiveCamera();
carCamera.position.set(0, 1.6, -10);
carCamera.lookAt(0, 1.6, -42);
const carAt = (x, k = 1, z = -42) => ({ x, z, k });
assert.equal(carListener(carAt(0, 0), carCamera).gain, 0, 'absent car is silent');
assert.equal(carListener(undefined, carCamera).gain, 0, 'missing street system is silent');
for (const bad of [null, { x: NaN, z: -42, k: 1 }, { x: 0, z: Infinity, k: 1 }]) {
  const state = carListener(bad, carCamera);
  assert.equal(state.gain, 0);
  assert(Object.values(state).every(Number.isFinite));
}
const leftCar = carListener(carAt(-46), carCamera);
const middleCar = carListener(carAt(0), carCamera);
const rightCar = carListener(carAt(46), carCamera);
assert(leftCar.pan < -0.5 && rightCar.pan > 0.5 && middleCar.pan === 0,
  'crossing must travel left through center to right');
assert(middleCar.gain > leftCar.gain * 2, 'center of junction must be loudest');
assert.equal(leftCar.gain, rightCar.gain, 'opposite approaches at equal distance have equal gain');
assert.equal(carListener(carAt(0, 0.5), carCamera).gain, middleCar.gain * 0.5);
carCamera.position.z = 20;
assert(carListener(carAt(0), carCamera).gain < middleCar.gain * 0.4);
carCamera.position.z = -10;
carCamera.lookAt(0, 1.6, 10);
assert(carListener(carAt(-46), carCamera).pan > 0.5, 'listener heading swaps stereo sides');
carCamera.lookAt(0, 1.6, -42);

// Web Audio test double checks real routing/scheduling, never claims DSP output.
const carContext = new Context(), carMix = carContext.createGain();
const carParams = { ...DEFAULTS };
const carLayer = createPassingCar(carContext, {
  mix: carMix, params: carParams, impulse: carContext.createBuffer(2, 2800, 1000), seed: 7,
});
const carSources = carContext.nodes.filter(n => n.started);
assert(carSources.length >= 2, 'wet tire noise and low engine must both have sources');
const carPan = carContext.nodes.find(n => n.kind === 'pan');
const carOutput = carContext.nodes.find(n => n.connections.includes(carMix));
assert.equal(carOutput.gain.value, 0, 'car starts silent before first world sample');
carLayer.update(0, carAt(0, 0), 12000, carCamera);
assert.equal(carOutput.gain.events.at(-1).value, 0);
for (let i = 0; i <= 120; i++) carLayer.update(1 + i / 10, carAt(-46 + 92 * i / 120), 12000, carCamera);
assert(carPan.pan.events.some(e => e.value < -0.5) && carPan.pan.events.at(-1).value > 0.5);
carLayer.update(14, carAt(0), 850, carCamera);
assert(carOutput.gain.events.at(-1).value > 0, 'memory must retain the present car');
assert(carContext.nodes.some(n => n.type === 'lowpass' && n.frequency.events.at(-1)?.value === 850),
  'car dry and wet output must receive the shared memory cutoff');
carLayer.update(15, carAt(0, 0), 850, carCamera);
assert.equal(carOutput.gain.events.at(-1).value, 0, 'departure must close output including private reverb');
assert.equal(carOutput.gain.events.at(-1).kind, 'linear', 'departure reaches exact zero instead of an endless target tail');
for (let i = 0; i < 100; i++) carLayer.update(16 + i / 60, carAt(46), 12000, carCamera);
assert.deepEqual(carContext.nodes.filter(n => n.started), carSources, 'frames and later passes must reuse sources');
assert(carSources.every(n => n.startCount === 1), 'sources must never be restarted');
carParams.passingCar = 0;
carLayer.update(20, carAt(0), 12000, carCamera);
assert.equal(carOutput.gain.events.at(-1).value, 0, 'URL/API level can mute the car');
carLayer.dispose(); carLayer.dispose();
const eventCount = carPan.pan.events.length;
carLayer.update(21, carAt(0), 12000, carCamera);
assert.equal(carPan.pan.events.length, eventCount);
assert(carSources.every(n => n.stopped));
assert(carContext.nodes.filter(n => n !== carMix).every(n => !n.connections.length));

// Exercise the production graph boundary too: forgetting world/camera/cutoff
// forwarding or routing the car through the rain-amount bus must fail here.
const { createSoundscape } = await import('./graph.js');
const integratedContext = new Context();
const integrated = createSoundscape(integratedContext, { loadBuffer: async () => null });
await integrated.recordingsReady;
const engineSource = integratedContext.nodes.find(n => n.type === 'triangle');
const descendants = new Set();
function visit(node) {
  if (descendants.has(node)) return;
  descendants.add(node);
  for (const next of node.connections) visit(next);
}
visit(engineSource);
const integratedPan = [...descendants].find(n => n.kind === 'pan');
const integratedOutput = integratedPan.connections[0];
const integratedCutoff = [...descendants].find(n => n.connections.includes(integratedPan));
integrated.update(0, { rain: 0, passingCar: carAt(0, 0) }, {}, undefined, carCamera);
assert.equal(integratedOutput.gain.events.at(-1).value, 0);
const initialSources = integratedContext.nodes.filter(n => n.started);
for (const direction of [1, -1]) {
  for (let i = 0; i <= 120; i++) {
    const at = (direction === 1 ? 1 : 14) + i / 10;
    integrated.update(at, { rain: 0, passingCar: carAt(direction * (-46 + 92 * i / 120)) },
      { strength: 1 }, undefined, carCamera);
  }
}
assert(integratedOutput.gain.events.at(-1).value > 0, 'rain=0 and memory=1 must not silence the car');
assert.equal(integratedCutoff.frequency.events.at(-1).value, 850);
assert(integratedPan.pan.events.at(-1).value < -0.5, 'reverse crossing must finish on the opposite side');
assert.deepEqual(integratedContext.nodes.filter(n => n.started), initialSources,
  'multiple passes must not accumulate sources in the complete graph');
integrated.update(30, { rain: 0 }, {}, undefined, carCamera);
assert.equal(integratedOutput.gain.events.at(-1).value, 0, 'removed world state must also silence the car');
integrated.dispose();
assert(initialSources.every(n => n.stopped), 'soundscape disposal must own car sources too');
console.log('PASS passing car: silence, distance, bidirectional stereo, memory cutoff, graph integration, source reuse, mute and disposal');
