// node tools/shop-fps.mjs <shot> [query]: 1080p frame time (uncapped), CPU submit, triangles, model GPU memory, LOD loads during the run
// frame time at a review shot with the LOD shop (dev server): node tools/_fpsdev.mjs shot [query]
import { chromium } from 'playwright';
const [shot, q = ''] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://127.0.0.1:5173/?shot=${shot}&frames=30${q}`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 240000 });
const r = await page.evaluate(() => new Promise((res) => {
  const e = window.__engine; e.shotFrames = 1e9; e.start(); // keep rendering this camera (shot mode stays: fixed step, same view)
  const t = []; let last = performance.now(); const L = e.ctx.api.shop.lod; const s0 = { ...L.stats };
  const f = (now) => { t.push(now - last); last = now; if (t.length < 200) requestAnimationFrame(f); else res({ t, perf: window.__perf, gpu: Math.round(L.gpuBytes / 1048576), loads: L.stats.loads - s0.loads, ev: L.stats.evictions - s0.evictions }); };
  setTimeout(() => requestAnimationFrame(f), 1000);
}));
r.t.sort((a, b) => a - b);
console.log(`${shot}${q} 1080p: frame p50 ${r.t[100].toFixed(1)} ms, p95 ${r.t[190].toFixed(1)} ms (${(1000 / r.t[100]).toFixed(0)} fps); submit ${r.perf.submitMs.toFixed(1)} ms; ${r.perf.triangles.toLocaleString()} tris; ${r.perf.calls} calls; model GPU ${r.gpu} MB; during: ${r.loads} loads, ${r.ev} evictions`);
await browser.close(); process.exit(0);
