import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, uv, color, instanceIndex, hash, time, positionLocal, sin, mix, smoothstep, dot, normalize, length, max, mx_noise_vec3, cameraPosition,
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
  out:    { hemi: 0.1, dusk: 0.55, lamp: 0, fill: 0, tube: 0, glow: 0.0, robot: 0.6, env: 0.2, street: 1, far: 0.4 }, // (far: the street across the road goes to night) the robot keeps a rim of street light: dark, not a black block
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
    // (motes within a few tens of cm of the lens were big hard white dots -- dead pixels, snow: they fade out there)
    const nearCam = smoothstep(0.3, 0.9, length(P.sub(cameraPosition)));
    mat.colorNode = vec3(1.0, 0.78, 0.52).mul(inLamp.mul(0.9)).add(vec3(1.0, 0.82, 0.6).mul(inBeam.mul(1.5))).add(vec3(0.42, 0.55, 0.85).mul(inDusk.mul(0.22))).mul(tw).mul(shape).mul(nearCam).mul(0.55);
    mat.scaleNode = float(0.0035).add(seed.y.mul(0.003));
    const dust = this.dust = new THREE.Sprite(mat); dust.count = N; dust.frustumCulled = false; dust.renderOrder = 7;
    if (ctx.params.get('nodust') === null) ctx.scene.add(dust);
    // ---- the street lamp across the road: a concrete post standing in front of the far side's photograph (a 3D thing
    // between our road and the picture), its head, a soft halo, and the cold pool it throws on the empty road. On only
    // at the end (street = 1 in the 'out' state)
    {
      const head = new THREE.Vector3(-4.5, 3.4, 10.35); // (3.4 m, an old street's lamp: from inside the shop at 4.6 its head sat on the shutter's lower edge) // the post stands at the pillar between the electronics shop and the tailor's (no sign covered)
      const hm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const rr = uv().sub(0.5).length().mul(2);
      this.streakK = uniform(0);
      hm.colorNode = vec3(0.82, 0.88, 1.0).mul(float(1).sub(smoothstep(0, 1, rr)).pow(3).mul(0.6).add(float(1).sub(smoothstep(0, 0.12, rr)).mul(5))).mul(this.streakK);
      const halo = new THREE.Sprite(hm); halo.position.copy(head).add(new THREE.Vector3(0, -0.04, 0)); halo.scale.setScalar(0.8); ctx.scene.add(halo);
      // cold: a mercury lamp over an empty road
      const sl = this.streetLamp = new THREE.SpotLight(0xcfdcff, 0, 30, 0.5, 0.9, 1.6); // (r7: a wide cone lit the whole road grey -- the street never went dark; now a pool under the lamp, falling off)
      sl.position.copy(head); sl.target.position.set(-3.2, -0.14, 7.4);
      ctx.scene.add(sl, sl.target);
      const pm = new THREE.MeshStandardNodeMaterial({ color: 0x8a877f, roughness: 0.85 });
      const PL = head.y + 0.15, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, PL, 10), pm); pole.position.set(head.x - 0.72, PL / 2 - 0.14, head.z + 0.04);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.78, 8).rotateZ(Math.PI / 2), pm); arm.position.set(head.x - 0.36, head.y + 0.1, head.z);
      const lampMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a3c40, roughness: 0.6 });
      lampMat.emissiveNode = vec3(0.85, 0.9, 1.0).mul(this.streakK.mul(3.5));
      const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.22), lampMat); lampHead.position.copy(head).add(new THREE.Vector3(0, 0.05, 0));
      for (const o of [pole, arm, lampHead]) { o.castShadow = true; o.receiveShadow = true; ctx.scene.add(o); }
    }
    // ---- the past's light: when the far side comes back (the beam resting on a shop; the whole street at the last look)
    // its warm evening falls back across the road and in under the shutter -- on the robot's back and shoulders, its
    // shadow long on the shop floor toward us. Driven by memory.pastK (the story); always present (no recompiles)
    {
      const pl = this.pastLight = new THREE.SpotLight(0xffb472, 0, 0, 0.24, 0.95, 0);
      pl.position.set(-1.1, 2.25, 10.3); pl.target.position.set(-0.45, 0.8, 1.0); // on the robot: its back and shoulders, the floor behind it
      pl.castShadow = ctx.params.get('nopastshadow') === null; pl.shadow.mapSize.setScalar(ctx.quality === 'low' ? 512 : 1024);
      pl.shadow.bias = -0.0004; pl.shadow.normalBias = 0.01; pl.shadow.camera.near = 4; pl.shadow.camera.far = 14;
      // only the robot casts it (its visible levels are on lod.js ROBOT_LAYER, 7): every frame redrawing the whole shop's
      // raw meshes into one more shadow map took a shot from 6 to 30 s and stalled the story when the shop came in
      pl.shadow.camera.layers.set(7);
      ctx.scene.add(pl, pl.target);
      // and a low, wide spill from the doorway into the dark shop (act two looks over it: the fan, the radios, the sets
      // only read as silhouettes) -- memory.doorK; no shadows
      const df = this.doorFill = new THREE.SpotLight(0xc4ccd8, 0, 0, 1.2, 1, 0); // dusk-cool, wide and soft (r8: the fan, the cartons, the cabinet black)
      df.position.set(0.0, 2.2, 2.6); df.target.position.set(0.0, 1.15, -1.9); ctx.scene.add(df, df.target); // aimed at the shelves, not the floor by the door
    }
    ctx.api.atmo = { levels: LEVELS, set: (s, snap) => { if (LEVELS[s]) { this.state = s; if (snap) Object.assign(this.cur, LEVELS[s]); } }, get state() { return this.state; }, flicker: (k = 1) => { this.burst = Math.max(this.burst, k); } };
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
    L.hemi.intensity = C.hemi * (ctx.memory.roomK ?? 1); L.dusk.intensity = C.dusk * (ctx.memory.duskK ?? 1); L.lamp.intensity = C.lamp * (ctx.params.get('lampoff') !== null ? 0 : 1) * (ctx.memory.lampK ?? 1); L.fill.intensity = C.fill * (ctx.memory.roomK ?? 1);
    L.tube.intensity = (this.state === 'review' ? C.tube : 5.5 * tubeOn); L.tubeGlow.value = this.state === 'review' ? C.glow : 0.02 + 2.2 * tubeOn;
    if (L.robotFill) L.robotFill.intensity = C.robot * (ctx.memory.robotFillK ?? 1); // (act two looks over its back: this front fill only lit the floor behind it)
    ctx.scene.environmentIntensity = C.env;
    this.streetLamp.intensity = 85 * C.street; /* (r10: its pool on the road was the brightest thing in the end) */ this.streakK.value = C.street; // (cold now: brighter so its pool on the empty road shows the robot dark against it)
    if (ctx.api.shop?.farK) ctx.api.shop.farK.value = C.far;
    // the past's light comes from where the beam brings the far side back (the whole street: from its middle)
    const m = ctx.memory, pk = m.pastK ?? 0, ek = Math.min(1, dt * (ctx.isShot ? 60 : 2.5));
    this.pastK = (this.pastK ?? 0) + (pk - (this.pastK ?? 0)) * ek;
    if (m.origin && m.dir && m.dir.z > 0.05) {
      const s = (10.3 - m.origin.z) / m.dir.z, wide = Math.min(1, Math.max(0, ((m.memWide ?? 1) - 1) / 2));
      const hx = m.pastX ?? (Math.max(-6.5, Math.min(6.5, m.origin.x + m.dir.x * s)) * (1 - wide) + 0.3 * wide); // (pastX: a shot puts it)
      this.pastX = (this.pastX ?? hx) + (hx - (this.pastX ?? hx)) * Math.min(1, dt * (ctx.isShot ? 60 : 3));
      this.pastLight.position.set(this.pastX, 2.25, 10.3);
    }
    this.doorK = (this.doorK ?? 0) + ((m.doorK ?? 0) - (this.doorK ?? 0)) * ek; this.doorFill.intensity = 1.1 * this.doorK;
    this.pastLight.angle = m.pastAngle ?? (0.24 + 0.32 * Math.min(1, Math.max(0, ((m.memWide ?? 1) - 1) / 2))); // the whole street: its light comes in across the road, not as a spot on the robot
    this.pastLight.intensity = 2.6 * this.pastK * Math.min(1, (m.power ?? 1) * 4) * Math.min(1, (m.strength ?? 1) * 1.5) * (+ctx.params.get('pastk') || 1);
    // the dust sees the same lights
    const lp = L.lamp; this.lampPos.value.copy(lp.position); this.lampDir.value.copy(lp.target.position).sub(lp.position).normalize();
    this.lampCos.value = Math.cos(lp.angle); this.lampK.value = lp.intensity / 18; this.duskK.value = C.dusk / 1.4;
  },
};
