import * as THREE from 'three/webgpu';
import { LANE } from './index.js';
import { placeProps } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, vec3, float, mix, uniform, clamp } from 'three/tsl';
import { memoryMask, amberNode, mains } from '../../materials/memory.js';

// The demolition mark: '拆' sprayed in a circle. In the present it is on every other wall; inside the eye's cone
// (the past, before the notices) the paint is simply not there yet.
function chaiMaterial(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineWidth = 15; g.lineCap = 'round';
  g.beginPath(); g.ellipse(128, 128, 104 + (seed % 3) * 4, 98, (seed % 5) * 0.1, 0.25, Math.PI * 2 - 0.1); g.stroke();
  g.font = '700 150px "PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('拆', 130, 136);
  // drips running down from the paint
  for (let i = 0; i < 6; i++) { const x = 60 + ((seed * 37 + i * 29) % 140); g.fillRect(x, 150 + (i % 3) * 10, 4, 40 + ((seed + i * 13) % 50)); }
  const tex = new THREE.CanvasTexture(c);
  const paint = texture(tex).r;
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.4 });
  m.colorNode = vec3(0.42); // pale spray paint (the real ones are red or white; this world has no red)
  m.opacityNode = paint.mul(0.8).mul(float(1).sub(clamp(memoryMask().mul(1.4), 0, 1)));
  return m;
}

// Relocation notices (texts from docs/research-relocation-grok.md, place names fictional). They are pasted on
// walls and shutters now; inside the cone (the past) they have not been put up yet.
export const NOTICES = [
  ['青石巷房屋征收决定公告', '范围:青石巷双号、槐树街1至17号。', '签约:三月一日至二十日下午五时。', '请按期签约并腾空。'],
  ['腾 空 通 知', '十五日内搬离物品,交回钥匙。', '水电气销户后不得自行接回。', '编号:青石-17'],
  ['已 验 收', '此户已腾空。', '闲人免进。'],
  ['公 告', '自本公告贴出之日起,', '青石巷暂停新办营业、装修', '和改作他用。'],
  ['水表、电表已拆回,管线封堵。', '结算请携编号至巷口登记处。'],
];
export function noticeMaterial(lines, seed = 0) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, 256, 360);
  // rain-soaked: darker blotches and a torn corner
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(60,60,60,${0.06 + ((seed * 7 + i * 13) % 10) / 80})`; g.beginPath(); g.ellipse((seed * 31 + i * 57) % 256, (seed * 17 + i * 91) % 360, 30 + i * 4, 18 + i * 3, i, 0, 7); g.fill(); }
  g.fillStyle = '#222'; g.textAlign = 'center';
  g.font = '600 24px "PingFang SC","Songti SC","Noto Sans SC",serif'; g.fillText(lines[0], 128, 54);
  g.font = '16px "PingFang SC","Songti SC","Noto Sans SC",serif';
  lines.slice(1).forEach((l, i) => g.fillText(l, 128, 104 + i * 34));
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(256, 360); g.lineTo(256 - 50 - (seed % 3) * 15, 360); g.lineTo(256, 360 - 70); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const t = texture(tex);
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.75 });
  const lum = t.r.mul(0.3).add(t.g.mul(0.59)).add(t.b.mul(0.11));
  m.colorNode = vec3(lum.mul(0.55));
  m.opacityNode = t.a.mul(float(1).sub(clamp(memoryMask().mul(1.5), 0, 1)));
  return m;
}

// The abandoned car remembers itself: in the cone its open door swings shut around the hinge and the headlamps
// come on; when the light leaves it falls back to the present half a beat late (driven in street update()).
export function setupPastCar(ctx, car) {
  if (!car) return;
  car.traverse((o) => { o.userData.dynamic = true; }); // animated: keep out of the static merge
  const door = car.getObjectByName('door_fl');
  let pivot = null;
  if (door) {
    // hinge from tools/blender/props.py (Blender (-0.825,-0.79,0.72) -> glTF (-0.825, 0.72, 0.79)), opened 50 deg
    pivot = new THREE.Group(); pivot.position.set(-0.825, 0, 0.79);
    door.parent.add(pivot); pivot.attach(door);
  }
  const glow = uniform(0);
  const lampMat = new THREE.MeshStandardNodeMaterial({ color: 0x111111, roughness: 0.3 });
  lampMat.emissiveNode = amberNode().mul(glow).mul(4);
  if (car.userData.prop === 'v2/sedan') {
    // r19: the Tripo Santana (door already hanging open, leaves on the roof); lamps at its grille end (local +x)
    const ry = car.rotation.y; car.rotation.y = 0; car.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(car); car.rotation.y = ry;
    const fx = b.max.x - car.position.x, h = b.max.y - b.min.y, cz = (b.min.z + b.max.z) / 2 - car.position.z, half = (b.max.z - b.min.z) / 2;
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.2), lampMat);
      l.position.set(fx - 0.04, h * 0.42, cz + s * half * 0.62); l.userData.dynamic = true; car.add(l);
    }
  } else for (const x of [-0.58, 0.58]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.03), lampMat);
    l.position.set(x, 0.66, 2.09); l.userData.dynamic = true; car.add(l);
  }
  car.updateMatrixWorld(true);
  ctx.api.pastCar = { car, pivot, glow, center: new THREE.Vector3().setFromMatrixPosition(car.matrixWorld).setY(0.8), past: 0, grace: 0 };
}

// dead plants come back into leaf inside the cone (the leaves simply are not there in the present)
function setupPastPlants(planters) {
  if (!planters) return;
  // r19: the leaf shadows were the biggest shape on the marked door frame during the climax
  planters.traverse((o) => { o.castShadow = false; });
  const leafMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a3a38, roughness: 0.65, side: THREE.DoubleSide });
  if (new URLSearchParams(location.search).get('leafdbg') === null) leafMat.maskNode = memoryMask().greaterThan(0.3);
  // pot centres and heights from tools/blender/props2.py (Blender (x, y, h) -> glTF (x, h, -y))
  for (const [cx, cy, h, n] of [[-0.63, 0, 0.27, 70], [-0.12, 0.025, 0.34, 90]]) {
    const leaves = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.CircleGeometry(0.03, 7); g.scale(1.25, 0.55, 1); // an oval leaf, not a paper square
      const a = i * 2.39996, r = 0.05 + ((i * 37) % 13) / 13 * 0.14, y = h + 0.05 + ((i * 53) % 17) / 17 * 0.32;
      g.rotateX((i % 5) * 0.6); g.rotateY(a + 0.5); g.translate(cx + Math.cos(a) * r, y, -cy + Math.sin(a) * r);
      leaves.push(g);
    }
    const m = new THREE.Mesh(mergeGeometries(leaves), leafMat);
    m.userData.dynamic = true; m.castShadow = false; // (r19: no leaf shadows on the marked frame)
    planters.add(m);
  }
}

// Shop fascia signs: dead grey plates now; inside the eye's cone the old names light up in amber.
const NAMES = ['张记面馆', '光明照相', '修表配钥匙', '和平理发', '永安旅社', '新华书店', '老周中药', '星光茶室', '平安五金', '春来裁缝',
  '红星电器', '东风粮油', '向阳副食', '大众浴池', '兴隆饭店', '光华眼镜', '老街修车', '明月糕点', '好运烟酒', '春光文具'];
function signMaterial(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 112);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${name.length > 4 ? 60 : 72}px "PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif`;
  g.fillText(name.split('').join(' '), 256, 60);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(10, 10, 492, 92);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
  const letters = texture(tex).r;
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  m.colorNode = vec3(mix(float(0.09), float(0.16), letters));
  const mask = memoryMask();
  m.emissiveNode = amberNode().mul(mask).mul(letters.mul(3.2).add(0.12));
  return m;
}

// Street clutter that says "people were here": AC units, pipes, dead signs, sagging cables, poles,
// a traffic light still cycling, a vending machine, an abandoned car, and the few light sources.
function add(parent, geo, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Sagging cable between two points as a thin tube along a catenary-ish curve.
function cable(parent, a, b, sag, mat, r = 0.012) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 4), mat);
  m.castShadow = true;
  m.userData.dynamic = true; m.userData.cable = true; // wind sways it (systems/wind)
  parent.add(m);
}

export async function buildDetails(ctx, root, facades, M, r) {
  const props = []; // [name, x, y, z, ry, extra] placed from Blender glbs at the end
  const { scene } = ctx;
  const L = LANE;
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x0d0d0d, roughness: 0.55, metalness: 0.4 });
  const pale = new THREE.MeshStandardNodeMaterial({ color: 0x4e4e4c, roughness: 0.5 }); // dead signs: dirty, never paper-white in the beam
  const acGeo = new THREE.BoxGeometry(0.35, 0.55, 0.8);
  const signGeo = new THREE.BoxGeometry(0.18, 1.8, 0.55);
  const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);

  // every shop gets its own name; the two shops straight across from the robot are the ones with small
  // memories (story/micro.js): the photo studio and the noodle shop
  const shops = facades.filter((f) => f.shop);
  const across = shops.filter((f) => f.side > 0).sort((a, b) => Math.abs(a.z + 13.5) - Math.abs(b.z + 13.5));
  const fixed = new Map([[across[0], '光明照相'], [across[1], '张记面馆']]);
  const pool = NAMES.filter((n) => ![...fixed.values()].includes(n));
  let poolIdx = 0;
  for (const f of shops) f.signName = fixed.get(f) ?? pool[poolIdx++ % pool.length];
  const signMatCache = new Map();
  const signMatFor = (name) => { if (!signMatCache.has(name)) signMatCache.set(name, signMaterial(name)); return signMatCache.get(name); };
  const chaiMats = [0, 1, 2].map(chaiMaterial);
  const noticeMats = NOTICES.map((n, i) => noticeMaterial(n, i));
  let noticeN = 0;
  let chaiN = 0;
  for (const f of facades) {
    const s = f.side;
    if (r() < 0.55) {
      // demolition mark on the wall (or the shutter), at chest-to-head height
      const ch = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), chaiMats[chaiN++ % 3]);
      const onShutter = f.shop && r() < 0.5;
      ch.position.set(f.frontX + s * (onShutter ? 0.96 : -0.02), onShutter ? 1.6 : 4.4 + r() * 0.8, f.z + (r() - 0.5) * Math.max(0, f.w - 2));
      ch.rotation.y = -s * Math.PI / 2; ch.rotation.z = (r() - 0.5) * 0.15;
      ch.renderOrder = 4; ch.userData.dynamic = true; // keep out of the static merge (transparent, own material)
      root.add(ch);
      (ctx.api.chai ??= []).push(ch);
    }
    if (r() < 0.6) {
      // a notice or two pasted at eye height (on the shutter if there is one)
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.59), noticeMats[noticeN++ % noticeMats.length]);
      const onShutter = f.shop;
      nm.position.set(f.frontX + s * (onShutter ? 0.97 : -0.02), 1.55 + r() * 0.2, f.z + (r() - 0.5) * Math.max(0, f.w - 1.6));
      nm.rotation.y = -s * Math.PI / 2; nm.rotation.z = (r() - 0.5) * 0.08;
      nm.renderOrder = 4; nm.userData.dynamic = true;
      root.add(nm);
    }
    if (f.shop) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(f.w - 1, 3.6), 0.62), signMatFor(f.signName));
      sign.position.set(f.frontX - s * 0.04, 3.5, f.z);
      sign.rotation.y = -s * Math.PI / 2;
      sign.receiveShadow = true;
      root.add(sign);
      (ctx.api.signs ??= []).push({ name: f.signName, side: s, x: f.frontX, z: f.z, w: f.w });
    }
    // AC units on upper floors
    for (let fl = 1; 3.2 + fl * 3.1 < f.h - 1; fl++) {
      if (r() < 0.45) props.push(['cc/ac_unit', f.frontX - s * 0.05, 3.2 + fl * 3.1 - 1.9, f.z + (r() - 0.5) * (f.w - 1), -s * Math.PI / 2]);
    }
    // a downpipe at one edge
    if (r() < 0.6) {
      const p = add(root, pipeGeo, M.rust, f.frontX - s * 0.1, f.h / 2, f.z + f.w / 2 - 0.2);
      p.scale.y = f.h;
    }
    // dead vertical sign sticking out over the walkway
    if (r() < 0.45) {
      const y = 4.5 + r() * 3;
      add(root, signGeo, r() < 0.5 ? dark : pale, f.frontX - s * 0.45, y, f.z + (r() - 0.5) * (f.w - 1.5));
      add(root, new THREE.BoxGeometry(0.5, 0.04, 0.04), dark, f.frontX - s * 0.2, y + 0.8, f.z);
    }
  }

  // utility poles on the right walk with cables to the facades and across the lane
  const wire = new THREE.MeshStandardNodeMaterial({ color: 0x050505, roughness: 0.6 });
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.15, 9, 8);
  const poles = [];
  for (let z = 8; z > L.zEnd + 5; z -= 15) {
    if (Math.abs(z - L.crossZ) < L.crossHalf + 2) continue;
    const x = L.halfRoad + 0.35;
    add(root, poleGeo, M.rust, x, 4.5, z);
    add(root, new THREE.BoxGeometry(1.4, 0.08, 0.08), dark, x, 8.4, z);
    poles.push(new THREE.Vector3(x, 8.3, z));
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    for (const dy of [0, -0.25, -0.5]) cable(root, poles[i].clone().setY(8.3 + dy), poles[i + 1].clone().setY(8.3 + dy), 0.6 + r() * 0.4, wire);
    const fl = facades.filter((f) => f.side < 0 && Math.abs(f.z - poles[i].z) < 5)[0];
    if (fl) cable(root, poles[i], new THREE.Vector3(fl.frontX, Math.min(fl.h - 0.5, 7.5), fl.z), 1.2, wire);
  }

  // abandoned car: door open, flat tyres, left mid-lane at an angle
  const car = new THREE.Group();
  car.position.set(0.9, 0, -18); car.rotation.y = 0.18;
  root.add(car);
  if (ctx.params.get('nov2props') !== null) props.push(['car', 0.9, 0, -18, 0.18 + Math.PI]); // the old procedural car only without the Tripo props

  // vending machine: the only thing in the street still powered
  const vmZ = -8.5, vmX = -(L.halfRoad + L.walk) + 0.5;
  props.push(['vending', vmX - 0.05, L.curb, vmZ, Math.PI / 2]);
  // r19: the panel was a blank white rectangle. Now a backlit drinks display: half the slots sold out years ago,
  // a few faded bottles left, price tags, a dusty glass (canvas texture, emissive)
  const vc = document.createElement('canvas'); vc.width = 256; vc.height = 384;
  const vg = vc.getContext('2d');
  const bgG = vg.createLinearGradient(0, 0, 0, 384); bgG.addColorStop(0, '#e8eef2'); bgG.addColorStop(1, '#b9c4cc');
  vg.fillStyle = bgG; vg.fillRect(0, 0, 256, 384);
  vg.fillStyle = '#1d5fa8'; vg.fillRect(0, 0, 256, 46);
  vg.fillStyle = '#f4f7fa'; vg.font = '700 30px "PingFang SC","Hiragino Sans GB",sans-serif'; vg.textAlign = 'center'; vg.fillText('冰镇饮料', 128, 34);
  const cols = ['#c8202a', '#2f8f3a', '#e9862a', '#3a7bd5', '#d8c23a', '#c8202a', '#7a3b8f'];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let row = 0; row < 4; row++) {
    const y0 = 62 + row * 80;
    vg.fillStyle = '#8a959e'; vg.fillRect(8, y0 + 62, 240, 4); // shelf
    for (let k = 0; k < 6; k++) {
      const x0 = 14 + k * 39;
      if (rnd() < 0.45) continue; // sold out
      const c = cols[Math.floor(rnd() * cols.length)];
      vg.fillStyle = c; vg.globalAlpha = 0.75;
      if (rnd() < 0.5) { vg.fillRect(x0 + 6, y0 + 22, 20, 40); vg.fillRect(x0 + 11, y0 + 12, 10, 12); } // bottle
      else { vg.fillRect(x0 + 4, y0 + 30, 24, 32); } // can
      vg.globalAlpha = 1; vg.fillStyle = '#f2f2f2'; vg.fillRect(x0 + 2, y0 + 68, 30, 10);
      vg.fillStyle = '#c11'; vg.font = '600 9px sans-serif'; vg.fillText('¥' + (2 + Math.floor(rnd() * 4)), x0 + 17, y0 + 76);
    }
  }
  // dust and a rain-streaked glass
  for (let i = 0; i < 40; i++) { vg.fillStyle = `rgba(90,96,100,${0.04 + rnd() * 0.08})`; vg.fillRect(rnd() * 256, rnd() * 384, 2 + rnd() * 3, 20 + rnd() * 120); }
  const vtex = new THREE.CanvasTexture(vc); vtex.colorSpace = THREE.SRGBColorSpace;
  const vmMat = new THREE.MeshBasicNodeMaterial();
  vmMat.colorNode = texture(vtex).rgb.mul(1.25).mul(mains);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), vmMat);
  panel.position.set(vmX + 0.38, L.curb + 1.1, vmZ); panel.rotation.y = Math.PI / 2;
  root.add(panel);
  const vmLight = new THREE.PointLight(0xeef2f6, 14, 9, 2);
  vmLight.position.set(vmX + 0.9, L.curb + 1.2, vmZ);
  root.add(vmLight);

  // r19: a dying fluorescent tube on the wall above the robot's corner -- the waiting shot was half pure black.
  // Cold, stuttering every few seconds, it trips with the mains like the rest of the street.
  {
    const fx = -(L.halfRoad + L.walk), fz = -16.4, fy = 3.05;
    const tubeK = uniform(1);
    const tm = new THREE.MeshBasicNodeMaterial(); tm.colorNode = vec3(0.85, 0.95, 1.0).mul(tubeK).mul(2.4);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 10), tm);
    tube.rotation.x = Math.PI / 2; tube.position.set(fx + 0.11, fy, fz);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 1.1), dark); bracket.position.set(fx + 0.04, fy + 0.045, fz);
    root.add(tube, bracket);
    ctx.lightPool?.add({ pos: new THREE.Vector3(fx + 0.45, fy - 0.15, fz), color: new THREE.Color(0.78, 0.9, 1.0), intensity: 6, distance: 7.5,
      alive: 1, importance: 1.5, power: () => {
        const t = performance.now() / 1000, ph = (t + 3.1) % 6.7;
        const k = ph < 0.7 ? (Math.sin(t * 53) * Math.sin(t * 17.3) > 0.15 ? 1 : 0.08) : 0.92 + 0.08 * Math.sin(t * 120);
        tubeK.value = k * mains.value; return k;
      } });
  }

  // traffic light at the crossing, still cycling for nobody (its colour is the one exception, kept tiny)
  const tlx = L.halfRoad + 0.6, tlz = L.crossZ + L.crossHalf + 0.6;
  add(root, new THREE.CylinderGeometry(0.07, 0.07, 4.2, 8), dark, tlx, 2.1, tlz);
  props.push(['traffic_light', tlx, 3.95, tlz, 0]);

  // the cold failing street lamp: main present-day key light
  const lamp = new THREE.SpotLight(0xffc690, 140, 26, 0.62, 0.7, 1); // v3: decay 1, a soft sodium pool instead of a hard ellipse // v2: an old sodium-ish lamp, warm against the blue night
  lamp.position.set(L.halfRoad - 0.3, 6.8, -3); lamp.target.position.set(-0.5, 0, -5);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0004;
  lamp.shadow.autoUpdate = false; lamp.shadow.needsUpdate = true; // the street does not move
  root.add(lamp, lamp.target);
  props.push(['lamp_head', L.halfRoad - 0.3, 6.78, -3, Math.PI / 2], ['lamp_head', -L.halfRoad + 0.4, 6.38, -34, -Math.PI / 2]);
  // glowing lamp heads: bright enough to bloom and to show up in the wet-road reflections
  const bulb = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(9, 9.4, 10) });
  add(root, new THREE.BoxGeometry(0.5, 0.03, 0.16), bulb, L.halfRoad - 0.3, 6.83, -3).castShadow = false;
  add(root, new THREE.BoxGeometry(0.5, 0.03, 0.16), bulb, -L.halfRoad + 0.4, 6.43, -34).castShadow = false;
  ctx.api.streetBulb = bulb;
  add(root, poleGeo, M.rust, L.halfRoad + 0.35, 4.5, -3);
  // a far lamp down the lane, dimmer, so depth reads in silhouettes
  const far = new THREE.SpotLight(0xd6dde6, 100, 26, 0.66, 0.7, 1);
  far.position.set(-L.halfRoad + 0.4, 6.5, -34); far.target.position.set(0.5, 0, -36);
  far.castShadow = false;
  root.add(far, far.target);
  // one lit window, high up, that never goes out
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.2), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.9, 0.88, 0.84) }));
  const wf = facades.find((f) => f.side > 0 && f.z < -45 && f.h > 12) || facades[facades.length - 1];
  win.position.set(wf.frontX - 0.04, wf.h - 2.4, wf.z); win.rotation.y = -Math.PI / 2 * wf.side;
  root.add(win);

  scene.add(new THREE.HemisphereLight(0x5c6470, 0x2a2826, 0.42)); // v3 (Grok r17): neutral cool fill, no purple cast // v3: the haze and real lights carry the night now
  // things people dropped: an umbrella upside down in the road near the robot, one left open against a shutter,
  // soaked flyers and a crate by the shops
  props.push(['umbrella_broken', -1.6, 0, -11.2, 0.7], ['umbrella_open', -(L.halfRoad + L.walk) + 0.6, L.curb, -21.5, 1.2, { rz: 0.35 }],
    ['debris', -(L.halfRoad + 0.6), L.curb, -15.8, 0.4], ['debris', L.halfRoad + 0.7, L.curb, -27, 2.1], ['umbrella_broken', 2.2, 0, -31, 2.6]);
  // traces of the people who lived here (Codex props pack 2), placed where they mean something
  const W = L.halfRoad + L.walk;
  props.push(
    ['props2/shoe', -0.45, 0, -16.5, 2.3],                                  // a child's shoe by the abandoned car
    ['props2/bicycle', -(W - 0.9), L.curb, -20.5, 0.4],
    ['props2/planters', W - 0.55, L.curb, -15.35, -Math.PI / 2],             // dead plants at the home door
    ['props2/mailbox', W - 0.06, 1.15, -13.35, -Math.PI / 2],                // stuffed mailbox by the home door
    ['props2/boxes_moving', W - 0.7, L.curb, -24.5, -Math.PI / 2 + 0.2], ['props2/boxes_moving', -(W - 0.7), L.curb, -6.6, Math.PI / 2 - 0.1],
    ['props2/chair_stool', -(W - 0.8), L.curb, -17.2, Math.PI / 2 + 0.5],
    ['props2/laundry', -(W + 0.05), 6.6, -10.2, Math.PI / 2],
    ['props2/notice_board', -(W - 0.12), L.curb + 0.9, -4.6, Math.PI / 2],
  );
  // v3 (critiques, after targets/present.jpg): the overhead tangle of an old street -- bundles of 5-14 sagging cables
  // strung across the lane between facades, plus runs along the walls. One merged mesh (wind only sways the few
  // individual pole cables), so hundreds of wires cost one draw.
  {
    const rr = (() => { let sd = 0x7a11; return () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296; })();
    const geos = [];
    const wireOf = (a, b, sag, rad) => {
      const pts = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, rad, 3);
      g.deleteAttribute('uv'); return g;
    };
    const W = L.halfRoad + L.walk;
    for (let z = 8; z > -66; z -= 5 + rr() * 6) {
      if (Math.abs(z - L.crossZ) < L.crossHalf + 1) continue;
      const n = 5 + Math.floor(rr() * 10), y0 = 5.2 + rr() * 3.5, skew = (rr() - 0.5) * 4;
      for (let k = 0; k < n; k++) {
        const a = new THREE.Vector3(-W + 0.05, y0 + (rr() - 0.5) * 0.7, z + (rr() - 0.5) * 0.6);
        const b = new THREE.Vector3(W - 0.05, y0 + (rr() - 0.5) * 0.7 + (rr() - 0.5) * 0.8, z + skew + (rr() - 0.5) * 0.6);
        geos.push(wireOf(a, b, 0.5 + rr() * 1.6, 0.008 + rr() * 0.012));
      }
    }
    for (const side of [-1, 1]) for (let z = 6; z > -66; z -= 9 + rr() * 8) { // along the walls, just under the first floor
      const y = 3.15 + rr() * 0.4;
      for (let k = 0; k < 3 + Math.floor(rr() * 4); k++) {
        geos.push(wireOf(new THREE.Vector3(side * (W - 0.04), y + k * 0.05, z), new THREE.Vector3(side * (W - 0.04), y + k * 0.05 - 0.2, z - 8), 0.25 + rr() * 0.3, 0.01));
      }
    }
    const bundle = new THREE.Mesh(mergeGeometries(geos), wire); bundle.name = 'overhead-cables';
    bundle.castShadow = false; root.add(bundle);
  }
  const placed = await placeProps(root, props);
  // the past of two things in the present: the abandoned car (door shut, lamps on) and the dead plants (in leaf)
  if (ctx.params.get('nov2props') !== null) setupPastCar(ctx, placed.find((o) => o.userData.prop === 'car'));
  setupPastPlants(placed.find((o) => o.userData.prop === 'props2/planters'));
  // notice board papers carry the relocation texts (and vanish in the past like the other notices)
  let pi = 0;
  for (const o of placed) if (o.userData.prop === 'props2/laundry') o.traverse((m) => { if (m.isMesh) m.userData.dynamic = true; });
  for (const o of placed) o.traverse((m) => { if (m.isMesh && /paper/i.test(m.name)) { m.material = noticeMaterial(NOTICES[pi % NOTICES.length], pi + 7); m.renderOrder = 4; m.userData.dynamic = true; pi++; } });
  ctx.api.street = { lamp, far, vmLight, car };
}
