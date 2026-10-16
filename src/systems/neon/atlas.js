import * as THREE from 'three/webgpu';
import { artKey, random01 } from './layout.js';

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif';
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// RGBA are four independent linear masks: intact tube, broken tube, intact halo, broken halo.
// Alpha is DATA, not transparency. Shader faces remain opaque so depth/SSR see the sign.
function drawCell(sign, w, h) {
  const intact = canvas(w, h), broken = canvas(w, h);
  const g = intact.getContext('2d', { willReadFrequently: true });
  const vertical = sign.kind === 'blade';
  const chars = [...sign.text];
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineJoin = 'round'; g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = vertical ? Math.min(w * 0.65, (h - 70) / chars.length * 0.84) : Math.min(h * 0.53, (w - 64) / chars.length * 0.95);
  g.font = `700 ${size}px ${FONT}`;
  g.lineWidth = Math.max(1.1, size * 0.028);
  if (vertical) chars.forEach((ch, i) => g.strokeText(ch, w / 2, 38 + (h - 76) * (i + 0.5) / chars.length));
  else g.strokeText(sign.text, w / 2, h * 0.49, w - 64);
  g.lineWidth = 1.8;
  g.strokeRect(17, 17, w - 34, h - 34);
  // A short second rule gives the rectangular fascia a period-appropriate tube frame.
  if (!vertical) { g.beginPath(); g.moveTo(40, h - 28); g.lineTo(w - 40, h - 28); g.stroke(); }
  const b = broken.getContext('2d', { willReadFrequently: true }); b.drawImage(intact, 0, 0);
  b.globalCompositeOperation = 'destination-out';
  // Actual small gaps across strokes, not missing whole words. Stable for each artwork.
  for (let i = 0; i < 8; i++) {
    const y = 26 + random01(sign.seed * 97 + i * 5) * (h - 52);
    const x = 20 + random01(sign.seed * 31 + i * 7) * (w - 54);
    b.fillRect(x, y, 15 + random01(i + sign.seed) * 28, 4 + i % 4);
  }
  const halo = (source) => {
    const c = canvas(w, h), p = c.getContext('2d', { willReadFrequently: true });
    p.shadowColor = '#fff'; p.shadowBlur = 10; p.globalAlpha = 0.65;
    p.drawImage(source, 0, 0); p.shadowBlur = 4; p.globalAlpha = 0.35; p.drawImage(source, 0, 0);
    return p.getImageData(0, 0, w, h).data;
  };
  const channels = [g.getImageData(0, 0, w, h).data, b.getImageData(0, 0, w, h).data, halo(intact), halo(broken)];
  const pixels = new Uint8Array(w * h * 4);
  for (let j = 0; j < pixels.length; j += 4) for (let k = 0; k < 4; k++) pixels[j + k] = channels[k][j + 3];
  return pixels;
}

export async function buildAtlas(signs) {
  // Only local OS fonts, no downloaded fonts, generated images or external requests.
  if (document.fonts?.load) await document.fonts.load(`700 64px ${FONT}`, '粤港歌舞廳凉茶');
  const entries = new Map();
  for (const s of signs) if (!entries.has(artKey(s))) entries.set(artKey(s), { sign: s, w: s.kind === 'blade' ? 128 : 512, h: s.kind === 'blade' ? 512 : 128 });
  const width = 2048, gap = 8;
  let x = gap, y = gap, row = 0;
  for (const e of [...entries.values()].sort((a, b) => b.h - a.h)) {
    if (x + e.w + gap > width) { x = gap; y += row + gap; row = 0; }
    e.x = x; e.y = y; x += e.w + gap; row = Math.max(row, e.h);
  }
  const height = 2 ** Math.ceil(Math.log2(y + row + gap));
  if (height > 4096) throw new Error('[neon] atlas budget exceeded');
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
