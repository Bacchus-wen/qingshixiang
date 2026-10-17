// In-scene close-ups of every distinct model in the repair shop (one instance each, framed 3/4 from its front,
// scene lighting as is). Writes renders/gallery/<name>.png and renders/gallery/sheet.jpg (contact sheet).
//   node tools/shop-gallery.mjs [--size 640x480]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const sz = (args[args.indexOf('--size') + 1] || '640x480'); const [W, H] = (args.includes('--size') ? sz : '640x480').split('x').map(Number);
mkdirSync('renders/gallery', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('http://127.0.0.1:5173/?shot=shop-iso&frames=30');
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
const list = await page.evaluate(() => {
  const e = window.__engine, P = e.ctx.api.shop.placed, seen = new Set(), out = [];
  // prefer stand-alone instances (not on shelves) as the representative of each model
  // representative instance per model: a named, free-standing one where it exists
  const PREF = { 'tube_radio_closed.glb': 'queue_radio', 'crt_tv.glb': 'tv_on_stool', 'stool.glb': 'stool_2', 'desk_fan.glb': 'queue_fan', 'alarm_clock.glb': 'bench_clock', 'thermos.glb': 'thermos_floor' };
  const rank = (o) => { const L = o.userData.layout; return (PREF[L.glb] === L.name ? -2 : 0) + (L.level != null ? 1 : 0) + (/plank|_t$/.test(L.name) || L.on === 'wall_plank' ? 1 : 0); };
  const items = Object.values(P).sort((a, b) => rank(a) - rank(b));
  for (const o of items) {
    const L = o.userData.layout; const key = L.glb || (L.type === 'proc' ? 'proc_' + L.kind : null);
    if (!key || seen.has(key)) continue; seen.add(key); out.push({ key, name: L.name });
  }
  return out;
});
const files = [];
for (const { key, name } of list) {
  await page.evaluate(({ name }) => {
    const e = window.__engine, THREE = e.ctx.THREE, o = e.ctx.api.shop.placed[name], R = e.ctx.api.shop.ROOM;
    const b = new THREE.Box3().setFromObject(o, true), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const yaw = o.rotation.y; const d = new THREE.Vector3(0.55, 0.35, 1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const cam = e.camera; e.shot = null; cam.fov = 35; cam.updateProjectionMatrix();
    const dist = Math.max(0.35, r / Math.tan((cam.fov * Math.PI / 180) / 2) * 1.15);
    const p = c.clone().addScaledVector(d, dist);
    // keep the camera inside the room (or on the street for street items)
    if (c.z < R.d / 2) { // interior item: camera stays inside the room, in front of it
      p.x = Math.max(-R.w / 2 + 0.15, Math.min(R.w / 2 - 0.15, p.x)); p.z = Math.max(-R.d / 2 + 0.15, Math.min(R.d / 2 - 0.1, p.z)); p.y = Math.max(0.2, Math.min(R.h - 0.15, p.y));
    } else { p.z = Math.max(p.z, c.z + 1.2); p.y = Math.max(p.y, 0.6); } // street item: from the street
    cam.position.copy(p); cam.lookAt(c);
    for (let i = 0; i < 6; i++) e.postfx.render(1 / 60);
  }, { name });
  const f = `renders/gallery/${key.replace('.glb', '')}.png`;
  await page.screenshot({ path: f }); files.push(f);
  console.log('SHOT', key, '->', f);
}
await browser.close();
// contact sheet: 4 columns
const cols = 4, rows = Math.ceil(files.length / cols);
const inputs = files.flatMap((f) => ['-i', f]);
const pad = cols * rows - files.length;
const filt = files.map((_, i) => `[${i}:v]scale=480:360,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${files[i].split('/').pop().replace('.png', '')}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5[v${i}]`).join(';')
  + (pad ? ';' + Array.from({ length: pad }, (_, k) => `color=c=black:s=480x360:d=1[p${k}]`).join(';') : '')
  + ';' + [...files.map((_, i) => `[v${i}]`), ...Array.from({ length: pad }, (_, k) => `[p${k}]`)].join('') + `xstack=inputs=${cols * rows}:layout=` + Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 360}`).join('|');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filt, '-frames:v', '1', '-q:v', '3', 'renders/gallery/sheet.jpg']);
console.log('SHEET renders/gallery/sheet.jpg', files.length);
process.exit(0);
