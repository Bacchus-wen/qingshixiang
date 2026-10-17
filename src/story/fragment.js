import * as THREE from 'three/webgpu';
import { texture, vec3, float, mix, uniform, positionWorld, normalView, positionViewDirection, abs, dot, pow, lights, smoothstep, clamp, mx_noise_float, normalWorld, vec2 } from 'three/tsl';
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
  { h: 1.10, label: '五岁' }, { h: 1.17, label: '六岁' }, { h: 1.24, label: '七岁' }, { h: 1.30, label: '八岁' },
  { h: 1.36, label: '九岁' }, { h: 1.42, label: '十岁' }, { h: 1.48, label: '十一岁' },
].map((m) => ({ ...m, y: FLOOR + m.h }));

function marksTexture(count) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  const draw = (n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 1024);
    // v3 (critique r4): a pencil and a child's handwriting, not HUD type
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 4.5; g.lineCap = 'round';
    g.font = '400 26px "Kaiti SC","STKaiti","KaiTi","PingFang SC",serif';
    if (n > 0) { // the name, written once up the jamb in the same hand
      g.save(); g.globalAlpha = 0.5; g.translate(30, 1024 - (1.78 / 2.12) * 1024); g.font = '400 28px "Kaiti SC","STKaiti","KaiTi",serif';
      for (const [k, ch] of [...'小宁'].entries()) g.fillText(ch, 0, k * 30); g.restore();
    }
    MARKS.slice(0, n).forEach((m, i) => {
      const y = 1024 - (m.y / 2.12) * 1024;
      const cur = i === n - 1;
      // pencil: two slightly offset light passes per line, every year still legible (review5), this year darkest
      g.globalAlpha = cur ? 0.9 : 0.7;
      // r20: hand-drawn, not a barcode: each year's line a different length and start
      const x0 = 14 + ((i * 37) % 13) - 6, x1 = 70 + ((i * 53) % 46);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y + (i % 2 ? 3 : -2)); g.stroke();
      g.globalAlpha *= 0.45; g.beginPath(); g.moveTo(x0 + 4, y + 1.5); g.lineTo(x1 - 6, y + 1 + (i % 2 ? 3 : -2)); g.stroke();
      g.globalAlpha = cur ? 1 : 0.7;
      g.font = cur ? '400 38px "Kaiti SC","STKaiti","KaiTi","PingFang SC",serif' : '400 24px "Kaiti SC","STKaiti","KaiTi","PingFang SC",serif';
      g.fillText(m.label, 124, y + (cur ? 12 : 8));
    });
    g.globalAlpha = 1; tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  draw(count);
  return { tex, draw };
}

// unlit black with an amber rim, visible only inside the cone (same language as the ghosts)
function rimMaterial(extraMask, headStart = null) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.lightsNode = lights([]);
  m.colorNode = vec3(0);
  let rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 6.0);
  // the head stays a plain dark shape: a rimmed sphere read as a hole against the lit door
  if (headStart) rim = rim.mul(float(1).sub(smoothstep(headStart, headStart.add(0.05), positionWorld.y).mul(0.85)));
  const mask = memoryMask(positionWorld).mul(extraMask);
  m.emissiveNode = amberNode().mul(rim.mul(1.1)).mul(mask); // a faint thin outline (as dim as the pencil marks)
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
    // review5: the marks sat on blue wall tiles beside a black jamb. The frame is now a wide board of old pale
    // painted wood (worn through to grey grain in places), so pencil reads on it like it would on a real door frame.
    const frameMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
    {
      const P = positionWorld;
      const grain = mx_noise_float(vec3(P.z.mul(90), P.y.mul(2.5), P.x.mul(90))).mul(0.5).add(0.5);
      const worn = smoothstep(0.5, 0.62, mx_noise_float(P.mul(vec3(30, 8, 30)).add(3.3)).mul(0.5).add(0.5));
      const paint = vec3(0.34, 0.3, 0.24).mul(grain.mul(0.3).add(0.8));
      const bare = vec3(0.16, 0.13, 0.1).mul(grain.mul(0.6).add(0.55));
      frameMat.colorNode = mix(paint, bare, worn.mul(0.35));
      frameMat.emissiveNode = frameMat.colorNode.mul(amberNode()).mul(memoryMask(positionWorld)).mul(0.08);
    }
    // v3: the door itself (GPT Image 2.5 texture): peeling green planks, a faded 福, couplet remnants -- and a cartoon
    // sticker at a child's height
    const leafTex = new THREE.TextureLoader().load('/textures/door_leaf.jpg'); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 8;
    const doorMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.62 });
    doorMat.colorNode = texture(leafTex).rgb.mul(0.75);
    // inside the memory the door leaf takes a little amber, so the dark child has something to stand against
    doorMat.emissiveNode = texture(leafTex).rgb.mul(amberNode()).mul(memoryMask(positionWorld)).mul(0.4); // the remembered door, warmly lit
    const g = this.group = new THREE.Group();
    const box = (w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; o.layers.enable(1); g.add(o); return o; };
    const x = DOOR.x, z = DOOR.z, hw = DOOR.w / 2;
    box(0.14, DOOR.h + 0.1, 0.1, frameMat, x - 0.05, (DOOR.h + 0.1) / 2, z - hw - 0.05);     // jamb (marked)
    box(0.03, DOOR.h + 0.1, 0.5, frameMat, x - 0.135, (DOOR.h + 0.1) / 2, z - hw - 0.17);  // the wide casing board the marks are on
    box(0.14, DOOR.h + 0.1, 0.1, frameMat, x - 0.05, (DOOR.h + 0.1) / 2, z + hw + 0.05);     // jamb
    box(0.14, 0.12, DOOR.w + 0.3, frameMat, x - 0.05, DOOR.h + 0.1, z);                      // lintel
    box(0.06, DOOR.h, DOOR.w, doorMat, x + 0.06, DOOR.h / 2, z);                          // door, recessed
    box(0.4, 0.12, DOOR.w + 0.3, wood, x - 0.2, 0.06 + 0.14, z);                          // step
    // the marks: faint pencil scratches now, amber writing in the light
    this.marks = marksTexture(0);
    this.revealed = uniform(0);
    // drawn into the casing board's own material (a separate decal plane z-fought and washed out): graphite is
    // darker and a little glossier than the paint; in the light it takes a faint warm sheen
    {
      const P = positionWorld;
      const u = P.z.sub(z - hw - 0.42).div(0.5), v = P.y.div(2.12);
      const onBoard = u.greaterThan(0).and(u.lessThan(1)).and(normalWorld.x.lessThan(-0.5)).and(P.x.lessThan(x - 0.13));
      const ink = onBoard.select(texture(this.marks.tex, vec2(u, v)).r, float(0));
      const wood0 = frameMat.colorNode, glow0 = frameMat.emissiveNode;
      frameMat.colorNode = mix(wood0, vec3(0.035, 0.033, 0.03), ink.mul(0.75));
      frameMat.roughnessNode = mix(float(0.7), float(0.62), ink);
      frameMat.emissiveNode = glow0.mul(float(1).sub(ink)); // graphite never glows (it read as light lines once the porch light died)
    }
    // the child, standing against the marked jamb
    this.childVis = uniform(0);
    this.childHead = uniform(9);
    const childMat = rimMaterial(this.childVis, this.childHead);
    // review5: the adult-proportioned figure read as a black mannequin in the close-up. The child is now only a
    // shadow: its mesh lives on layer 3, which the camera never renders but the memory key light's shadow does.
    const childShadowMat = new THREE.MeshBasicNodeMaterial({ color: 0x000000 });
    // the child from Codex's people.glb (person_2: child with a school bag); procedural fallback
    try {
      // v3: the same child, subdivided and smoothed in Blender (tools: /tmp child.py; critique r4 "blocky")
      const gltf = await new GLTFLoader().loadAsync('/models/child_smooth.glb').catch(() => new GLTFLoader().loadAsync('/models/people.glb'));
      const src = gltf.scene.getObjectByName('person_2');
      if (!src) throw new Error('person_2 missing');
      this.child = src.clone(true);
      this.child.position.set(0, 0, 0); this.child.rotation.set(0, 0, 0);
      this.child.traverse((o) => {
        if (!o.isMesh) return;
        // smooth normals: the rim light has to roll around the body, not light whole facets
        const g = o.geometry.clone(); g.deleteAttribute('normal'); if (g.attributes.uv) g.deleteAttribute('uv');
        o.geometry = mergeVertices(g, 1e-3); o.geometry.computeVertexNormals();
        o.material = childShadowMat; o.castShadow = true; o.layers.set(3); // shadow only (see the memory key below)
      });
      const box3 = new THREE.Box3().setFromObject(this.child);
      this.childBaseH = box3.max.y - box3.min.y || 1;
      const holder = new THREE.Group(); holder.add(this.child); this.child = holder;
    } catch (e) {
      console.warn('[fragment] people.glb child unavailable, procedural child', e.message);
      this.child = childFigure(childShadowMat); this.childBaseH = 0.98;
      this.child.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.set(3); } });
    }
    // back against the marked jamb, facing the street
    // inside the doorway, tight to the marked jamb: the frame crops the near half of the body
    this.child.position.set(x - 0.22, FLOOR, z - hw + 0.07); // in front of the door leaf, back to the jamb
    this.child.rotation.y = -Math.PI / 2; // glTF front (+Z) -> faces the street (-X)
    g.add(this.child);
    // now: '已验收。此户已腾空。' pasted on the door, and the house number in chalk; neither exists in the memory
    const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5), noticeMaterial(NOTICES[2], 4));
    notice.position.set(x + 0.025, 1.5, z + 0.1); notice.rotation.y = -Math.PI / 2; notice.rotation.z = 0.04; notice.renderOrder = 4;
    notice.material.colorNode = notice.material.colorNode.mul(0.5); // r20: it was the brightest thing after the light died
    g.add(notice); this.notice = notice; // hidden while the memory plays: it would be the brightest thing in the close-up
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
    // the memory's key light: from across the street, level with the marks, it throws the child's shadow onto the
    // door leaf beside the frame. Present from init (light count never changes), dark until the memory plays.
    this.key = new THREE.SpotLight(0xffb27a, 0, 7, 0.42, 0.55, 1.2);
    this.key.position.set(x - 2.6, FLOOR + 1.3, z - hw + 0.25);
    this.key.target.position.set(x + 0.05, FLOOR + 1.0, z - hw + 0.2);
    this.key.castShadow = true; this.key.shadow.mapSize.setScalar(1024);
    this.key.shadow.camera.near = 0.5; this.key.shadow.camera.far = 7; this.key.shadow.bias = -0.0008;
    this.key.shadow.camera.layers.enable(3); // its own mask (layer 0 + 3): sees the street and the shadow-only child
    this.key.shadow.autoUpdate = false;
    g.add(this.key.target); g.add(this.key);
    const bulbMat = new THREE.MeshStandardNodeMaterial({ color: 0x111111, roughness: 0.4 });
    this.porchGlow = uniform(0);
    bulbMat.emissiveNode = amberNode().mul(this.porchGlow).mul(2.5);
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
    if (this.notice) this.notice.visible = this.state !== 'playing';
    if (this.state === 'playing') {
      this.t += dt;
      // the robot takes over: aim the eye at the current mark (look values tuned for the over-shoulder framing)
      const step = Math.min(MARKS.length, 1 + Math.floor(Math.max(0, this.t - 3) / 2.2));
      const target = MARKS[step - 1];
      // closed-loop aim: nudge the head until the eye's axis points at the current mark (no guessed constants)
      this.aim ??= { x: 0, y: 0.1 };
      this._want ??= new THREE.Vector3();
      this._want.set(DOOR.x - 0.1, target.y - 0.005, DOOR.z - DOOR.w / 2 - 0.3).sub(m.origin).normalize(); // r20: onto the pencil line, not its label
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
      this.key.intensity = 6 * glow * glow; this.key.shadow.autoUpdate = true;
      // the child grows with the marks
      this.childVis.value = Math.min(1, Math.max(0, (this.t - 2) / 1.5));
      this.child.scale.setScalar(target.h / this.childBaseH);
      this.child.visible = this.childVis.value > 0.4;
      this.childHead.value = FLOOR + target.h * 0.86; // where the neck ends
      if (step !== this.shown) { this.shown = step; this.marks.draw(step); ctx.api.audio?.play('click'); }
      const end = 3 + MARKS.length * 2.2 + 2.5;
      this.endT = end;
      if (this.t > end) {
        // the marks stop; the child is gone; the line stays on the last mark a moment, then control returns
        this.childVis.value = Math.max(0, 1 - (this.t - end) / 1.2);
        this.child.visible = this.childVis.value > 0.4;
        // empty doorway, light still on, '十一岁' still there... then the porch light fails like the street lamps
        const k = this.t - end;
        const flick = k < 4 ? 1 : k < 5.4 ? (Math.sin(k * 41) * Math.sin(k * 13) > 0.1 ? 1 : 0.08) : 0;
        this.porch.intensity = 5 * flick; this.porchGlow.value = flick; this.key.intensity = 6 * flick;
        if (k > 5.6 && k - dt <= 5.6) ctx.api.audio?.play('click');
        if (this.t > end + 7) { this.key.intensity = 0; this.key.shadow.autoUpdate = false; this.state = 'done'; this.crowdBack = 0; m.lookOverride = undefined; m.forceOpen = undefined; m.goboMode = undefined; }
      }
    }
  },
};
