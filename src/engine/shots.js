// Deterministic camera shots for tools/shot.mjs (?shot=<name>). setup(ctx, t) may force story/system state.
// `scene` picks the system set in main.js (default 'street').
export const SHOTS = {
  sandbox: { scene: 'lookdev', pos: [0, 1.6, 8], look: [0, 1, 0], fov: 50 },
  lookdev: { scene: 'lookdev', pos: [1.5, 1.4, 9], look: [0, 1.6, -8], fov: 45 },
  'lookdev-low': { scene: 'lookdev', pos: [-1, 0.35, 7], look: [2, 1.2, -10], fov: 38 },
  'street-eye': { pos: [0.6, 1.55, 10], look: [0, 1.8, -30], fov: 42 },
  'street-low': { pos: [-1.2, 0.25, 4], look: [0.5, 1.0, -25], fov: 35 },
  'street-high': { pos: [2.5, 9, 12], look: [0, 0, -20], fov: 50 },
  'robot-wide': { pos: [1.6, 1.3, -9.5], look: [-4.4, 0.7, -13.6], fov: 40 },
  'eye-open-wide': { pos: [1.6, 1.3, -9.5], look: [-4.4, 0.7, -13.6], fov: 40, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'eye-hero': { pos: [-3.85, 0.92, -13.15], look: [-4.42, 0.98, -13.5], fov: 24, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'eye-close': { pos: [-3.7, 1.05, -13.3], look: [-4.45, 0.95, -13.55], fov: 30, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'eye-closed-close': { pos: [-3.7, 1.05, -13.3], look: [-4.45, 0.95, -13.55], fov: 30, setup: (ctx) => { ctx.memory.forceOpen = false; } },
  'memory-windows': { pos: [-5.0, 1.55, -12.6], look: [3, 4.5, -16], fov: 55, setup: (ctx) => { ctx.memory.forceOpen = true; ctx.memory.lookOverride = { x: -0.15, y: 0.55, copy() {} }; } },
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
  'beam-street': { pos: [-4.0, 1.7, -10.5], look: [3, 1.2, -17], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; } },
};
