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
  'eye-close': { pos: [-3.7, 1.05, -13.3], look: [-4.45, 0.95, -13.55], fov: 30, setup: (ctx) => { ctx.memory.forceOpen = true; } },
  'eye-closed-close': { pos: [-3.7, 1.05, -13.3], look: [-4.45, 0.95, -13.55], fov: 30, setup: (ctx) => { ctx.memory.forceOpen = false; } },
  'beam-street': { pos: [-4.0, 1.7, -10.5], look: [3, 1.2, -17], fov: 50, setup: (ctx) => { ctx.memory.forceOpen = true; } },
};
