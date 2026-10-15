import * as THREE from 'three/webgpu';
import { texture, vec3, float, mix, uniform, positionWorld, normalView, positionViewDirection, abs, dot, pow, lights, smoothstep, clamp } from 'three/tsl';
import { memoryMask, memoryMaskCPU, amberNode } from '../materials/memory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { crowd } from '../systems/ghosts/index.js';
import { NOTICES, noticeMaterial } from '../systems/street/details.js';

// The one memory with a story: the door across the street, its frame scored with a child's heights.
// Hold the beam on it and the robot takes over: its eye narrows to a level line, the child appears against the
// frame and grows one mark at a time, year by year, until the marks stop.
const DOOR = { x: 5.0, z: -14.2, w: 0.96, h: 2.12 };
const FLOOR = 0.14; // sidewalk / doorstep level: marks and the child share this base
const MARKS = [
  { h: 1.10, label: '小宁 五岁' }, { h: 1.17, label: '六岁' }, { h: 1.24, label: '七岁' }, { h: 1.30, label: '八岁' },
  { h: 1.36, label: '九岁' }, { h: 1.42, label: '十岁' }, { h: 1.48, label: '十一岁' },
].map((m) => ({ ...m, y: FLOOR + m.h }));

function marksTexture(count) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  const draw = (n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 1024);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
    g.font = '600 24px "PingFang SC","Hiragino Sans GB",sans-serif';
    MARKS.slice(0, n).forEach((m, i) => {
      const y = 1024 - (m.y / 2.12) * 1024;
      g.globalAlpha = i === n - 1 ? 1 : 0.28;
      g.beginPath(); g.moveTo(14, y); g.lineTo(118, y + (i % 2 ? 3 : -2)); g.stroke();
      g.fillText(m.label, i % 2 ? 150 : 122, y + 8); // alternate columns: the marks are only 6-7 cm apart
    });
    g.globalAlpha = 1; tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  draw(count);
  return { tex, draw };
}

// unlit black with an amber rim, visible only inside the cone (same language as the ghosts)
function rimMaterial(extraMask) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.lightsNode = lights([]);
  m.colorNode = vec3(0);
  const rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3.5);
  const mask = memoryMask(positionWorld).mul(extraMask);
  m.emissiveNode = amberNode().mul(rim.mul(1.8)).mul(mask); // outline only: no body fill
  m.maskNode = mask.greaterThan(0.08);
  return m;
}

function childFigure(mat) {
  const g = new THREE.Group();
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.z = rz; g.add(o); return o; };
  add(new THREE.SphereGeometry(0.075, 20, 14), 0, 0.905, 0, 0.92, 1.05, 0.98);       // head
  add(new THREE.SphereGeometry(0.08, 16, 10), 0, 0.94, 0.012, 1.0, 0.72, 1.05);      // hair
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 10), 0, 0.81, 0);                // neck
  add(new THREE.CapsuleGeometry(0.085, 0.2, 6, 14), 0, 0.62, 0, 1.15, 1, 0.68);      // torso in a small coat
  add(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 14), 0, 0.46, 0, 1, 1, 0.7);        // coat hem
  add(new THREE.BoxGeometry(0.17, 0.22, 0.07), 0, 0.64, 0.085);                        // backpack
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.036, 0.34, 4, 10), s * 0.05, 0.22, 0);            // legs
    add(new THREE.BoxGeometry(0.06, 0.04, 0.11), s * 0.05, 0.02, -0.025);             // shoes
    add(new THREE.CapsuleGeometry(0.026, 0.25, 4, 8), s * 0.115, 0.6, 0, 1, 1, 1, s * 0.06); // arms at the sides
  }
  return g;
}

export default {
  name: 'fragment',
  async init(ctx) {
    const { scene } = ctx;
    const wood = new THREE.MeshStandardNodeMaterial({ color: 0x1b1a19, roughness: 0.6 });
    const doorMat = new THREE.MeshStandardNodeMaterial({ color: 0x0a0a0a, roughness: 0.45 });
    const g = this.group = new THREE.Group();
    const box = (w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; o.layers.enable(1); g.add(o); return o; };
    const x = DOOR.x, z = DOOR.z, hw = DOOR.w / 2;
    box(0.14, DOOR.h + 0.1, 0.1, wood, x - 0.05, (DOOR.h + 0.1) / 2, z - hw - 0.05);     // jamb (marked)
    box(0.14, DOOR.h + 0.1, 0.1, wood, x - 0.05, (DOOR.h + 0.1) / 2, z + hw + 0.05);     // jamb
    box(0.14, 0.12, DOOR.w + 0.3, wood, x - 0.05, DOOR.h + 0.1, z);                      // lintel
    box(0.06, DOOR.h, DOOR.w, doorMat, x + 0.06, DOOR.h / 2, z);                          // door, recessed
    box(0.4, 0.12, DOOR.w + 0.3, wood, x - 0.2, 0.06 + 0.14, z);                          // step
    // the marks: faint pencil scratches now, amber writing in the light
    this.marks = marksTexture(0);
    this.revealed = uniform(0);
    const mm = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
    const ink = texture(this.marks.tex).r;
    mm.colorNode = vec3(0.4); mm.opacityNode = ink.mul(0.25);
    mm.emissiveNode = amberNode().mul(ink).mul(memoryMask(positionWorld)).mul(2.6);
    const markPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.12), mm);
    markPlane.position.set(x - 0.125, 1.06, z - hw - 0.05 - 0.12); markPlane.rotation.y = -Math.PI / 2;
    markPlane.renderOrder = 5;
    g.add(markPlane);
    // the child, standing against the marked jamb
    this.childVis = uniform(0);
    const childMat = rimMaterial(this.childVis);
    // the child from Codex's people.glb (person_2: child with a school bag); procedural fallback
    try {
      const gltf = await new GLTFLoader().loadAsync('/models/people.glb');
      const src = gltf.scene.getObjectByName('person_2');
      if (!src) throw new Error('person_2 missing');
      this.child = src.clone(true);
      this.child.position.set(0, 0, 0); this.child.rotation.set(0, 0, 0);
      this.child.traverse((o) => {
        if (!o.isMesh) return;
        // smooth normals: the rim light has to roll around the body, not light whole facets
        const g = o.geometry.clone(); g.deleteAttribute('normal'); if (g.attributes.uv) g.deleteAttribute('uv');
        o.geometry = mergeVertices(g, 1e-3); o.geometry.computeVertexNormals();
        o.material = childMat; o.castShadow = false;
      });
      const box3 = new THREE.Box3().setFromObject(this.child);
      this.childBaseH = box3.max.y - box3.min.y || 1;
      const holder = new THREE.Group(); holder.add(this.child); this.child = holder;
    } catch (e) {
      console.warn('[fragment] people.glb child unavailable, procedural child', e.message);
      this.child = childFigure(childMat); this.childBaseH = 0.98;
    }
    // back against the marked jamb, facing the street
    this.child.position.set(x - 0.05, FLOOR, z - hw + 0.16);
    this.child.rotation.y = -Math.PI / 2; // glTF front (+Z) -> faces the street (-X)
    g.add(this.child);
    // now: '已验收。此户已腾空。' pasted on the door, and the house number in chalk; neither exists in the memory
    const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5), noticeMaterial(NOTICES[2], 4));
    notice.position.set(x + 0.025, 1.5, z + 0.1); notice.rotation.y = -Math.PI / 2; notice.rotation.z = 0.04; notice.renderOrder = 4;
    g.add(notice);
    const nc = document.createElement('canvas'); nc.width = 256; nc.height = 96;
    const ng = nc.getContext('2d'); ng.fillStyle = '#000'; ng.fillRect(0, 0, 256, 96);
    ng.fillStyle = '#fff'; ng.font = '600 54px "PingFang SC","Hiragino Sans GB",sans-serif'; ng.fillText('青石-17', 14, 66);
    const nm = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
    nm.colorNode = vec3(0.5); nm.opacityNode = texture(new THREE.CanvasTexture(nc)).r.mul(0.7).mul(float(1).sub(clamp(memoryMask(positionWorld).mul(1.5), 0, 1)));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), nm);
    num.position.set(x - 0.11, 1.85, z + hw + 0.32); num.rotation.y = -Math.PI / 2; num.renderOrder = 4;
    g.add(num);
    // the porch light of the past: off now; in the memory it comes on and lights the doorway warm
    this.porch = new THREE.SpotLight(0xffa45a, 0, 3.6, 0.62, 0.8, 2);
    this.porch.position.set(x - 0.3, DOOR.h + 0.26, z);
    this.porch.target.position.set(x - 0.45, 0, z - 0.1);
    g.add(this.porch.target);
    g.add(this.porch);
    const bulbMat = new THREE.MeshStandardNodeMaterial({ color: 0x111111, roughness: 0.4 });
    this.porchGlow = uniform(0);
    bulbMat.emissiveNode = amberNode().mul(this.porchGlow).mul(6);
    box(0.16, 0.1, 0.16, bulbMat, x - 0.12, DOOR.h + 0.32, z);
    scene.add(g);

    this.center = new THREE.Vector3(x, 1.2, z);
    this.dwell = 0; this.state = 'idle'; this.t = 0; this.shown = 0;
    ctx.api.fragment = this;
  },

  update(dt, time, ctx) {
    const m = ctx.memory;
    const lit = memoryMaskCPU(this.center, m);
    if (this.state === 'idle') {
      this.dwell = lit > 0.45 ? this.dwell + dt : Math.max(0, this.dwell - dt * 0.5);
      // only after the street has been looked at for a while (or when the director forces the return to the door)
      const ready = !ctx.api.director || (ctx.api.director.lookTime ?? 0) > 35 || ctx.isShot;
      if (ready && this.dwell > 2.5 && m.strength > 0.5) { this.state = 'playing'; this.t = 0; ctx.api.audio?.play('servo'); }
      return;
    }
    if (this.state === 'done' && this.crowdBack !== undefined && this.crowdBack < 1) {
      this.crowdBack = Math.min(1, this.crowdBack + dt / 4); crowd.value = this.crowdBack; // people drift back slowly
    }
    if (this.state === 'playing') {
      this.t += dt;
      // the robot takes over: aim the eye at the current mark (look values tuned for the over-shoulder framing)
      const step = Math.min(MARKS.length, 1 + Math.floor(Math.max(0, this.t - 3) / 2.2));
      const target = MARKS[step - 1];
      // closed-loop aim: nudge the head until the eye's axis points at the current mark (no guessed constants)
      this.aim ??= { x: 0, y: 0.1 };
      this._want ??= new THREE.Vector3();
      this._want.set(DOOR.x - 0.1, target.y, DOOR.z - DOOR.w / 2 - 0.05).sub(m.origin).normalize();
      const yawErr = Math.atan2(this._want.z, this._want.x) - Math.atan2(m.dir.z, m.dir.x);
      const pitchErr = Math.asin(this._want.y) - Math.asin(m.dir.y);
      this.aim.x += yawErr * dt * 2.2;     // +look.x turns the head toward +z in world (verified by the probe)
      this.aim.y += pitchErr * dt * 2.2;
      this.aim.x = THREE.MathUtils.clamp(this.aim.x, -0.8, 0.8); this.aim.y = THREE.MathUtils.clamp(this.aim.y, -0.8, 0.8);
      m.lookOverride = this.aim;
      m.forceOpen = true;
      m.goboMode = this.t > 1.5 ? 'line' : undefined;
      // the porch light warms up first, then the child steps in and grows with the marks
      const glow = Math.min(1, this.t / 2.5);
      // the street empties around the door: only the child stays
      const endT = 3 + MARKS.length * 2.2 + 2.5;
      crowd.value = Math.max(0, 1 - this.t / 2); // the street stays empty through the doorway's last beat
      this.porch.intensity = 5 * glow * glow; this.porchGlow.value = glow;
      // the child grows with the marks
      this.childVis.value = Math.min(1, Math.max(0, (this.t - 2) / 1.5));
      this.child.scale.setScalar(target.h / this.childBaseH);
      if (step !== this.shown) { this.shown = step; this.marks.draw(step); ctx.api.audio?.play('click'); }
      const end = 3 + MARKS.length * 2.2 + 2.5;
      if (this.t > end) {
        // the marks stop; the child is gone; the line stays on the last mark a moment, then control returns
        this.childVis.value = Math.max(0, 1 - (this.t - end) / 1.2);
        // empty doorway, light still on, '十一岁' still there... then the porch light fails like the street lamps
        const k = this.t - end;
        const flick = k < 4 ? 1 : k < 5.4 ? (Math.sin(k * 41) * Math.sin(k * 13) > 0.1 ? 1 : 0.08) : 0;
        this.porch.intensity = 5 * flick; this.porchGlow.value = flick;
        if (k > 5.6 && k - dt <= 5.6) ctx.api.audio?.play('click');
        if (this.t > end + 7) { this.state = 'done'; this.crowdBack = 0; m.lookOverride = undefined; m.forceOpen = undefined; m.goboMode = undefined; }
      }
    }
  },
};
