// Scripted playthrough of the shop story (v4): drives the real experience (no ?shot) with keyboard and mouse and
// screenshots the key moments, then tiles them into one sheet.
//   node tools/play-shop.mjs [--speed 2] [--query "q=low"] [--out renders/play-shop] [--size 1280x720] [--url http://…/] [--netlog f.json]
//   --netlog: every request (path, status, bytes) and every failed one, for the web build's file list and its checks
// Uses Playwright's own Chromium (never the user's Chrome).
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
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
for (const f of readdirSync(path.dirname(out))) if (f.startsWith(path.basename(out) + '-') && f.endsWith('.png')) unlinkSync(path.join(path.dirname(out), f)); // no stale frames

const base = opt('url', null); // e.g. http://127.0.0.1:5181/ (a production build) instead of a dev server
const server = base ? null : await createServer({ root, logLevel: 'error', server: { port: 0 } });
if (server) await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const shots = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(120000); // (a loaded machine: the shop's first frames can take a while)
  const errors = [], net = [], failed = []; globalThis.__net = { net, failed, errors };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', async (r) => { const u = new URL(r.url()); let n = 0; try { n = +(r.headers()['content-length'] || 0); } catch {} net.push({ path: decodeURIComponent(u.pathname), status: r.status(), bytes: n }); });
  page.on('requestfailed', (r) => failed.push({ path: r.url(), error: r.failure()?.errorText }));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  await page.goto(`${base || `http://localhost:${server.httpServer.address().port}/`}?speed=${speed}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 180000 });
  const wait = (s) => page.waitForTimeout((s / speed) * 1000);
  const phase = () => page.evaluate(() => window.__engine?.ctx?.api?.story?.phase);
  const until = async (p, maxS = 60) => { for (let i = 0; i < maxS * 4; i++) { if ((await phase()) === p) return true; await page.waitForTimeout(250); } return false; };
  const snap = async (label) => { const f = `${out}-${String(shots.length).padStart(2, '0')}-${label}.png`; await page.screenshot({ path: f }); shots.push(f); console.log('snap', label, await phase(), 'audio', JSON.stringify(await page.evaluate(() => window.__engine?.ctx?.api?.audio?.meter?.()))); };
  // by the story's own clock (phase + seconds into it): screenshots take real time, this does not drift
  const ORDER = ['title', 'arrive', 'wait', 'waking', 'look', 'turn', 'street', 'last', 'fade', 'end'];
  const at = async (p, s, maxS = 150) => {
    for (let i = 0; i < maxS * 20; i++) {
      const st = await page.evaluate(() => { const S = window.__engine?.ctx?.api?.story; return S ? [S.phase, S.t] : null; });
      if (st && (ORDER.indexOf(st[0]) > ORDER.indexOf(p) || (st[0] === p && st[1] >= s))) return st[0] === p;
      await page.waitForTimeout(40);
    }
    return false;
  };
  await page.waitForTimeout(1500); await snap('title');
  await page.mouse.move(W / 2, H / 2); await page.mouse.click(W / 2, H / 2);
  await at('arrive', 2.5); await snap('arrive-2s-far-side');
  await at('arrive', 7); await snap('arrive-7s-the-shop');
  await at('arrive', 11); await snap('arrive-11s-bench');
  await at('arrive', 14.5); await snap('arrive-14s-robot');
  await at('wait', 4); await snap('wait');
  await page.keyboard.down('Space'); await wait(0.9); await snap('attempt1'); await wait(0.8); await page.keyboard.up('Space');
  await wait(2); await snap('after-fail');
  await page.keyboard.down('Space'); await wait(1.2); await snap('opening');
  // act one: the shop
  await at('look', 1.5); await snap('look-0');
  await page.mouse.move(W * 0.2, H * 0.4, { steps: 30 }); await at('look', 7); await snap('shop-left');
  await page.mouse.move(W * 0.55, H * 0.35, { steps: 30 }); await at('look', 13); await snap('shop-ahead');
  await page.mouse.move(W * 0.85, H * 0.45, { steps: 30 }); await at('look', 19); await snap('shop-right');
  await page.mouse.move(W * 0.5, H * 0.5, { steps: 30 });
  await at('look', 24); await snap('bench-radio');
  await at('turn', 0.8); await snap('turn-1s');
  await at('turn', 2.6); await snap('turn-3s');
  // act two: the street -- sweep the far side, left to right as seen from behind it, resting on each shop
  await at('street', 1); await snap('street-0');
  const seen = () => page.evaluate(() => [...(window.__engine?.ctx?.api?.story?.seen || [])].join(','));
  for (const [x, y, label] of [[0.5, 0.15, 'up'], [0.08, 0.5, 'left'], [0.3, 0.52, 'left-centre'], [0.5, 0.5, 'centre'], [0.72, 0.52, 'right-centre'], [0.93, 0.5, 'right']]) {
    await page.mouse.move(W * x, H * y, { steps: 30 }); await wait(3.2);
    if ((await phase()) !== 'street') break;
    await snap(`street-${label}`); console.log('  seen:', await seen());
  }
  await at('last', 2.6); await snap('last-3s-the-shop');
  await at('last', 6.2); await snap('last-6s-whole-street');
  await at('fade', 1.6); await snap('fade-2s-street-out');
  await at('fade', 5.5); await snap('fade-5s-face');
  await page.keyboard.up('Space');
  await at('end', 2.5); await snap('end-2s');
  await at('end', 6); await snap('end-6s');
  await at('end', 9); await snap('end-9s');
  await at('end', 13.5); await snap('end-card');
  const perf = await page.evaluate(() => window.__perf && { frameMs: +window.__perf.frameMs.toFixed(1), calls: window.__perf.calls, tris: window.__perf.triangles });
  console.log('phase now:', await phase(), 'perf', JSON.stringify(perf));
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
  globalThis.__done = true;
} finally {
  const netlog = opt('netlog', null); // (also after a failure: what was loaded up to there)
  if (netlog && globalThis.__net) { const { net, failed, errors } = globalThis.__net; writeFileSync(netlog, JSON.stringify({ complete: !!globalThis.__done, net, failed, errors: [...new Set(errors)] }, null, 1)); console.log('netlog', netlog, net.length, 'responses,', failed.length, 'failed,', net.filter((x) => x.status >= 400).length, '>= 400'); }
  await browser.close(); await server?.close();
}
// contact sheet
try { execFileSync(path.join(root, 'tools/sheet.sh'), [`${out}-sheet.jpg`, '4', '480', ...shots], { stdio: 'inherit' }); console.log('sheet', `${out}-sheet.jpg`); } catch (e) { console.log('sheet failed', e.message); }
