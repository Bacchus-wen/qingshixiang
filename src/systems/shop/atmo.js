import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, uv, color, instanceIndex, hash, time, positionLocal, sin, mix, smoothstep, dot, normalize, length, max, mx_noise_vec3,
} from 'three/tsl';
import { mem } from '../../materials/memory.js';

// The shop's light over the story (v4): the levels of every light per state, eased; the fluorescent tube (dead in the
// present, it stutters; when the robot's eye holds open the shop's power holds and the tube steadies); dust in the air,
// lit only where light passes through it (the desk lamp's cone, the robot's beam, the blue light under the shutter);
// the street lamp across the road that comes on at the end.
//   review  : the bright review rig of the models-and-layout phase (?review)
//   dusk    : the closed shop at dusk -- lamp pool, blue spill under the shutter, the rest dim
//   alive   : the eye is open: the tube holds, the room warms a little
//   out     : the end -- everything inside goes out, the street lamp outside comes on
const LEVELS = {
  review: { hemi: 0.45, dusk: 1.4, lamp: 18, fill: 3, tube: 5.5, glow: 2.2, robot: 7, env: 0.55, street: 0, far: 1 },
  dusk:   { hemi: 0.28, dusk: 2.1, lamp: 13, fill: 1.0, tube: 0, glow: 0.02, robot: 2.2, env: 0.34, street: 0, far: 1 }, // dusk light only gets in under the shutter: outside can be properly lit
  alive:  { hemi: 0.2, dusk: 1.0, lamp: 16, fill: 1.0, tube: 4.0, glow: 1.8, robot: 2.2, env: 0.38, street: 0, far: 1 },
  out:    { hemi: 0.07, dusk: 0.55, lamp: 0, fill: 0, tube: 0, glow: 0.0, robot: 1.8, env: 0.14, street: 1, far: 0.4 }, // (far: the street across the road goes to night) the robot keeps a rim of street light: dark, not a black block
};

export default {
  name: 'atmo-shop',
  async init(ctx) {
    const shop = ctx.api.shop; if (!shop) return;
    const L = this.L = shop.lights;
    this.state = shop.review ? 'review' : (ctx.params.get('light') || 'dusk');
    this.cur = { ...LEVELS[this.state] }; this.flick = 0; this.nextBurst = 4; this.burst = 0;
    this.envBase = ctx.scene.environmentIntensity;
    // ---- dust: N tiny sprites drifting through the room; each is lit by whatever light it floats in
    const N = ctx.quality === 'low' ? 3500 : 9000;
    const lampPos = this.lampPos = uniform(new THREE.Vector3()), lampDir = this.lampDir = uniform(new THREE.Vector3(0, -1, 0)), lampCos = this.lampCos = uniform(0.6), lampK = this.lampK = uniform(1);
    const duskK = this.duskK = uniform(1);
    const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const seed = vec3(hash(instanceIndex), hash(instanceIndex.add(7919)), hash(instanceIndex.add(15881)));
    // home: the room's air (more of it in the middle height, where the light shafts are)
    const home = vec3(seed.x.mul(5.4).sub(2.7), seed.y.mul(seed.y).mul(-1).add(1).mul(2.5).add(0.15), seed.z.mul(4.3).sub(2.1));
    const drift = mx_noise_vec3(home.mul(0.9).add(vec3(0, 0, time.mul(0.012)))).mul(0.18)
      .add(vec3(sin(time.mul(0.11).add(seed.x.mul(40))).mul(0.03), time.mul(-0.004).add(seed.y.mul(3)).fract().mul(-0.08), sin(time.mul(0.09).add(seed.z.mul(40))).mul(0.03)));
    const P = home.add(drift);
    mat.positionNode = P;
    // light at P: the lamp's cone (inverse square), the eye's beam (the memory cone, crisp), the dusk spill under the
    // shutter (front of the room, under the shutter's lower edge)
    const toL = P.sub(lampPos), dL = length(toL);
    const inLamp = smoothstep(lampCos, lampCos.add(0.08), dot(toL.div(dL), lampDir)).mul(float(1).div(dL.mul(dL).mul(1.6).add(0.15))).mul(lampK);
    const toE = P.sub(mem.origin), dE = length(toE);
    const inBeam = smoothstep(mem.cosAngle, mem.cosAngle.add(0.02), dot(toE.div(dE.max(1e-3)), mem.dir)).mul(mem.strength).mul(float(1).div(dE.mul(dE).mul(0.25).add(0.2))).mul(smoothstep(0.15, 0.4, dE));
    const inDusk = smoothstep(1.2, 2.2, P.z).mul(smoothstep(2.0, 1.6, P.y)).mul(duskK);
    const tw = sin(time.mul(seed.x.mul(3).add(1)).add(seed.z.mul(50))).mul(0.35).add(0.65); // turning motes catch the light
    const r = uv().sub(0.5).length().mul(2);
    const shape = float(1).sub(smoothstep(0.0, 1.0, r)).pow(2);
    mat.colorNode = vec3(1.0, 0.78, 0.52).mul(inLamp.mul(0.9)).add(vec3(1.0, 0.82, 0.6).mul(inBeam.mul(1.5))).add(vec3(0.42, 0.55, 0.85).mul(inDusk.mul(0.22))).mul(tw).mul(shape).mul(0.55);
    mat.scaleNode = float(0.0035).add(seed.y.mul(0.003));
    const dust = this.dust = new THREE.Sprite(mat); dust.count = N; dust.frustumCulled = false; dust.renderOrder = 7;
    if (ctx.params.get('nodust') === null) ctx.scene.add(dust);
    // ---- the street lamp across the road (a cobra-head on the pole in the backdrop painting, ~6.5 m up): its glowing
    // head, a soft halo, and the warm pool it throws on the road and the shutter
    { const head = new THREE.Vector3(6.78, 6.5, 10.9);
      const hm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const rr = uv().sub(0.5).length().mul(2);
      this.streakK = uniform(0);
      hm.colorNode = vec3(0.82, 0.88, 1.0).mul(float(1).sub(smoothstep(0, 1, rr)).pow(3).mul(0.6).add(float(1).sub(smoothstep(0, 0.12, rr)).mul(5))).mul(this.streakK);
      const halo = new THREE.Sprite(hm); halo.position.copy(head); halo.scale.setScalar(1.6); ctx.scene.add(halo);
      const sl = this.streetLamp = new THREE.SpotLight(0xcfdcff, 0, 30, 0.7, 0.85, 1.1); // cold: a mercury lamp over an empty road sl.position.copy(head); sl.target.position.set(1.2, -0.14, 4.6); // its pool reaches the pavement in front of the shop: seen from inside
      ctx.scene.add(sl, sl.target); }
    ctx.api.atmo = { set: (s) => { if (LEVELS[s]) this.state = s; }, get state() { return this.state; }, flicker: (k = 1) => { this.burst = Math.max(this.burst, k); } };
  },

  update(dt, t, ctx) {
    const L = this.L; if (!L) return;
    const T = LEVELS[this.state], C = this.cur, k = Math.min(1, dt * (this.state === 'out' ? 0.45 : 1.2));
    for (const key of Object.keys(T)) C[key] += (T[key] - C[key]) * k;
    // the tube: dead tubes stutter -- every few seconds a burst of fast on/off, with the starter's tick; when the power
    // holds (alive) it can still blink once in a while
    this.nextBurst -= dt;
    if (this.nextBurst <= 0) { this.burst = 1; this.nextBurst = (this.state === 'alive' ? 14 : 5) + Math.random() * 8; }
    let tubeOn = C.glow / 2.2;
    if (this.burst > 0) {
      this.burst = Math.max(0, this.burst - dt * 1.2);
      const on = Math.sin(t * 61) * Math.sin(t * 23 + 1.3) > 0.1 ? 1 : 0;
      if (this.state === 'alive') tubeOn *= on ? 1 : 0.15; else tubeOn = Math.max(tubeOn, on * 0.8 * this.burst);
      if (on && !this.wasOn) ctx.api.audio?.play('tube', { gain: 0.5 * this.burst });
      this.wasOn = on;
    }
    if (ctx.isShot && ctx.params.get('tube') !== null) tubeOn = +ctx.params.get('tube');
    L.hemi.intensity = C.hemi; L.dusk.intensity = C.dusk; L.lamp.intensity = C.lamp * (ctx.params.get('lampoff') !== null ? 0 : 1); L.fill.intensity = C.fill;
    L.tube.intensity = (this.state === 'review' ? C.tube : 5.5 * tubeOn); L.tubeGlow.value = this.state === 'review' ? C.glow : 0.02 + 2.2 * tubeOn;
    if (L.robotFill) L.robotFill.intensity = C.robot;
    ctx.scene.environmentIntensity = C.env;
    this.streetLamp.intensity = 170 * C.street; this.streakK.value = C.street; // (cold now: brighter so its pool on the empty road shows the robot dark against it)
    if (ctx.api.shop?.farK) ctx.api.shop.farK.value = C.far;
    // the dust sees the same lights
    const lp = L.lamp; this.lampPos.value.copy(lp.position); this.lampDir.value.copy(lp.target.position).sub(lp.position).normalize();
    this.lampCos.value = Math.cos(lp.angle); this.lampK.value = lp.intensity / 18; this.duskK.value = C.dusk / 1.4;
  },
};
