// The shop as it is now, and as it was (2026-10-23, the user: "既然要走落败现在与回忆,那房间内的所有物体是不是要做残破版来
// 对比" -- chose a decay layer on everything plus true broken models for four of the sets). Outside the robot's beam every
// thing in the shop is the present: grey dust lying on whatever faces up, grime, the colours faded and the gloss gone;
// where the beam falls it is as it was -- clean, the colours full -- per pixel, by the same memory mask as the street's
// photographs. The robot's corner (it, its bench and what lies on it) is left alone: the one place it still keeps.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, mix, smoothstep, clamp, luminance, positionWorld, normalWorld, materialColor, materialRoughness,
  materialMetalness, mx_noise_float, uniform, uv, length, atan, abs, fract, step, cameraPosition, max, sin,
} from 'three/tsl';
import { memoryMask } from '../../materials/memory.js';
import { ditherNoise } from './lod.js';

// how much of the present shows (?nodecay: none -- for comparisons; the review shots can set it too)
export const decayK = uniform(1);
const DUST = vec3(0.40, 0.385, 0.36); // pale grey-brown, a little warm (lime plaster and street dust)
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// the present over a material: wraps whatever colour/roughness/metalness it has (its own nodes, or its maps)
export function decayMaterial(mat, { dust = 1, fade = 0.4, film = 0.05 } = {}) {
  if (!mat?.isNodeMaterial || mat.userData.decayed) return mat;
  mat.userData.decayed = true;
  const base = mat.colorNode ? vec4(mat.colorNode) : materialColor;
  const r0 = mat.roughnessNode ? float(mat.roughnessNode) : materialRoughness;
  const m0 = mat.metalnessNode ? float(mat.metalnessNode) : materialMetalness;
  const P = positionWorld;
  // the past where the beam falls (1), the present elsewhere (0)
  const past = memoryMask(P);
  // dust: thick on what faces up, in patches (two scales of noise, fixed in the world), a thin film everywhere else
  const up = smoothstep(0.2, 0.85, normalWorld.y);
  const patch = mx_noise_float(P.mul(6.0)).mul(0.5).add(0.5).mul(0.65).add(mx_noise_float(P.mul(23.0)).mul(0.5).add(0.5).mul(0.35));
  const amount = clamp(up.mul(patch.mul(1.1).add(0.05)).add(film), 0, 0.85).mul(dust).mul(decayK); // (patch x1.1 + 0.05: more of the board shows between the dust -- Codex decay-1; a film of 0.1 everywhere made the boxes chalky)
  const now = Fn(() => {
    const c = base.rgb;
    const faded = mix(c, vec3(luminance(c)), float(fade).mul(decayK)).mul(float(1).sub(float(0.14).mul(decayK))); // the colours faded, a little darker (grime)
    return vec4(mix(faded, DUST, amount), base.a);
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
    return max(max(spoke, ring).mul(0.32), fluff).mul(edge).mul(far).mul(float(1).sub(memoryMask(positionWorld))).mul(decayK);
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
  const past = memoryMask(positionWorld), m = broken ? past.lessThanEqual(ditherNoise) : past.greaterThan(ditherNoise);
  scene.traverse((o) => { if (o.isMesh) for (const mat of [].concat(o.material)) if (mat.isNodeMaterial) mat.maskNode = mat.maskNode ? mat.maskNode.and(m) : m; });
}

export const DECAY_SKIP = new Set(['robot', 'workbench', 'desk_lamp', 'tube_radio_open', 'soldering_iron', 'magnifier', 'enamel_mug', 'stool']); // its corner
