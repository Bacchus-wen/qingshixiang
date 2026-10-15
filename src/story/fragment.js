import * as THREE from 'three/webgpu';
import {
  texture, vec3, float, mix, uniform, positionWorld, normalView, positionViewDirection, abs, dot, pow, lights, smoothstep,
} from 'three/tsl';
import { memoryMask, memoryMaskCPU, amberNode } from '../materials/memory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { crowd } from '../systems/ghosts/index.js';

// The one memory with a story: the door across the street, its frame scored with a child's heights.
// Hold the beam on it and the robot takes over: its eye narrows to a level line, the child appears against the
// frame and grows one mark at a time, year by year, until the marks stop.
const DOOR = { x: 5.0, z: -14.2, w: 0.96, h: 2.12 };
const MARKS = [
  { y: 0.98, label: '小宁 五岁' }, { y: 1.06, label: '六岁' }, { y: 1.13, label: '七岁' }, { y: 1.21, label: '八岁' },
  { y: 1.28, label: '九岁' }, { y: 1.36, label: '十岁' }, { y: 1.41, label: '十一岁' },
];

function marksTexture(count) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  const draw = (n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 1024);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
    g.font = '600 30px "PingFang SC","Hiragino Sans GB",sans-serif';
    MARKS.slice(0, n).forEach((m, i) => {
      const y = 1024 - (m.y / 2.12) * 1024;
      g.globalAlpha = i === n - 1 ? 1 : 0.75;
      g.beginPath(); g.moveTo(14, y); g.lineTo(118, y + (i % 2 ? 3 : -2)); g.stroke();
      g.fillText(m.label, 124, y + 10);
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
  const rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.5);
  const mask = memoryMask(positionWorld).mul(extraMask);
  m.emissiveNode = amberNode().mul(rim.mul(2.2).add(0.08)).mul(mask);
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
    const box = (w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
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
    this.child.position.set(x - 0.17, 0.2, z - hw - 0.05);
    this.child.rotation.y = -Math.PI / 2; // glTF front (+Z) -> faces the street (-X)
    g.add(this.child);
    // the porch light of the past: off now; in the memory it comes on and lights the doorway warm
    this.porch = new THREE.PointLight(0xffa45a, 0, 4.5, 2);
    this.porch.position.set(x - 0.35, DOOR.h + 0.28, z);
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
      if (this.dwell > 2.5 && m.strength > 0.5) { this.state = 'playing'; this.t = 0; ctx.api.audio?.play('servo'); }
      return;
    }
    if (this.state === 'playing') {
      this.t += dt;
      // the robot takes over: aim the eye at the current mark (look values tuned for the over-shoulder framing)
      const step = Math.min(MARKS.length, 1 + Math.floor(Math.max(0, this.t - 3) / 2.2));
      const target = MARKS[step - 1];
      // closed-loop aim: nudge the head until the eye's axis points at the current mark (no guessed constants)
      this.aim ??= { x: 0, y: 0.1 };
      this._want ??= new THREE.Vector3();
      this._want.set(DOOR.x - 0.12, target.y + 0.03, DOOR.z - DOOR.w / 2 - 0.05).sub(m.origin).normalize();
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
      crowd.value = this.t < endT ? Math.max(0, 1 - this.t / 2) : Math.min(1, (this.t - endT) / 3);
      this.porch.intensity = 5 * glow * glow; this.porchGlow.value = glow;
      // the child grows with the marks
      this.childVis.value = Math.min(1, Math.max(0, (this.t - 2) / 1.5));
      this.child.scale.setScalar((target.y - 0.02) / this.childBaseH);
      if (step !== this.shown) { this.shown = step; this.marks.draw(step); ctx.api.audio?.play('click'); }
      const end = 3 + MARKS.length * 2.2 + 2.5;
      if (this.t > end) {
        // the marks stop; the child is gone; the line stays on the last mark a moment, then control returns
        this.childVis.value = Math.max(0, 1 - (this.t - end) / 1.5);
        const off = Math.max(0, 1 - (this.t - end) / 3); this.porch.intensity = 5 * off * off; this.porchGlow.value = off;
        if (this.t > end + 3) { crowd.value = 1; this.state = 'done'; m.lookOverride = undefined; m.forceOpen = undefined; m.goboMode = undefined; }
      }
    }
  },
};
