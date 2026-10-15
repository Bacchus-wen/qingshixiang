import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { robotMaterial, eyeGlow, eyeColor } from './materials.js';
import { LANE } from '../street/index.js';
import { syncMemory } from '../../materials/memory.js';
import { rippleNormal, wetUniforms } from '../../materials/wet.js';
import { positionWorld, vec3, float, transformNormalToView, normalize } from 'three/tsl';

// The robot has sat here long enough for water to pool around it: an irregular, mirror-dark puddle.
function makePuddle() {
  const g = new THREE.CircleGeometry(1, 48);
  const pos = g.attributes.position;
  for (let i = 1; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    const r = 1 + 0.22 * Math.sin(a * 3 + 1.3) + 0.12 * Math.sin(a * 7 + 0.4) + 0.06 * Math.sin(a * 13);
    pos.setXY(i, pos.getX(i) * r, pos.getY(i) * r);
  }
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.03, metalness: 0 });
  m.colorNode = vec3(0.008);
  const rip = rippleNormal(positionWorld.xz).mul(wetUniforms.rain);
  m.normalNode = transformNormalToView(normalize(vec3(rip.x, float(1), rip.y)));
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

// The broken surveyor robot and its one working eye.
// Eye state: closed -> (hold) opening -> open; release -> closing. The first attempt always fails (flicker, shut).
// Publishes ctx.memory (origin, dir, angle, range, strength) every frame for every "past/present" consumer.
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const ROBOT_POS = new THREE.Vector3(-(LANE.halfRoad + LANE.walk) + 0.42, LANE.curb, -13.5);

// Gobo: a low-frequency mask projected by the eye (cracked lens + 8-blade aperture), not a picture.
function makeGobo() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  // fixed dirt pattern (seeded) so the projection is "this lens", not noise
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const specks = Array.from({ length: 70 }, () => [rnd() * 256 - 128, rnd() * 256 - 128, 0.5 + rnd() * 3.5, rnd()]);
  const wobble = Array.from({ length: 48 }, () => 0.86 + rnd() * 0.2);
  const aperture = (g, r, open) => {
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * Math.PI * 2;
      const blade = 0.94 + 0.06 * Math.cos(a * 8 + open * 0.6);       // 8-blade polygon feel
      const bent = Math.abs(((a / (Math.PI * 2)) * 8) % 8 - 5.5) < 0.6 ? 0.78 : 1; // the stuck blade
      const rr = r * blade * bent * wobble[i % 48];
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  };
  const draw = (open) => {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.translate(128, 128);
    const r = 18 + 106 * open;
    // faint double image (internal reflection in the cracked lens), offset and dim
    g.save(); g.translate(9, -6); aperture(g, r * 0.96, open); g.clip();
    g.fillStyle = 'rgba(150,150,150,0.18)'; g.fillRect(-128, -128, 256, 256); g.restore();
    g.save(); aperture(g, r, open); g.clip();
    const grd = g.createRadialGradient(-8, 6, 0, 0, 0, r);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.55, '#e2e2e2'); grd.addColorStop(0.85, '#8a8a8a'); grd.addColorStop(1, '#2a2a2a');
    g.fillStyle = grd; g.fillRect(-128, -128, 256, 256);
    // silver specks and dust: dark motes and a few bright pin-holes
    for (const [x, y, s, k] of specks) { g.fillStyle = k < 0.8 ? `rgba(0,0,0,${0.25 + k * 0.4})` : 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }
    // cracks
    g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-90, -30); g.lineTo(-20, 5); g.lineTo(15, -12); g.lineTo(100, 40); g.stroke();
    g.lineWidth = 1.1; g.beginPath(); g.moveTo(-20, 5); g.lineTo(-35, 80); g.moveTo(15, -12); g.lineTo(30, -95); g.moveTo(60, 20); g.lineTo(70, 70); g.stroke();
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
    const puddle = makePuddle();
    puddle.position.set(ROBOT_POS.x + 0.55, LANE.curb + 0.006, ROBOT_POS.z + 0.1);
    puddle.scale.set(1.25, 1, 0.95);
    scene.add(puddle);

    const find = (n) => root.getObjectByName(n);
    this.head = find('head');
    this.eye = find('eye');
    this.headRest = this.head.quaternion.clone();
    this.iris = [];
    for (let i = 0; i < 8; i++) { const p = find(`iris_${i}`); if (p) this.iris.push({ node: p, rest: p.quaternion.clone() }); }

    // the eye light: the only coloured light in the world
    this.gobo = makeGobo(); this.gobo.draw(0);
    const spot = this.spot = new THREE.SpotLight(eyeColor.value.clone(), 0, 45, 0.3, 0.65, 1.4);
    spot.map = this.gobo.tex;
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.2; spot.shadow.bias = -0.0005;
    scene.add(spot, spot.target);
    this.beamVol = ctx.api.atmo?.volume(new THREE.Vector3(0.3, 3, -14), new THREE.Vector3(11, 6, 18), 0.0, [spot]);

    // state
    this.open = 0; this.target = 0; this.attempts = 0; this.failT = -1; this.holdT = 0;
    this.look = new THREE.Vector2(0, 0); this.lookCur = new THREE.Vector2(0, 0);
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.goboT = 0;
    const sys = this;
    ctx.api.robot = { root, eye: this.eye, spot, setOpenTarget: (v) => { sys.target = v; }, get open() { return sys.open; }, get attempts() { return sys.attempts; }, get failed() { return sys.failed; } };
  },

  update(dt, t, ctx) {
    const input = ctx.input;
    const forced = ctx.memory.forceOpen; // story / shots can force the eye
    const holding = forced ?? input.hold;

    // ---- eye state: first attempt fails with a flicker, later attempts open slowly while held
    // an attempt counts once the hold is deliberate (taps don't use up the scripted failure)
    const prevHold = this.holdT;
    this.holdT = holding ? this.holdT + dt : 0;
    if (prevHold < 0.25 && this.holdT >= 0.25) this.attempts++;
    if (forced !== undefined) this.target = forced ? 1 : 0;
    else if (this.attempts <= 1 && holding && this.holdT >= 0.25) {
      this.target = this.holdT < 1.1 ? 0.25 : 0;
      if (this.holdT > 1.1 && this.failT < 0) { this.failT = t; ctx.api.audio?.play('click'); }
    } else this.target = holding && this.attempts > 1 ? 1 : 0;
    this.failed = this.failT > 0;
    if (prevHold < 0.25 && this.holdT >= 0.25 && this.attempts > 1) { ctx.api.audio?.play('whine'); ctx.api.audio?.play('servo'); }

    // opening is slow and stuttering (servo slips), closing is quicker
    const speed = this.target > this.open ? 0.32 : 0.9;
    const slip = this.target > this.open && Math.sin(t * 9.0) > 0.85 ? 0.15 : 1;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), speed * slip * dt);
    const flicker = this.failT > 0 && t - this.failT < 0.6 ? (Math.random() < 0.5 ? 0.6 : 0.0) : 1;
    const pw = ctx.memory.power ?? 1;
    const weak = pw < 0.2 ? (Math.random() < (0.2 - pw) * 2.5 ? 0.35 : 1) : 1;
    const o = this.open * flicker * weak * Math.min(1, 0.4 + pw * 3);

    // ---- iris blades swing out of the aperture as it opens (blade 5 is bent and lags)
    for (let i = 0; i < this.iris.length; i++) {
      const lag = i === 5 ? 0.55 : 1;
      this._q.setFromAxisAngle(AXIS_Z, -o * lag * 0.95);
      this.iris[i].node.quaternion.copy(this.iris[i].rest).multiply(this._q);
    }
    eyeGlow.value = o;

    // ---- head: stiff, delayed look toward the pointer, only once the eye is awake
    this.look.set(input.pointer.x * 0.55, input.pointer.y * 0.55);
    if (ctx.memory.lookOverride) this.look.set(ctx.memory.lookOverride.x, ctx.memory.lookOverride.y);
    const k = Math.min(1, dt * (0.6 + this.open * 1.4));
    this.lookCur.lerp(this.look.multiplyScalar(0.25 + this.open * 0.75), k);
    const jitter = this.open > 0.05 ? Math.sin(t * 31) * 0.004 * this.open : 0;
    // waking lifts the drooped head toward level; the pointer then pitches it further up/down
    this._e.set(-this.lookCur.y * 0.9 - this.open * 0.32 + jitter, -this.lookCur.x * 1.1, 0);
    this.head.quaternion.copy(this.headRest).multiply(this._q.setFromEuler(this._e));

    // ---- eye light follows the eye's forward axis
    this.root.updateMatrixWorld(true);
    this.eye.getWorldPosition(this._v);
    this._d.set(0, 0, 1).transformDirection(this.eye.matrixWorld).normalize();
    this.spot.position.copy(this._v).addScaledVector(this._d, 0.03);
    this.spot.target.position.copy(this._v).addScaledVector(this._d, 10);
    this.spot.intensity = 260 * o * o;
    this.spot.angle = 0.12 + 0.24 * o;
    // never toggle the light's visibility (changing the light set recompiles every lit material = a visible hitch);
    // just stop re-rendering its shadow map while the eye is shut. The beam volume is kept visible for the first
    // frames (hidden by the black title) so its pipeline is compiled before the eye ever opens.
    this.frames = (this.frames ?? 0) + 1;
    this.spot.shadow.autoUpdate = o > 0.005 || this.frames < 30;
    if (this.beamVol) { this.beamVol.material.userData.density.value = 0.35 * o; this.beamVol.visible = o > 0.01 || this.frames < 30; }
    if (t - this.goboT > 1 / 15 && Math.abs(o - (this._lastGobo ?? -1)) > 0.01) { this.gobo.draw(o); this.goboT = t; this._lastGobo = o; }

    // ---- publish the memory cone
    const m = ctx.memory;
    m.origin.copy(this._v); m.dir.copy(this._d);
    m.angle = this.spot.angle; m.range = 40; m.strength = o;
    syncMemory(m);
  },
};
