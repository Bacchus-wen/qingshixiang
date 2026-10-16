// Original Southern Chinese shop vocabulary and layout. No reference artwork/code is reused.
export const PALETTE = ['#ff3ba7', '#24e9ee', '#63ed75', '#ffd44c', '#ff493c', '#b572ff', '#ffe6bf'];
const TRADES = ['歌舞厅', '卡拉OK', '录像厅', '网吧', '美丽发廊', '兴记士多', '粥粉面', '廿四味凉茶', '仁安药房', '平安旅社', '桌球', '电器维修', '合兴五金', '海鮮酒家', '照相冲印', '招待所', '冰室', '茶餐廳'];
const SMALL = ['凉茶', '桌球', '录像厅', '理髮', '士多', '旅業', '夜宵', '卡拉OK', '修理电器', '24H'];
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
    const add = (kind, text, w, h, x, y, z, yaw, salt) => out.push({
      id: out.length, facade: i, kind, text, w, h, x, y, z, yaw,
      tint: PALETTE[(i * 3 + salt) % PALETTE.length], seed: i * 17 + salt + 1,
      frontX: f.frontX, side: f.side, alive: 0,
    });
    const height = Math.min(4 + r(1) * 5, Math.max(4, f.h - 3.2));
    const width = 0.85 + r(2) * 0.5;
    // The vertical face lies in XY, perpendicular to the X-constant facade; readable from both ends.
    const edgeZ = f.z + f.w * (i % 2 ? -0.33 : 0.33);
    add('blade', TRADES[i % TRADES.length], width, height,
      f.frontX - f.side * (0.32 + width / 2), 3.8 + height / 2, edgeZ, 0, 0);
    if (!f.home) add('fascia', name, Math.min(4.6, f.w - 0.6), 0.82 + r(3) * 0.18,
      f.frontX - f.side * 0.24, 3.55, f.z, -f.side * Math.PI / 2, 1);
    if (f.home || i % 3 !== 1) add('box', SMALL[(i * 7) % SMALL.length], Math.min(1.65, f.w * 0.3), 0.85,
      f.frontX - f.side * 0.3, Math.min(f.h - 0.7, 5.7 + r(4) * 2.1),
      f.z - (edgeZ - f.z) * 0.65, -f.side * Math.PI / 2, 2);
    if (!f.home && i % 8 === 3) add('roof', i % 2 ? '南方歌舞厅' : '金龍海鮮酒家', Math.min(5.6, f.w - 0.4), 1.4,
      f.frontX - f.side * 0.35, f.h + 1.3, f.z, -f.side * Math.PI / 2, 3);
  });
  // Spatially stratified survivors: 4 per side, one per depth band. Never brighten a story home.
  for (const side of [-1, 1]) {
    const candidates = out.filter((s) => s.side === side && s.kind === 'blade' && !facades[s.facade].home).sort((a, b) => b.z - a.z);
    const n = Math.min(4, candidates.length);
    for (let k = 0; k < n; k++) candidates[Math.floor((k + 0.5) * candidates.length / n)].alive = 1;
  }
  return out;
}

export const artKey = (s) => `${s.kind === 'blade' ? 'v' : 'h'}:${s.text}`;
