// Ground placement is independent of street's RNG: adding litter cannot move story props.
// Pass street's LANE at integration time; never import a system into a material.
export const DEFAULT_GROUND_LANE = Object.freeze({
  halfRoad: 3.4, walk: 1.6, curb: 0.14, zStart: 14, zEnd: -70, crossZ: -42, crossHalf: 4.5,
});

export function groundLayout(lane = DEFAULT_GROUND_LANE) {
  const L = { ...DEFAULT_GROUND_LANE, ...lane };
  const dashes = [];
  for (let z = L.zStart - 2; z > L.zEnd + 2; z -= 6) {
    if (Math.abs(z - L.crossZ) < L.crossHalf + 1 || (z * 7919) % 5 === 0) continue;
    dashes.push(z);
  }
  const roadY = z => Math.abs(z - L.crossZ) < L.crossHalf ? 0.002 : 0;
  const manholes = [4, -20, -55].filter(z => z > L.zEnd + 1 && z < L.zStart - 1)
    .map((z, i) => ({ x: i % 2 ? -1.05 : 1.1, z, y: roadY(z) + 0.006, w: 0.78, d: 0.78, angle: i * 0.53 }));
  const drains = [];
  for (let z = 10; z > L.zEnd; z -= 11) for (const side of [-1, 1]) {
    const pz = z + side * 2.5;
    if (pz < L.zEnd + 0.5 || pz > L.zStart - 0.5 || Math.abs(pz - L.crossZ) < L.crossHalf + 0.5) continue;
    drains.push({ x: side * (L.halfRoad - 0.25), z: pz, y: roadY(pz) + 0.006, w: 0.35, d: 0.8, angle: 0 });
  }
  let seed = 20261016;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // Avoid branded packaging, newspaper, Japanese receipts and flyers.
  const cells = [[0, 0.16], [4, 0.27], [7, 0.34], [8, 0.38], [9, 0.09], [10, 0.18], [14, 0.14], [15, 0.16]];
  const litter = [];
  for (let i = 0; i < 72; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const z = L.zEnd + 1 + rnd() * (L.zStart - L.zEnd - 2);
    const x = side * (L.halfRoad - 0.32 - rnd() * 0.95);
    const [cell, size] = cells[Math.floor(rnd() * cells.length)];
    const w = size * (0.8 + rnd() * 0.35);
    const angle = rnd() * Math.PI * 2;
    // Leave a quiet central story/reflection corridor, the crossing and utility covers clear.
    if (Math.abs(z - L.crossZ) < L.crossHalf + 0.8) continue;
    if ([...manholes, ...drains].some(p => Math.abs(x - p.x) < (p.w + w) * 0.5 + 0.1 && Math.abs(z - p.z) < (p.d + w) * 0.5 + 0.1)) continue;
    litter.push({ x, z, y: roadY(z) + 0.008 + (i % 3) * 0.0005, w, d: w, angle, cell });
  }
  return { lane: L, dashes, manholes, drains, litter };
}
