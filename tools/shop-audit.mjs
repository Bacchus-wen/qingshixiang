// Contact audit for the repair shop: every placed item is checked for floating (its bottom is not resting on what is
// under it), sinking/clipping into neighbours (bounding-box overlap beyond a tolerance, support pairs excluded) and
// poking through the room walls. Prints one line per problem and a summary.  node tools/shop-audit.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://127.0.0.1:5173/?shot=shop-iso');
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
const res = await page.evaluate(() => {
  const e = window.__engine, THREE = e.ctx.THREE, shop = e.ctx.api.shop;
  const P = shop.placed, R = shop.ROOM, out = [];
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), v = new THREE.Vector3();
  const boxes = {};
  for (const [n, o] of Object.entries(P)) boxes[n] = new THREE.Box3().setFromObject(o);
  const surfaces = (self) => Object.values(P).filter((o) => o !== self).concat(shop.root.children.filter((c) => c.isMesh));
  for (const [n, o] of Object.entries(P)) {
    const L = o.userData.layout || {}; const b = boxes[n];
    if (L.wall || L.type === 'shelf') continue;
    // bottom vertices: lowest 1.5 cm of the item, sampled; each one's gap to the surface right under it
    const pts = []; o.updateMatrixWorld(true);
    o.traverse((m) => {
      if (!m.isMesh) return; const p = m.geometry.attributes.position; const step = Math.max(1, Math.floor(p.count / 4000));
      for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v.y < b.min.y + 0.015) pts.push(v.clone()); }
    });
    const tg = surfaces(o); let gaps = [];
    for (const q of pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 24)) === 0)) {
      ray.set(new THREE.Vector3(q.x, q.y + 0.002, q.z), down); ray.far = 2;
      const h = ray.intersectObjects(tg, true)[0];
      gaps.push(h ? q.y - h.point.y : 2);
    }
    gaps.sort((a, b) => a - b);
    const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0, mn = gaps[0] ?? 0;
    if (med > 0.012) out.push({ kind: 'FLOAT', n, minGap: +mn.toFixed(3), medGap: +med.toFixed(3), samples: gaps.length });
    // walls
    const eps = 0.005;
    if (b.min.x < -R.w / 2 - eps || b.max.x > R.w / 2 + eps || b.min.z < -R.d / 2 - eps) {
      if (b.max.z < R.d / 2) out.push({ kind: 'WALL', n, min: b.min.toArray().map((x) => +x.toFixed(2)), max: b.max.toArray().map((x) => +x.toFixed(2)) });
    }
  }
  // pairwise overlap (axis-aligned; rotated items are coarse, so only report clear interpenetration)
  const names = Object.keys(P);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = names[i], c = names[j], A = boxes[a], B = boxes[c];
    const La = P[a].userData.layout || {}, Lc = P[c].userData.layout || {};
    if (La.on === c || Lc.on === a || La.type === 'shelf' || Lc.type === 'shelf' || La.wall || Lc.wall) continue;
    const ox = Math.min(A.max.x, B.max.x) - Math.max(A.min.x, B.min.x), oy = Math.min(A.max.y, B.max.y) - Math.max(A.min.y, B.min.y), oz = Math.min(A.max.z, B.max.z) - Math.max(A.min.z, B.min.z);
    if (ox > 0.03 && oy > 0.03 && oz > 0.03) out.push({ kind: 'OVERLAP', a, b: c, ox: +ox.toFixed(2), oy: +oy.toFixed(2), oz: +oz.toFixed(2) });
  }
  const dims = Object.fromEntries(Object.entries(boxes).filter(([n]) => !/shelf_.*_\d/.test(n)).map(([n, b]) => [n, { min: b.min.toArray().map((x) => +x.toFixed(2)), max: b.max.toArray().map((x) => +x.toFixed(2)) }]));
  return { out, dims, count: names.length };
});
console.log('items', res.count);
for (const [n, d] of Object.entries(res.dims)) console.log('BOX', n, JSON.stringify(d));
for (const r of res.out) console.log(JSON.stringify(r));
console.log('problems', res.out.length);
await browser.close(); process.exit(0);
