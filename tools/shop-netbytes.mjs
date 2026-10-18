// Bytes the shop scene downloads from the production build (sum of response bodies), by type.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:5181/?shot=shop-establish';
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const by = {}; let total = 0; const big = [];
page.on('response', async (r) => { try { const b = await r.body(); const u = new URL(r.url()); const ext = (u.pathname.split('.').pop() || 'html').slice(0, 5); by[ext] = (by[ext] || 0) + b.length; total += b.length; big.push([b.length, u.pathname]); } catch {} });
await page.goto(url);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 180000 });
await page.waitForTimeout(1500);
console.log('TOTAL MB', (total / 1048576).toFixed(1));
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(k, (v / 1048576).toFixed(2));
big.sort((a, b) => b[0] - a[0]); console.log(big.slice(0, 8).map(([n, p]) => `${(n / 1048576).toFixed(2)} ${p}`).join('\n'));
await browser.close(); process.exit(0);
