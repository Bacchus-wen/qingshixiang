// The shop as it is now, and as it was (2026-10-23, the user: "既然要走落败现在与回忆,那房间内的所有物体是不是要做残破版来
// 对比" -- chose a decay layer on everything plus true broken models for four of the sets). Outside the robot's beam every
// thing in the shop is the present: grey dust lying on whatever faces up, grime, the colours faded and the gloss gone;
// where the beam falls it is as it was -- clean, the colours full -- per pixel, by the same memory mask as the street's
// photographs. The robot's corner (it, its bench and what lies on it) is left alone: the one place it still keeps.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, mix, smoothstep, clamp, luminance, positionWorld, normalWorld, materialColor, materialRoughness,
  materialMetalness, mx_noise_float, uniform, uv, length, atan, abs, fract, step, cameraPosition, max, min, sin, cos, dot, vec2,
  hash, instanceIndex, texture,
} from 'three/tsl';
import { memoryMask } from '../../materials/memory.js';
import { ditherNoise } from './lod.js';

// how much of the present shows (?nodecay: none -- for comparisons; the review shots can set it too)
export const decayK = uniform(1);
const DUST = vec3(0.40, 0.385, 0.36); // pale grey-brown, a little warm (lime plaster and street dust)
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// the past here, one node for every material of the layer (a material that masks by it and colours by it works it out
// once)
const PAST = memoryMask(positionWorld);

// The layer's noise is read from a texture: a tiling 2D gradient noise, 32 cells across 512 texels, made once here --
// dust lies on what faces up and the tide marks run down walls, so a plane's worth of noise is enough, and a texel
// read costs a fraction of a 3D noise worked out per pixel on every surface of the shop (~1 ms a frame between them).
// 0..1 like noise x 0.5 + 0.5; one tile is 32 noise cells (3.6 m of floor at the dust's scale)
const NOISE_CELLS = 32;
const NOISE = (() => {
  const N = 512, C = NOISE_CELLS, g = new Float32Array(C * C * 2), data = new Uint8Array(N * N);
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < C * C; i++) { const a = r() * Math.PI * 2; g[i * 2] = Math.cos(a); g[i * 2 + 1] = Math.sin(a); }
  const f = (t) => t * t * t * (t * (t * 6 - 15) + 10), dg = (i, j, x, y) => { const k = (((j % C) * C) + (i % C)) * 2; return g[k] * x + g[k + 1] * y; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) * C / N, v = (y + 0.5) * C / N, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = f(fu), b = f(fv);
    const n0 = dg(i, j, fu, fv) + (dg(i + 1, j, fu - 1, fv) - dg(i, j, fu, fv)) * a, n1 = dg(i, j + 1, fu, fv - 1) + (dg(i + 1, j + 1, fu - 1, fv - 1) - dg(i, j + 1, fu, fv - 1)) * a;
    data[y * N + x] = Math.round(Math.min(1, Math.max(0, (n0 + (n1 - n0) * b) * 1.3 * 0.5 + 0.5)) * 255); // (x1.3: a 2D gradient noise spans +-0.71 -- to the spread of the 3D one)
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
})();
// noise at (a, b), one cell per unit, 0..1
const noise2 = (a, b) => texture(NOISE, vec2(a, b).div(NOISE_CELLS)).r;

// the present over a material: wraps whatever colour/roughness/metalness it has (its own nodes, or its maps)
// stains: water run down walls from the ceiling and up from the floor (vertical streaks); yellow: paper gone yellow
export function decayMaterial(mat, { dust = 1, fade = 0.4, film = 0.05, stains = 0, yellow = 0 } = {}) {
  if (!mat?.isNodeMaterial || mat.userData.decayed) return mat;
  mat.userData.decayed = true;
  const base = mat.colorNode ? vec4(mat.colorNode) : materialColor;
  const r0 = mat.roughnessNode ? float(mat.roughnessNode) : materialRoughness;
  const m0 = mat.metalnessNode ? float(mat.metalnessNode) : materialMetalness;
  const P = positionWorld;
  // the past where the beam falls (1), the present elsewhere (0)
  const past = PAST;
  // dust: thick on what faces up, in patches (noise fixed in the world), a thin film everywhere else
  const up = smoothstep(0.2, 0.85, normalWorld.y);
  const patch = noise2(P.x.mul(9.0), P.z.mul(9.0));
  const amount = clamp(up.mul(patch.mul(1.1).add(0.05)).add(film), 0, 0.85).mul(dust).mul(decayK); // (patch x1.1 + 0.05: more of the board shows between the dust -- Codex decay-1; a film of 0.1 everywhere made the boxes chalky)
  const now = Fn(() => {
    const c = base.rgb;
    const faded = mix(c, vec3(luminance(c)), float(fade).mul(decayK)).mul(float(1).sub(float(0.14).mul(decayK))); // the colours faded, a little darker (grime)
    let c2 = mix(faded, DUST, amount);
    if (stains) { // brown tide marks running down from the ceiling and up from the floor, in streaks
      const streak = smoothstep(0.55, 0.85, noise2(P.x.add(P.z).mul(1.8), P.y.mul(0.35).add(7.7)));
      const where = smoothstep(1.7, 2.95, P.y).add(smoothstep(0.55, 0.0, P.y).mul(0.7));
      c2 = mix(c2, c2.mul(vec3(0.55, 0.47, 0.36)), clamp(streak.mul(where), 0, 1).mul(stains).mul(decayK));
    }
    if (yellow) c2 = mix(c2, c2.mul(vec3(1.0, 0.9, 0.66)), float(yellow).mul(decayK));
    return vec4(c2, base.a);
  })();
  mat.colorNode = mix(now, base, past);
  mat.roughnessNode = mix(mix(r0, float(0.96), amount), r0, past);   // dust is matte
  mat.metalnessNode = mix(m0.mul(float(1).sub(amount)), m0, past);   // and covers bare metal
  mat.needsUpdate = true;
  return mat;
}

// every mesh of a scene (a model's level as it loads, a procedural thing)
export function decayScene(scene, opts) {
  scene.traverse((m) => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => decayMaterial(x, opts)) : decayMaterial(m.material, opts); });
  return scene;
}

// cobwebs: in the corners of the shelf bays and the room's top corners, only in the present (the beam takes them away).
// A web is a quarter disc in a corner's plane: spokes from the corner, sagging rings between them, some threads
// broken, a little dust caught in it -- drawn thin, lit by the room (unlit, a web glowed in the dark)
let webMat = null;
function webMaterial() {
  if (webMat) return webMat;
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  m.colorNode = vec3(0.6, 0.585, 0.55); // grey with dust, not white (a white web read as a decal)
  m.opacityNode = Fn(() => {
    const q = uv().mul(2).sub(1), r = length(q), a = atan(q.y, q.x).clamp(0, Math.PI / 2);
    const N = 6, K = 7;
    // spokes, unevenly spaced (their angles wander with a slow noise), drawn ~1 mm wide at a 0.2 m web
    const t = a.div(Math.PI / 2).mul(N - 1).add(mx_noise_float(vec3(r.mul(2.0), 3.3, 0.5)).mul(0.35));
    const f = abs(fract(t.add(0.5)).sub(0.5)).mul((Math.PI / 2) / (N - 1));
    const spoke = smoothstep(0.006, 0.0018, r.mul(f)).mul(step(0.35, mx_noise_float(vec3(t.floor(), 9.1, 2.0)).mul(0.5).add(0.6)));
    // the rings: few, sagging, mostly broken
    const between = fract(t), rs = r.add(sin(between.mul(Math.PI)).mul(0.05).mul(r));
    const dr = abs(fract(rs.mul(K).add(0.5)).sub(0.5)).div(K);
    const broken = step(0.5, mx_noise_float(vec3(q.mul(4.5), 1.7)).mul(0.5).add(0.5));
    const ring = smoothstep(0.005, 0.0015, dr).mul(broken).mul(step(0.15, r));
    // dust caught in it: a grey veil thickest in the corner, in clumps
    const fluff = smoothstep(0.45, 0.85, mx_noise_float(vec3(q.mul(6.0), 4.1)).mul(0.5).add(0.5)).mul(0.3).mul(float(1).sub(r).pow(1.5));
    const edge = float(1).sub(smoothstep(0.75, 1.0, r));
    const far = float(1).sub(smoothstep(2.5, 5.0, positionWorld.distance(cameraPosition)).mul(0.6)); // (thin lines alias from afar: fainter)
    return max(max(spoke, ring).mul(0.32), fluff).mul(edge).mul(far).mul(float(1).sub(PAST)).mul(decayK);
  })();
  return (webMat = m);
}
function web(radius, rotZ) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20, 0, Math.PI / 2), webMaterial());
  m.scale.setScalar(radius); m.rotation.z = rotZ; m.castShadow = m.receiveShadow = false; m.renderOrder = 6;
  return m;
}
// corners: rotation of the quarter disc so it spans into the bay (default: right and up)
const ROT = { 'bottom-left': 0, 'bottom-right': Math.PI / 2, 'top-right': Math.PI, 'top-left': -Math.PI / 2 };
export function addCobwebs(root, layout, ROOM) {
  let k = 0;
  for (const it of layout) {
    if (it.type !== 'shelf') continue;
    const W = it.w || 1.8, D = it.d || 0.45, H = it.h || 2.4, n = it.levels || 5;
    const g = new THREE.Group(); g.position.set(it.pos[0], 0, it.pos[2]); g.rotation.y = (it.ry || 0) * Math.PI / 180;
    const boards = Array.from({ length: n }, (_, i) => 0.08 + i * (H - 0.12) / (n - 1));
    const xs = [-W / 2 + 0.036, W / 2 - 0.036];
    // three corners per shelf, chosen by a fixed seed: under a board (top corners of a bay) or on one (bottom corners)
    const used = new Set();
    for (let j = 0; j < 3; j++, k++) {
      const bay = 1 + Math.floor(rnd(k * 3.1) * (n - 1)), left = rnd(k * 7.7) < 0.5, top = rnd(k * 5.3) < 0.7;
      const key = `${bay}${left}${top}`; if (used.has(key)) continue; used.add(key); // (one web per corner)
      const y = top ? boards[bay] - 0.012 : boards[bay - 1] + 0.012;
      const w = web(0.13 + rnd(k * 2.9) * 0.12, ROT[`${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`]);
      w.position.set(left ? xs[0] : xs[1], y, D / 2 - 0.03 - rnd(k * 1.3) * 0.12);
      g.add(w);
    }
    root.add(g);
  }
  // the room's top corners at the back, and one by the back door
  const { w: RW, d: RD, h: RH } = ROOM;
  for (const [x, rot, r] of [[-RW / 2 + 0.01, 'top-left', 0.42], [RW / 2 - 0.01, 'top-right', 0.36]]) {
    const m = web(r, ROT[rot]); m.position.set(x, RH - 0.01, -RD / 2 + 0.012); root.add(m);
  }
  { const m = web(0.3, ROT['top-right']); m.rotation.y = -Math.PI / 2; m.position.set(RW / 2 - 0.012, RH - 0.01, -RD / 2 + 0.01); root.add(m); }
}

// the broken twins (model file -> its broken set) and the per-pixel swap between them: the whole set where the memory
// shows, the broken one elsewhere, by the same dither the far shop's shutter uses (TRAA averages the edge)
export const TWINS = { 'crt_tv_hero.glb': 'crt_tv_hero_broken', 'wall_clock.glb': 'wall_clock_broken', 'desk_fan.glb': 'desk_fan_broken', 'tube_radio_closed.glb': 'tube_radio_closed_broken' };
export function twinMask(scene, broken) {
  const m = broken ? PAST.lessThanEqual(ditherNoise) : PAST.greaterThan(ditherNoise);
  scene.traverse((o) => { if (o.isMesh) for (const mat of [].concat(o.material)) if (mat.isNodeMaterial) mat.maskNode = mat.maskNode ? mat.maskNode.and(m) : m; });
}

// what has fallen on the floor since: flakes of plaster along the walls, scraps of paper, the broken TV's glass in
// front of its cartons -- the present only. Instanced, flat, a millimetre above the floor; not in the robot's corner.
// Plaster has ragged outlines (noise on the distance from the middle, fixed in the world: every flake its own shape);
// glass is cut by straight edges -- three to five per shard, at random angles round its middle -- dusty grey with
// lighter edges, glossy enough to catch a glint (dark opaque triangles read as confetti); paper by four, frayed, each
// scrap longer than wide
export function addDebris(root, { tvAt = null } = {}) {
  const P = positionWorld, present = PAST.lessThan(ditherNoise);
  const kinds = [
    { n: 140, color: [0.56, 0.54, 0.49], rough: 0.95, size: [0.012, 0.04], wall: true, ragged: 0.45 },  // plaster flakes, lime white gone grey
    { n: 18, color: [0.5, 0.47, 0.38], rough: 0.85, size: [0.035, 0.07], wall: false, cut: [4, 4], torn: 0.08, aspect: [1.5, 2.5] }, // paper scraps, yellowed and dirty: torn-off pieces, longer than wide (round ones read as stains -- Codex decay-3)
    { n: 34, color: [0.27, 0.29, 0.28], rough: 0.16, size: [0.008, 0.032], wall: false, near: tvAt, glass: true, cut: [3, 5], aspect: [0.5, 1.8] }, // glass
  ];
  const corner = (x, z) => x < -0.7 && x > -2.2 && z > 0.2 && z < 1.7; // the robot's bench and stool
  let k = 0;
  for (const K of kinds) {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardNodeMaterial({ roughness: K.rough, metalness: 0, side: THREE.DoubleSide });
    const quv = uv().mul(2).sub(1), id = instanceIndex.mul(8);
    let inside, edge;
    if (K.cut) { // cut by straight edges: cut[0]..cut[1] of them, spread round the middle, jittered (paper: torn, so frayed a little)
      const [c0, c1] = K.cut, n = c0 === c1 ? float(c0) : hash(id.add(7)).mul(c1 - c0 + 1).floor().add(c0);
      let d = float(1);
      for (let j = 0; j < c1; j++) { // (edge j, used when j < n)
        const a = float(j).add(hash(id.add(j)).sub(0.5).mul(0.7)).div(n).mul(Math.PI * 2).add(hash(id.add(6)).mul(6.283));
        const off = K.glass ? hash(id.add(j + 16)).mul(0.45).add(0.4) : hash(id.add(j + 16)).mul(0.25).add(0.6);
        d = min(d, mix(float(1), off.sub(dot(quv, vec2(cos(a), sin(a)))), step(float(j), n.sub(0.5))));
      }
      if (K.torn) d = d.sub(noise2(P.x.mul(90), P.z.mul(90)).sub(0.5).mul(K.torn));
      inside = d.greaterThan(0); edge = smoothstep(0.12, 0.0, d);
    } else {
      const outline = length(quv).add(noise2(P.x.mul(45), P.z.mul(45)).mul(2).sub(1).mul(K.ragged));
      inside = outline.lessThan(0.8); edge = smoothstep(0.62, 0.8, outline);
    }
    m.maskNode = present.and(inside);
    const tint = hash(id.add(3)).mul(0.22).add(0.86); // (each piece a little lighter or darker)
    const base = vec3(...K.color).mul(tint).mul(noise2(P.x.mul(60), P.z.mul(60).add(11)).mul(0.24).add(0.83));
    m.colorNode = K.glass ? mix(base, vec3(0.5, 0.55, 0.52), edge.mul(0.6)) : mix(base, base.mul(0.72), edge.mul(0.5)); // (glass: its edges catch the light; plaster and paper: darker, dirtier edges)
    const im = new THREE.InstancedMesh(g, m, K.n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    let i = 0, tries = 0;
    while (i < K.n && tries++ < K.n * 40) {
      k++;
      let x, z;
      if (K.near) { const a = rnd(k * 1.7) * Math.PI * 2, r = 0.08 + Math.sqrt(rnd(k * 2.3)) * 0.55; x = K.near.x + Math.cos(a) * r; z = K.near.z + 0.3 + Math.abs(Math.sin(a)) * r; }
      else { x = -2.9 + rnd(k * 3.1) * 5.8; z = -2.15 + rnd(k * 4.7) * 4.3; }
      if (corner(x, z) || (x > -1.3 && x < 1.3 && z > 1.4)) continue; // (not in its corner, nor across the doorway: act two looks over it)
      const dw = Math.min(x + 3, 3 - x, z + 2.25);
      if (K.wall && rnd(k * 5.9) > Math.max(0.12, 1 - dw / 0.5)) continue; // flakes lie mostly along the walls
      const s = K.size[0] + rnd(k * 6.1) * (K.size[1] - K.size[0]);
      e.set((rnd(k * 7.3) - 0.5) * 0.12, rnd(k * 8.9) * Math.PI * 2, (rnd(k * 9.7) - 0.5) * 0.12);
      const [a0, a1] = K.aspect ?? [0.6, 1.4]; // (length over width)
      M.compose(pos.set(x, 0.0015 + rnd(k * 2.9) * 0.002, z), q.setFromEuler(e), sc.set(s * (a0 + rnd(k) * (a1 - a0)), 1, s));
      im.setMatrixAt(i++, M);
    }
    im.count = i; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; root.add(im);
  }
}

export const DECAY_SKIP = new Set(['robot', 'workbench', 'desk_lamp', 'tube_radio_open', 'soldering_iron', 'magnifier', 'enamel_mug', 'stool']); // its corner
