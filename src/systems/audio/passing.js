import { Vector3 } from 'three/webgpu';
import { clamp, random } from './control.js';

// No independent traffic clock: the street owns the pass, including debug/shot
// poses. Use the actual listener when available, otherwise the robot's vicinity.
export function createPassingCarListener() {
  const position = new Vector3(), direction = new Vector3(), right = new Vector3();
  const offset = new Vector3(), up = new Vector3(0, 1, 0);
  return (car, camera) => {
    if (!car || !Number.isFinite(car.x) || !Number.isFinite(car.z)) return { gain: 0, pan: 0 };
    position.set(0, 1.6, -10); direction.set(0, 0, -1);
    if (camera?.getWorldPosition) camera.getWorldPosition(position);
    else if (camera?.position) position.copy(camera.position);
    if (camera?.getWorldDirection) camera.getWorldDirection(direction);
    right.crossVectors(direction, up).normalize();
    offset.set(car.x, 0.6, car.z).sub(position);
    const distance = offset.length();
    return {
      gain: clamp(clamp(car.k) / (1 + (distance / 16) ** 2)),
      pan: distance > 0.001 ? clamp(offset.dot(right) / distance, -1, 1) : 0,
    };
  };
}

// Two persistent sources, one private room, no per-pass allocations or cues.
// The final gate closes even the room tail when the street says k=0. The car
// shares mixState's memory lowpass cutoff but bypasses rain amount/ducking.
export function createPassingCar(ac, { mix, params, impulse, seed }) {
  const nodes = [], sources = [];
  const keep = n => { nodes.push(n); return n; };
  const gain = value => { const n = keep(ac.createGain()); n.gain.value = value; return n; };
  const filter = (type, frequency) => {
    const n = keep(ac.createBiquadFilter()); n.type = type;
    n.frequency.value = frequency; n.Q.value = 0.7; return n;
  };
  const rng = random(seed ^ 0xca712);
  const noise = ac.createBuffer(1, Math.ceil(ac.sampleRate * 3.73), ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  const tires = keep(ac.createBufferSource()); tires.buffer = noise; tires.loop = true;
  const engine = keep(ac.createOscillator()); engine.type = 'triangle'; engine.frequency.value = 54;
  const body = gain(1), room = gain(1);
  tires.connect(filter('highpass', 170)).connect(filter('lowpass', 1450)).connect(gain(0.24)).connect(body);
  engine.connect(filter('lowpass', 150)).connect(gain(0.035)).connect(body);
  // A little low, unpitched engine roughness avoids a perfectly clean hum.
  tires.connect(filter('lowpass', 100)).connect(gain(0.07)).connect(body);
  const dry = gain(0.24), wet = gain(clamp(params.reverb) * 3.5);
  const verb = keep(ac.createConvolver()); verb.buffer = impulse;
  body.connect(dry).connect(room);
  body.connect(verb).connect(filter('lowpass', 1100)).connect(wet).connect(room);
  const memoryFilter = filter('lowpass', 12000);
  const pan = keep(ac.createStereoPanner()), output = gain(0);
  room.connect(memoryFilter).connect(pan).connect(output).connect(mix);
  for (const s of [tires, engine]) { sources.push(s); s.start(ac.currentTime); }

  const listener = createPassingCarListener(), targets = new WeakMap();
  let disposed = false;
  let ramp = { from: 0, to: 0, at: ac.currentTime, end: ac.currentTime };
  function target(param, value, at, tau) {
    if (targets.get(param) === value) return;
    if (!targets.has(param)) param.setValueAtTime(value, at);
    else param.setTargetAtTime(value, at, tau);
    targets.set(param, value);
  }
  function level(value, at) {
    if (value === ramp.to) return;
    const held = ramp.from + (ramp.to - ramp.from) * clamp((at - ramp.at) / Math.max(0.00001, ramp.end - ramp.at));
    const p = output.gain;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(at);
    else { p.cancelScheduledValues(at); p.linearRampToValueAtTime(held, at); }
    p.setValueAtTime(held, at);
    p.linearRampToValueAtTime(value, at + 0.03);
    ramp = { from: held, to: value, at, end: at + 0.03 };
  }
  output.gain.setValueAtTime(0, ac.currentTime);
  return {
    update(at, car, cutoff, camera) {
      if (disposed) return;
      const state = listener(car, camera);
      level(state.gain * clamp(params.passingCar), at);
      target(pan.pan, state.pan, at, 0.06);
      target(memoryFilter.frequency, clamp(cutoff, 20, 20000, 12000), at, 0.3);
      target(wet.gain, clamp(params.reverb) * 3.5, at, 0.15);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const s of sources) s.stop();
      for (const n of nodes) n.disconnect();
    },
  };
}
