// node tools/shop-fps-throttle.mjs <shot> <cpuRate> [query] [WxH]: frame time with Chrome's CPU throttling (CDP), vsync on
import { chromium } from 'playwright';
const [shot, rate = '4', q = '', size = '1920x1080'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`http://127.0.0.1:5173/?shot=${shot}&frames=30${q}`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 240000 });
const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rate });
const r = await page.evaluate(() => new Promise((res) => {
  const e = window.__engine; e.shotFrames = 1e9; e.start();
  const t = []; let last = performance.now();
  const f = (now) => { t.push(now - last); last = now; if (t.length < 150) requestAnimationFrame(f); else res({ t, perf: window.__perf }); };
  setTimeout(() => requestAnimationFrame(f), 1500);
}));
r.t.sort((a, b) => a - b);
console.log(`${shot}${q} ${size} cpu x${rate}: frame p50 ${r.t[75].toFixed(1)} ms, p95 ${r.t[142].toFixed(1)} ms (${(1000 / r.t[75]).toFixed(0)} fps); submit ${r.perf.submitMs.toFixed(1)} ms; calls ${r.perf.calls}`);
await browser.close(); process.exit(0);
