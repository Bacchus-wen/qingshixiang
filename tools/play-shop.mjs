// Scripted playthrough of the shop story (v4): drives the real experience (no ?shot) with keyboard and mouse and
// screenshots the key moments, then tiles them into one sheet.
//   node tools/play-shop.mjs [--speed 2] [--query "q=low"] [--out renders/play-shop] [--size 1280x720]
// Uses Playwright's own Chromium (never the user's Chrome).
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const speed = parseFloat(opt('speed', '2'));
const query = opt('query', '');
const out = path.join(root, opt('out', 'renders/play-shop'));
const [W, H] = opt('size', '1280x720').split('x').map(Number);
mkdirSync(path.dirname(out), { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const shots = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  await page.goto(`http://localhost:${server.httpServer.address().port}/?speed=${speed}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 180000 });
  const wait = (s) => page.waitForTimeout((s / speed) * 1000);
  const phase = () => page.evaluate(() => window.__engine?.ctx?.api?.story?.phase);
  const until = async (p, maxS = 60) => { for (let i = 0; i < maxS * 4; i++) { if ((await phase()) === p) return true; await page.waitForTimeout(250); } return false; };
  const snap = async (label) => { const f = `${out}-${String(shots.length).padStart(2, '0')}-${label}.png`; await page.screenshot({ path: f }); shots.push(f); console.log('snap', label, await phase()); };
  await page.waitForTimeout(1500); await snap('title');
  await page.mouse.move(W / 2, H / 2); await page.mouse.click(W / 2, H / 2);
  await wait(4); await snap('arrive-4s');
  await wait(9); await snap('arrive-13s');
  await wait(9); await snap('arrive-22s');
  await until('wait', 40); await wait(4); await snap('wait');
  await page.keyboard.down('Space'); await wait(0.9); await snap('attempt1'); await wait(0.8); await page.keyboard.up('Space');
  await wait(2); await snap('after-fail');
  await page.keyboard.down('Space'); await wait(1.2); await snap('opening');
  await until('look', 20); await wait(1); await snap('look-0');
  await wait(4); await snap('look-centre');
  await page.mouse.move(W * 0.15, H * 0.45, { steps: 25 }); await wait(4); await snap('look-left');
  await page.mouse.move(W * 0.3, H * 0.2, { steps: 25 }); await wait(4); await snap('look-left-up');
  await page.mouse.move(W * 0.62, H * 0.5, { steps: 25 }); await wait(4); await snap('look-ahead');
  await page.mouse.move(W * 0.92, H * 0.45, { steps: 25 }); await wait(5); await snap('look-right');
  await wait(14); await snap(`look-dwell-${await phase()}`);
  if ((await phase()) === 'look') { await page.keyboard.press('KeyD'); }
  await until('door', 10); await wait(5); await snap('door-5s');
  await wait(4); await snap('door-9s');
  await wait(6); await snap('door-15s');
  await wait(6); await snap('door-21s');
  await until('fade', 30); await wait(2); await snap('fade');
  await page.keyboard.up('Space');
  await until('end', 20); await wait(6); await snap('end-6s');
  await wait(8); await snap('end-14s');
  await wait(7); await snap('end-card');
  const perf = await page.evaluate(() => window.__perf && { frameMs: +window.__perf.frameMs.toFixed(1), calls: window.__perf.calls, tris: window.__perf.triangles });
  console.log('phase now:', await phase(), 'perf', JSON.stringify(perf));
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
} finally {
  await browser.close(); await server.close();
}
// contact sheet
try { execFileSync(path.join(root, 'tools/sheet.sh'), [`${out}-sheet.jpg`, '4', '480', ...shots], { stdio: 'inherit' }); console.log('sheet', `${out}-sheet.jpg`); } catch (e) { console.log('sheet failed', e.message); }
