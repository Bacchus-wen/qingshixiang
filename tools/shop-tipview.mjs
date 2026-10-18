// Render chosen torso poses from /tmp/tipsearch.json (robotfull camera, crop round the hands) into a contact sheet.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const R = JSON.parse(readFileSync('/tmp/tipsearch.json'));
const want = JSON.parse(process.argv[2]); const shot = process.argv[3] || 'shop-robotfull'; const crop = process.argv[4] || '640:480:120:240';
const pick = want.map(([ch, ry]) => R.out.filter((c) => c.ch === ch && c.ry === ry && !c.bad && !c.bad2).sort((a, b) => Math.abs(a.sd - 0.003) - Math.abs(b.sd - 0.003))[0]).filter(Boolean);
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:5173/?shot=${shot}&frames=30`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
await page.evaluate(() => { const e = window.__engine; e.__cam = [e.camera.position.clone(), e.camera.quaternion.clone()]; e.shot = null; for (let i = 0; i < 4; i++) e.postfx.render(1 / 60); });
await page.waitForTimeout(600);
const files = [];
for (const [k, c] of pick.entries()) {
  await page.evaluate(({ c, R }) => {
    const e = window.__engine, P = e.ctx.api.shop.placed, t = P.spare_torso, k = P.work_carton;
    e.camera.position.copy(e.__cam[0]); e.camera.quaternion.copy(e.__cam[1]);
    const r = c.ry * Math.PI / 180;
    t.position.set(c.tx, c.ch - R.tminY, c.tz); t.rotation.y = r;
    k.position.set(c.ccx, 0, c.ccz); k.rotation.y = r; k.scale.set(R.CW / 0.32, c.ch / 0.3, R.CD / 0.26);
    for (let i = 0; i < 6; i++) e.postfx.render(1 / 60);
  }, { c, R: { tminY: R.tminY, CW: R.CW, CD: R.CD } });
  await page.waitForTimeout(400);
  const f = `/tmp/_tv${k}.png`; await page.screenshot({ path: f }); files.push([f, `${k} h${c.ch} ry${c.ry} sd${c.sd}`]);
}
await browser.close();
const cols = 4, rows = Math.ceil(files.length / cols), [cw, chh] = crop.split(':').map(Number), tw = 400, th = Math.round(400 * chh / cw);
const inputs = files.flatMap(([f]) => ['-i', f]); const pad = cols * rows - files.length;
const filt = files.map(([, l], i) => `[${i}:v]crop=${crop},scale=${tw}:${th},drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${l}':x=6:y=6:fontsize=15:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';')
  + (pad ? ';' + Array.from({ length: pad }, (_, k) => `color=c=black:s=${tw}x${th}:d=1[p${k}]`).join(';') : '')
  + ';' + [...files.map((_, i) => `[v${i}]`), ...Array.from({ length: pad }, (_, k) => `[p${k}]`)].join('') + `xstack=inputs=${cols * rows}:layout=` + Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`).join('|');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filt, '-frames:v', '1', '-q:v', '3', '/tmp/tipview.jpg']);
console.log(pick.map((c, i) => `${i}: ${JSON.stringify(c)}`).join('\n'));
process.exit(0);
