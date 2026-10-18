// Preview robot head rest poses from a shot camera: node tools/_headview.mjs <shot> '[[px,py,pz],...]' <crop> <out>
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const [shot, list, crop, out] = process.argv.slice(2);
const poses = JSON.parse(list);
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:5173/?shot=${shot}&frames=30`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
await page.evaluate(() => { const e = window.__engine; e.__cam = [e.camera.position.clone(), e.camera.quaternion.clone()]; e.shot = null; for (let i = 0; i < 4; i++) e.postfx.render(1 / 60); });
await page.waitForTimeout(600);
const files = [];
for (const [k, r] of poses.entries()) {
  await page.evaluate((r) => { const e = window.__engine, h = e.ctx.api.shop.placed.robot.getObjectByName('robot_head'); e.camera.position.copy(e.__cam[0]); e.camera.quaternion.copy(e.__cam[1]);
    h.rotation.set(...r); h.updateMatrixWorld(true); for (let i = 0; i < 6; i++) e.postfx.render(1 / 60); }, r);
  await page.waitForTimeout(400); const f = `/tmp/_hv${k}.png`; await page.screenshot({ path: f }); files.push([f, r.join(' ')]);
}
await browser.close();
const inputs = files.flatMap(([f]) => ['-i', f]);
const filt = files.map(([, l], i) => `[${i}:v]crop=${crop},scale=420:-2,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${l}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${files.length}`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filt, '-q:v', '3', out]);
process.exit(0);
