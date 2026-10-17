import { chromium } from '/Users/wenbin/Games/新游戏/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const url = process.argv[2];
const hook = readFileSync('/tmp/perfcmp/hook.js', 'utf8');
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await page.addInitScript({ content: 'window.__pmTimestamps = true;' });
  await page.addInitScript({ content: hook });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000, polling: 250 });
  await page.evaluate(() => { const e = window.__engine; if (e?.params && e.shot) e.start(); });
  await page.waitForTimeout(2000);
  const res = await page.evaluate(async () => {
    const r = window.__pmRenderer, PM = window.__pm;
    PM.passAgg = new Map(); PM.tsBatches.length = 0; PM.uidLabel.clear();
    const f0 = r.info.frame; let raf = 0;
    await new Promise((res) => { const t0 = performance.now(); const l = (t) => { raf++; if (t - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); });
    const f1 = r.info.frame;
    await r.resolveTimestampsAsync('render');
    const b = PM.tsBatches[PM.tsBatches.length - 1];
    if (!b) return { f0, f1, raf, err: 'no batch' };
    const rows = [...b.offsets.entries()].map(([uid, off]) => [uid, Number(b.data[off]) / 1e6, Number(b.data[off + 1]) / 1e6, PM.uidLabel.get(uid)]);
    PM.passAgg = null;
    return { f0, f1, raf, n: rows.length, rows };
  });
  console.log('info.frame', res.f0, '->', res.f1, 'raf', res.raf, 'rows', res.n, res.err || '');
  if (res.rows) {
    const base = Math.min(...res.rows.map((x) => x[1]));
    const frames = [...new Set(res.rows.map((x) => x[0].split(':f')[1]))];
    console.log('frames in batch', frames.length, frames.slice(0, 10).join(','), '...', frames.slice(-5).join(','));
    const last = frames[frames.length - 2];
    for (const x of res.rows.filter((x) => x[0].endsWith(':f' + last))) console.log(x[0].padEnd(14), (x[1] - base).toFixed(2).padStart(9), (x[2] - base).toFixed(2).padStart(9), (x[2] - x[1]).toFixed(2).padStart(7), x[3]);
  }
} finally { await browser.close(); }
