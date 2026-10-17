// Deterministic camera shots for tools/shot.mjs (?shot=<name>). setup(ctx, t) may force story/system state.
// `scene` picks the system set in main.js (default 'street').
export const SHOTS = {
  sandbox: { scene: 'lookdev', pos: [0, 1.6, 8], look: [0, 1, 0], fov: 50 },
  lookdev: { scene: 'lookdev', pos: [1.5, 1.4, 9], look: [0, 1.6, -8], fov: 45 },
  'lookdev-low': { scene: 'lookdev', pos: [-1, 0.35, 7], look: [2, 1.2, -10], fov: 38 },
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
    ctx.memory.forceOpen = true; ctx.memory.lookOverride = { x: -0.25, y: 0.02 };
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
