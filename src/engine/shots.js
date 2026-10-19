import * as THREE from 'three/webgpu';
// Deterministic camera shots for tools/shot.mjs (?shot=<name>). setup(ctx, t) may force story/system state.
// `scene` picks the system set in main.js (default 'street').
export const SHOTS = {
  sandbox: { scene: 'lookdev', pos: [0, 1.6, 8], look: [0, 1, 0], fov: 50 },
  lookdev: { scene: 'lookdev', pos: [1.5, 1.4, 9], look: [0, 1.6, -8], fov: 45 },
  'lookdev-low': { scene: 'lookdev', pos: [-1, 0.35, 7], look: [2, 1.2, -10], fov: 38 },
  // v4 repair shop: the key-art framing (assets/generated/shop/keyart/img_43683 #2), plus close reviews
  'shop-establish': { scene: 'shop', pos: [-0.25, 1.42, 4.5], look: [-0.55, 1.05, -1.0], fov: 52 },
  'shop-wide': { scene: 'shop', pos: [-0.1, 1.45, 5.5], look: [-0.45, 1.08, -1.0], fov: 50 },
  'shop-front': { scene: 'shop', pos: [0.1, 1.45, 6.6], look: [-0.3, 1.2, -1.0], fov: 44 },
  'shop-inside': { scene: 'shop', pos: [0.35, 1.32, 4.1], look: [-0.35, 1.0, -1.0], fov: 50 },
  'shop-left': { scene: 'shop', pos: [1.2, 1.45, 1.2], look: [-2.6, 1.2, -1.1], fov: 46 },
  'shop-bench': { scene: 'shop', pos: [-1.25, 1.55, 2.45], look: [-1.95, 0.85, 0.75], fov: 42 },
  'shop-robot': { scene: 'shop', pos: [0.7, 1.1, 2.3], look: [-0.5, 0.75, 1.05], fov: 38 },
  'shop-back': { scene: 'shop', pos: [-0.8, 1.5, 1.8], look: [1.6, 1.2, -2.2], fov: 46 },
  'shop-probe': { scene: 'shop', pos: [0.0, 0.9, 3.0], look: [0, 0.2, 1.5], fov: 35 },
  'shop-sign': { scene: 'shop', pos: [0.4, 1.6, 8.5], look: [0, 2.6, 2.5], fov: 55 },
  'shop-robotfull': { scene: 'shop', pos: [0.65, 0.95, 2.75], look: [-0.5, 0.55, 1.15], fov: 40 },
  'shop-robotface': { scene: 'shop', pos: [-0.38, 0.9, 2.02], look: [-0.6, 0.86, 1.18], fov: 30 },
  'shop-peg': { scene: 'shop', pos: [-1.6, 1.6, -0.9], look: [-1.83, 1.68, -2.25], fov: 45 },
  'shop-rev': { scene: 'shop', pos: [1.9, 1.55, -1.6], look: [-1.2, 0.8, 1.2], fov: 55 },
  'shop-rev2': { scene: 'shop', pos: [-2.6, 1.6, -1.9], look: [1.0, 0.7, 1.4], fov: 60 },
  'shop-top': { scene: 'shop', pos: [0.0, 2.9, 0.2], look: [-0.2, 0.0, 0.0], fov: 85 },
  'shop-broom': { scene: 'shop', pos: [0.2, 1.25, 2.15], look: [-2.2, 0.55, 1.55], fov: 45 },
  'shop-door': { scene: 'shop', pos: [0.2, 1.5, -0.6], look: [1.75, 1.1, -2.25], fov: 50 },
  'shop-marks': { scene: 'shop', pos: [1.0, 1.45, -1.0], look: [1.05, 1.2, -2.25], fov: 50 },
  'shop-chassis': { scene: 'shop', pos: [-1.2, 1.25, 1.75], look: [-1.38, 0.92, 0.7], fov: 38 },
  'shop-frontin': { scene: 'shop', pos: [1.6, 1.5, -1.2], look: [-1.8, 1.0, 2.2], fov: 60 },
  'shop-est3': { scene: 'shop', pos: [-0.5, 1.42, 4.5], look: [-0.62, 1.05, -1.0], fov: 52 },
  // v4 story: the robot faces into the shop (heading 15 deg right of -z); rig checks
  'shop-rigface': { scene: 'shop', pos: [-0.43, 0.93, 0.27], look: [-0.6, 0.82, 0.95], fov: 34 },
  'shop-rigback': { scene: 'shop', pos: [-0.95, 1.28, 2.05], look: [0.45, 0.85, -2.6], fov: 52 },
  'shop-rigside': { scene: 'shop', pos: [0.45, 0.95, 0.75], look: [-0.58, 0.82, 1.08], fov: 34 },
  // beam checks: the eye forced open, aimed at a point (the head turns to it)
  'shop-beamback': { scene: 'shop', pos: [-0.85, 1.22, 2.0], look: [0.6, 0.95, -2.3], fov: 55, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(0.2, 1.1, -2.2)); } },
  'shop-beamdoor': { scene: 'shop', pos: [-0.8, 1.25, 1.95], look: [1.6, 1.0, -2.2], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(2.35, 1.25, -2.2)); } },
  'shop-beamleft': { scene: 'shop', pos: [-0.3, 1.25, 1.95], look: [-2.4, 1.0, -1.2], fov: 55, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(-2.5, 1.1, -1.4)); } },
  'shop-beamside': { scene: 'shop', pos: [1.6, 1.4, 1.4], look: [-0.2, 0.95, -0.8], fov: 60, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(0.2, 1.1, -2.2)); } },
  // the climax at the door: eye open on the marks, the child's shadow at eight (h 1.29)
  'shop-climax': { scene: 'shop', pos: [2.0, 1.3, -1.05], look: [2.66, 1.25, -2.25], fov: 42, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(2.62, 1.27, -2.24)); ctx.api.past?.setChild(1.29); ctx.api.past?.setMarks(1.29); } },
  'shop-climaxwide': { scene: 'shop', pos: [0.6, 1.4, -0.2], look: [2.3, 1.2, -2.25], fov: 55, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(2.62, 1.27, -2.24)); ctx.api.past?.setChild(1.29); ctx.api.past?.setMarks(1.29); } },
  'shop-marksnow': { scene: 'shop', pos: [1.95, 1.35, -1.35], look: [2.48, 1.25, -2.25], fov: 46 },
  'shop-marksclose': { scene: 'shop', pos: [2.6, 1.25, -1.55], look: [2.65, 1.22, -2.25], fov: 40 },
  'shop-climaxclose': { scene: 'shop', pos: [2.6, 1.25, -1.45], look: [2.65, 1.22, -2.25], fov: 44, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(2.62, 1.27, -2.24)); ctx.api.past?.setChild(1.29); ctx.api.past?.setMarks(1.29); } },
  'shop-customer': { scene: 'shop', pos: [-0.75, 1.3, 1.95], look: [-1.6, 1.2, -2.2], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(-1.85, 1.3, -2.2)); } },
  'shop-clockpast': { scene: 'shop', pos: [1.6, 1.6, -0.9], look: [2.63, 1.95, -2.2], fov: 40, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(2.63, 2.0, -2.2)); } },
  'shop-shelfpast': { scene: 'shop', pos: [-0.6, 1.35, 0.6], look: [-0.6, 1.3, -2.1], fov: 46, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.shotOpen = 1; ctx.api.eye?.aim(new THREE.Vector3(-0.6, 1.25, -2.1)); } },
  'shop-endstreet': { scene: 'shop', pos: [0.62, 1.0, -0.8], look: [-0.15, 1.05, 6.0], fov: 50, setup: (ctx) => { ctx.api.atmo?.set('out'); } },
  'shop-iso': { scene: 'shop', pos: [5.5, 6.0, 7.5], look: [0, 0.6, 0], fov: 32 },
  'street-eye': { pos: [0.6, 1.55, 10], look: [0, 1.8, -30], fov: 42 },
  'street-low': { pos: [-1.2, 0.25, 4], look: [0.5, 1.0, -25], fov: 35 },
  'street-high': { pos: [2.5, 9, 12], look: [0, 0, -20], fov: 50 },
  'robot-wide': { pos: [-3.2, 0.62, -11.8], look: [-6.1, 0.95, -21.6], fov: 38 }, // = the wait-phase framing (v3)
  'eye-open-wide': { pos: [1.6, 1.3, -9.5], look: [-4.4, 0.7, -13.6], fov: 40, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'eye-close': { pos: [-3.7, 1.05, -13.3], look: [-4.45, 0.95, -13.55], fov: 30, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'eye-closed-close': { pos: [-3.7, 1.05, -13.3], look: [-4.45, 0.95, -13.55], fov: 30, setup: (ctx) => { ctx.memory.forceOpen = false; } },
  'memory-windows': { pos: [-5.0, 1.55, -12.6], look: [3, 4.5, -16], fov: 55, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.lookOverride = { x: -0.15, y: 0.55, copy() {} }; } },
  // the gameplay over-the-shoulder (director 'look'): rebuilt from the live eye each frame
  'look-beam': { pos: [-5.2, 1.0, -13.4], look: [3, 0.9, -15], fov: 50, setup: (ctx) => {
    ctx.memory.forceOpen = true; ctx.memory.lookOverride = { x: -0.25, y: Number(ctx.params?.get('ly') ?? 0.02) };
    const m = ctx.memory; if (!m.origin || m.origin.lengthSq() === 0) return;
    const w = new ctx.THREE.Vector3(m.dir.z, 0, -m.dir.x).normalize(), c = ctx.camera;
    const side = Number(ctx.params?.get('side') ?? 0.7), back = Number(ctx.params?.get('back') ?? 1.0);
    c.position.copy(m.origin).addScaledVector(m.dir, -back).addScaledVector(w, -side); c.position.y = m.origin.y + Number(ctx.params?.get('up') ?? 0.35);
    c.lookAt(c.position.clone().copy(m.origin).addScaledVector(m.dir, 9).addScaledVector(w, 0.9)); } },
  // the lens itself, from just in front of it and a little to the side (critiques r18/review5): built from the live eye
  'eye-hero': { pos: [-3.6, 0.9, -13.4], look: [-4.4, 0.8, -13.5], fov: 20, setup: (ctx) => {
    ctx.memory.forceOpen = true;
    const m = ctx.memory; if (!m.origin || m.origin.lengthSq() === 0) return;
    const w = new ctx.THREE.Vector3(m.dir.z, 0, -m.dir.x).normalize(), c = ctx.camera;
    c.position.copy(m.origin).addScaledVector(m.dir, 0.55).addScaledVector(w, 0.22); c.position.y += 0.06;
    c.lookAt(m.origin.clone().addScaledVector(w, 0.05)); } },
  'memory-street': { pos: [-5.1, 1.5, -13.0], look: [3, 0.9, -19], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.lookOverride = { x: -0.35, y: 0.05 }; } },
  'memory-down': { pos: [-5.1, 1.5, -13.0], look: [2, 0.6, -24], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.lookOverride = { x: -0.6, y: -0.05 }; } },
  'fragment-mark': { pos: [-5.1, 1.5, -13.0], look: [5, 1.2, -14.2], fov: 40, setup: (ctx, t) => {
    const f = ctx.api.fragment; if (f && f.state === 'idle') { f.state = 'playing'; f.t = 11; } ctx.memory.forceOpen = true; } },
  'fragment-close': { pos: [2.6, 1.25, -13.6], look: [5, 1.05, -14.5], fov: 45, setup: (ctx) => {
    const f = ctx.api.fragment; if (f && f.state === 'idle') { f.state = 'playing'; f.t = 11; } ctx.memory.forceOpen = true; } },
  'traces': { pos: [1.2, 1.2, -12.0], look: [3.8, 0.6, -15.5], fov: 45, setup: (ctx) => { ctx.memory.forceOpen = false; } },
  'traces-lit': { pos: [1.2, 1.2, -12.0], look: [3.8, 0.6, -15.5], fov: 45 },
  'fragment-marks': { pos: [3.2, 1.45, -14.9], look: [4.95, 1.35, -14.75], fov: 38, setup: (ctx) => {
    const f = ctx.api.fragment; if (f && f.state === 'idle') { f.state = 'playing'; f.t = 8; } ctx.memory.forceOpen = true; } },
  'fragment-late': { pos: [3.2, 1.45, -14.9], look: [4.95, 1.35, -14.75], fov: 38, setup: (ctx) => {
    const f = ctx.api.fragment; if (f && f.state === 'idle') { f.state = 'playing'; f.t = 3 + 7 * 2.2 + 2.5 + 5.8; } ctx.memory.forceOpen = true; } },
  'micro-photo': { pos: [-4.9, 1.5, -13.2], look: [4, 1.2, -8], fov: 46, setup: (ctx) => {
    const it = ctx.api.micro?.items.find((i) => i.name === 'photo'); if (!it) return;
    ctx.memory.forceOpen = true; ctx.memory.aimAt = it.center;
    if (it.t < 0 && !it.done && ctx.engine.frame > 240) it.t = 2.9; } },
  'micro-noodle': { pos: [-4.9, 1.5, -13.2], look: [4, 1.2, -22], fov: 46, setup: (ctx) => {
    const it = ctx.api.micro?.items.find((i) => i.name === 'noodle'); if (!it) return;
    ctx.memory.forceOpen = true; ctx.memory.aimAt = it.center;
    if (it.t < 0 && !it.done && ctx.engine.frame > 240) it.t = 1.5; } },
  'eye-macro-half': { pos: [-4.0, 1.0, -13.28], look: [-4.42, 0.97, -13.47], fov: 20, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.openCap = 0.35; } },
  'eye-macro-open': { pos: [-4.0, 1.0, -13.28], look: [-4.42, 0.97, -13.47], fov: 20, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'cat-close': { pos: [-1.4, 1.32, -11.6], look: [-4.4, 0.6, -13.4], fov: 36 },
  'cat-awake': { pos: [-2.6, 0.7, -12.2], look: [-4.4, 0.3, -12.9], fov: 34, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'past-car': { pos: [-4.9, 1.5, -13.2], look: [0.9, 0.6, -18], fov: 40, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.aimAt = new ctx.THREE.Vector3(0.9, 0.7, -18); } },
  'present-car': { pos: [-4.9, 1.5, -13.2], look: [0.9, 0.6, -18], fov: 40, setup: (ctx) => { ctx.memory.forceOpen = false; } },
  'past-plants': { pos: [3.0, 1.1, -15.4], look: [4.45, 0.45, -15.6], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.aimAt = new ctx.THREE.Vector3(4.45, 0.5, -15.35); } },
  'present-plants': { pos: [3.0, 1.1, -15.4], look: [4.45, 0.45, -15.6], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = false; } },
  'past-car-door': { pos: [4.0, 1.5, -16.2], look: [1.0, 0.7, -17.8], fov: 40, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.aimAt = new ctx.THREE.Vector3(0.9, 0.7, -18); } },
  'present-car-door': { pos: [4.0, 1.5, -16.2], look: [1.0, 0.7, -17.8], fov: 40, setup: (ctx) => { ctx.memory.forceOpen = false; } },
  'past-traffic': { pos: [-4.9, 1.5, -13.2], look: [2, 0.8, -26], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.aimAt = new ctx.THREE.Vector3(1.5, 0.8, -24); } },
  'flood': { pos: [-4.9, 1.6, -13.0], look: [3, 1.6, -20], fov: 62, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.flood = 1; } },
  'props-left': { pos: [-1.2, 1.5, -14.5], look: [-4.6, 0.6, -21], fov: 50 },
  'props-deep': { pos: [0.3, 1.6, -18], look: [0.5, 1.0, -36], fov: 55 },
  'props-right': { pos: [2.2, 1.5, -12.5], look: [4.6, 0.6, -20], fov: 50 },
  'junction': { pos: [-2.6, 1.45, -12], look: [0, 1.0, -42], fov: 38 }, // add &passcar to park the passing car mid-junction
  'beam-street': { pos: [-4.0, 1.7, -10.5], look: [3, 1.2, -17], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; } },
};
