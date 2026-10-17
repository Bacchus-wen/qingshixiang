import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { color, float, mix, mx_fractal_noise_float, mx_noise_float, positionWorld, smoothstep, vec2, vec3, mx_worley_noise_float, texture, normalWorldGeometry, abs, step, uniform } from 'three/tsl';

// v4: the closed-down home-appliance repair shop (docs/scene-shop.md). This phase is models + layout only:
// a simple room shell, the Tripo models placed from /models/shop/layout.json (every item is grounded on its
// support surface automatically), plain review lighting (desk lamp warm key, blue dusk from the street).
// Room: x in [-3, 3], z in [-2.25, 2.25] (front/shutter at +z), floor y = 0, ceiling 3.0.
export const ROOM = { w: 6.0, d: 4.5, h: 3.0 };

// room surfaces and printed things: photographic textures generated with the company platform (gpt-image-2.5,
// docs/gen-log.md), shipped as KTX2 (tools/tex-ktx2.sh: ~1 byte/px on the GPU instead of 4). Tiled surfaces are mapped
// in world space so walls and floor line up without UV work. All are loaded up front (init awaits them).
const TEX = {};
const TEX_NAMES = ['floor_terrazzo', 'wall_upper', 'wall_dado', 'ceiling', 'facade', 'pavement', 'shutter', 'cardboard', 'pegboard',
  'poster', 'calendar', 'price_list', 'slogan', 'sign_main', 'sign_side', 'tags', 'box_a', 'box_b', 'tv_poster', 'notice'];
async function loadTextures(ktx2) {
  await Promise.all(TEX_NAMES.map(async (n) => {
    const t = await ktx2.loadAsync(`${import.meta.env.BASE_URL}textures/shop/${n}.ktx2`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; TEX[n] = t;
  }));
}
const tex = (name) => TEX[name];
function terrazzo() {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld;
  const T = texture(tex('floor_terrazzo'), P.xz.div(0.75));
  const grime = smoothstep(0.35, 0.85, mx_noise_float(vec3(P.x.mul(0.7), 0, P.z.mul(0.7)).add(2.0)).mul(0.5).add(0.5));
  m.colorNode = T.rgb.mul(mix(float(1.0), float(0.7), grime));
  m.roughnessNode = mix(float(0.32), float(0.7), grime);  // polished where nobody walks, dull along the paths
  return m;
}
function wallMat() {
  // yellowed lime plaster above, dark green gloss dado below 1.2 m with a thin darker stripe on top
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld, N = normalWorldGeometry;
  const u = abs(N.x).greaterThan(0.5).select(P.z, P.x);
  const uv = vec2(u.div(2.2), P.y.div(2.2).add(abs(N.x).mul(0.37)));
  const upper = texture(tex('wall_upper'), uv).rgb;
  const dado = texture(tex('wall_dado'), uv).rgb;
  const isDado = float(1).sub(step(1.2, P.y));
  const stripe = smoothstep(1.2, 1.205, P.y).mul(float(1).sub(smoothstep(1.225, 1.23, P.y)));
  let c = mix(upper, dado, isDado);
  c = mix(c, vec3(0.06, 0.12, 0.08), stripe);
  const floorDirt = smoothstep(0.35, 0.0, P.y).mul(0.35);
  const broad = mx_noise_float(vec3(u.mul(0.45), P.y.mul(0.6), 1.7)).mul(0.12);  // breaks the tile repeat
  m.colorNode = c.mul(float(1).sub(floorDirt)).mul(float(1).add(broad));
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
function shutterMat() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.35 });
  const P = positionWorld;
  m.colorNode = texture(tex('shutter'), vec2(P.x.div(1.2), P.y.div(1.2))).rgb;
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
function carton(front, W, H, D) {
  cardboardMat ??= new THREE.MeshStandardNodeMaterial({ map: tex('cardboard'), roughness: 0.92 });
  const side = cardboardMat;
  const f = new THREE.MeshStandardNodeMaterial({ map: tex(front), roughness: 0.9 });
  const g = new THREE.BoxGeometry(W, H, D, 4, 2, 4).translate(0, H / 2, 0);
  const G = g.groups; // px, nx, py, ny, pz, nz in index order: merge into two runs -> two draw calls
  g.groups = [{ start: G[0].start, count: G[4].start - G[0].start, materialIndex: 0 }, { start: G[4].start, count: G[5].start + G[5].count - G[4].start, materialIndex: 1 }];
  const o = new THREE.Mesh(g, [side, f]); o.castShadow = o.receiveShadow = true;
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
  } else if (kind === 'screwdriver') { // lying on the bench: handle + shaft along x
    const handle = pmat('handle' + (seed % 2), { color: seed % 2 ? 0xb8241c : 0xd9a520, roughness: 0.4 });
    const steel = pmat('steel', { color: 0xb8b8b8, roughness: 0.25, metalness: 1 });
    add(new THREE.CylinderGeometry(0.012, 0.014, 0.1, 12).rotateZ(Math.PI / 2), handle, -0.05, 0.014, 0);
    add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, 8).rotateZ(Math.PI / 2), steel, 0.06, 0.014, 0);
  } else if (kind === 'tin') { // round screw tin, lid leaning against it
    const tinM = pmat('tin', { color: 0x6e7b6a, roughness: 0.45, metalness: 0.7 });
    const dark = pmat('tinIn', { color: 0x1c1a17, roughness: 0.8 });
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 28, 1, true), tinM, 0, 0.015, 0).material.side = THREE.DoubleSide;
    add(new THREE.CylinderGeometry(0.044, 0.044, 0.004, 28), dark, 0, 0.012, 0);
    const lid = add(new THREE.CylinderGeometry(0.047, 0.047, 0.006, 28), tinM, 0.075, 0.003, 0.01);
  } else if (kind === 'rag') { // a cloth draped over the bench's front edge: top part on the bench, the rest hanging
    const m = PM.rag ??= (() => { // grubby striped cotton: faded blue stripes, oil/grease blotches
      const r = new THREE.MeshStandardNodeMaterial({ roughness: 0.97, side: THREE.DoubleSide });
      const P = positionWorld;
      const stripe = smoothstep(0.35, 0.5, mx_noise_float(vec3(P.x.mul(2), 0, 0)).mul(0).add(P.x.add(P.z).mul(40).sin().mul(0.5).add(0.5)));
      const grease = smoothstep(0.45, 0.8, mx_fractal_noise_float(P.mul(18), 3, 2, 0.5).mul(0.5).add(0.5));
      r.colorNode = mix(mix(vec3(0.13, 0.115, 0.09), vec3(0.045, 0.06, 0.09), stripe.mul(0.7)), vec3(0.025, 0.02, 0.015), grease.mul(0.75)); // linear values
      return r;
    })();
    const geo = new THREE.PlaneGeometry(0.26, 0.42, 12, 24); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), t = (p.getY(i) + 0.21) / 0.42; // t: 0 = hanging end, 1 = end lying on the bench
      const lying = 0.16; // length lying on the bench (m)
      const s = (1 - t) * 0.42;      // distance from the bench-top end
      let y, z;
      if (s < lying) { y = 0.004 + 0.003 * Math.sin(x * 60 + s * 40); z = -(lying - s); }
      else { const a = Math.min((s - lying) / 0.03, 1) * Math.PI / 2; const r = 0.015; const hang = Math.max(s - lying - 0.03 * 0.64, 0);
             y = 0.004 - r * Math.sin(a) - hang; z = r * (1 - Math.cos(a)) + 0.01 * Math.sin(x * 40 + hang * 30) * Math.min(hang * 8, 1); }
      p.setXYZ(i, x + 0.01 * Math.sin(s * 25), y, z);
    }
    geo.computeVertexNormals();
    add(geo, m);
  } else if (kind === 'coil') { // a coil of black flex cable on the floor
    const m = pmat('flex', { color: 0x161616, roughness: 0.5 });
    for (let k = 0; k < 4; k++) add(new THREE.TorusGeometry(0.14 - k * 0.006, 0.006, 8, 40).rotateX(Math.PI / 2), m, (k % 2) * 0.006, 0.006 + k * 0.011, k * 0.004);
  }
  return g;
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
    boardMat.colorNode = mix(vec3(0.3, 0.33, 0.3), vec3(0.24, 0.17, 0.11), smoothstep(0.5, 0.85, mx_noise_float(P.mul(3.3)).mul(0.5).add(0.5)).mul(0.6));
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
    // KTX2 (Basis) textures for the room and the models: transcoded to the GPU's native compressed format
    const ktx2 = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(ctx.renderer);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
    let layout = [];
    try { layout = await (await fetch(`${import.meta.env.BASE_URL}models/shop/layout.json`, { cache: 'no-store' })).json(); } catch { layout = []; }
    // every distinct model is fetched + parsed once (in parallel with the textures); placed items are clones that
    // share geometry, materials and GPU textures (8 boomboxes = one set of textures, not eight)
    const templates = new Map();
    for (const glb of new Set(layout.filter((i) => i.glb).map((i) => i.glb))) templates.set(glb, loader.loadAsync(`${import.meta.env.BASE_URL}models/shop/${glb}`).catch((e) => { console.warn('[shop] model failed', glb, e.message); return null; }));
    await Promise.all([loadTextures(ktx2), ...templates.values()]);
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
    const wall = (W, H, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; root.add(m); return m; };
    wall(w, h, 0, h / 2, -d / 2, 0);
    wall(d, h, -w / 2, h / 2, 0, Math.PI / 2);
    wall(d, h, w / 2, h / 2, 0, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), ceilingMat());
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
      for (let y = 2.55; y > 2.3; y -= 0.075) { const s = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.02), sm); s.position.set(0, y, d / 2 + 0.05); s.castShadow = true; slats.add(s); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.05), sm); bar.position.set(0, 2.27, d / 2 + 0.05); slats.add(bar);
      // guide channels the shutter runs in: U-section steel on both jambs, floor to lintel
      const rail = new THREE.MeshStandardNodeMaterial({ color: 0x4a4d4f, roughness: 0.55, metalness: 0.6 });
      for (const sx of [-1, 1]) {
        const x = sx * (1.8 - 0.03);
        for (const [w, dz] of [[0.06, -0.035], [0.06, 0.035]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, 0.008), rail); f.position.set(x, 1.3, d / 2 + 0.05 + dz); f.castShadow = true; slats.add(f); }
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.008, 2.6, 0.078), rail); web.position.set(sx * 1.8 - sx * 0.004, 1.3, d / 2 + 0.05); slats.add(web);
      }
      root.add(slats);
    }
    // printed things on the walls (generated with the company platform, docs/gen-log.md)
    root.add(onWall(decal('pegboard', 1.2, 0.8), 'back', -1.83, 1.72, 0.012));
    root.add(onWall(decal('poster', 0.46, 0.69, { curl: 0.012 }), 'left', 0.12, 1.86));
    root.add(onWall(decal('calendar', 0.34, 0.51, { curl: 0.01 }), 'back', 2.63, 1.4));
    root.add(onWall(decal('price_list', 0.4, 0.6, { curl: 0.01 }), 'right', -1.42, 1.78));
    root.add(onWall(decal('slogan', 0.96, 0.64), 'right', -0.5, 2.38, 0.015));
    root.add(onWall(decal('tv_poster', 0.4, 0.6, { curl: 0.012 }), 'left', 1.22, 2.36));
    root.add(onWall(decal('notice', 0.36, 0.54, { curl: 0.008 }), 'right', -1.98, 1.72));
    root.add(onWall(decal('sign_main', 2.4, 1.2, { rough: 0.6 }), 'front-out', 0, 3.42, 0.01));
    root.add(onWall(decal('sign_side', 0.82, 1.64, { rough: 0.6 }), 'front-out', -2.4, 1.62, 0.01));
    // review lighting: warm desk lamp key, cold dusk from the street, a weak bounce so models read
    scene.add(new THREE.HemisphereLight(0x8a94a8, 0x403428, 0.7));
    const dusk = new THREE.DirectionalLight(0x9db4d6, 1.4); dusk.position.set(1.5, 2.2, 8); dusk.target.position.set(-0.5, 0, -1);
    dusk.castShadow = true; dusk.shadow.mapSize.setScalar(2048); dusk.shadow.camera.left = -5; dusk.shadow.camera.right = 5; dusk.shadow.camera.top = 5; dusk.shadow.camera.bottom = -5; dusk.shadow.bias = -0.0004;
    scene.add(dusk, dusk.target);
    this.lamp = new THREE.SpotLight(0xffc489, 18, 6, 0.9, 0.6, 1.5); this.lamp.castShadow = true; this.lamp.shadow.mapSize.setScalar(1024); this.lamp.shadow.bias = -0.0005;
    scene.add(this.lamp, this.lamp.target);
    const fill = new THREE.PointLight(0xffd9a8, 3, 7, 1.5); fill.position.set(0, 2.7, 0); scene.add(fill);

    // environment for reflections (PBR metals read black without one): the room itself, coarsely -- warm dim walls,
    // the fluorescent tube, the dusk-blue shop opening, the desk lamp's hot spot -- baked once into a PMREM
    {
      const env = new THREE.Scene();
      const bm = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
      const room = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bm(0x4a4236, 0.9)); room.position.y = h / 2; env.add(room);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2c2822 })); fl.position.y = 0.01; env.add(fl);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff8ee).multiplyScalar(6) })); tube.position.set(0.1, h - 0.08, -0.55); env.add(tube);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6f86ad).multiplyScalar(1.6), side: THREE.DoubleSide })); door.position.set(0, 1.3, d / 2 - 0.01); env.add(door);
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
      const tubeM = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.3 }); tubeM.emissiveNode = vec3(1.0, 1.03, 0.95).mul(2.2);
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 12).rotateZ(Math.PI / 2), tubeM); tb.position.y = -0.06; fx.add(tb);
      for (const sx of [-0.62, 0.62]) { const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.05), body.material); cap.position.set(sx, -0.055, 0); fx.add(cap); }
      root.add(fx);
      const tl = new THREE.PointLight(0xf2f0e6, 5.5, 8, 1.5); tl.position.set(0.1, h - 0.15, -0.55); scene.add(tl);
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
        else if (it.type === 'carton') o = carton(it.front, ...it.size);
        else if (it.type === 'proc') o = procItem(it.kind, it.seed);
        else {
          const g = await templates.get(it.glb); if (!g) continue; o = g.scene.clone(true);
          // yaw0: the generated model sits diagonally in its own frame (bicycle): pre-rotate it inside a pivot so the
          // item's long axis is x, then ry/roll act about the real axes
          if (it.yaw0) { const piv = new THREE.Group(); o.rotation.y = it.yaw0 * Math.PI / 180; piv.add(o); o = piv; }
        }
        o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        // per-instance tint so repeated models read as different units (black vs silver boombox, grey vs wood TV)
        if (it.tint) o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.setRGB(...it.tint); } });
        if (it.scale) o.scale.setScalar(it.scale);
        o.rotation.order = 'YXZ'; o.rotation.y = (it.ry || 0) * Math.PI / 180; o.rotation.x = (it.roll || 0) * Math.PI / 180; // roll: lean about the item's own long (x) axis
        o.position.set(it.pos[0], 0, it.pos[2]); o.name = it.name;
        root.add(o); o.updateMatrixWorld(true);
        _box.setFromObject(o, !!it.wall); // precise (vertex) box for wall-mounted items: flush means flush
        if (it.wall) {
          // wall-mounted: back face flush with the wall plane, bottom at the given height
          const { w: W, d: D } = ROOM;
          if (it.wall === 'back') o.position.z += -D / 2 - _box.min.z;
          if (it.wall === 'left') o.position.x += -W / 2 - _box.min.x;
          if (it.wall === 'right') o.position.x += W / 2 - _box.max.x;
          o.position.y += (it.pos[1] ?? 1.5) - _box.min.y;
        } else {
          // grounded: lowest point onto the highest surface under its footprint (floor, bench top, shelf board...)
          const sup = it.on && placed[it.on];
          const sl = sup?.userData.layout;
          if (it.type === 'shelf') o.position.y = 0;
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
    // the robot's head droops forward and to one side while it is asleep (rest pose; the beam phases animate it later)
    const head = placed.robot?.getObjectByName('robot_head');
    if (head) {
      this.head = head; head.rotation.set(0.14, 0.32, -0.06); // dozing, but turned a little toward the door/street
      // the camera-lens eye: the texture's bright orange core becomes emissive (dim "asleep" glow for now)
      head.traverse((m) => {
        if (!m.isMesh || /badge/i.test(m.name) || /badge/i.test(m.material?.name || '')) return;
        const src = m.material, nm = new THREE.MeshStandardNodeMaterial();
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'roughness', 'metalness', 'aoMapIntensity']) if (src[k] !== undefined) nm[k] = src[k];
        if (src.normalScale) nm.normalScale.copy(src.normalScale);
        const c = texture(src.map).rgb;
        const core = smoothstep(0.7, 0.9, c.r).mul(smoothstep(0.3, 0.5, c.g)).mul(float(1).sub(smoothstep(0.28, 0.45, c.b)));
        nm.emissiveNode = c.mul(core).mul(this.eyeGlow = uniform(1.6));
        m.material = nm;
      });
    }
    // the robot's badges (chrome "上海" on the face, "人民电器" plate on the chest) are geometry inside robot.glb
    // (tools/blender/robot_badges.py), parented to the head/body so they move with them
    // the desk lamp, if placed, drives the warm key light
    const lampObj = placed.desk_lamp;
    if (lampObj) { _box.setFromObject(lampObj); this.lamp.position.set((_box.min.x + _box.max.x) / 2 + 0.1, _box.max.y - 0.05, (_box.min.z + _box.max.z) / 2); this.lamp.target.position.set(this.lamp.position.x + 0.3, 0.8, this.lamp.position.z + 0.2); }
    else { this.lamp.position.set(-1.6, 1.45, 0.1); this.lamp.target.position.set(-1.2, 0.8, 0.2); }
    ctx.api.shop = { root, placed, ROOM };
  },
  update() {},
};
