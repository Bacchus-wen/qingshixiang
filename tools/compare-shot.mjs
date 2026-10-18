// Screenshot check of the comparison stage: node tools/compare-shot.mjs "<query>" <out.png> [split] [size]
import { chromium } from 'playwright';
const [query, out, split = '0.5', size = '1600x900'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:5173/compare.html?${query}`);
await page.waitForFunction(() => window.__compare?.ready(), null, { timeout: 300000 });
const tl = (Date.now() - t0) / 1000;
await page.evaluate((s) => window.__compare.setSplit(+s), split);
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
console.log('loaded in', tl.toFixed(1), 's; messages', errs.length); for (const e of errs.slice(0, 8)) console.log('  ', e.slice(0, 220));
await browser.close(); process.exit(0);
