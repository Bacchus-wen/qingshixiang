// Usage: node glbinfo.mjs <file.glb> ... -> JSON lines with per-file mesh/texture stats (no deps)
import { readFileSync, statSync } from 'node:fs';
const CT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
function imgDims(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { fmt: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { fmt: 'jpg', h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      const len = buf.readUInt16BE(o + 2); o += 2 + len;
    }
    return { fmt: 'jpg' };
  }
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const c = buf.slice(12, 16).toString();
    if (c === 'VP8X') return { fmt: 'webp', w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (c === 'VP8 ') return { fmt: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (c === 'VP8L') { const b = buf.readUInt32LE(21); return { fmt: 'webp', w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  }
  if (buf[0] === 0xab && buf.slice(1, 7).toString() === 'KTX 20') return { fmt: 'ktx2', w: buf.readUInt32LE(20), h: buf.readUInt32LE(24), vk: buf.readUInt32LE(12) };
  return { fmt: '?' };
}
for (const f of process.argv.slice(2)) {
  const b = readFileSync(f);
  if (b.readUInt32LE(0) !== 0x46546c67) { console.log(JSON.stringify({ f, err: 'not glb' })); continue; }
  let o = 12, json = null, bin = null;
  while (o < b.length) { const len = b.readUInt32LE(o), type = b.readUInt32LE(o + 4); const chunk = b.slice(o + 8, o + 8 + len); if (type === 0x4e4f534a) json = JSON.parse(chunk.toString()); else if (type === 0x004e4942) bin = chunk; o += 8 + len; }
  const acc = json.accessors || [], bvs = json.bufferViews || [];
  let verts = 0, tris = 0, prims = 0, attrBytes = 0, idxBytes = 0;
  const attrNames = new Set();
  for (const m of json.meshes || []) for (const p of m.primitives) {
    prims++;
    const pos = acc[p.attributes.POSITION]; verts += pos?.count || 0;
    for (const [k, ai] of Object.entries(p.attributes)) { const a = acc[ai]; attrNames.add(k + ':' + a.componentType + (a.normalized ? 'n' : '')); attrBytes += a.count * NC[a.type] * CT[a.componentType]; }
    if (p.indices !== undefined) { const a = acc[p.indices]; tris += a.count / 3; idxBytes += a.count * CT[a.componentType]; } else tris += (pos?.count || 0) / 3;
  }
  const images = (json.images || []).map((im, i) => {
    let d = { fmt: im.mimeType };
    if (im.bufferView !== undefined && bin) { const bv = bvs[im.bufferView]; const s = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); d = { ...imgDims(s), bytes: bv.byteLength }; }
    else if (im.uri) d.uri = im.uri;
    return { i, name: im.name, ...d };
  });
  // which material slot uses each texture
  const texSlots = {};
  const tx = json.textures || [];
  for (const m of json.materials || []) {
    const pbr = m.pbrMetallicRoughness || {};
    const slots = { base: pbr.baseColorTexture, mr: pbr.metallicRoughnessTexture, normal: m.normalTexture, occ: m.occlusionTexture, emis: m.emissiveTexture };
    for (const [s, t] of Object.entries(slots)) if (t) { const src = tx[t.index]?.source ?? tx[t.index]?.extensions?.KHR_texture_basisu?.source ?? tx[t.index]?.extensions?.EXT_texture_webp?.source; (texSlots[src] ||= new Set()).add(s); }
  }
  for (const im of images) im.slots = [...(texSlots[im.i] || [])].join('+');
  const gpuTex = images.reduce((s, im) => s + (im.w ? im.w * im.h * 4 * 4 / 3 : 0), 0);
  console.log(JSON.stringify({ f, kb: Math.round(statSync(f).size / 1024), meshes: (json.meshes || []).length, nodes: (json.nodes || []).length, prims, verts, tris, attrMB: +(attrBytes / 1048576).toFixed(2), idxMB: +(idxBytes / 1048576).toFixed(2), attrs: [...attrNames].join(','), mats: (json.materials || []).length, images, gpuTexMB_rgba8_mips: +(gpuTex / 1048576).toFixed(1), ext: json.extensionsUsed || [] }));
}
