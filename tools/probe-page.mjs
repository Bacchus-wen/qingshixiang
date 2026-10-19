// Open a page in Playwright's Chromium, evaluate an expression (may change state), optionally screenshot.
//   node tools/probe-page.mjs <url> "<expr>" [out.png] [waitMs]
// The page may be a ?shot= (frozen after its frames: the expression can call __engine.renderer.setAnimationLoop again)
import { chromium } from 'playwright';
const [url, expr, png, waitMs] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = []; page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300))); page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__shotReady === true || document.getElementById('loading')?.classList.contains('done'), null, { timeout: 120000 });
await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate(expr), null, 1));
await page.waitForTimeout(+waitMs || 1500);
if (png) await page.screenshot({ path: png });
console.log(logs.filter((l) => !l.startsWith('[log]') && !l.startsWith('[debug]')).slice(0, 20).join('\n'));
await browser.close();
