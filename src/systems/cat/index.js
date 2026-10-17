import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { float, mix, mx_noise_float, normalWorldGeometry, positionLocal, sin, smoothstep, uniform, vec3 } from 'three/tsl';
import { wetUniforms } from '../../materials/wet.js';

const PARTS = ['body', 'head', 'ear_l', 'ear_r', 'tail_0', 'tail_1', 'tail_2', 'tail_3', 'tail_4',
  'leg_fl', 'leg_fr', 'leg_bl', 'leg_br'];
const LEG_NAMES = ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'];
const LEG_PHASE = [0, Math.PI, Math.PI, 0];
const TAIL_CURL = [-1.90, -0.90, -0.20, -0.15, -0.20];
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export const catEye = uniform(0.12);
function catMaterial(name, presence) {
  // review5: the cat read as a black blob. Still a black cat (its low-poly form must stay in shadow), but with a
  // fur sheen at grazing angles so the outline reads, and eyes that catch the light (tapetum), facing the camera.
  const m = new THREE.MeshPhysicalNodeMaterial();
  m.name = name;
  let gray = 0.07, roughness = 0.6;
  if (name === 'cat_muzzle') { gray = 0.1; roughness = 0.62; }
  else if (name === 'cat_inner_ear') { gray = 0.06; roughness = 0.58; }
  else if (name === 'cat_nose') { gray = 0.03; roughness = 0.26; }
  else if (name === 'cat_eye') { gray = 0.03; roughness = 0.08; }
  const wet = smoothstep(0.3, 0.9, normalWorldGeometry.y).mul(wetUniforms.wetness);
  const fur = name === 'cat_fur' || name.startsWith('cat_body') || name === 'cat_tail';
  // mackerel stripes: bands across the body (local x) broken by noise
  const P = positionLocal;
  const stripe = fur ? smoothstep(0.35, 0.7, sin(P.x.mul(46).add(mx_noise_float(P.mul(9)).mul(3.2))).mul(0.5).add(0.5)) : float(0);
  m.colorNode = vec3(gray).mul(mix(float(1), float(0.7), stripe)).mul(vec3(1.0, 0.94, 0.86)).mul(mix(float(1), float(0.78), wet));
  m.roughnessNode = mix(float(roughness), float(0.22), wet.mul(0.8));
  m.metalness = 0;
  if (name !== 'cat_eye' && name !== 'cat_nose') {
    m.sheen = 1; m.sheenRoughness = 0.45; m.sheenColor = new THREE.Color(0.32, 0.3, 0.28);
  }
  if (name === 'cat_eye') m.emissiveNode = vec3(0.9, 0.75, 0.32).mul(catEye);
  // Opaque depth/shadow behavior while present; dither the last few steps into rain.
  // The end camera looks along -Z, so that path cannot literally cross its frustum.
  m.alphaHash = true;
  m.opacityNode = presence;
  return m;
}

function release(root) {
  if (!root) return;
  const geometries = new Set(), materials = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    geometries.add(o.geometry);
    if (Array.isArray(o.material)) o.material.forEach((m) => materials.add(m));
    else materials.add(o.material);
  });
  root.removeFromParent();
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}

export default {
  name: 'cat',
  async init(ctx) {
    this.root = null;
    let model;
    try {
      model = (await new GLTFLoader().loadAsync(`${import.meta.env?.BASE_URL ?? '/'}models/cat.glb`)).scene;
      const nodes = Object.create(null);
      for (const name of PARTS) {
        nodes[name] = model.getObjectByName(name);
        if (!nodes[name]) { release(model); return; }
      }
      this.presence = uniform(1);
      const cache = new Map(), oldMaterials = new Set();
      const replace = (mat) => {
        const name = mat.name || 'cat_fur';
        oldMaterials.add(mat);
        if (!cache.has(name)) cache.set(name, catMaterial(name, this.presence));
        return cache.get(name);
      };
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map(replace) : replace(o.material);
        o.castShadow = o.receiveShadow = true;
      });
      oldMaterials.forEach((m) => m.dispose());

      // Outer motion wrapper, so exporter axis conversion never affects world placement.
      const root = new THREE.Group();
      root.name = 'cat-system';
      root.add(model);
      this.nodes = nodes;
      this.rest = Object.create(null);
      for (const name of PARTS) {
        const node = nodes[name];
        this.rest[name] = { position: node.position.clone(), quaternion: node.quaternion.clone() };
      }
      this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
      this.q = new THREE.Quaternion();
      this.origin = new THREE.Vector3(-4.58, 0.14, -13.5);
      // +X is the robot's facing direction. The cat sleeps on its +Z side, against the wall by the torn
      // shoulder's cables (dry, out of the puddle, and in view of the waiting camera) (Claude)
      ctx.api.robot?.root?.getWorldPosition(this.origin);
      this.origin.x += Number(ctx.params?.get('catx') ?? 0.35); // r19: by the robot's knee in the mid-ground, not a black ball in the lens
      this.origin.z += Number(ctx.params?.get('catz') ?? -0.75);
      this.origin.y = 0.14;
      root.position.copy(this.origin);
      this.debug = ctx.params?.get('cat');
      const shot = ctx.params?.get('shot');
      this.catShot = ctx.isShot && /^cat-(sleep|alert|lightning|walk)$/.test(shot || '');
      if (this.catShot) this.debug = shot.slice(4);
      if (this.catShot && ctx.camera) {
        ctx.camera.position.set(this.origin.x + 1.6, 0.65, this.origin.z + 1.7);
        ctx.camera.fov = 36;
        ctx.camera.lookAt(this.origin.x, 0.33, this.origin.z);
        ctx.camera.updateProjectionMatrix();
      }
      this.dozeP = Number(ctx.params?.get('catp') ?? 0.3);
      this.dozeY = Number(ctx.params?.get('caty') ?? -0.6);
      this.root = root;
      this.state = 'sleep';
      this.awake = 0;
      this.yaw = this.pitch = 0;
      this.leaveTime = 0;
      this.shockAge = 100;
      this.flashHigh = false;
      this.clock = 0;
      this.api = { root, state: 'sleep' };
      ctx.api.cat = this.api;
      this.update(0, 0, ctx); // first visible frame is already curled
      ctx.scene.add(root);
    } catch {
      // Missing / invalid GLB is optional scenery, never a failed engine system.
      release(this.root || model);
      this.root = null;
      if (ctx.api.cat === this.api) delete ctx.api.cat;
    }
  },

  // Rest-relative quaternion rotations also work with glTF's converted pivot axes.
  pose(name, x, y, z) {
    this.euler.set(x, y, z);
    this.nodes[name].quaternion.copy(this.rest[name].quaternion).premultiply(this.q.setFromEuler(this.euler));
  },

  update(dt, t, ctx) {
    if (!this.root || this.state === 'gone') return;
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.clock += dt;
    const time = this.clock;
    const debug = this.debug;
    const ending = ctx.api.director?.phase === 'end' || debug === 'walk';
    const strength = debug === 'sleep' ? 0 : debug === 'alert' || debug === 'lightning' ? 1 : ctx.memory?.strength ?? 0;
    if (ending && this.state !== 'leave') { this.state = 'leave'; this.leaveTime = 0; }
    else if (this.state === 'sleep' && strength > 0.3) this.state = 'alert';
    if (this.state === 'leave') this.leaveTime += dt;
    const leave = this.leaveTime;
    const stand = ease(leave / 1.15);
    // Turn first, then start walking. Travel 3.3 m in a slow 1.35 Hz gait.
    const walkTime = Math.max(0, leave - 1.15);
    const distance = 0.78 * (walkTime - 0.25 * (1 - Math.exp(-walkTime * 4)));
    const walking = 1 - Math.exp(-walkTime * 4);
    this.root.position.z = this.origin.z - distance;
    this.root.rotation.y = lerp(Math.PI / 2, Math.PI, stand);
    this.awake += ((this.state !== 'sleep' ? 1 : 0) - this.awake) * (1 - Math.exp(-dt * 1.25));
    catEye.value = 0.1 + 0.55 * this.awake;

    // Rising edge only: a held lightning value must not pin the animal in a flinch.
    const flash = debug === 'lightning' ? (time >= 1 && time < 1.12 ? 1 : 0) : ctx.world?.lightning ?? 0;
    if (flash > 0.5 && !this.flashHigh) this.shockAge = 0;
    else this.shockAge += dt;
    this.flashHigh = flash > 0.5;
    const shock = (1 - Math.exp(-this.shockAge * 55)) * Math.exp(-this.shockAge * 7);
    const twitch = Math.sin(this.shockAge * 47) * Math.exp(-this.shockAge * 13);
    const gait = walkTime * Math.PI * 2 * 1.35;
    const breath = Math.sin(time * 1.65) * 0.003;
    const body = this.nodes.body, bodyRest = this.rest.body.position;
    body.position.copy(bodyRest);
    // Lift the chest before unfolding the rigid limbs, keeping paws above the curb.
    body.position.y += -0.135 * (1 - stand) ** 3 + breath * (1 - stand)
      + Math.sin(gait * 2) * 0.004 * walking - shock * 0.018;
    body.scale.set(1, 1 + Math.sin(time * 1.65) * 0.012 * (1 - stand), 1);
    this.pose('body', -shock * 0.045, 0, Math.sin(gait) * 0.018 * walking);

    const dir = ctx.memory?.dir;
    let targetYaw = 0, targetPitch = 0;
    if (dir && Number.isFinite(dir.x) && Number.isFinite(dir.y) && Number.isFinite(dir.z)) {
      const angle = Math.atan2(dir.x, dir.z) - this.root.rotation.y;
      targetYaw = clamp(Math.atan2(Math.sin(angle), Math.cos(angle)), -1.05, 1.05);
      targetPitch = clamp(-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -0.35, 0.35);
    }
    const follow = 1 - Math.exp(-dt * 1.7);
    this.yaw += (targetYaw - this.yaw) * follow;
    this.pitch += (targetPitch - this.pitch) * follow;
    const attentive = this.awake * (1 - stand);
    this.nodes.head.position.copy(this.rest.head.position);
    // dozing, not curled: head resting low but turned out toward the street, one eye catching the light (review5)
    this.nodes.head.position.y -= 0.035 * (1 - this.awake) * (1 - stand);
    this.pose('head', lerp(this.dozeP, this.pitch, this.awake) * (1 - stand) + shock * 0.14,
      lerp(this.dozeY, this.yaw, this.awake) * (1 - stand), -0.12 * (1 - this.awake) * (1 - stand));
    this.pose('ear_l', -0.12 + attentive * Math.sin(time * 0.91) * 0.09 + twitch * 0.45,
      attentive * (this.yaw * 0.28 + Math.sin(time * 0.63) * 0.18), -0.12 - shock * 0.55);
    this.pose('ear_r', -0.08 + attentive * Math.sin(time * 1.13 + 1) * 0.08 - twitch * 0.40,
      attentive * (this.yaw * 0.24 + Math.sin(time * 0.79 + 2) * 0.16), 0.12 + shock * 0.55);

    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      this.pose(LEG_NAMES[i], (front ? 1.30 : -1.20) * (1 - stand)
        + Math.sin(gait + LEG_PHASE[i]) * 0.30 * walking, 0, 0);
    }
    // The tail wraps from rump around the flank to the forepaws; only its tip stirs.
    const tailCycle = time % 9.7;
    const flick = tailCycle < 0.9 ? Math.sin(tailCycle * Math.PI / 0.9) ** 2 * Math.sin(tailCycle * 11) : 0;
    this.nodes.tail_0.position.copy(this.rest.tail_0.position);
    this.nodes.tail_0.position.y -= 0.10 * (1 - stand);
    for (let i = 0; i < 5; i++) {
      this.pose(PARTS[4 + i], stand * (i === 0 ? 1.10 : 0.10) - (i === 0 ? 0.12 * (1 - stand) : 0),
        lerp(TAIL_CURL[i], Math.sin(time * 1.5 - i * 0.45) * 0.045, stand)
          + (i > 2 ? flick * 0.15 * (1 - stand) : 0), 0);
    }
    this.api.state = this.state;
    // Complete the exit in 5.5 s, including the rise. No hard visible pop in wide shots.
    this.presence.value = 1 - ease((leave - 4.65) / 0.85);
    if (leave >= 5.5) {
      this.state = this.api.state = 'gone';
      this.root.removeFromParent();
    }
  },

  dispose(ctx) {
    release(this.root);
    this.root = null;
    if (ctx?.api.cat === this.api) delete ctx.api.cat;
  },
};
