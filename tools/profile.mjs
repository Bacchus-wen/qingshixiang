// CPU profile of the running experience (Chrome DevTools Protocol). Prints the top self-time functions.
//   node tools/profile.mjs [shotName] [--query "..."] [--seconds 3]
import { createServer } from 'vite';
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const query = opt('query', ''); const seconds = parseFloat(opt('seconds', '3'));
const shot = args[0] || 'memory-street';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${server.httpServer.address().port}/?shot=${shot}&frames=100000${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__perf?.n > 240, null, { timeout: 180000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(seconds * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas; let total = 0;
  profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const key = `${f.functionName || '(anon)'}  ${(f.url || '').split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + (dt[i] || 0)); total += dt[i] || 0; });
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
  console.log(`total ${(total / 1000).toFixed(0)} ms over ${seconds}s, frames/s ~${await page.evaluate(() => (1000 / window.__perf.frameMs).toFixed(0))}`);
  for (const [k, v] of top) console.log(`${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`);
} finally { await browser.close(); await server.close(); }
