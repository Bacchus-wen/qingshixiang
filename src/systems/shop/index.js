import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SHOTS } from '../../engine/shots.js';
import { LodLibrary, SHADOW_LAYER, ROBOT_LAYER, ROBOT_SHADOW_LAYER } from './lod.js';
import { HeadRig } from './rig.js';
import { pastHooks } from './past.js';
import { color, float, mix, mx_fractal_noise_float, mx_noise_float, positionWorld, positionLocal, smoothstep, vec2, vec3, mx_worley_noise_float, texture, normalWorldGeometry, abs, step, uniform, uv, vec4 } from 'three/tsl';

// v4: the closed-down home-appliance repair shop (docs/scene-shop.md). This phase is models + layout only:
// a simple room shell, the Tripo models placed from /models/shop/layout.json (every item is grounded on its
// support surface automatically), plain review lighting (desk lamp warm key, blue dusk from the street).
// Room: x in [-3, 3], z in [-2.25, 2.25] (front/shutter at +z), floor y = 0, ceiling 3.0.
export const ROOM = { w: 6.0, d: 4.5, h: 3.0 };

// room surfaces and printed things: photographic textures generated with the company platform (gpt-image-2.5,
// docs/gen-log.md), shipped as KTX2 (tools/tex-ktx2.sh: ~1 byte/px on the GPU instead of 4). Tiled surfaces are mapped
// in world space so walls and floor line up without UV work. All are loaded up front (init awaits them).
const TEX = {};
const TEX_NAMES = ['floor_terrazzo', 'wall_upper', 'wall_dado', 'ceiling', 'facade', 'pavement', 'shutter', 'cardboard',
  'poster', 'calendar', 'price_list', 'slogan', 'sign_main', 'sign_side', 'tags', 'box_a', 'box_b', 'box_c', 'box_d', 'tv_poster', 'notice', 'street_backdrop', 'sign_aframe', 'sign_vertical', 'pegboard_empty'];
async function loadTextures(ktx2) {
  await Promise.all(TEX_NAMES.map(async (n) => {
    try {
      const t = await ktx2.loadAsync(`${import.meta.env.BASE_URL}textures/shop/${n}.ktx2`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; TEX[n] = t;
    } catch (e) { // a missing texture must not take the whole shop down: grey stand-in, logged
      console.warn('[shop] texture missing', n); const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); t.needsUpdate = true; TEX[n] = t;
    }
  }));
}
const tex = (name) => TEX[name];
function terrazzo() {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld;
  const T = texture(tex('floor_terrazzo'), P.xz.div(0.75));
  const grime = smoothstep(0.35, 0.85, mx_noise_float(vec3(P.x.mul(0.7), 0, P.z.mul(0.7)).add(2.0)).mul(0.5).add(0.5));
  // the trodden path: shutter -> bench -> back door, darker with ground-in dirt (distance to two segments)
  const seg = (ax, az, bx, bz) => { const pa = vec2(P.x.sub(ax), P.z.sub(az)), ba = vec2(bx - ax, bz - az); const h = pa.dot(ba).div(ba.dot(ba)).clamp(0, 1); return pa.sub(ba.mul(h)).length(); };
  const dPath = seg(0.1, 2.3, -0.2, 0.3).min(seg(-0.2, 0.3, 1.2, -1.7));
  const trod = smoothstep(0.75, 0.15, dPath).mul(mx_noise_float(vec3(P.x.mul(2.2), 3, P.z.mul(2.2))).mul(0.3).add(0.7));
  m.colorNode = T.rgb.mul(mix(float(1.0), float(0.7), grime)).mul(mix(float(1), float(0.78), trod));
  m.roughnessNode = mix(float(0.32), float(0.7), grime);  // polished where nobody walks, dull along the paths
  return m;
}
function wallMat() {
  // yellowed lime plaster above, dark green gloss dado below 1.0 m with a thin darker stripe on top (v4 story: lowered
  // from 1.2 m so a child's pencil marks, 1.10-1.47 m, sit on pale plaster)
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld, N = normalWorldGeometry;
  const u = abs(N.x).greaterThan(0.5).select(P.z, P.x);
  const uv = vec2(u.div(2.2), P.y.div(2.2).add(abs(N.x).mul(0.37)));
  const upper = texture(tex('wall_upper'), uv).rgb;
  const dado = texture(tex('wall_dado'), uv).rgb;
  const isDado = float(1).sub(step(1.0, P.y));
  const stripe = smoothstep(1.0, 1.005, P.y).mul(float(1).sub(smoothstep(1.025, 1.03, P.y)));
  let c = mix(upper, dado, isDado);
  c = mix(c, vec3(0.06, 0.12, 0.08), stripe);
  const floorDirt = smoothstep(0.35, 0.0, P.y).mul(0.35);
  const broad = mx_noise_float(vec3(u.mul(0.45), P.y.mul(0.6), 1.7)).mul(0.12);  // breaks the tile repeat
  // decades of soldering smoke and a coal stove: the plaster browns towards the ceiling, patchily
  const soot = smoothstep(1.9, 3.0, P.y).mul(mx_noise_float(vec3(u.mul(1.3), P.y.mul(2.0), 4.2)).mul(0.25).add(0.75)).mul(0.42);
  m.colorNode = c.mul(float(1).sub(floorDirt)).mul(float(1).add(broad)).mul(mix(vec3(1), vec3(0.62, 0.52, 0.4), soot));
  m.roughnessNode = mix(float(0.88), float(0.38), isDado);
  return m;
}
function ceilingMat() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  m.colorNode = texture(tex('ceiling'), positionWorld.xz.div(2.0)).rgb.mul(0.85);
  return m;
}

function facadeMat() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
  const P = positionWorld, N = normalWorldGeometry;
  const u = abs(N.x).greaterThan(0.5).select(P.z, P.x);
  const v = abs(N.y).greaterThan(0.5).select(P.z, P.y); // horizontal faces (sill, lintel underside) map x/z
  m.colorNode = texture(tex('facade'), vec2(u.div(2.0), v.div(2.0))).rgb.mul(0.9);
  return m;
}
function streetMat() {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld;
  m.colorNode = texture(tex('pavement'), P.xz.div(1.6)).rgb.mul(0.8);
  m.roughnessNode = float(0.8);
  return m;
}
let railMat = null;
const rail0 = () => (railMat ??= new THREE.MeshStandardNodeMaterial({ color: 0x4a4d4f, roughness: 0.55, metalness: 0.6 }));
function shutterMat() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.35 });
  const P = positionWorld;
  const c = texture(tex('shutter'), vec2(P.x.div(1.2), P.y.div(1.2))).rgb;
  m.colorNode = mix(vec3(c.r.add(c.g).add(c.b).div(3)), c, 0.55).mul(0.72); // greyer, darker: the eye goes past it into the shop
  return m;
}

const _box = new THREE.Box3();

// flat printed things on the walls (pegboard, calendar, price list, poster, signs): a textured plane a few mm off the wall
function decal(name, W, H, opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ map: tex(name), roughness: opts.rough ?? 0.85 });
  m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping;
  const g = new THREE.PlaneGeometry(W, H);
  if (opts.curl) { // paper hangs slightly away from the wall at the bottom
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = (H / 2 - p.getY(i)) / H; p.setZ(i, opts.curl * t * t); }
    g.computeVertexNormals();
  }
  const o = new THREE.Mesh(g, m); o.receiveShadow = true; o.name = name;
  return o;
}
// put a decal on a wall: wall 'back' | 'left' | 'right' | 'front-out' (street face of the front wall); (a, y) = along-wall
// coordinate (x for back/front, z for the side walls) and centre height
function onWall(o, wall, a, y, off = 0.004) {
  const { w, d } = ROOM;
  if (wall === 'back') { o.position.set(a, y, -d / 2 + off); }
  if (wall === 'left') { o.position.set(-w / 2 + off, y, a); o.rotation.y = Math.PI / 2; }
  if (wall === 'right') { o.position.set(w / 2 - off, y, a); o.rotation.y = -Math.PI / 2; }
  if (wall === 'front-out') { o.position.set(a, y, d / 2 + 0.25 + off); }
  return o;
}
let cardboardMat = null;
// cardboard carton with a printed front (box_a / box_b) and plain sides
function carton(front, W, H, D, opt = {}) {
  cardboardMat ??= new THREE.MeshStandardNodeMaterial({ map: tex('cardboard'), roughness: 0.92 });
  const side = cardboardMat;
  const f = new THREE.MeshStandardNodeMaterial({ map: tex(front), roughness: 0.9 });
  let g = new THREE.BoxGeometry(W, H, D, 4, 2, 4).translate(0, H / 2, 0);
  if (opt.uv) { // a squat box shows only a band of its print (no squashed lettering): remap the front/back face UVs
    const [u0, v0, u1, v1] = opt.uv, uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) if (Math.abs(n.getZ(i)) > 0.9) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  { // not machined boxes: the top sags a little, one top corner is crushed in (seeded by the size, so stable)
    const p = g.attributes.position, sd = Math.sin(W * 917 + H * 311 + D * 73) * 0.5 + 0.5, cx = sd < 0.5 ? -1 : 1, cz = (sd * 7 % 1) < 0.5 ? -1 : 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), top = y / H;
      const sag = Math.max(0, 1 - (Math.abs(x) / (W / 2)) ** 2) * Math.max(0, 1 - (Math.abs(z) / (D / 2)) ** 2) * top ** 4 * 0.012;
      const cd = Math.max(0, 1 - Math.hypot(x / W - cx * 0.5, z / D - cz * 0.5) * 3) * top ** 3 * (0.012 + sd * 0.02);
      p.setY(i, y - sag - cd); p.setX(i, x - cx * cd * 0.4); p.setZ(i, z - cz * cd * 0.4);
    }
    g.computeVertexNormals();
  }
  const G = g.groups; // px, nx, py, ny, pz, nz in index order: merge into two runs -> two draw calls
  g.groups = [{ start: G[0].start, count: G[4].start - G[0].start, materialIndex: 0 }, { start: G[4].start, count: G[5].start + G[5].count - G[4].start, materialIndex: 1 }];
  const o = new THREE.Mesh(g, [side, f]); o.castShadow = o.receiveShadow = true;
  if (opt.tape) { // sealed: brown packing tape along the flap seam, folded 6 cm down both ends; follows the sagging top
    const tg = new THREE.PlaneGeometry(W + 0.12, 0.048, 24, 1).rotateX(-Math.PI / 2), p = g.attributes.position, tp = tg.attributes.position;
    const topAt = (x, z) => { let best = 1e9, y = H; for (let i = 0; i < p.count; i++) { const d = (p.getX(i) - x) ** 2 + (p.getZ(i) - z) ** 2; if (p.getY(i) > H * 0.6 && d < best) { best = d; y = p.getY(i); } } return y; };
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i), over = Math.abs(x) - W / 2;
      if (over > 0) tp.setXYZ(i, Math.sign(x) * (W / 2 + 0.0008), H - over, z); // down the end face
      else tp.setY(i, topAt(x, z) + 0.0008);
    }
    tg.computeVertexNormals();
    const tape = new THREE.Mesh(tg, PM.packTape ??= new THREE.MeshStandardNodeMaterial({ color: 0x8a6a3c, roughness: 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    tape.receiveShadow = true; o.add(tape);
  }
  return o;
}

// hand-written shelf tags (brand + model number, "待修", "已修好 取件"): one generated sheet, 12 cards (docs/gen-log.md)
const TAG_RECTS = [[0.0293, 0.6875, 0.2409, 0.9199], [0.2747, 0.6875, 0.4837, 0.9209], [0.5169, 0.6885, 0.7246, 0.9209], [0.7604, 0.6865, 0.9701, 0.9209], [0.0299, 0.3828, 0.2402, 0.627], [0.2741, 0.3818, 0.4831, 0.627], [0.5182, 0.3818, 0.7253, 0.627], [0.7604, 0.3818, 0.9714, 0.626], [0.0293, 0.082, 0.2389, 0.3223], [0.2741, 0.082, 0.4831, 0.3232], [0.5182, 0.082, 0.7246, 0.3242], [0.7604, 0.0801, 0.972, 0.3232]];
let tagMat = null;
function tagGeometry(i) {
  const [u0, v0, u1, v1] = TAG_RECTS[i % 12];
  const W = 0.085, H = W * ((v1 - v0) * 1024) / ((u1 - u0) * 1536);
  const g = new THREE.PlaneGeometry(W, H); const uv = g.attributes.uv;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  return g;
}

// small procedural bench dressing (not generated: too small/thin for image-to-3D): wire spools, screwdrivers, a screw
// tin, a rag over the bench edge, a coil of flex on the floor. Each returns a group with its origin at the bottom.
const PM = {};
function pmat(key, opts) { return (PM[key] ??= new THREE.MeshStandardNodeMaterial(opts)); }
function procItem(kind, seed = 1) {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  if (kind === 'spool') { // flanged bobbin with enamelled copper / coloured wire
    const wire = pmat('wire' + (seed % 3), { color: [0xb5532a, 0xc23a2a, 0xd8b23a][seed % 3], roughness: 0.35, metalness: seed % 3 === 0 ? 0.8 : 0.1 });
    const flange = pmat('flange', { color: 0x2b2b2b, roughness: 0.6 });
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 24), flange, 0, 0.003, 0);
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.036, 24), wire, 0, 0.024, 0);
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 24), flange, 0, 0.045, 0);
  } else if (kind === 'screwdriver') { // lying on the bench: fluted, grubby handle + ferrule + shaft along x
    const handle = PM['handle' + (seed % 2)] ??= (() => {
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
      const base = seed % 2 ? vec3(0.32, 0.035, 0.025) : vec3(0.42, 0.26, 0.03); // worn red / amber (linear)
      const grime = smoothstep(0.4, 0.9, mx_fractal_noise_float(positionWorld.mul(90), 2, 2, 0.5).mul(0.5).add(0.5));
      m.colorNode = mix(base, base.mul(0.35), grime.mul(0.8)); return m;
    })();
    const steel = pmat('steel', { color: 0x8c8c88, roughness: 0.4, metalness: 1 });
    const hg = new THREE.CylinderGeometry(0.0105, 0.0125, 0.09, 8).rotateZ(Math.PI / 2); // octagonal: reads as fluted
    add(hg, handle, -0.045, 0.0125, 0);
    add(new THREE.CylinderGeometry(0.006, 0.0075, 0.012, 12).rotateZ(Math.PI / 2), steel, 0.005, 0.0125, 0);
    add(new THREE.CylinderGeometry(0.003, 0.003, 0.11, 8).rotateZ(Math.PI / 2), steel, 0.065, 0.0125, 0);
    add(new THREE.BoxGeometry(0.008, 0.0012, 0.006), steel, 0.123, 0.0125, 0); // flat tip
  } else if (kind === 'tin') { // round screw tin, lid leaning against it
    const tinM = pmat('tin', { color: 0x6e7b6a, roughness: 0.45, metalness: 0.7 });
    const dark = pmat('tinIn', { color: 0x1c1a17, roughness: 0.8 });
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 28, 1, true), tinM, 0, 0.015, 0).material.side = THREE.DoubleSide;
    add(new THREE.CylinderGeometry(0.044, 0.044, 0.004, 28), dark, 0, 0.012, 0);
    const lid = add(new THREE.CylinderGeometry(0.047, 0.047, 0.006, 28), tinM, 0.075, 0.003, 0.01);
    const scr = pmat('bitsDark', { color: 0x4a4740, roughness: 0.5, metalness: 0.85 });   // the screws it holds, on the heap
    for (let k = 0; k < 9; k++) { const a = k * 2.4 + seed, r = 0.008 + (k % 4) * 0.008;
      const sc = add(new THREE.CylinderGeometry(0.0021, 0.0021, 0.011, 6).rotateZ(Math.PI / 2).rotateY(a * 1.7), scr, Math.cos(a) * r, 0.0158 + (k % 3) * 0.0015, Math.sin(a) * r); sc.rotation.x = (k % 3 - 1) * 0.3; }
  } else if (kind === 'rag') { // a cloth draped over the bench's front edge: top part on the bench, the rest hanging
    const m = PM.rag ??= (() => { // grubby striped cotton: faded blue stripes, oil/grease blotches
      const r = new THREE.MeshStandardNodeMaterial({ roughness: 0.97, side: THREE.DoubleSide });
      const P = positionWorld;
      const stripe = smoothstep(0.55, 0.7, P.x.mul(0.8).add(P.z).mul(26).add(mx_noise_float(P.mul(9)).mul(1.5)).sin().mul(0.5).add(0.5)); // faded, wobbly stripes
      const grease = smoothstep(0.45, 0.8, mx_fractal_noise_float(P.mul(18), 3, 2, 0.5).mul(0.5).add(0.5));
      r.colorNode = mix(mix(vec3(0.22, 0.2, 0.17), vec3(0.08, 0.1, 0.15), stripe.mul(0.55)), vec3(0.04, 0.032, 0.024), grease.mul(0.65)); // linear values: faded blue-striped cotton
      return r;
    })();
    // mostly on the bench, pushed into folds (crumpled where it was last wiped), one corner over the edge
    const geo = new THREE.PlaneGeometry(0.22, 0.28, 34, 56); const p = geo.attributes.position;
    const nz = (a, b) => Math.sin(a * 1.7 + b * 0.9) * Math.sin(a * 0.6 - b * 1.3 + 1.1) + 0.5 * Math.sin(a * 3.1 + b * 2.3 + 0.4);
    for (let i = 0; i < p.count; i++) {
      const x0 = p.getX(i), t = (p.getY(i) + 0.14) / 0.28; // t: 0 = edge side, 1 = back
      let x = x0 * (0.8 + 0.12 * Math.sin(t * 5)), z = -(t * 0.28) * 0.6;       // pushed together front-to-back
      const tw = t + 0.07 * Math.sin(t * 9 + x0 * 11) + 0.04 * nz(x0 * 9, t * 4);                       // uneven fold spacing
      const ridge = 0.5 + 0.5 * Math.sin(tw * Math.PI * 6 + 1.3 * Math.sin(x0 * 16 + t * 3) + 0.6 * nz(x0 * 12, t * 5));
      const env = Math.max(0, 1 - Math.abs(t - 0.3) / 0.45) * (0.6 + 0.4 * nz(x0 * 7, 1.3));            // bunched near the edge, flat behind
      let y = 0.002 + ridge * ridge * (3 - 2 * ridge) * 0.009 * env + (0.5 + 0.5 * nz(x0 * 24, t * 9)) * 0.002;
      const ux = Math.min(1, Math.max(0, (x0 + 0.075) / 0.1)), corner = ux * ux * (3 - 2 * ux) * Math.max(0, 1 - t / 0.42); // most of the front edge slides over
      if (corner > 0) { const hang = corner * 0.11; y -= hang; z += Math.min(hang, 0.014) * 0.7 - Math.max(0, hang - 0.06) * 0.45; } // hem tucked in under the top
      p.setXYZ(i, x, y, z + 0.004);
    }
    geo.computeVertexNormals();
    add(geo, m);
  } else if (kind === 'broom') { // bamboo-handled straw broom, upright (lean it with roll/pitch in the layout)
    const bamboo = pmat('bamboo', { color: 0x9a7a45, roughness: 0.6 });
    const straw = PM.straw ??= (() => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
      const P = positionWorld; m.colorNode = mix(vec3(0.33, 0.24, 0.11), vec3(0.15, 0.1, 0.05), smoothstep(0.3, 0.8, mx_noise_float(vec3(P.x.mul(300), P.y.mul(8), P.z.mul(300))).mul(0.5).add(0.5))); return m; })();
    add(new THREE.CylinderGeometry(0.012, 0.013, 0.95, 10), bamboo, 0, 0.2 + 0.475, 0);
    for (const yy of [0.32, 0.6, 0.88]) add(new THREE.CylinderGeometry(0.0135, 0.0135, 0.012, 10), pmat('node', { color: 0x7a5c30, roughness: 0.6 }), 0, yy, 0); // bamboo nodes
    const fan = new THREE.CylinderGeometry(0.02, 0.13, 0.3, 14, 1, false); fan.scale(1, 1, 0.32); add(fan, straw, 0, 0.15, 0);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), pmat('wire', { color: 0x3a3a38, roughness: 0.5, metalness: 0.6 }), 0, 0.29, 0); // binding
  } else if (kind === 'aframe') { // sandwich-board sign: two boards hinged at the top, the painted face toward +z
    const wood = pmat('aframe', { color: 0x2f3a33, roughness: 0.85 });
    const face = new THREE.MeshStandardNodeMaterial({ map: tex('sign_aframe'), roughness: 0.8 });
    const H = 0.8, Wd = 0.48, spread = 0.18;
    for (const sz of [1, -1]) {
      const b = new THREE.Group(); const board = new THREE.Mesh(new THREE.BoxGeometry(Wd, H, 0.018), wood); board.position.y = -H / 2; b.add(board);
      if (sz < 0) { const p = new THREE.Mesh(new THREE.PlaneGeometry(Wd - 0.04, H - 0.04), face); p.position.set(0, -H / 2, 0.0095); b.add(p); } // the leg whose foot points at the street carries the face
      b.position.set(0, H * Math.cos(Math.asin(spread / H)), 0); b.rotation.x = sz * Math.asin(spread / H); g.add(b);
      b.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    }
  } else if (kind === 'coil') { // a coil of black flex cable on the floor
    const m = pmat('flex', { color: 0x161616, roughness: 0.5 });
    for (let k = 0; k < 4; k++) add(new THREE.TorusGeometry(0.14 - k * 0.006, 0.006, 8, 40).rotateX(Math.PI / 2), m, (k % 2) * 0.006, 0.006 + k * 0.011, k * 0.004);
  }
  return g;
}

// merge a static group's meshes into one mesh per material (world transforms baked in): draw calls for clutter
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const by = new Map();
  group.traverse((m) => { if (!m.isMesh) return; const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); (by.get(m.material) ?? by.set(m.material, []).get(m.material)).push(g); });
  const out = new THREE.Group();
  for (const [mat, gs] of by) { const m = new THREE.Mesh(mergeGeometries(gs), mat); m.castShadow = m.receiveShadow = true; out.add(m); }
  return out;
}

// slotted angle-iron shelving (thin repeated steel: procedural, not generated): uprights, boards, worn grey-green paint.
// All parts of one material are merged into one mesh: steel, boards, tags = 3 draw calls per shelf unit.
let steelMat = null, boardMat = null;
function shelfUnit(it) {
  const grp = new THREE.Group();
  const W = it.w || 1.8, D = it.d || 0.45, H = it.h || 2.4, n = it.levels || 5;
  const P = positionWorld;
  if (!steelMat) {
    steelMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.5 });
    const wear = smoothstep(0.55, 0.8, mx_fractal_noise_float(P.mul(7), 3, 2, 0.5).mul(0.5).add(0.5));
    steelMat.colorNode = mix(vec3(0.27, 0.31, 0.28), vec3(0.32, 0.22, 0.14), wear.mul(0.7));
    boardMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.35 });
    const bc = mix(vec3(0.3, 0.33, 0.3), vec3(0.24, 0.17, 0.11), smoothstep(0.5, 0.85, mx_noise_float(P.mul(3.3)).mul(0.5).add(0.5)).mul(0.6));
    // years of dust on the up-facing board tops: pale, patchy, thicker towards the back
    const dust = smoothstep(0.6, 0.95, normalWorldGeometry.y).mul(smoothstep(0.3, 0.75, mx_fractal_noise_float(P.mul(9), 3, 2, 0.5).mul(0.5).add(0.5))).mul(0.55);
    boardMat.colorNode = mix(bc, vec3(0.42, 0.4, 0.36), dust);
    boardMat.roughnessNode = mix(float(0.7), float(0.95), dust);
  }
  const steel = [], boards = [], tags = [];
  const box = (arr, w, h, d, x, y, z) => arr.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  for (const x of [-W / 2 + 0.018, W / 2 - 0.018]) for (const z of [-D / 2 + 0.018, D / 2 - 0.018]) {
    box(steel, 0.035, H, 0.004, x, H / 2, z + (z < 0 ? 0.0155 : -0.0155));
    box(steel, 0.004, H, 0.035, x + (x < 0 ? 0.0155 : -0.0155), H / 2, z);
  }
  for (let i = 0; i < n; i++) {
    const y = 0.08 + i * (H - 0.12) / (n - 1);
    box(boards, W - 0.01, 0.012, D - 0.01, 0, y, 0);
    box(steel, W, 0.035, 0.004, 0, y - 0.012, D / 2 - 0.002);
  }
  // tags taped to the front lip of a board: [x along the shelf, level, card index]
  for (const [x, lv, i] of it.tags || []) {
    const y = 0.08 + lv * (H - 0.12) / (n - 1);
    tags.push(tagGeometry(i).rotateZ(Math.sin(x * 91 + lv * 7) * 0.06).translate(x, y - 0.03, D / 2 + 0.0015));
  }
  const add = (arr, mat, shadow) => { if (!arr.length) return; const m = new THREE.Mesh(mergeGeometries(arr), mat); m.castShadow = shadow; m.receiveShadow = true; grp.add(m); };
  add(steel, steelMat, true); add(boards, boardMat, true);
  tagMat ??= new THREE.MeshStandardNodeMaterial({ map: tex('tags'), roughness: 0.9 });
  add(tags, tagMat, false);
  grp.name = it.name;
  return grp;
}

export default {
  name: 'shop',
  async init(ctx) {
    const { scene } = ctx;
    // post chain for an interior: no depth of field, no rain-air scatter, no SSR (env-map reflections instead).
    // Measured on the establishing shot (GPU timestamps): 66.9 -> 28.3 with no visible difference. ?ssr=1 restores SSR.
    { const pf = (ctx.params.get('pfx') || '').split(',').filter(Boolean); pf.push('nodof', 'noscatter'); if (ctx.params.get('ssr') === null) pf.push('nossr'); ctx.params.set('pfx', pf.join(',')); }
    // KTX2 (Basis) textures for the room and the models: transcoded to the GPU's native compressed format
    const ktx2 = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(ctx.renderer);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
    let layout = [];
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}models/shop/layout.json`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      layout = await r.json(); if (!Array.isArray(layout)) throw new Error('not a list');
    } catch (e) { console.error('[shop] layout.json could not be loaded, the shop will be empty:', e.message); layout = []; }
    // the generated models are shown as generated: every placed copy shows the coarsest level of detail whose error is
    // under one screen pixel, up to the raw Tripo mesh itself up close (./lod.js, tools/lod-build.mjs). ?nolod = the old
    // prepared (decimated) models, for comparison. Every distinct model is fetched + parsed once; copies are clones
    // that share geometry, materials and GPU textures.
    // GPU memory for model levels: 600 MB, 320 MB on devices that report 4 GB of memory or less; ?lodmb= overrides
    const lod = this.lod = new LodLibrary(loader, `${import.meta.env.BASE_URL}models/shop/lod/`,
      { budgetMB: +ctx.params.get('lodmb') || (navigator.deviceMemory && navigator.deviceMemory <= 4 ? 320 : 600) });
    pastHooks(lod); // radio dials, the clock's pendulum: on every level as it loads (./past.js)
    let lodNames = new Set();
    if (ctx.params.get('nolod') === null) {
      try { const r = await fetch(`${import.meta.env.BASE_URL}models/shop/lod/index.json`, { cache: 'no-store' }); if (r.ok) lodNames = new Set(await r.json()); } catch { /* no LOD set: old models */ }
      for (const n of (ctx.params.get('lodskip') || '').split(',').filter(Boolean)) lodNames.delete(n); // A/B one model: ?lodskip=tube_radio_open
      const only = (ctx.params.get('lodonly') || '').split(',').filter(Boolean); if (only.length) lodNames = new Set([...lodNames].filter((n) => only.includes(n)));
    }
    // CRT screens are glass: the generated texture paints them a flat grey, so the bright, unsaturated parts of the
    // TV's colour map (screen, chrome trim) get glass-like roughness and pick up the room in reflection
    const glassify = (scene) => scene.traverse((m) => {
      if (!m.isMesh || !m.material.map) return;
      const src = m.material, nm = new THREE.MeshStandardNodeMaterial();
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'roughness', 'metalness', 'color']) if (src[k] !== undefined) nm[k] = src[k]?.clone && k === 'color' ? src[k].clone() : src[k];
      if (src.normalScale) nm.normalScale.copy(src.normalScale);
      const c = texture(src.map).rgb, mx = c.r.max(c.g).max(c.b), mn = c.r.min(c.g).min(c.b);
      const glass = smoothstep(0.32, 0.5, mx).mul(float(1).sub(smoothstep(0.08, 0.2, mx.sub(mn))));
      const r0 = src.roughnessMap ? texture(src.roughnessMap).g.mul(src.roughness) : float(src.roughness);
      nm.roughnessNode = mix(r0, float(0.12), glass);
      m.material = nm;
    });
    lod.hook('crt_tv', glassify);
    // the robot: a soft neck in the vertex shader (./rig.js) turns the generated head without cutting the mesh, and the
    // camera-lens eye glows -- the texture's bright orange core becomes emissive, only on the face (model space), so
    // rust and brass elsewhere never glow. One rig and one glow uniform shared by every level as it streams in.
    const rig = this.rig = new HeadRig();
    const eyeGlow = this.eyeGlow = uniform(1.6);
    { const hp = (ctx.params.get('head') || '').split(',').map(Number); if (hp.length >= 2) { rig.yaw = THREE.MathUtils.degToRad(hp[0]); rig.pitch = THREE.MathUtils.degToRad(hp[1]); rig.update(); } }
    lod.proxyLayers.set('robot', ROBOT_SHADOW_LAYER);
    ctx.camera.layers.enable(ROBOT_LAYER);
    lod.hook('robot', (scene) => {
      scene.updateMatrixWorld(true); // mesh -> model space (the level's own minY offset included)
      scene.traverse((m) => {
        if (!m.isMesh) return;
        m.layers.set(ROBOT_LAYER); // (copies made from this level keep it)
        if (!m.material.map) return;
        const src = m.material, nm = new THREE.MeshStandardNodeMaterial();
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'roughness', 'metalness']) if (src[k] !== undefined) nm[k] = src[k];
        if (src.normalScale) nm.normalScale.copy(src.normalScale).multiplyScalar(0.7); // softer relief: the casing read as stone under raking light
        const { position, model } = rig.nodes(m.matrixWorld);
        nm.positionNode = position;
        const c = texture(src.map).rgb;
        const core = smoothstep(0.7, 0.9, c.r).mul(smoothstep(0.3, 0.5, c.g)).mul(float(1).sub(smoothstep(0.28, 0.45, c.b)));
        const face = smoothstep(0.76, 0.79, model.y).mul(smoothstep(0.09, 0.13, model.z)); // the lens: y 0.81-0.97, z 0.15-0.21
        nm.emissiveNode = c.mul(core).mul(face).mul(eyeGlow);
        m.material = nm;
      });
    });
    const templates = new Map();
    for (const glb of new Set(layout.filter((i) => i.glb).map((i) => i.glb))) {
      const name = glb.replace(/\.glb$/, '');
      templates.set(glb, lodNames.has(name)
        ? lod.prepare(name).then(() => ({ lod: name })).catch((e) => { console.warn('[shop] lod failed', name, e.message); return null; })
        : loader.loadAsync(`${import.meta.env.BASE_URL}models/shop/${glb}`).catch((e) => { console.warn('[shop] model failed', glb, e.message); return null; }));
    }
    await Promise.all([loadTextures(ktx2), ...templates.values()]);
    const tvT = await templates.get('crt_tv.glb');
    if (tvT && !tvT.lod) glassify(tvT.scene);
    ctx.busy = () => lod.busy();
    const root = this.root = new THREE.Group(); root.name = 'shop';
    scene.add(root);
    const { w, d, h } = ROOM;
    // shell: floor, ceiling, back/left/right walls, front wall pieces around the shutter opening (2.8 m wide)
    // shop floor (one step above the street: the front wall's sill line), the street pavement outside
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d + 0.25).rotateX(-Math.PI / 2), terrazzo());
    floor.position.z = 0.125; floor.receiveShadow = true; root.add(floor);
    const STEP = 0.14;
    const street = new THREE.Mesh(new THREE.PlaneGeometry(14, 9).rotateX(-Math.PI / 2), streetMat());
    street.position.set(0, -STEP, d / 2 + 0.25 + 4.5); street.receiveShadow = true; root.add(street);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, STEP, 0.3), facadeMat()); sill.position.set(0, -STEP / 2, d / 2 + 0.25 + 0.15 - 0.15); sill.receiveShadow = true; root.add(sill);
    const wm = wallMat();
    // walls and ceiling block light from both faces (shadowSide): the street's light only comes in under the shutter
    wm.shadowSide = THREE.DoubleSide;
    const wall = (W, H, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = m.castShadow = true; root.add(m); return m; };
    wall(w, h, 0, h / 2, -d / 2, 0);
    wall(d, h, -w / 2, h / 2, 0, Math.PI / 2);
    wall(d, h, w / 2, h / 2, 0, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), ceilingMat());
    ceil.material.shadowSide = THREE.DoubleSide; ceil.castShadow = true;
    ceil.position.y = h; root.add(ceil);
    // front wall with the shutter opening, seen from inside as dark masonry
    // front wall: pillars either side of the 3.6 m opening and the facade above it (up to 4.2 m: the sign board)
    const front = facadeMat(), FH = 4.2;
    const fw = (W, H, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.25), front); m.position.set(x, y, d / 2 + 0.125); m.castShadow = m.receiveShadow = true; root.add(m); };
    fw((w - 3.6) / 2, FH, -w / 2 + (w - 3.6) / 4, FH / 2); fw((w - 3.6) / 2, FH, w / 2 - (w - 3.6) / 4, FH / 2); fw(3.6, FH - 2.6, 0, 2.6 + (FH - 2.6) / 2);
    // shutter housing (the rolled-up shutter's box) on the street face of the lintel
    { const hb = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.3, 0.26), shutterMat()); hb.position.set(0, 2.6 + 0.15, d / 2 + 0.25 + 0.13); hb.castShadow = true; root.add(hb); }
    // rolling shutter, half open: corrugated slats from the lintel down to 1.25 m
    {
      const slats = new THREE.Group(); const sm = shutterMat();
      let si = 0;
      for (let y = 2.55; y > 2.02; y -= 0.075, si++) { // slats a little out of line: dented, one bowed
        const s = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.02, 12, 1, 1), sm); const p = s.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) + Math.sin(x * 1.7 + si * 2.1) * 0.006 + ((si >= 2 && si <= 4) ? Math.cos(x * 0.8) * (0.014 - Math.abs(si - 3) * 0.004) : 0)); }
        s.geometry.computeVertexNormals(); s.position.set(0, y, d / 2 + 0.05); s.rotation.x = Math.sin(si * 7.3) * 0.05; s.castShadow = true; slats.add(s);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.06, 0.06), sm); bar.position.set(0, 1.99, d / 2 + 0.05); bar.castShadow = true; slats.add(bar);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.006, 0.07), rail0()); lip.position.set(0, 1.957, d / 2 + 0.05); slats.add(lip); // bottom angle iron
      // guide channels the shutter runs in: U-section steel on both jambs, floor to lintel
      const rail = rail0();
      for (const sx of [-1, 1]) {
        const x = sx * (1.8 - 0.03);
        for (const [w, dz] of [[0.06, -0.035], [0.06, 0.035]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, 0.008), rail); f.position.set(x, 1.3, d / 2 + 0.05 + dz); f.castShadow = true; slats.add(f); }
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.008, 2.6, 0.078), rail); web.position.set(sx * 1.8 - sx * 0.004, 1.3, d / 2 + 0.05); slats.add(web);
      }
      root.add(slats);
    }
    // the other side of the street (seen through the shop opening from inside): a generated matte painting on a
    // plane across the road, unlit (it carries its own dusk light), plus dark ground under it
    {
      const bd = new THREE.MeshBasicNodeMaterial(); const bt = tex('street_backdrop'); bt.wrapS = bt.wrapT = THREE.ClampToEdgeWrapping;
      const CROP = 0.13; // the painting's own road strip (bottom 13%) is cut: the buildings stand on our pavement
      bd.colorNode = texture(bt, uv().mul(vec2(1, 1 - CROP)).add(vec2(0, CROP))).rgb.mul(0.55);
      const BW = 16, BH = BW * 1024 / 1536 * (1 - CROP);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), bd); plane.rotation.y = Math.PI; // faces the shop (-z)
      plane.position.set(0.4, -STEP + BH / 2 - 0.05, d / 2 + 0.25 + 8.5); root.add(plane);
    }
    // printed things on the walls (generated with the company platform, docs/gen-log.md)
    root.add(onWall(decal('pegboard_empty', 1.14, 0.76), 'back', -1.88, 1.72, 0.0145));
    { // the pegboard is a real 6 mm board on spacers, not a sticker: its edges catch light and cast a thin shadow
      const pb = new THREE.Mesh(new THREE.BoxGeometry(1.145, 0.765, 0.006), new THREE.MeshStandardNodeMaterial({ color: 0x6b4526, roughness: 0.8 }));
      pb.position.set(-1.88, 1.72, -d / 2 + 0.0135 - 0.0032); pb.castShadow = pb.receiveShadow = true; root.add(pb);
    }
    root.add(onWall(decal('poster', 0.46, 0.69, { curl: 0.012 }), 'left', 0.12, 1.86));
    root.add(onWall(decal('calendar', 0.34, 0.51, { curl: 0.01 }), 'right', -1.28, 1.05)); // v4 story: off the back wall (the height marks are there), clear of the climax's frame
    root.add(onWall(decal('price_list', 0.4, 0.6, { curl: 0.01 }), 'right', -1.42, 1.78));
    root.add(onWall(decal('slogan', 0.96, 0.64), 'right', -0.5, 2.38, 0.015));
    root.add(onWall(decal('tv_poster', 0.4, 0.6, { curl: 0.012 }), 'left', 1.22, 2.36));
    root.add(onWall(decal('notice', 0.36, 0.54, { curl: 0.008 }), 'right', -1.98, 1.72));
    // (the child's pencil height marks are on the wall right of the back door: ./past.js)
    root.add(onWall(decal('sign_main', 2.4, 1.2, { rough: 0.6 }), 'front-out', 0, 3.42, 0.01));
    root.add(onWall(decal('sign_side', 0.82, 1.64, { rough: 0.6 }), 'front-out', -2.62, 1.55, 0.01));
    { // the vertical 家电维修 board right at the opening's edge: narrow, so it reads whole in the establishing shot
      const vt = tex('sign_vertical'); vt.wrapS = vt.wrapT = THREE.ClampToEdgeWrapping;
      const u0 = 0.347, u1 = 0.652, H = 1.5, W = H * ((u1 - u0) * 1024) / 1536;
      const vm = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
      vm.colorNode = texture(vt, uv().mul(vec2(u1 - u0, 1)).add(vec2(u0, 0))).rgb;
      const vb = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, H + 0.02, 0.025), PM.signBack ??= new THREE.MeshStandardNodeMaterial({ color: 0x3a2e24, roughness: 0.8 }));
      const vf = new THREE.Mesh(new THREE.PlaneGeometry(W, H), vm); vf.position.z = 0.0131;
      const grp = new THREE.Group(); grp.add(vb, vf); vb.castShadow = true;
      root.add(onWall(grp, 'front-out', -1.8 - W / 2 - 0.025, 1.58, 0.0125));
    }
    // review lighting: warm desk lamp key, cold dusk from the street, a weak bounce so models read
    const hemi = new THREE.HemisphereLight(0x8a94a8, 0x403428, 0.45); scene.add(hemi);
    const dusk = new THREE.DirectionalLight(0x9db4d6, 1.4); dusk.position.set(1.5, 2.2, 8); dusk.target.position.set(-0.5, 0, -1);
    dusk.castShadow = true; dusk.shadow.mapSize.setScalar(2048); dusk.shadow.camera.left = -5; dusk.shadow.camera.right = 5; dusk.shadow.camera.top = 5; dusk.shadow.camera.bottom = -5; dusk.shadow.bias = -0.0004;
    dusk.shadow.camera.layers.enable(SHADOW_LAYER); dusk.shadow.camera.layers.enable(ROBOT_LAYER); dusk.shadow.camera.layers.enable(ROBOT_SHADOW_LAYER); scene.add(dusk, dusk.target); // shadow proxies of raw-mesh models (./lod.js)
    this.lamp = new THREE.SpotLight(0xffc489, 18, 6, 0.9, 0.6, 1.5); this.lamp.castShadow = ctx.params.get('nolampshadow') === null; if (ctx.params.get('lampoff') !== null) this.lamp.intensity = 0; this.lamp.shadow.mapSize.setScalar(1024); this.lamp.shadow.bias = -0.0005;
    this.lamp.shadow.camera.layers.enable(SHADOW_LAYER); this.lamp.shadow.camera.layers.enable(ROBOT_LAYER); this.lamp.shadow.camera.layers.enable(ROBOT_SHADOW_LAYER); scene.add(this.lamp, this.lamp.target);
    const fill = new THREE.PointLight(0xffd9a8, 3, 7, 1.5); fill.position.set(0, 2.7, 0); scene.add(fill);
    const tubeGlow = uniform(2.2); // the fluorescent tube's brightness (the story makes it flicker, die, come back)

    // environment for reflections (PBR metals read black without one): the room itself, coarsely -- warm dim walls,
    // the fluorescent tube, the dusk-blue shop opening, the desk lamp's hot spot -- baked once into a PMREM
    {
      const env = new THREE.Scene();
      const bm = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
      const room = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bm(0x4a4236, 0.9)); room.position.y = h / 2; env.add(room);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2c2822 })); fl.position.y = 0.01; env.add(fl);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff8ee).multiplyScalar(6) })); tube.position.set(0.1, h - 0.08, -0.55); env.add(tube);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5d6a80).multiplyScalar(1.0), side: THREE.DoubleSide })); door.position.set(0, 1.3, d / 2 - 0.01); env.add(door);
      const hot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(8) })); hot.position.set(-1.7, 1.2, 0.0); env.add(hot);
      const pm = new THREE.PMREMGenerator(ctx.renderer);
      scene.environment = pm.fromScene(env, 0.04).texture; scene.environmentIntensity = 0.55;
      pm.dispose();
    }
    // ceiling fluorescent tube over the middle of the shop (fixture + glowing tube + its light)
    {
      const fx = new THREE.Group(); fx.position.set(0.1, h - 0.02, -0.55);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 0.09), new THREE.MeshStandardNodeMaterial({ color: 0xb9b4a6, roughness: 0.6, metalness: 0.3 }));
      body.position.y = -0.02; fx.add(body);
      const tubeM = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.3 }); tubeM.emissiveNode = vec3(1.0, 1.03, 0.95).mul(tubeGlow);
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 12).rotateZ(Math.PI / 2), tubeM); tb.position.y = -0.06; fx.add(tb);
      for (const sx of [-0.62, 0.62]) { const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.05), body.material); cap.position.set(sx, -0.055, 0); fx.add(cap); }
      root.add(fx);
      const tl = this.tubeLight = new THREE.PointLight(0xf2f0e6, 5.5, 8, 1.5); tl.position.set(0.1, h - 0.15, -0.55); scene.add(tl);
    }
    // models from the layout manifest; each is grounded on its support (floor, or a named surface)
    const placed = this.placed = {};
    const ray = new THREE.Raycaster(); const down = new THREE.Vector3(0, -1, 0); const v = new THREE.Vector3();
    const supportsOf = (name) => (name === 'floor' ? [floor] : name && placed[name] ? [placed[name]] : [floor, street, ...Object.values(placed)]);
    // drop test: the item falls straight down until the first of its bottom points touches something. Start it above
    // every support whose box overlaps its footprint, cast from its lowest vertices (the bottom 2.5 cm), lower it by the
    // smallest gap. (The old "highest surface under five footprint points" rule left things hovering on a corner.)
    const sb = new THREE.Box3();
    const dropY = (o, targets, under = false) => { // under: the item may sit beneath its neighbours (only the floor counts)
      _box.setFromObject(o, true); // precise: a rotated/rolled item's loose box can sit far below its real lowest point
      const near = targets.filter((t) => { sb.setFromObject(t); return sb.max.x > _box.min.x && sb.min.x < _box.max.x && sb.max.z > _box.min.z && sb.min.z < _box.max.z; });
      let top = 0; for (const t of near) { sb.setFromObject(t); if (t !== floor && t !== street) top = Math.max(top, sb.max.y); }
      o.position.y += top + 0.01 - _box.min.y; o.updateMatrixWorld(true); _box.setFromObject(o, true);
      const cut = _box.min.y + 0.025, pts = [];
      o.traverse((m) => {
        if (!m.isMesh) return; const p = m.geometry.attributes.position, st = Math.max(1, Math.floor(p.count / 6000));
        for (let i = 0; i < p.count; i += st) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v.y <= cut) pts.push(v.clone()); }
      });
      const k = Math.max(1, Math.floor(pts.length / 120)); let gap = Infinity;
      for (let i = 0; i < pts.length; i += k) {
        ray.set(pts[i], down); ray.far = 4;
        const h = ray.intersectObjects(near.length ? near : [floor], true)[0];
        if (h) gap = Math.min(gap, pts[i].y - h.point.y);
      }
      if (gap === Infinity) { console.warn('[shop] nothing under', o.name || '?', '- resting on y = 0'); gap = _box.min.y; }
      o.userData.dropGap = gap;
      o.position.y -= gap; o.updateMatrixWorld(true);
    };
    for (const it of layout) {
      try {
        let o;
        if (it.type === 'shelf') o = shelfUnit(it);
        else if (it.type === 'carton') o = carton(it.front, ...it.size, it);
        else if (it.type === 'proc') o = procItem(it.kind, it.seed);
        else if (it.type === 'plank') { // wall shelf: a worn plank on two angle brackets, back edge on the wall
          o = new THREE.Group(); const wood = PM.plank ??= new THREE.MeshStandardNodeMaterial({ color: 0x5a3f28, roughness: 0.85 });
          const pl = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.022, it.d), wood); pl.position.set(0, 0.011, it.d / 2); o.add(pl);
          for (const sx of [-it.w / 2 + 0.12, it.w / 2 - 0.12]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.012), PM.hook ??= new THREE.MeshStandardNodeMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.8 })); br.position.set(sx, -0.08, 0.006); o.add(br);
            const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, it.d * 0.8), br.material); st.position.set(sx, -0.006, it.d * 0.4); o.add(st); }
          o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
        }
        else {
          const g = await templates.get(it.glb); if (!g) continue; o = g.lod ? lod.instance(g.lod, { tint: it.tint }) : g.scene.clone(true);
          // yaw0: the generated model sits diagonally in its own frame (bicycle): pre-rotate it inside a pivot so the
          // item's long axis is x, then ry/roll act about the real axes
          if (it.yaw0) { const piv = new THREE.Group(); o.rotation.y = it.yaw0 * Math.PI / 180; piv.add(o); o = piv; }
        }
        o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        // per-instance tint so repeated models read as different units (black vs silver boombox, grey vs wood TV)
        if (it.tint && !(await templates.get(it.glb))?.lod) o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.setRGB(...it.tint); } });
        if (it.scale) o.scale.setScalar(it.scale);
        if (it.sz) o.scale.z *= it.sz; // flattened in depth (the back door's frame: a shallower jamb throws less shadow on the wall beside it)
        o.rotation.order = 'YXZ'; o.rotation.y = (it.ry || 0) * Math.PI / 180; o.rotation.x = (it.roll || 0) * Math.PI / 180; // roll: lean about the item's own long (x) axis
        o.position.set(it.pos[0], 0, it.pos[2]); o.name = it.name;
        root.add(o); o.updateMatrixWorld(true);
        _box.setFromObject(o, true); // precise (vertex) box: flush means flush, a rotated item's loose box can sit below it
        if (it.wall) {
          // wall-mounted: back face flush with the wall plane, bottom at the given height
          const { w: W, d: D } = ROOM;
          if (it.wall === 'back') o.position.z += -D / 2 - _box.min.z;
          if (it.wall === 'left') o.position.x += -W / 2 - _box.min.x;
          if (it.wall === 'right') o.position.x += W / 2 - _box.max.x;
          if (it.wall === 'front-out') o.position.z += D / 2 + 0.25 - _box.min.z; // street face of the front wall
          o.position.y += (it.pos[1] ?? 1.5) - _box.min.y;
        } else {
          // grounded: lowest point onto the highest surface under its footprint (floor, bench top, shelf board...)
          const sup = it.on && placed[it.on];
          const sl = sup?.userData.layout;
          if (it.type === 'shelf') o.position.y = 0;
          else if (it.type === 'plank') { o.position.set(it.pos[0], it.pos[1], it.pos[2]); }
          else if (it.noDrop && sup) { // draped things (the rag): origin = the support's top surface just behind pos
            ray.set(v.set(it.pos[0], 5, it.pos[2] - 0.08), down); ray.far = 10;
            const hit = ray.intersectObject(sup, true)[0]; o.position.y = (hit ? hit.point.y : 0) + (it.y || 0);
          } else if (sl?.type === 'shelf' && it.level != null) { // a given shelf board (0 = bottom)
            const n = sl.levels || 5, H = sl.h || 2.4; o.position.y += 0.08 + it.level * (H - 0.12) / (n - 1) + 0.006 - _box.min.y;
          } else dropY(o, supportsOf(it.on), it.on === 'floor');
          o.position.y += it.lift || 0;
        }
        o.updateMatrixWorld(true);
        o.name = it.name; o.userData.layout = it; placed[it.name] = o;
      } catch (e) { console.warn('[shop] model failed', it.glb || it.name, e.message); }
    }
    // wiring and small dressing that makes the place look used (procedural: too thin for image-to-3D):
    // the tube's conduit to a switch, the robot's own power cable to a wall socket, cords hanging off shelf
    // appliances, screwdrivers hanging on the pegboard. One merged mesh per material.
    {
      const cables = [], conduits = [], plastic = [];
      const tube = (pts, r, arr, closed = false, tension = 0.5) => {
        const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', tension);
        arr.push(new THREE.TubeGeometry(c, Math.max(8, pts.length * 10), r, 6, closed));
      };
      const pipe = (pts, r) => { // straight runs with clips (conduit)
        for (let i = 0; i < pts.length - 1; i++) {
          const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]), L = a.distanceTo(b);
          const g = new THREE.CylinderGeometry(r, r, L, 8); g.translate(0, L / 2, 0);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
          g.applyQuaternion(q).translate(a.x, a.y, a.z); conduits.push(g);
          for (let t = 0.25; t < L; t += 0.6) { const c = a.clone().lerp(b, t / L); conduits.push(new THREE.BoxGeometry(0.03, 0.03, 0.03).translate(c.x, c.y, c.z)); }
        }
      };
      // conduit: tube fixture -> along the ceiling -> down the right wall to a switch box at 1.45 m
      pipe([[0.72, h - 0.03, -0.55], [0.72, h - 0.03, 0.3], [w / 2 - 0.03, h - 0.03, 0.3], [w / 2 - 0.03, 1.5, 0.3]], 0.011);
      plastic.push(new THREE.BoxGeometry(0.03, 0.12, 0.085).translate(w / 2 - 0.015, 1.45, 0.3));
      // a wall socket under the pegboard (the robot's long power cable was removed: it read as a stray line)
      { const sx = -1.27, sz = -d / 2; plastic.push(new THREE.BoxGeometry(0.085, 0.085, 0.022).translate(sx, 0.3, sz + 0.011)); }
      const mk = (arr, mat) => { if (!arr.length) return; const m = new THREE.Mesh(mergeGeometries(arr.map((g) => g.index ? g.toNonIndexed() : g)), mat); m.castShadow = m.receiveShadow = true; root.add(m); };
      mk(cables, new THREE.MeshStandardNodeMaterial({ color: 0x101010, roughness: 0.55 }));
      mk(conduits, new THREE.MeshStandardNodeMaterial({ color: 0xc9c3b4, roughness: 0.7 }));
      mk(plastic, new THREE.MeshStandardNodeMaterial({ color: 0xd8d0bc, roughness: 0.5 }));
      // the litter of a repair in progress on the bench top, gathered where the work is (left of the open chassis, by
      // the screw tin): dark screws lying flat, washers, nuts, a removed knob, cut wire ends, solder blobs
      if (placed.workbench) {
        const bits = new THREE.Group(), wb = placed.workbench, rr = (k) => { const x = Math.sin(k * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
        const steelB = PM.bitsDark ??= new THREE.MeshStandardNodeMaterial({ color: 0x4a4740, roughness: 0.5, metalness: 0.85 });
        const brass = PM.brassDark ??= new THREE.MeshStandardNodeMaterial({ color: 0x6e5a2e, roughness: 0.45, metalness: 0.9 });
        const wireB = PM.wireBitsDark ??= new THREE.MeshStandardNodeMaterial({ color: 0x4a1a12, roughness: 0.55 });
        const knobM = PM.knob ??= new THREE.MeshStandardNodeMaterial({ color: 0x1a1612, roughness: 0.4 });
        for (let k = 0; k < 40; k++) {
          const B = k % 5 >= 3, a = rr(k) * Math.PI * 2, r = 0.004 + Math.sqrt(rr(k + 50)) * (B ? 0.026 : 0.038); // two tight heaps: by the chassis, by the tin
          const x = (B ? -1.31 : -1.5) + Math.cos(a) * r * 1.3, z = (B ? 1.14 : 0.94) + Math.sin(a) * r * 0.8;
          ray.set(v.set(x, 2, z), down); ray.far = 3; const hit = ray.intersectObject(wb, true)[0]; if (!hit || hit.point.y < 0.7) continue;
          const kind = k === 0 ? 5 : k % 5; let m;
          if (kind === 0 || kind === 3) { m = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.011, 6).rotateZ(Math.PI / 2), steelB); m.position.y = 0.0021; } // screw
          else if (kind === 1) { m = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0011, 10), steelB); m.position.y = 0.0006; }                          // washer
          else if (kind === 2) { m = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.0028, 6), brass); m.position.y = 0.0014; }                             // nut
          else if (kind === 4) { m = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.022 + rr(k + 3) * 0.02, 4).rotateZ(Math.PI / 2), k % 2 ? wireB : knobM); m.position.y = 0.0008; } // wire end
          else { m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.013, 16), knobM); m.position.y = 0.0065; }                                            // a knob pulled off
          const w0 = new THREE.Group(); w0.position.copy(hit.point); w0.rotation.y = rr(k + 7) * Math.PI * 2; w0.add(m); bits.add(w0);
        }
        root.add(mergeByMaterial(bits));
      }
      // a bare bulb on a flex over the back door corner, enamel shade, switched off
      {
        const bx = 1.75, bz = -1.6, drop = 0.75;
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, drop, 6), PM.cordBlack ??= new THREE.MeshStandardNodeMaterial({ color: 0x151515, roughness: 0.6 }));
        cord.position.set(bx, h - drop / 2, bz); root.add(cord);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.16, 0.09, 24, 1, true), PM.enamel ??= new THREE.MeshStandardNodeMaterial({ color: 0x2f4a3a, roughness: 0.35, side: THREE.DoubleSide }));
        shade.position.set(bx, h - drop - 0.03, bz); shade.castShadow = true; root.add(shade);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), new THREE.MeshStandardNodeMaterial({ color: 0xf2efe6, roughness: 0.15, transparent: true, opacity: 0.85 }));
        bulb.position.set(bx, h - drop - 0.085, bz); root.add(bulb);
      }
      // floor mess that a working shop has and a showroom doesn't: offcuts of wire, two crumpled notes, a few screws
      {
        const mess = new THREE.Group(), rr = (k) => { const x = Math.sin(k * 78.233 + 4.1) * 43758.5453; return x - Math.floor(x); };
        const wireM = [PM.wireMess0 ??= new THREE.MeshStandardNodeMaterial({ color: 0x8a2a1a, roughness: 0.5 }), PM.wireMess1 ??= new THREE.MeshStandardNodeMaterial({ color: 0x1b1b1b, roughness: 0.5 }), PM.wireMess2 ??= new THREE.MeshStandardNodeMaterial({ color: 0xb87333, roughness: 0.35, metalness: 0.9 })];
        const spots = [[-0.72, 1.72], [-1.05, 1.68], [-0.45, 1.6], [-1.75, 1.32], [-2.05, 0.35]];
        spots.forEach(([x0, z0], k) => { // a loose curl of wire, lying flat
          const pts = []; let a = rr(k) * 6.28, x = x0, z = z0;
          for (let i = 0; i < 9; i++) { a += (rr(k * 9 + i) - 0.5) * 1.6; x += Math.cos(a) * 0.035; z += Math.sin(a) * 0.035; pts.push(new THREE.Vector3(x, 0.0025, z)); }
          mess.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0018, 5), wireM[k % 3]));
        });
        const paperM = PM.paper ??= new THREE.MeshStandardNodeMaterial({ color: 0xd9d2bf, roughness: 0.95 });
        [[-1.95, 1.34], [-1.02, 1.3]].forEach(([x, z], k) => { // crumpled notes, dropped by the bench
          const g = new THREE.IcosahedronGeometry(0.032, 1), p = g.attributes.position;
          for (let i = 0; i < p.count; i++) { const f = 0.75 + rr(i * 3 + k * 50) * 0.45; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.85, p.getZ(i) * f); }
          g.computeVertexNormals(); const m = new THREE.Mesh(g, paperM); m.position.set(x, 0.025, z); m.rotation.set(rr(k) * 3, rr(k + 1) * 3, 0); mess.add(m);
        });
        const steelS = PM.bits ??= new THREE.MeshStandardNodeMaterial({ color: 0x9c9a94, roughness: 0.35, metalness: 1 });
        for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.012, 6).rotateZ(Math.PI / 2), steelS); m.position.set(-1.45 + rr(k + 20) * 1.0, 0.0022, 1.3 + rr(k + 40) * 0.5); m.rotation.y = rr(k + 60) * 6; mess.add(m); }
        root.add(mergeByMaterial(mess));
      }
      // spare limbs hang on wall hooks: a screwed plate on the wall, a stout galvanised rod out to the top joint with an
      // upturned tip, and a loop of wire round the joint (the review said the parts read as floating: the hook must show)
      for (const part of [placed.spare_arm, placed.spare_leg]) {
        if (!part || part.userData.layout.wall !== 'right') continue;
        const bb = new THREE.Box3().setFromObject(part, true), cz = (bb.min.z + bb.max.z) / 2, top = bb.max.y - 0.03;
        const galv = PM.hookGalv ??= new THREE.MeshStandardNodeMaterial({ color: 0x7a7872, roughness: 0.45, metalness: 0.85 });
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.1, 0.06), galv); plate.position.set(w / 2 - 0.004, top + 0.025, cz);
        const screws = [-1, 1].map((sy) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10).rotateZ(Math.PI / 2), PM.hook ??= new THREE.MeshStandardNodeMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.8 })); m.position.set(w / 2 - 0.009, top + 0.025 + sy * 0.035, cz); return m; });
        const midx = (bb.min.x + bb.max.x) / 2, rl = w / 2 - midx + 0.012; // wall to the joint's centre line
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, rl, 10).rotateZ(Math.PI / 2), galv);
        rod.position.set(w / 2 - rl / 2, top, cz);
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.04, 10), galv); tip.position.set(midx - 0.006, top + 0.018, cz);
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.0025, 6, 24), galv); loop.position.set(midx, top - 0.012, cz); loop.rotation.y = Math.PI / 2; // wire round the joint
        for (const m of [plate, ...screws, rod, tip, loop]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
      }
      // screwdrivers and a wire coil hanging on the pegboard (in front of the printed board: real depth and shadows)
      const pegX = -1.88, pegY = 1.72, pegZ = -d / 2 + 0.012;
      // the tool wall is real: a bare printed pegboard (holes, a few empty hooks) and every tool on it is geometry
      // hanging 1-3 cm proud of the board on its hook -- spanners, pliers, a hammer, screwdrivers, wire and tape
      const rnd = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
      const tools = new THREE.Group(), Z = pegZ + 0.012;
      const steelT = PM.toolSteel ??= new THREE.MeshStandardNodeMaterial({ color: 0xb4b2ab, roughness: 0.46, metalness: 0.75 }); // satin, not mirror: turned tools caught the lamp as white bars
      const redG = PM.toolRed ??= new THREE.MeshStandardNodeMaterial({ color: 0x8e1d14, roughness: 0.55 });
      const woodH = PM.toolWood ??= new THREE.MeshStandardNodeMaterial({ color: 0x7a5a36, roughness: 0.7 });
      const peg = (x, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 6).rotateX(Math.PI / 2), steelT); m.position.set(x, y, pegZ + 0.015); tools.add(m); };
      const box = (m, w, h, dd, x, y, z, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); o.position.set(x, y, z); o.rotation.z = rz; tools.add(o); return o; };
      // a row of open-ended spanners, graded
      for (let i = 0; i < 5; i++) {
        const L = 0.12 + i * 0.02, x = pegX - 0.5 + [0, 0.018, 0.12, 0.138, 0.25][i], top = pegY + 0.33 - (i === 3 ? 0.03 : 0), tilt = (rnd(i) - 0.5) * 0.35;
        const g = new THREE.Group(); g.position.set(x, top, Z + (i % 2) * 0.006); g.rotation.set(0, [0, 0.7, 0, -0.65, 1.15][i], tilt); tools.add(g); // pairs on one peg, the front one turned out
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.012 + i * 0.001, L, 0.004), steelT); shaft.position.y = -L / 2; g.add(shaft);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009 + i * 0.0008, 0.0035, 6, 14), steelT); ring.position.y = -0.006; g.add(ring);
        { const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.011 + i * 0.0009, 0.0042, 5, 12, Math.PI * 1.25), steelT); jaw.rotation.z = -Math.PI / 2 - Math.PI * 0.625 + Math.PI; jaw.position.set(0, -L - 0.008, 0); g.add(jaw); } // open end
        peg(x, top + 0.004);
      }
      // three different pliers -- combination (钢丝钳), long-nose (尖嘴钳), side cutters (斜口钳): each half is a flat
      // steel profile (jaw + handle) extruded, the two halves stacked at the riveted pivot, handles dipped in plastic
      { const forged = PM.forged ??= new THREE.MeshStandardNodeMaterial({ color: 0x8c8b86, roughness: 0.55, metalness: 0.8 }); // drop-forged, not polished
        const dip = [PM.toolRed ??= redG, PM.dipBlue ??= new THREE.MeshStandardNodeMaterial({ color: 0x1f3550, roughness: 0.55 }), PM.dipRed2 ??= new THREE.MeshStandardNodeMaterial({ color: 0x6e1c12, roughness: 0.6 })];
        const KINDS = [ // jaw outline (right half, from the tip down to the pivot) and handle length
          { jaw: [[0, 0], [0.0065, 0], [0.011, -0.01], [0.0125, -0.028], [0.0115, -0.044]], piv: -0.05, hl: 0.13 },
          { jaw: [[0, 0], [0.0022, 0], [0.004, -0.025], [0.007, -0.05], [0.0105, -0.068]], piv: -0.074, hl: 0.12 },
          { jaw: [[0, 0], [0.0075, -0.002], [0.012, -0.011], [0.0125, -0.022], [0.0105, -0.03]], piv: -0.036, hl: 0.11 }];
        KINDS.forEach((K, i) => {
          const x = pegX + [-0.07, 0.01, 0.335][i], top = pegY + [0.31, 0.29, 0.24][i], g = new THREE.Group(); g.position.set(x, top, Z + 0.014); g.rotation.set(0, [0.62, -0.6, 0.55][i], [0.06, -0.38, 0.2][i]); tools.add(g);
          const pv = K.piv, hl = K.hl;
          const handle = (o) => [[0.0105 + o, pv - 0.004], [0.0125 + o, pv - 0.03], [0.0145 + o, pv - hl * 0.6], [0.0158 + o, pv - hl + 0.004], [0.0118, pv - hl - o], [0.0075 - o, pv - hl + 0.004], [0.0062 - o, pv - hl * 0.6], [0.0042 - o, pv - 0.03], [0.001, pv - 0.004]]; // closed: handle ends ~2.5 cm apart
          for (const sx of [1, -1]) {
            const sh = new THREE.Shape(); const pts = [...K.jaw, ...handle(0), [0, pv + 0.004]];
            pts.forEach(([px, py], j) => (j ? sh.lineTo(sx * px, py) : sh.moveTo(sx * px, py)));
            const st = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.0045, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 1 }), forged);
            const half = new THREE.Group(); half.position.set(0, pv, 0); half.rotation.z = sx * 0.13; g.add(half); // opened ~15 deg about the rivet
            st.position.set(sx * 0.0005, -pv, sx > 0 ? 0 : 0.0048); half.add(st);
            const sl = new THREE.Shape(); handle(0.0016).slice(0, 4).concat(handle(0.0016).slice(5)).forEach(([px, py], j) => (j ? sl.lineTo(sx * px, py) : sl.moveTo(sx * px, py)));
            const dp = new THREE.Mesh(new THREE.ExtrudeGeometry(sl, { depth: 0.0085, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), dip[i]);
            dp.position.set(sx * 0.0005, -pv, (sx > 0 ? 0 : 0.0048) - 0.002); half.add(dp);
          }
          const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0115, 12).rotateX(Math.PI / 2), forged); rv.position.set(0, pv, 0.0047); g.add(rv);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.0052, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), forged); dome.scale.z = 0.45; dome.position.set(0, pv, 0.0104); g.add(dome);
          peg(x, top + 0.004);
        });
      }
      // a claw hammer, head up on two pegs
      { const x = pegX + 0.2, top = pegY + 0.28, hz = Z + 0.006, HG = new THREE.Group(); // turned ~50 deg on its pegs: the split claw shows
        HG.position.set(x, top, hz + 0.012); HG.rotation.y = 0.85; tools.add(HG);
        { const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0128, 0.042, 8).rotateZ(Math.PI / 2), steelT); eye.rotation.x = Math.PI / 8; eye.position.set(-0.004, 0, 0); HG.add(eye); } // octagonal head
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.012, 0.03, 14).rotateZ(Math.PI / 2), steelT); face.position.set(-0.037, 0, 0); HG.add(face);
        const fr = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.004, 14).rotateZ(Math.PI / 2), steelT); fr.position.set(-0.053, 0, 0); HG.add(fr);
        for (const sz of [-1, 1]) { const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.009, 0.06, 6).rotateZ(-Math.PI / 2 - 0.35), steelT); cl.scale.z = 0.55; cl.position.set(0.042, -0.01, sz * 0.0075); HG.add(cl); } // split claw: thick at the eye, tapering down to the tips
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0115, 0.28, 10), woodH); h.position.set(-0.004, -0.15, 0); HG.add(h);
        peg(x - 0.035, top - 0.017); peg(x + 0.03, top - 0.017); }
      // copper wire and black tape on hooks
      { const cu = PM.copper ??= new THREE.MeshStandardNodeMaterial({ color: 0x8a4a22, roughness: 0.35, metalness: 0.8 });
        const cx0 = pegX - 0.09, cy0 = pegY - 0.17;
        for (let t = 0; t < 6; t++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.066 + (t % 3) * 0.0035, 0.0022, 5, 40), cu); c.position.set(cx0 + (t - 2.5) * 0.0012, cy0 - Math.abs(t - 2.5) * 0.001, Z + 0.004 + t * 0.0026); c.rotation.z = t * 0.7; tools.add(c); }
        const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(cx0 + 0.06, cy0 - 0.04, Z + 0.012), new THREE.Vector3(cx0 + 0.09, cy0 - 0.1, Z + 0.016), new THREE.Vector3(cx0 + 0.07, cy0 - 0.15, Z + 0.012)]), 10, 0.0022, 5), cu); tools.add(tail);
        peg(cx0, cy0 + 0.07);
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 24), PM.tape ??= new THREE.MeshStandardNodeMaterial({ color: 0x141414, roughness: 0.45 })); t.position.set(pegX + 0.4, pegY + 0.03, Z + 0.01); tools.add(t); peg(pegX + 0.4, pegY + 0.062); }
      // a panel saw at the right edge, hung by its closed wooden handle: tapered blade with a toothed edge, three brass rivets
      { const x = pegX + 0.5, top = pegY + 0.32, sawM = PM.saw ??= new THREE.MeshStandardNodeMaterial({ color: 0x7c7a74, roughness: 0.58, metalness: 0.75, side: THREE.DoubleSide });
        const g = new THREE.Group(); g.position.set(x, top, Z + 0.004); g.rotation.set(0, 0.8, 0.05); tools.add(g); // turned ~45 deg on its hook: handle thickness, blade edge and teeth all read
        const bl = new THREE.Shape(); bl.moveTo(0.05, -0.05); bl.lineTo(0.035, -0.47); // straight back
        const n = 120; for (let t = 0; t <= n; t++) { const f = t / n, y = -0.47 + 0.42 * f - (t % 2 ? 0.0034 : 0), xe = -0.03 + (-0.06 + 0.03) * f; bl.lineTo(xe - (t % 2 ? 0.0034 : 0), y); } // sharp sawteeth: steep front, sloped back
        bl.closePath();
        g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(bl, { depth: 0.0009, bevelEnabled: false }), sawM));
        const hd = new THREE.Shape(); hd.moveTo(-0.07, -0.085); hd.lineTo(0.065, -0.07); hd.quadraticCurveTo(0.07, 0.03, 0.03, 0.035); hd.lineTo(-0.035, 0.03); hd.quadraticCurveTo(-0.075, 0.02, -0.07, -0.085);
        const hole = new THREE.Path(); hole.moveTo(-0.035, -0.03); hole.lineTo(0.035, -0.025); hole.quadraticCurveTo(0.042, 0.012, 0.02, 0.012); hole.lineTo(-0.025, 0.01); hole.quadraticCurveTo(-0.042, 0.0, -0.035, -0.03); hd.holes.push(hole);
        const h = new THREE.Mesh(new THREE.ExtrudeGeometry(hd, { depth: 0.02, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }), woodH); h.position.z = -0.0095; g.add(h);
        for (const [rx, ry] of [[-0.04, -0.062], [0.0, -0.06], [0.04, -0.057]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.027, 10).rotateX(Math.PI / 2), PM.brassRivet ??= new THREE.MeshStandardNodeMaterial({ color: 0x9a7a38, roughness: 0.35, metalness: 0.9 })); r.position.set(rx, ry, 0.0005); g.add(r); }
        peg(x, top + 0.015); }
      for (let i = 0; i < 4; i++) { const x = pegX + 0.08 + i * 0.022, top = pegY + 0.12 + [0, -0.045, 0.02, -0.07][i]; box(PM.file ??= new THREE.MeshStandardNodeMaterial({ color: 0x55534e, roughness: 0.6, metalness: 0.6 }), 0.012 - i * 0.001, 0.2 - i * 0.02, 0.004, x, top - 0.1 + i * 0.01, Z + 0.003, (i - 1.5) * 0.04); box(woodH, 0.016, 0.06, 0.016, x, top + 0.015 + i * 0.01, Z + 0.006, (i - 1.5) * 0.04); }
      // screwdrivers along the bottom, then a few more on the right
      let k = 0;
      const TILT = [0.35, -0.04, -0.33, 0.06, -0.02, 0.3, 0.05];
      for (const [x0, y0, n, step] of [[-0.46, -0.12, 3, 0.085], [0.12, -0.15, 4, 0.07]]) for (let i = 0; i < n; i++, k++) {
        const sd = procItem('screwdriver', k); sd.rotation.z = -Math.PI / 2 + TILT[k]; sd.scale.setScalar([0.8, 1.15, 0.95, 1.0, 0.85, 1.2, 0.9][k]);
        sd.position.set(pegX + x0 + i * step + (rnd(k + 11) - 0.5) * 0.025, pegY + y0 + (rnd(k + 5) - 0.5) * 0.05, pegZ + 0.016); tools.add(sd);
      }
      tools.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      root.add(mergeByMaterial(tools)); // a few hundred small meshes -> one per material
    }
    // the robot's head droops forward and to one side while it is asleep (rest pose; the beam phases animate it later)
    const head = placed.robot?.getObjectByName('robot_head');
    if (head) {
      this.head = head; head.rotation.set(0.5, 0.3, -0.05); // head bowed over its work: the lens looks down at the screwdriver tip on the spare torso
      // the camera-lens eye: the texture's bright orange core becomes emissive (dim "asleep" glow for now)
      head.traverse((m) => {
        if (!m.isMesh || /badge/i.test(m.name) || /badge/i.test(m.material?.name || '')) return;
        const src = m.material, nm = new THREE.MeshStandardNodeMaterial();
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'roughness', 'metalness', 'aoMapIntensity']) if (src[k] !== undefined) nm[k] = src[k];
        if (src.normalScale) nm.normalScale.copy(src.normalScale);
        const c = texture(src.map).rgb;
        const core = smoothstep(0.7, 0.9, c.r).mul(smoothstep(0.3, 0.5, c.g)).mul(float(1).sub(smoothstep(0.28, 0.45, c.b)));
        nm.emissiveNode = c.mul(core).mul(eyeGlow);
        m.material = nm;
      });
    }
    // the robot's badges (chrome "上海" on the face, "人民电器" plate on the chest) are geometry inside robot.glb
    // (tools/blender/robot_badges.py), parented to the head/body so they move with them
    // review fill on the hero (the street's dusk spilling in): soft, unshadowed, so the robot's parts read
    if (placed.robot) {
      const rf = new THREE.SpotLight(0xd8dcef, 7, 6, 0.42, 1, 1.5); rf.castShadow = false;
      const rp = placed.robot.position; rf.position.set(rp.x + 1.1, 1.9, rp.z + 1.6); rf.target.position.set(rp.x, 0.62, rp.z);
      scene.add(rf, rf.target); this.robotFill = rf;
    }
    // the desk lamp, if placed, drives the warm key light
    const lampObj = placed.desk_lamp;
    if (lampObj) { _box.setFromObject(lampObj); this.lamp.position.set((_box.min.x + _box.max.x) / 2 + 0.1, _box.max.y - 0.12, (_box.min.z + _box.max.z) / 2); this.lamp.target.position.set(this.lamp.position.x + 0.3, 0.8, this.lamp.position.z + 0.2); } // (under the shade's rim: the shade inside is not lit point-blank)
    else { this.lamp.position.set(-1.6, 1.45, 0.1); this.lamp.target.position.set(-1.2, 0.8, 0.2); }
    // repeated generated models are drawn instanced: one draw per mesh per model type instead of one per copy
    // (the placed copies stay, hidden, for picking and the audit). Tints become per-instance colours. ?noinst = off
    if (ctx.params.get('noinst') === null) {
      const groups = new Map();
      for (const o of Object.values(placed)) { const L = o.userData.layout; if (!L.glb || L.glb === 'robot.glb' || (await templates.get(L.glb))?.lod) continue; (groups.get(L.glb) ?? groups.set(L.glb, []).get(L.glb)).push(o); } // LOD copies switch levels: not instanced
      root.updateMatrixWorld(true);
      const inv = root.matrixWorld.clone().invert(), col = new THREE.Color();
      for (const [glb, objs] of groups) {
        if (objs.length < 3) continue;
        const tpl = (await templates.get(glb))?.scene; if (!tpl) continue;
        const tplMeshes = []; tpl.traverse((m) => { if (m.isMesh) tplMeshes.push(m); });
        const per = objs.map((o) => { const ms = []; o.traverse((m) => { if (m.isMesh) ms.push(m); }); return ms; });
        if (per.some((ms) => ms.length !== tplMeshes.length)) continue;
        tplMeshes.forEach((tm, mi) => {
          const im = new THREE.InstancedMesh(tm.geometry, tm.material, objs.length);
          objs.forEach((o, k) => {
            im.setMatrixAt(k, inv.clone().multiply(per[k][mi].matrixWorld));
            const t = o.userData.layout.tint; im.setColorAt(k, t ? col.setRGB(t[0], t[1], t[2]) : col.setRGB(1, 1, 1));
          });
          im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); im.name = `inst:${glb}:${mi}`;
          root.add(im);
        });
        for (const o of objs) o.visible = false;
      }
    }
    ctx.api.shop = { root, placed, ROOM, lod, rig, eyeGlow, lights: { hemi, dusk, lamp: this.lamp, fill, tube: this.tubeLight, tubeGlow, robotFill: this.robotFill }, review: !ctx.isShot && ctx.params.get('review') !== null };
    ctx.postfx.memoryGrade = true; // the past inside the beam is graded per pixel (src/engine/PostFX.js)
    Object.assign(ctx.postfx.params, { bloomRadius: 0.35, bloomStrength: 0.26, bloomThreshold: 2.2 }); // a tight glow round the hottest cores only (the lamp's shade is lit point-blank: it must not flare)
    // the face light for the robot's close-ups (story: wait / waking), soft and unshadowed, off otherwise (never removed:
    // changing the light set recompiles every material)
    if (placed.robot) { const fl = this.faceLight = new THREE.SpotLight(0xffe2c0, 0, 3, 0.5, 1, 1.5); fl.castShadow = false;
      fl.position.set(-1.35, 1.05, 0.62); fl.target.position.set(-0.6, 0.8, 0.98); scene.add(fl, fl.target); ctx.api.shop.faceLight = fl; } // from the bench side: a side light that shows the volumes
    // review viewer (this phase has no story camera yet): orbit/zoom/pan with the mouse, number keys jump to the
    // review shots, the camera is kept inside the room (or out on the street in front of it)
    if (!ctx.isShot && ctx.params.get('review') !== null) { // the free review viewer (the story owns the camera otherwise)
      const cam = ctx.camera, oc = this.controls = new OrbitControls(cam, ctx.renderer.domElement);
      oc.enableDamping = true; oc.dampingFactor = 0.08; oc.minDistance = 0.3; oc.maxDistance = 9; oc.maxPolarAngle = Math.PI * 0.53;
      const KEYS = ['shop-establish', 'shop-robotfull', 'shop-bench', 'shop-back', 'shop-left', 'shop-robotface', 'shop-front', 'shop-iso'];
      const go = (name) => { const v = SHOTS[name]; if (!v) return; cam.position.set(...v.pos); cam.fov = v.fov ?? 50; cam.updateProjectionMatrix(); oc.target.set(...v.look); oc.update(); };
      go('shop-establish');
      addEventListener('keydown', (e) => { const k = Number(e.key); if (k >= 1 && k <= KEYS.length) go(KEYS[k - 1]); });
      // double-click a model: the camera glides to a 3/4 view of it and orbits around it; its name and triangle
      // count show bottom-left (every placed model here was generated with Tripo)
      const NAMES = { 'robot.glb': '机器人', 'workbench.glb': '工作台', 'desk_lamp.glb': '台灯', 'tube_radio_open.glb': '拆开的电子管收音机', 'tube_radio_closed.glb': '电子管收音机',
        'crt_tv.glb': '显像管电视', 'desk_fan.glb': '台式电风扇', 'cassette_recorder.glb': '收录机', 'alarm_clock.glb': '闹钟', 'thermos.glb': '暖水瓶', 'enamel_mug.glb': '搪瓷杯',
        'magnifier.glb': '放大镜', 'soldering_iron.glb': '电烙铁', 'toolbox.glb': '铁皮工具箱', 'stool.glb': '木凳', 'parts_cabinet.glb': '零件抽屉柜', 'wall_clock.glb': '摆钟',
        'back_door.glb': '后屋门', 'bicycle.glb': '二八自行车', 'spare_arm.glb': '备用手臂', 'spare_leg.glb': '备用腿', 'spare_torso.glb': '备用躯干', '../v2/meterbox.glb': '电表箱', '../v2/cardboard.glb': '压扁的纸箱' };
      const pick = new THREE.Raycaster(), ndc = new THREE.Vector2(), fly = this.fly = { t: 1 }; pick.layers.enableAll(); // (the robot draws on its own layer)
      const info = document.createElement('div');
      Object.assign(info.style, { position: 'fixed', left: '16px', bottom: '36px', font: '15px/1.4 -apple-system, "PingFang SC", sans-serif', color: 'rgba(245,238,224,0.92)', textShadow: '0 1px 3px rgba(0,0,0,0.85)', pointerEvents: 'none', transition: 'opacity 0.6s', opacity: '0' });
      document.getElementById('ui')?.appendChild(info);
      ctx.renderer.domElement.addEventListener('dblclick', (ev) => {
        const r = ctx.renderer.domElement.getBoundingClientRect();
        ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        pick.setFromCamera(ndc, cam);
        const hit = pick.intersectObjects(Object.values(placed), true)[0]; if (!hit) return;
        let o = hit.object; while (o && !o.userData?.layout) o = o.parent;
        if (!o || !o.userData.layout.glb) return;
        const b = new THREE.Box3().setFromObject(o, true), c = b.getCenter(new THREE.Vector3()), rad = b.getSize(new THREE.Vector3()).length() / 2;
        // try directions around the model, starting from the current one: take the first whose view line is clear
        // of other objects and that stays inside the room (or out in the street for street things)
        const base = Math.atan2(cam.position.x - c.x, cam.position.z - c.z), dist = Math.max(0.45, rad * 2.6), others = Object.values(placed).filter((x) => x !== o);
        let p1 = null;
        for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, 3.14]) {
          const a = base + da, dir = new THREE.Vector3(Math.sin(a) * 0.8, 0.45, Math.cos(a) * 0.8).normalize(), p = c.clone().addScaledVector(dir, dist);
          const inside = c.z > ROOM.d / 2 + 0.25 || (Math.abs(p.x) < ROOM.w / 2 - 0.15 && p.z > -ROOM.d / 2 + 0.15 && p.z < ROOM.d / 2 - 0.15 && p.y < ROOM.h - 0.15);
          if (!inside) continue;
          pick.set(c, dir); pick.far = dist; if (pick.intersectObjects(others, true).length) continue;
          p1 = p; break;
        }
        if (!p1) return;
        Object.assign(fly, { t: 0, p0: cam.position.clone(), q0: oc.target.clone(), p1, q1: c });
        let tris = 0; o.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
        let lo = o; while (lo && !lo.isLodObject) lo = lo.children?.[0];
        const raw = lo?.set.levels[0].tris;
        info.textContent = `${NAMES[o.userData.layout.glb] || o.userData.layout.glb} · Tripo 生成 · ${raw ? `原始 ${(raw / 1e4).toFixed(0)} 万三角面,靠近时显示原始模型` : `${(tris / 1000).toFixed(1)} 千三角面`}`;
        info.style.opacity = '1'; clearTimeout(this._infoT); this._infoT = setTimeout(() => (info.style.opacity = '0'), 7000);
      });
      // a small, quiet hint for reviewers (bottom-left); fades after a while, any key brings it back
      const ui = document.getElementById('ui');
      if (ui) {
        const hint = document.createElement('div');
        hint.textContent = '拖动旋转 · 右键平移 · 滚轮缩放 · 双击模型看近景 · 数字键 1–8 切换机位';
        Object.assign(hint.style, { position: 'fixed', left: '16px', bottom: '14px', font: '13px/1.4 -apple-system, "PingFang SC", sans-serif', color: 'rgba(235,228,214,0.78)', letterSpacing: '0.04em', textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none', transition: 'opacity 1.2s', opacity: '1' });
        ui.appendChild(hint);
        let t = setTimeout(() => (hint.style.opacity = '0'), 9000);
        addEventListener('keydown', () => { hint.style.opacity = '1'; clearTimeout(t); t = setTimeout(() => (hint.style.opacity = '0'), 6000); });
      }
    }
  },
  update(dt, t, ctx) {
    this.lod?.update(ctx.camera, ctx.renderer, ctx.isShot ? 1 : 4);
    const oc = this.controls; if (!oc) return;
    const f = this.fly;
    if (f && f.t < 1) { f.t = Math.min(1, f.t + dt / 0.9); const k = f.t * f.t * (3 - 2 * f.t); ctx.camera.position.lerpVectors(f.p0, f.p1, k); oc.target.lerpVectors(f.q0, f.q1, k); }
    oc.update();
    const p = ctx.camera.position, R = ROOM, wallZ0 = R.d / 2 - 0.12, wallZ1 = R.d / 2 + 0.25 + 0.12;
    if (p.z < wallZ0) { p.x = Math.max(-R.w / 2 + 0.12, Math.min(R.w / 2 - 0.12, p.x)); p.z = Math.max(-R.d / 2 + 0.12, p.z); p.y = Math.max(0.15, Math.min(R.h - 0.12, p.y)); }
    else if (p.z < wallZ1) { p.x = Math.max(-1.68, Math.min(1.68, p.x)); p.y = Math.max(0.15, Math.min(1.85, p.y)); } // in the doorway: between the jambs, under the shutter
    else { p.y = Math.max(0.1, p.y); p.z = Math.min(p.z, 12); }
  },
};
