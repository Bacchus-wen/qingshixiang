// Contact audit for the repair shop (node tools/shop-audit.mjs). Uses precise (vertex) boxes. Reports:
//  FLOAT    an item's bottom is not resting on what is under it (median gap of its lowest vertices > 1.2 cm)
//  SHELF    a shelf item pokes through the board above, past the uprights, or off the board front/back
//  ROOM     an item crosses a wall, the ceiling, or the front wall (pillars / lintel) — street items excepted
//  OVERLAP  two items' precise boxes interpenetrate by > 3 cm on every axis (candidates: check visually)
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', (m) => { if (/\[shop\]/.test(m.text())) console.log('PAGE', m.text()); });
await page.goto('http://127.0.0.1:5173/?shot=shop-iso');
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
const res = await page.evaluate(() => {
  const e = window.__engine, THREE = e.ctx.THREE, shop = e.ctx.api.shop;
  const P = shop.placed, R = shop.ROOM, out = [];
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), v = new THREE.Vector3();
  const boxes = {};
  for (const [n, o] of Object.entries(P)) boxes[n] = new THREE.Box3().setFromObject(o, true);
  const statics = shop.root.children.filter((c) => c.isMesh);
  const f3 = (x) => +x.toFixed(3);
  for (const [n, o] of Object.entries(P)) {
    const L = o.userData.layout || {}; const b = boxes[n];
    if (L.type === 'shelf') continue;
    // FLOAT (not for wall-mounted items)
    if (!L.wall && !L.noDrop) {
      const band = Math.min(0.015, (b.max.y - b.min.y) * 0.2);
      const pts = []; o.updateMatrixWorld(true);
      o.traverse((m) => {
        if (!m.isMesh) return; const p = m.geometry.attributes.position; const st = Math.max(1, Math.floor(p.count / 6000));
        for (let i = 0; i < p.count; i += st) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v.y < b.min.y + band) pts.push(v.clone()); }
      });
      const tg = Object.values(P).filter((x) => x !== o).concat(statics); const gaps = [];
      for (const q of pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 30)) === 0)) {
        ray.set(new THREE.Vector3(q.x, q.y + 0.002, q.z), down); ray.far = 2;
        const h = ray.intersectObjects(tg, true)[0]; gaps.push(h ? q.y - h.point.y : 2);
      }
      gaps.sort((a, c) => a - c);
      const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
      if (med > 0.012) out.push({ kind: 'FLOAT', n, minGap: f3(gaps[0] ?? 0), medGap: f3(med) });
    }
    // SHELF: board above, uprights, front/back edge
    const sup = L.on && P[L.on], SL = sup?.userData.layout;
    if (SL?.type === 'shelf' && L.level != null) {
      const nlev = SL.levels || 5, H = SL.h || 2.4, W = SL.w || 1.8, D = SL.d || 0.45;
      const yAbove = L.level < nlev - 1 ? 0.08 + (L.level + 1) * (H - 0.12) / (nlev - 1) - 0.006 : 9;
      if (b.max.y > yAbove) out.push({ kind: 'SHELF', n, why: 'board above', over: f3(b.max.y - yAbove) });
      // shelf-local box of the item: transform its 8 precise-box corners into the shelf frame (shelves only yaw)
      const inv = sup.matrixWorld.clone().invert(); const lb = new THREE.Box3();
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) lb.expandByPoint(v.set(x, y, z).applyMatrix4(inv));
      // (world AABB corners -> local is conservative for yawed shelves; good enough to flag)
      const inner = W / 2 - 0.04;
      if (lb.min.x < -inner - 0.01 || lb.max.x > inner + 0.01) out.push({ kind: 'SHELF', n, why: 'past uprights', x: [f3(lb.min.x), f3(lb.max.x)], inner: f3(inner) });
      if (lb.min.z < -D / 2 - 0.01 || lb.max.z > D / 2 + 0.03) out.push({ kind: 'SHELF', n, why: 'off board', z: [f3(lb.min.z), f3(lb.max.z)], half: D / 2 });
    }
    // ROOM
    const street = b.min.z > R.d / 2 + 0.25 - 0.01;
    if (!street) {
      const eps = 0.006;
      if (b.min.x < -R.w / 2 - eps || b.max.x > R.w / 2 + eps) out.push({ kind: 'ROOM', n, why: 'side wall', x: [f3(b.min.x), f3(b.max.x)] });
      if (b.min.z < -R.d / 2 - eps) out.push({ kind: 'ROOM', n, why: 'back wall', z: f3(b.min.z) });
      if (b.max.y > R.h + eps) out.push({ kind: 'ROOM', n, why: 'ceiling', y: f3(b.max.y) });
      if (b.max.z > R.d / 2 + eps && (b.min.x < -1.8 || b.max.x > 1.8 || b.max.y > 2.6)) out.push({ kind: 'ROOM', n, why: 'front wall', z: f3(b.max.z) });
    } else if (b.min.z < R.d / 2 + 0.25 - 0.005) out.push({ kind: 'ROOM', n, why: 'into facade', z: f3(b.min.z) });
  }
  const names = Object.keys(P);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = names[i], c = names[j], A = boxes[a], B = boxes[c];
    const La = P[a].userData.layout || {}, Lc = P[c].userData.layout || {};
    if (La.on === c || Lc.on === a || La.type === 'shelf' || Lc.type === 'shelf') continue;
    const ox = Math.min(A.max.x, B.max.x) - Math.max(A.min.x, B.min.x), oy = Math.min(A.max.y, B.max.y) - Math.max(A.min.y, B.min.y), oz = Math.min(A.max.z, B.max.z) - Math.max(A.min.z, B.min.z);
    if (ox > 0.03 && oy > 0.03 && oz > 0.03) out.push({ kind: 'OVERLAP', a, b: c, ox: f3(ox), oy: f3(oy), oz: f3(oz) });
  }
  return { out, count: names.length };
});
console.log('items', res.count);
for (const r of res.out) console.log(JSON.stringify(r));
console.log('problems', res.out.length, Object.entries(res.out.reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {})).map((x) => x.join('=')).join(' '));
await browser.close(); process.exit(0);
