// Original Southern Chinese shop vocabulary and layout. No reference artwork/code is reused.
export const PALETTE = ['#ff3ba7', '#24e9ee', '#63ed75', '#ffd44c', '#ff493c', '#b572ff', '#ffe6bf'];
const TRADES = ['歌舞厅', '卡拉OK', '录像厅', '网吧', '美丽发廊', '兴记士多', '粥粉面', '廿四味凉茶', '仁安药房', '平安旅社', '桌球', '电器维修', '合兴五金', '海鮮酒家', '照相冲印', '招待所', '冰室', '茶餐廳'];
const SMALL = ['凉茶', '桌球', '录像厅', '理髮', '士多', '旅業', '夜宵', '卡拉OK', '修理电器', '24H'];
export const TUBE_INTENSITY = 3.6;
export const LIGHTBOX_RATIO = 0.6;
// Discrete silhouettes, with separately seeded mounting heights (not a uniform scaled row).
const SIZES = [
  { blade: [0.76, 3.6], fascia: [2.7, 0.65], box: 0.92 },
  { blade: [1.08, 5.2], fascia: [3.6, 0.86], box: 1.18 },
  { blade: [1.45, 7.1], fascia: [4.7, 1.12], box: 1.46 },
];
export function random01(seed) {
  let n = Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

// Also used by static checks: only simulation time, never wall time / Math.random.
export function flickerAt(seed, t) {
  const cycle = Math.floor((t + seed * 0.137) / 7.5);
  const phase = ((t + seed * 0.137) % 7.5 + 7.5) % 7.5;
  return phase < 0.32 && random01(cycle + seed * 73) > 0.45
    ? (random01(Math.floor(t * 24) + seed * 199) > 0.48 ? 0.16 : 0.68) : 1;
}

export function planSigns(facades, signs = []) {
  const out = [];
  facades.forEach((f, i) => {
    const r = (n) => random01(i * 131 + n);
    const known = signs.find((s) => s.side === f.side && Math.abs(s.z - f.z) < 0.1);
    const name = f.signName || known?.name || TRADES[i % TRADES.length];
    const tier = (i + (f.side > 0 ? 1 : 0)) % SIZES.length;
    const size = SIZES[tier];
    const heightOffset = (r(11) - 0.5) * 1.6;
    const add = (kind, text, w, h, x, y, z, yaw, salt, extra = {}) => out.push({
      id: out.length, facade: i, kind, text, w, h, x, y, z, yaw,
      tint: PALETTE[(i * 3 + salt) % PALETTE.length], seed: i * 17 + salt + 1,
      frontX: f.frontX, side: f.side, alive: 0, broken: 0,
      tier, heightOffset, stroke: [0.022, 0.032, 0.042][(i + salt) % 3],
      depth: kind === 'blade' ? 0.2 : kind === 'box' ? 0.24 : 0.14,
      paper: i % 2 ? '#fff0a6' : '#fff7e6', ...extra,
    });
    const bottom = Math.max(f.home ? 3.8 : 3.35, 4.15 + heightOffset);
    const height = Math.min(size.blade[1], Math.max(2.4, f.h - bottom - 0.2));
    const width = size.blade[0];
    // The vertical face lies in XY, perpendicular to the X-constant facade; readable from both ends.
    const edgeZ = f.z + f.w * (i % 2 ? -0.33 : 0.33);
    add('blade', TRADES[i % TRADES.length], width, height,
      f.frontX - f.side * (0.18 + width / 2), bottom + height / 2, edgeZ, 0, 0);
    if (!f.home) add('fascia', name, Math.min(size.fascia[0], f.w - 0.6), size.fascia[1],
      f.frontX - f.side * 0.12, 3.8 + heightOffset, f.z, -f.side * Math.PI / 2, 1);
    // Every shop gets a solid diffuser, not another outline-tube rectangle.
    // Front of diffuser is exactly 0.35 m from wall, including cabinet depth + face clearance.
    if (f.shop !== false && !f.home) add('box', SMALL[(i * 7) % SMALL.length], size.box, size.box,
      f.frontX - f.side * (0.35 - 0.124), 4.55 + (r(12) - 0.5) * 1.6,
      f.z - (edgeZ - f.z) * 0.8, -f.side * Math.PI / 2, 2,
      { shape: i % 2 ? 'round' : 'square', projection: 0.35 });
    // The hanging face sits in front of the fascia; its edge overlaps the neighbouring bay in perspective.
    if (!f.home && i % 3 !== 2) {
      const projection = 0.6 + r(13) * 0.6;
      add('hanger', SMALL[(i * 7 + 3) % SMALL.length], 1.45 + tier * 0.32, 0.7 + tier * 0.19,
        f.frontX - f.side * (projection - 0.074), 4.65 + (r(14) - 0.5) * 1.6,
        f.z + (i % 2 ? -1 : 1) * (f.w / 2 - 0.55), -f.side * Math.PI / 2, 4,
        { projection });
    }
    if (!f.home && i % 8 === 3) add('roof', i % 2 ? '南方歌舞厅' : '金龍海鮮酒家', Math.min(5.6, f.w - 0.4), 1.4,
      f.frontX - f.side * 0.35, f.h + 1.3, f.z, -f.side * Math.PI / 2, 3);
  });
  // Exact nearest-integer 30% of tube signs, independent of camera/time; diffusers never use broken masks.
  const tubes = out.filter((s) => s.kind !== 'box').sort((a, b) => random01(a.seed * 83) - random01(b.seed * 83));
  for (const s of tubes.slice(0, Math.round(tubes.length * 0.3))) s.broken = 1;
  // Spatially stratified survivors: 4 per side, one per depth band. Never brighten a story home.
  for (const side of [-1, 1]) {
    const candidates = out.filter((s) => s.side === side && s.kind === 'blade' && !facades[s.facade].home).sort((a, b) => b.z - a.z);
    const n = Math.min(4, candidates.length);
    for (let k = 0; k < n; k++) candidates[Math.floor((k + 0.5) * candidates.length / n)].alive = 1;
  }
  return out;
}

export const artKey = (s) => s.kind === 'box'
  ? `box-${s.shape}:${s.text}` // Paper/ink colours are vertex data; filled artwork has no tube stroke width.
  : `${s.kind === 'blade' ? 'v' : 'h'}:${s.stroke}:${s.text}`;
