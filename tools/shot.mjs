// Automated screenshot check. Usage:
//   node tools/shot.mjs <shot> [<shot> ...] [--frames 120] [--size 1280x720] [--query "only=rain"]
// Starts its own Vite server, renders each ?shot=<name> deterministically, writes renders/<name>.png
// and prints the backend (webgpu/webgl2) plus any console errors. Exit code 1 if a shot failed.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const frames = opt('frames', '120');
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const extra = opt('query', '');
const shots = args.length ? args : ['sandbox'];

mkdirSync(path.join(root, 'renders'), { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const port = server.httpServer.address().port;

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--ignore-gpu-blocklist'],
});
let failed = 0;
for (const name of shots) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  const url = `http://localhost:${port}/?shot=${name}&frames=${frames}${extra ? '&' + extra : ''}`;
  const t0 = Date.now();
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
    const backend = await page.evaluate(() => window.__engine?.ctx?.backend);
    const out = path.join(root, 'renders', `${name}.png`);
    await page.screenshot({ path: out });
    console.log(`OK   ${name} -> renders/${name}.png (${backend}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
  }
  for (const e of errors.slice(0, 15)) console.log('     ' + e);
  await page.close();
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
