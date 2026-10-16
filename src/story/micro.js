import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  vec3, float, uniform, positionWorld, normalView, positionViewDirection, abs, dot, pow, lights,
} from 'three/tsl';
import { memoryMask, memoryMaskCPU, amberNode } from '../materials/memory.js';

// Small memories along the street: hold the beam on a place for a moment and something that happened there
// plays once. Photo studio: a family posing at the door, then the flash.
function rimMaterial(vis) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.lightsNode = lights([]);
  m.colorNode = vec3(0);
  const rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 5.0);
  const mask = memoryMask(positionWorld).mul(vis);
  m.emissiveNode = amberNode().mul(rim.mul(1.0)).mul(mask);
  m.maskNode = mask.greaterThan(0.08);
  return m;
}

async function people() {
  try {
    const g = await new GLTFLoader().loadAsync('/models/people.glb');
    return (n) => {
      const src = g.scene.getObjectByName(`person_${n}`);
      if (!src) return null;
      const o = src.clone(true); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0);
      o.traverse((m) => { if (m.isMesh) { const c = m.geometry.clone(); for (const k of Object.keys(c.attributes)) if (k !== 'position') c.deleteAttribute(k); m.geometry = mergeVertices(c, 1e-3); m.geometry.computeVertexNormals(); } });
      return o;
    };
  } catch { return () => null; }
}

export default {
  name: 'micro',
  async init(ctx) {
    const { scene } = ctx;
    this.items = [];
    ctx.api.micro = this;
    const make = await people();
    const shop = ctx.api.signs?.find((s) => s.name === '光明照相' && s.side > 0);
    if (shop) {
      const s = shop.side;
      const vis = uniform(0);
      const mat = rimMaterial(vis);
      const g = new THREE.Group();
      // a family at the studio door, facing the street: two adults, the child in front
      const cast = [[1, -0.45, 0], [5, 0.25, 0.05], [2, -0.05, 0.45]];
      for (const [n, dz, dx] of cast) {
        const p = make(n); if (!p) continue;
        p.traverse((m) => { if (m.isMesh) m.material = mat; });
        p.position.set(shop.x + s * (0.75 - dx), 0.14, shop.z + dz);
        p.rotation.y = -s * Math.PI / 2;
        g.add(p);
      }
      scene.add(g);
      // the flash: warm-white burst from where the photographer stood (intensity only, never toggled)
      const flash = new THREE.PointLight(0xfff0dc, 0, 9, 2);
      flash.position.set(shop.x - s * 1.6, 1.6, shop.z);
      scene.add(flash);
      this.items.push({ kind: 'photo', name: 'photo', center: new THREE.Vector3(shop.x + s * 0.6, 1.3, shop.z), vis, flash, dwell: 0, t: -1, done: false });
    }
    this.initNoodle(ctx); // robot and atmo are initialised before this system
  },
  // noodle shop: warm steam at the door, lit only by the eye (a small volume restricted to the eye's light)
  initNoodle(ctx) {
    const shop = ctx.api.signs?.find((s) => s.name === '张记面馆' && s.side > 0);
    const spot = ctx.api.robot?.spot;
    if (!shop || !spot || !ctx.api.atmo) return;
    const s = shop.side;
    const vol = ctx.api.atmo.volume(new THREE.Vector3(shop.x + s * 0.4, 1.9, shop.z), new THREE.Vector3(1.8, 3.2, Math.min(3, shop.w - 0.6)), 0, [spot]);
    vol.visible = true; // visible for the first frames (compiled behind the title), hidden while idle
    const warm = new THREE.PointLight(0xffa860, 0, 5, 2);
    warm.position.set(shop.x + s * 1.0, 1.4, shop.z);
    ctx.scene.add(warm);
    this.items.push({ kind: 'noodle', name: 'noodle', center: new THREE.Vector3(shop.x + s * 0.6, 1.3, shop.z), vol, warm, dwell: 0, t: -1, done: false });
  },
  update(dt, time, ctx) {
    this.frames = (this.frames ?? 0) + 1;
    const m = ctx.memory;
    for (const it of this.items) {
      const lit = memoryMaskCPU(it.center, m);
      if (it.vol) it.vol.visible = it.t >= 0 || this.frames < 30;
      if (it.t < 0) {
        it.dwell = lit > 0.4 ? it.dwell + dt : Math.max(0, it.dwell - dt);
        if (it.dwell > 1.5 && !it.done) it.t = 0;
        continue;
      }
      it.t += dt;
      if (it.kind === 'noodle') {
        // the kitchen comes back: warm light inside, steam rolling out of the door, then it thins away
        const env = Math.min(1, it.t / 2) * (it.t > 9 ? Math.max(0, 1 - (it.t - 9) / 3) : 1);
        it.vol.material.userData.density.value = 1.4 * env;
        it.warm.intensity = 7 * env * lit;
        if (it.t > 12) { it.t = -1; it.done = true; it.dwell = 0; it.warm.intensity = 0; it.vol.material.userData.density.value = 0; }
        continue;
      }
      // fade in the family, two flashes (3.0 s and 5.5 s), hold, fade out
      it.vis.value = Math.min(1, it.t / 1.2) * (it.t > 8 ? Math.max(0, 1 - (it.t - 8) / 1.5) : 1);
      let f = 0;
      for (const at of [3.0, 5.5]) { const x = it.t - at; if (x > 0 && x < 0.6) f = Math.max(f, Math.exp(-x * 12)); if (x > 0 && x - dt <= 0) ctx.api.audio?.play('shutter'); }
      it.flash.intensity = 60 * f * lit;
      if (it.t > 9.5) { it.t = -1; it.done = true; it.dwell = 0; it.flash.intensity = 0; }
    }
  },
};
