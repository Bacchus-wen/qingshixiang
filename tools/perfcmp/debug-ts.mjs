// debug GPU timestamp sums on one page
import { chromium } from '/Users/wenbin/Games/新游戏/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const url = process.argv[2];
const hook = readFileSync('/tmp/perfcmp/hook.js', 'utf8');
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-precise-memory-info'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript({ content: hook });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000, polling: 250 });
  await page.evaluate(() => { const e = window.__engine; if (e?.params && e.shot) e.start(); });
  await page.waitForTimeout(2000);
  const res = await page.evaluate(async () => {
    const r = window.__pmRenderer, PM = window.__pm;
    PM.passLog = new Map();
    const out = [];
    for (let k = 0; k < 4; k++) {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
      await r.resolveTimestampsAsync('render');
      const q = r.backend.timestampQueryPool.render;
      const rows = [...q.timestamps.entries()].map(([uid, ms]) => ({ uid, ms: +ms.toFixed(3), label: PM.passLog.get(uid)?.label }));
      out.push({ frames: q.frames, n: rows.length, rows: rows.slice(0, 200) });
    }
    return out;
  });
  for (const b of res) {
    console.log('batch frames', JSON.stringify(b.frames), 'n', b.n);
    const byF = {};
    for (const r of b.rows) { const f = r.uid.split(':f')[1]; byF[f] = (byF[f] || 0) + r.ms; }
    console.log('  per frame sums', JSON.stringify(byF));
  }
  const last = res[res.length - 1];
  const f = last.rows[last.rows.length - 1].uid.split(':f')[1];
  for (const r of last.rows.filter((x) => x.uid.endsWith(':f' + f))) console.log('  ', r.uid.padEnd(16), String(r.ms).padStart(9), r.label);
} finally { await browser.close(); }
