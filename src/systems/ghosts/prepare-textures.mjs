// Local conversion of existing reference images ONLY. No service/API/model.
// Requires the user's explicit image-conversion approval before executing:
// node src/systems/ghosts/prepare-textures.mjs --confirmed
// Uses macOS sips and Node built-ins. Writes only inside the declared asset scope.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ATLAS_SIZE, TILE_SIZE, GUTTER } from './crowd-materials.mjs';

if (!process.argv.includes('--confirmed')) {
  console.log('Approval required. Prepared command: node src/systems/ghosts/prepare-textures.mjs --confirmed');
  process.exit(0);
}
const out = 'assets/textures/crowd';
const manifest = JSON.parse(await readFile('assets/models/crowd/manifest.json', 'utf8'));
assert.equal(manifest.version, 2, 'Rebake VAT v2 first');
await mkdir(out, { recursive: true });
const temporary = await mkdtemp(`${out}/.convert-`);
const sha = b => createHash('sha256').update(b).digest('hex');
const sources = new Map(), cache = new Map();
const inner = TILE_SIZE - GUTTER * 2;

// sips PNG intermediates are decoded without installing image libraries.
function png(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let width, height, depth, type, palette, transparency;
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9];
      assert.equal(data[12], 0, 'Interlaced PNG is unsupported');
    } else if (kind === 'IDAT') chunks.push(data);
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') transparency = data;
    offset += size + 12;
  }
  assert.equal(depth, 8, 'Expected 8-bit sips PNG');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  assert(channels, `Unsupported PNG type ${type}`);
  const stride = width * channels, filtered = inflateSync(Buffer.concat(chunks));
  assert.equal(filtered.length, (stride + 1) * height);
  const raw = Buffer.alloc(stride * height), rgba = Buffer.alloc(width * height * 4);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    assert(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? raw[i - channels] : 0;
      const b = y ? raw[i - stride] : 0, c = y && x >= channels ? raw[i - stride - channels] : 0;
      raw[i] = filtered[y * (stride + 1) + x + 1] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
    }
  }
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (type === 2 || type === 6) {
      rgba[d] = raw[s]; rgba[d + 1] = raw[s + 1]; rgba[d + 2] = raw[s + 2];
      rgba[d + 3] = type === 6 ? raw[s + 3] : 255;
    } else if (type === 3) {
      assert(palette); palette.copy(rgba, d, raw[s] * 3, raw[s] * 3 + 3);
      rgba[d + 3] = transparency?.[raw[s]] ?? 255;
    } else {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = raw[s]; rgba[d + 3] = type === 4 ? raw[s + 1] : 255;
    }
  }
  return { width, height, rgba };
}
async function source(path) {
  if (!path) return null;
  if (cache.has(path)) return cache.get(path);
  assert(/^textures\/crowd\/[\w.-]+$/.test(path));
  const original = `reference/cybercity/assets/${path}`, input = await readFile(original);
  const dest = `${temporary}/${cache.size}.png`;
  // Fixed square tiles, same uniform UV scale in both axes; all selected sources are square.
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(inner), String(inner), original, '--out', dest], { stdio: 'pipe' });
  const decoded = png(await readFile(dest));
  assert.equal(decoded.width, inner); assert.equal(decoded.height, inner);
  cache.set(path, decoded); sources.set(path, { source: original, sha256: sha(input) });
  return decoded;
}
const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
const srgb = x => x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055;
function bmp(rgb) {
  // 24-bit, bottom-up BMP. 1024-wide rows need no alignment padding.
  const b = Buffer.alloc(54 + rgb.length); b.write('BM'); b.writeUInt32LE(b.length, 2);
  b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(ATLAS_SIZE, 18); b.writeInt32LE(ATLAS_SIZE, 22);
  b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rgb.length, 34);
  for (let y = 0; y < ATLAS_SIZE; y++) for (let x = 0; x < ATLAS_SIZE; x++) {
    const i = (y * ATLAS_SIZE + x) * 3, j = 54 + ((ATLAS_SIZE - 1 - y) * ATLAS_SIZE + x) * 3;
    b[j] = rgb[i + 2]; b[j + 1] = rgb[i + 1]; b[j + 2] = rgb[i];
  }
  return b;
}
const outputs = [];
try {
  for (const variant of manifest.variants) {
    const color = Buffer.alloc(ATLAS_SIZE * ATLAS_SIZE * 3, 0);
    const normalAlpha = Buffer.alloc(color.length);
    for (let i = 0; i < normalAlpha.length; i += 3) { normalAlpha[i] = normalAlpha[i + 1] = 128; normalAlpha[i + 2] = 255; }
    for (const material of variant.materials) {
      const d = await source(material.diffuse), n = await source(material.normal);
      for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) {
        // Repeat fabric gutters; clamp photographic UV islands' gutters.
        const coord = v => material.fabricDetail ? ((v - GUTTER) % inner + inner) % inner : Math.max(0, Math.min(inner - 1, v - GUTTER));
        const s = (coord(y) * inner + coord(x)) * 4;
        const at = ((Math.floor(material.slot / 4) * TILE_SIZE + y) * ATLAS_SIZE + material.slot % 4 * TILE_SIZE + x) * 3;
        for (let k = 0; k < 3; k++) {
          const value = material.fabricDetail ? material.color[k] * linear(d.rgba[s] / 255) * 2
            : d ? linear(d.rgba[s + k] / 255) : material.color[k];
          color[at + k] = Math.round(Math.min(1, Math.max(0, srgb(value))) * 255);
        }
        normalAlpha[at] = n ? n.rgba[s] : 128;
        normalAlpha[at + 1] = n ? n.rgba[s + 1] : 128;
        normalAlpha[at + 2] = material.alphaCutout && d ? d.rgba[s + 3] : 255;
      }
    }
    for (const [kind, pixels] of [['color', color], ['normalAlpha', normalAlpha]]) {
      const temp = `${temporary}/atlas.bmp`, file = variant.atlas[kind];
      await writeFile(temp, bmp(pixels));
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', temp, '--out', `${temporary}/${file}`], { stdio: 'pipe' });
      const bytes = await readFile(`${temporary}/${file}`);
      outputs.push({ file, bytes: bytes.length, sha256: sha(bytes), width: ATLAS_SIZE, height: ATLAS_SIZE });
    }
  }
  const textureBytes = outputs.reduce((n, o) => n + o.bytes, 0);
  const uvBytes = manifest.variants.reduce((n, v) => n + v.vertexCount * 8, 0);
  assert(textureBytes + uvBytes < 6_000_000, '6 MB incremental asset budget exceeded');
  const report = { version: 1, jpegQuality: 85, normalPacking: 'rg-normal_b-opacity', textureBytes,
    uvBytes, incrementalBytes: textureBytes + uvBytes, sources: [...sources.values()], outputs };
  // Conservatively subtract only the previous VAT payload (not its metadata).
  const modelDir = 'assets/models/crowd';
  const modelBytes = (await Promise.all((await readdir(modelDir)).map(async f => (await stat(`${modelDir}/${f}`)).size))).reduce((a, b) => a + b, 0);
  const replaced = new Set(['manifest.json', ...outputs.map(o => o.file)]);
  let otherTextureBytes = 0;
  for (const entry of await readdir(out, { withFileTypes: true })) {
    if (entry.isFile() && !replaced.has(entry.name)) otherTextureBytes += (await stat(`${out}/${entry.name}`)).size;
  }
  const reportText = JSON.stringify(report, null, 2) + '\n';
  assert(modelBytes + textureBytes + otherTextureBytes + Buffer.byteLength(reportText) - 6_783_516 <= 6_000_000,
    '6 MB incremental asset budget exceeded including metadata/credits');
  for (const { file } of outputs) await writeFile(`${out}/${file}`, await readFile(`${temporary}/${file}`));
  await writeFile(`${out}/manifest.json`, reportText);
  console.log(`Textures ${textureBytes} bytes; UV + textures ${report.incrementalBytes} bytes (metadata excluded).`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
