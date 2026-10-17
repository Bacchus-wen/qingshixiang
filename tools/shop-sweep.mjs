// Random-viewpoint sweep of the shop (inside, eye height 1.1-1.7 m, looking at random points on the room's surfaces)
// to catch floating/clipping/odd things from angles the review shots never take. Writes renders/sweep/sheet.jpg.
//   node tools/shop-sweep.mjs [count=16] [seed=1]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const N = Number(process.argv[2] || 16), seed = Number(process.argv[3] || 1);
mkdirSync('renders/sweep', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.goto('http://127.0.0.1:5173/?shot=shop-iso&frames=30');
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
const files = [];
for (let i = 0; i < N; i++) {
  await page.evaluate(({ i, seed }) => {
    const e = window.__engine, cam = e.camera, R = e.ctx.api.shop.ROOM;
    const r = (k) => { const x = Math.sin((i + 1) * 127.1 * seed + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    e.shot = null; cam.fov = 58; cam.updateProjectionMatrix();
    cam.position.set((r(1) - 0.5) * (R.w - 0.8), 1.1 + r(2) * 0.6, (r(3) - 0.5) * (R.d - 0.8));
    const a = r(4) * Math.PI * 2; cam.lookAt(cam.position.x + Math.cos(a) * 3, 0.6 + r(5) * 0.8, cam.position.z + Math.sin(a) * 3);
    for (let k = 0; k < 6; k++) e.postfx.render(1 / 60);
  }, { i, seed });
  await page.waitForTimeout(350);
  const f = `renders/sweep/v${String(i).padStart(2, '0')}.png`; await page.screenshot({ path: f }); files.push(f);
}
await browser.close();
const cols = 4, rows = Math.ceil(N / cols);
const inputs = files.flatMap((f) => ['-i', f]);
const filt = files.map((_, k) => `[${k}:v]scale=480:300,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='v${k}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.5[v${k}]`).join(';')
  + ';' + files.map((_, k) => `[v${k}]`).join('') + `xstack=inputs=${N}:layout=` + files.map((_, k) => `${(k % cols) * 480}_${Math.floor(k / cols) * 300}`).join('|');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filt, '-frames:v', '1', '-q:v', '3', 'renders/sweep/sheet.jpg']);
console.log('SHEET renders/sweep/sheet.jpg', N);
process.exit(0);
