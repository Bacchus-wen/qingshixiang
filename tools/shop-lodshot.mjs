// node tools/shop-lodshot.mjs <shot> [query]: screenshot a review shot after every LOD copy reached its level; prints levels, GPU MB, perf
import { chromium } from 'playwright';
const shot = process.argv[2] || 'shop-establish', extra = process.argv[3] || '';
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || /\[shop\]|\[lod\]/.test(m.text())) errs.push(m.type() + ' ' + m.text()); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:5173/?shot=${shot}&frames=30${extra}`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 240000 });
const info = await page.evaluate(() => { const L = window.__engine.ctx.api.shop.lod; const lv = {}; for (const o of L.instances) { const k = o.set.name; (lv[k] ??= []).push(o.cur); } return { gpuMB: Math.round((L.gpuBytes || 0) / 1048576), loads: L.stats.loads, lv, perf: window.__perf }; });
await page.screenshot({ path: `/tmp/lod_${shot}.png` });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify(info));
for (const e of errs.slice(0, 12)) console.log('  ', e.slice(0, 200));
await browser.close(); process.exit(0);
