import * as THREE from 'three/webgpu';
import { artKey, random01 } from './layout.js';

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif';
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// Tube RGBA: intact tube, broken tube, intact halo, broken halo. Diffusers use R for ink only.
// Alpha is DATA, not transparency. Shader faces remain opaque so depth/SSR see the sign.
function drawCell(sign, w, h) {
  const intact = canvas(w, h), broken = canvas(w, h);
  const g = intact.getContext('2d', { willReadFrequently: true });
  const vertical = sign.kind === 'blade';
  const chars = [...sign.text];
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineJoin = 'round'; g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (sign.kind === 'box') {
    // Filled ink on a solid white/yellow diffuser; no tube outline or halo.
    const lines = chars.length > 2 ? [chars.slice(0, 2).join(''), chars.slice(2).join('')] : [sign.text];
    g.font = `800 ${w * (lines.length > 1 ? 0.25 : 0.3)}px ${FONT}`;
    lines.forEach((line, i) => g.fillText(line, w / 2, h * (lines.length > 1 ? 0.35 + i * 0.3 : 0.49), w * 0.7));
    g.lineWidth = w * 0.018;
    if (sign.shape === 'round') { g.beginPath(); g.arc(w / 2, h / 2, w * 0.43, 0, Math.PI * 2); g.stroke(); }
    else g.strokeRect(w * 0.07, h * 0.07, w * 0.86, h * 0.86);
    const ink = g.getImageData(0, 0, w, h).data;
    const pixels = new Uint8Array(w * h * 4);
    for (let j = 0; j < pixels.length; j += 4) pixels[j] = ink[j + 3];
    return pixels;
  }
  const size = vertical ? Math.min(w * 0.65, (h - 70) / chars.length * 0.84) : Math.min(h * 0.53, (w - 64) / chars.length * 0.95);
  g.font = `700 ${size}px ${FONT}`;
  // Coverage encodes the tube cross-section: soft coloured rim, hot white centre.
  const stroke = (width, draw) => {
    for (const [scale, alpha] of [[1, 0.35], [0.6, 0.7], [0.3, 1]]) {
      g.lineWidth = width * scale; g.globalAlpha = alpha; draw();
    }
    g.globalAlpha = 1;
  };
  // Keep the 30% inner stroke at least one texel wide before mip filtering.
  stroke(Math.max(3.4, size * sign.stroke * 2), () => {
    if (vertical) chars.forEach((ch, i) => g.strokeText(ch, w / 2, 38 + (h - 76) * (i + 0.5) / chars.length));
    else g.strokeText(sign.text, w / 2, h * 0.49, w - 64);
  });
  stroke(3.4, () => {
    g.strokeRect(17, 17, w - 34, h - 34);
    // A short second rule gives the rectangular fascia a period-appropriate tube frame.
    if (!vertical) { g.beginPath(); g.moveTo(40, h - 28); g.lineTo(w - 40, h - 28); g.stroke(); }
  });
  const b = broken.getContext('2d', { willReadFrequently: true }); b.drawImage(intact, 0, 0);
  b.globalCompositeOperation = 'destination-out';
  // Actual small gaps across strokes, not missing whole words. Stable for each artwork.
  for (let i = 0; i < 8; i++) {
    const y = 26 + random01(sign.seed * 97 + i * 5) * (h - 52);
    const x = 20 + random01(sign.seed * 31 + i * 7) * (w - 54);
    b.fillRect(x, y, 15 + random01(i + sign.seed) * 28, 4 + i % 4);
  }
  // Guarantee a visible missing segment ON a glyph: random rectangles alone can all hit empty space.
  const source = g.getImageData(0, 0, w, h).data;
  const strokes = [];
  for (let y = 36; y < h - 36; y++) for (let x = 30; x < w - 30; x++) {
    if (source[(y * w + x) * 4 + 3] > 180) strokes.push([x, y]);
  }
  if (strokes.length) {
    const [x, y] = strokes[Math.floor(random01(sign.seed * 331) * strokes.length)];
    b.fillRect(x - 18, y - 8, 36, 15);
  }
  const halo = (source) => {
    const c = canvas(w, h), p = c.getContext('2d', { willReadFrequently: true });
    p.shadowColor = "#fff"; p.shadowBlur = 15; p.globalAlpha = 0.65;
    p.drawImage(source, 0, 0); p.shadowBlur = 4; p.globalAlpha = 0.35; p.drawImage(source, 0, 0);
    return p.getImageData(0, 0, w, h).data;
  };
  const channels = [g.getImageData(0, 0, w, h).data, b.getImageData(0, 0, w, h).data, halo(intact), halo(broken)];
  const pixels = new Uint8Array(w * h * 4);
  for (let j = 0; j < pixels.length; j += 4) for (let k = 0; k < 4; k++) pixels[j + k] = channels[k][j + 3];
  return pixels;
}

export function planAtlas(signs) {
  const entries = new Map();
  for (const s of signs) if (!entries.has(artKey(s))) entries.set(artKey(s), {
    // Leave room for gutters: four horizontal cells / eight diffuser cells fit a 2048 px row.
    sign: s, w: s.kind === 'box' ? 320 : s.kind === 'blade' ? 192 : 704, // v3: 1.5x -- strokes stay readable at distance
    h: s.kind === 'box' ? 320 : s.kind === 'blade' ? 768 : 192,
  });
  const width = 4096, gap = 8; // v3: 1.5x cells need a 4096-wide atlas
  let x = gap, y = gap, row = 0;
  for (const e of [...entries.values()].sort((a, b) => b.h - a.h)) {
    if (x + e.w + gap > width) { x = gap; y += row + gap; row = 0; }
    e.x = x; e.y = y; x += e.w + gap; row = Math.max(row, e.h);
  }
  const height = 2 ** Math.ceil(Math.log2(y + row + gap));
  if (height > 4096) throw new Error('[neon] atlas budget exceeded'); // (4096x4096 RGBA8 = 64 MB GPU)
  return { entries, width, height };
}

export async function buildAtlas(signs) {
  // Only local OS fonts, no downloaded fonts, generated images or external requests.
  if (document.fonts?.load) await document.fonts.load(`700 64px ${FONT}`, '粤港歌舞廳凉茶');
  const { entries, width, height } = planAtlas(signs);
  const pixels = new Uint8Array(width * height * 4);
  for (const e of entries.values()) {
    const cell = drawCell(e.sign, e.w, e.h);
    // Flip rows explicitly: DataTexture uses flipY=false on both backends.
    for (let j = 0; j < e.h; j++) pixels.set(cell.subarray(j * e.w * 4, (j + 1) * e.w * 4), ((height - 1 - e.y - j) * width + e.x) * 4);
    e.uv = [(e.x + 0.5) / width, 1 - (e.y + e.h - 0.5) / height, (e.w - 1) / width, (e.h - 1) / height];
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.name = 'neon-local-canvas-masks'; texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.anisotropy = 4; texture.needsUpdate = true;
  return { texture, entries, width, height };
}
