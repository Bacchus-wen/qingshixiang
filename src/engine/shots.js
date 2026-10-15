// Deterministic camera shots for tools/shot.mjs (?shot=<name>). setup(ctx, t) may force story/system state.
export const SHOTS = {
  sandbox: { pos: [0, 1.6, 8], look: [0, 1, 0], fov: 50 },
  lookdev: { pos: [1.5, 1.4, 9], look: [0, 1.6, -8], fov: 45 },
  'lookdev-low': { pos: [-1, 0.35, 7], look: [2, 1.2, -10], fov: 38 },
};
