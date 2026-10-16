// Capture the assembled three.js scene of a built web demo into a manifest + binary buffers, so headless Blender
// can rebuild it as a glb (tools/blender/rebuild_capture.py). Used for the kestrel-k1 robot (CC BY-NC, thtbee_).
//   node tools/capture-scene.mjs <static-dir> <out-dir> [--wait 9000] [--keys "1"]
// The page is served from a local static server and opened in Playwright's own Chromium (never the user's Chrome).
// A setter trap on Object.prototype.isScene grabs every THREE.Scene the bundle constructs.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const [dir, out] = process.argv.slice(2);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const waitMs = Number(arg('--wait', 9000));
mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dir, p);
  if (!f.startsWith(path.resolve(dir)) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[page error]', e.message.slice(0, 200)));
await page.addInitScript(() => {
  window.__scenes = [];
  Object.defineProperty(Object.prototype, 'isScene', {
    configurable: true,
    set(v) { Object.defineProperty(this, 'isScene', { value: v, writable: true, configurable: true, enumerable: true }); if (v) window.__scenes.push(this); },
  });
});
let nbuf = 0;
await page.exposeFunction('__saveBuf', (name, b64) => { writeFileSync(path.join(out, name), Buffer.from(b64, 'base64')); nbuf++; });
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(waitMs);
const keys = arg('--keys', '');
for (const k of keys.split(',').filter(Boolean)) { await page.keyboard.press(k); await page.waitForTimeout(1500); }
await page.screenshot({ path: path.join(out, 'page.png') });

const manifest = await page.evaluate(async () => {
  const scenes = window.__scenes;
  // the biggest scene (by mesh count) is the robot's
  const count = (s) => { let n = 0; s.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const scene = scenes.sort((a, b) => count(b) - count(a))[0];
  if (!scene) return { error: 'no scene' };
  scene.updateMatrixWorld(true);
  const toB64 = (arr) => {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const geoms = new Map(); let gid = 0;
  const mats = new Map(); let mid = 0;
  const saveGeo = async (g) => {
    if (geoms.has(g)) return geoms.get(g);
    const id = `g${gid++}`; const rec = { id, attrs: {} };
    for (const k of ['position', 'normal', 'uv']) {
      const a = g.attributes[k]; if (!a) continue;
      // de-interleave / de-normalize into plain Float32
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent ? a.getComponent(i, c) : [a.getX, a.getY, a.getZ][c].call(a, i);
      await window.__saveBuf(`${id}_${k}.bin`, toB64(f)); rec.attrs[k] = { itemSize: a.itemSize, count: a.count };
    }
    if (g.index) { const idx = new Uint32Array(g.index.array); await window.__saveBuf(`${id}_index.bin`, toB64(idx)); rec.index = idx.length; }
    rec.groups = g.groups?.map((x) => [x.start, x.count, x.materialIndex]) ?? [];
    geoms.set(g, rec); return rec;
  };
  const matRec = (m) => {
    if (!m) return null;
    if (mats.has(m)) return mats.get(m).id;
    const c = (x) => (x && x.isColor ? '#' + x.getHexString() : null);
    const r = { id: `m${mid++}`, name: m.name || m.type, type: m.type, color: c(m.color), emissive: c(m.emissive), emissiveIntensity: m.emissiveIntensity,
      roughness: m.roughness, metalness: m.metalness, opacity: m.opacity, transparent: m.transparent, transmission: m.transmission, clearcoat: m.clearcoat, side: m.side };
    mats.set(m, r); return r.id;
  };
  const walk = async (o) => {
    const n = { name: o.name || o.type, type: o.type, visible: o.visible, p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray(), children: [] };
    if (o.isMesh || o.isInstancedMesh) {
      n.geo = (await saveGeo(o.geometry)).id;
      n.mat = Array.isArray(o.material) ? o.material.map(matRec) : matRec(o.material);
      if (o.isInstancedMesh) {
        const m = new Float32Array(o.count * 16); for (let i = 0; i < o.count; i++) o.getMatrixAt(i, { toArray: (arr) => arr } ) ;
        n.instances = o.count; await window.__saveBuf(`${n.geo}_inst_${Math.random().toString(36).slice(2, 8)}.bin`, toB64(o.instanceMatrix.array.slice(0, o.count * 16)));
      }
    }
    for (const c of o.children) if (!c.isLight && !c.isCamera) n.children.push(await walk(c));
    return n;
  };
  const root = await walk(scene);
  return { root, materials: [...mats.values()], geometries: [...geoms.values()] };
});
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
console.log('buffers', nbuf, 'materials', manifest.materials?.length, 'geometries', manifest.geometries?.length, manifest.error ?? '');
await browser.close(); server.close(); process.exit(0);
