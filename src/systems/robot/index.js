import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { robotMaterial, eyeGlow, eyeColor } from './materials.js';
import { LANE } from '../street/index.js';

// The broken surveyor robot and its one working eye.
// Eye state: closed -> (hold) opening -> open; release -> closing. The first attempt always fails (flicker, shut).
// Publishes ctx.memory (origin, dir, angle, range, strength) every frame for every "past/present" consumer.
const ROBOT_POS = new THREE.Vector3(-(LANE.halfRoad + LANE.walk) + 0.42, LANE.curb, -13.5);

// Gobo: a low-frequency mask projected by the eye (cracked lens + 8-blade aperture), not a picture.
function makeGobo() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (open) => {
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.save(); g.translate(128, 128);
    const r = 20 + 108 * open;
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + open * 0.6; const rr = i === 5 ? r * 0.72 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.clip();
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.75, '#d8d8d8'); grd.addColorStop(1, '#5a5a5a');
    g.fillStyle = grd; g.fillRect(-128, -128, 256, 256);
    // cracks in the lens throw thin dark lines and smudges into the beam
    g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-90, -30); g.lineTo(-20, 5); g.lineTo(15, -12); g.lineTo(100, 40); g.stroke();
    g.lineWidth = 1.2; g.beginPath(); g.moveTo(-20, 5); g.lineTo(-35, 80); g.moveTo(15, -12); g.lineTo(30, -95); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(45, 50, 30, 18, 0.5, 0, 7); g.fill();
    g.restore();
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

export default {
  name: 'robot',
  async init(ctx) {
    const { scene } = ctx;
    const gltf = await new GLTFLoader().loadAsync('/models/robot.glb');
    const root = this.root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = robotMaterial(o.material.name || '');
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    root.position.copy(ROBOT_POS);
    root.rotation.y = Math.PI / 2; // glTF front (+Z) faces the road (+X)
    scene.add(root);

    const find = (n) => root.getObjectByName(n);
    this.head = find('head');
    this.eye = find('eye');
    this.headRest = this.head.quaternion.clone();
    this.iris = [];
    for (let i = 0; i < 8; i++) { const p = find(`iris_${i}`); if (p) this.iris.push({ node: p, rest: p.quaternion.clone() }); }

    // the eye light: the only coloured light in the world
    this.gobo = makeGobo(); this.gobo.draw(0);
    const spot = this.spot = new THREE.SpotLight(eyeColor.value.clone(), 0, 45, 0.3, 0.35, 1.4);
    spot.map = this.gobo.tex;
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.2; spot.shadow.bias = -0.0005;
    scene.add(spot, spot.target);
    this.beamVol = ctx.api.atmo?.volume(new THREE.Vector3(0.3, 3, -14), new THREE.Vector3(11, 6, 18), 0.0, [spot]);

    // state
    this.open = 0; this.target = 0; this.attempts = 0; this.failT = -1; this.holdT = 0;
    this.look = new THREE.Vector2(0, 0); this.lookCur = new THREE.Vector2(0, 0);
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.goboT = 0;
    ctx.api.robot = { root, eye: this.eye, spot, setOpenTarget: (v) => { this.target = v; }, get open() { return this.open; } };
  },

  update(dt, t, ctx) {
    const input = ctx.input;
    const forced = ctx.memory.forceOpen; // story / shots can force the eye
    const holding = forced ?? input.hold;

    // ---- eye state: first attempt fails with a flicker, later attempts open slowly while held
    if (holding && this.holdT === 0) this.attempts++;
    this.holdT = holding ? this.holdT + dt : 0;
    if (forced !== undefined) this.target = forced ? 1 : 0;
    else if (this.attempts <= 1 && holding) {
      this.target = this.holdT < 0.9 ? 0.25 : 0;
      if (this.holdT > 0.9 && this.failT < 0) { this.failT = t; ctx.api.audio?.play('click'); }
    } else this.target = holding ? 1 : 0;
    if (holding && this.holdT > 0 && this.holdT < dt * 1.5 && this.attempts > 1) { ctx.api.audio?.play('whine'); ctx.api.audio?.play('servo'); }

    // opening is slow and stuttering (servo slips), closing is quicker
    const speed = this.target > this.open ? 0.32 : 0.9;
    const slip = this.target > this.open && Math.sin(t * 9.0) > 0.85 ? 0.15 : 1;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), speed * slip * dt);
    const flicker = this.failT > 0 && t - this.failT < 0.6 ? (Math.random() < 0.5 ? 0.6 : 0.0) : 1;
    const o = this.open * flicker;

    // ---- iris blades swing out of the aperture as it opens (blade 5 is bent and lags)
    for (let i = 0; i < this.iris.length; i++) {
      const lag = i === 5 ? 0.55 : 1;
      this._q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -o * lag * 0.95);
      this.iris[i].node.quaternion.copy(this.iris[i].rest).multiply(this._q);
    }
    eyeGlow.value = o;

    // ---- head: stiff, delayed look toward the pointer, only once the eye is awake
    this.look.set(input.pointer.x * 0.5, input.pointer.y * 0.25);
    if (ctx.memory.lookOverride) this.look.copy(ctx.memory.lookOverride);
    const k = Math.min(1, dt * (0.6 + this.open * 1.4));
    this.lookCur.lerp(this.look.clone().multiplyScalar(0.25 + this.open * 0.75), k);
    const jitter = this.open > 0.05 ? Math.sin(t * 31) * 0.004 * this.open : 0;
    this._e.set(-this.lookCur.y * 0.9 + jitter, -this.lookCur.x * 1.1, 0);
    this.head.quaternion.copy(this.headRest).multiply(this._q.setFromEuler(this._e));

    // ---- eye light follows the eye's forward axis
    this.root.updateMatrixWorld(true);
    this.eye.getWorldPosition(this._v);
    this._d.set(0, 0, 1).transformDirection(this.eye.matrixWorld).normalize();
    this.spot.position.copy(this._v).addScaledVector(this._d, 0.03);
    this.spot.target.position.copy(this._v).addScaledVector(this._d, 10);
    this.spot.intensity = 260 * o * o;
    this.spot.angle = 0.12 + 0.24 * o;
    if (this.beamVol) this.beamVol.material.userData.density.value = 0.35 * o;
    if (t - this.goboT > 1 / 15 && Math.abs(o - (this._lastGobo ?? -1)) > 0.01) { this.gobo.draw(o); this.goboT = t; this._lastGobo = o; }

    // ---- publish the memory cone
    const m = ctx.memory;
    m.origin.copy(this._v); m.dir.copy(this._d);
    m.angle = this.spot.angle; m.range = 40; m.strength = o; m.power = Math.max(0, 1 - this.attempts * 0.08);
  },
};
