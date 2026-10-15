// Scripted playthrough: drives the real experience (no ?shot) with keyboard/mouse and screenshots key moments.
//   node tools/play.mjs [--speed 4] [--query "power=0.2"] [--out renders/play]
// Uses Playwright's own Chromium (never the user's Chrome). Writes <out>-NN-<label>.png and a contact sheet.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const speed = parseFloat(opt('speed', '4'));
const query = opt('query', '');
const out = path.join(root, opt('out', 'renders/play'));
mkdirSync(path.dirname(out), { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
  await page.goto(`http://localhost:${server.httpServer.address().port}/?speed=${speed}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 120000 });
  const wait = (s) => page.waitForTimeout((s / speed) * 1000);
  const snap = async (label) => { const f = `${out}-${String(shots.length).padStart(2, '0')}-${label}.png`; await page.screenshot({ path: f }); shots.push(f); };
  const phase = () => page.evaluate(() => window.__engine?.ctx?.api?.director?.phase);
  await page.mouse.move(640, 360);
  await wait(3); await snap('arrive-start');
  await wait(18); await snap('arrive-mid');
  await wait(22); await snap(`after-arrive-${await phase()}`);
  // first attempt: fails
  await page.keyboard.down('Space'); await wait(1.2); await snap('attempt1'); await page.keyboard.up('Space');
  await wait(1.5);
  // second attempt: holds open
  await page.keyboard.down('Space');
  await wait(1.5); await snap(`opening-${await phase()}`);
  await wait(3); await snap(`opened-${await phase()}`);
  await wait(3); await snap('look-center');
  await page.mouse.move(1100, 300, { steps: 20 }); await wait(4); await snap('look-right');
  await page.mouse.move(250, 260, { steps: 20 }); await wait(5); await snap('look-left-up');
  await page.mouse.move(700, 420, { steps: 20 }); await wait(4); await snap(`look-${await phase()}`);
  console.log('phase now:', await phase());
  if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 10).join('\n'));
} finally {
  await browser.close(); await server.close();
}
execSync(`ffmpeg -v error -y ${shots.map((f) => `-i "${f}"`).join(' ')} -filter_complex "${shots.map((_, i) => `[${i}]scale=480:-1[s${i}]`).join(';')};${shots.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${shots.length}:layout=${shots.map((_, i) => `${(i % 4) * 480}_${Math.floor(i / 4) * 270}`).join('|')}" "${out}-sheet.jpg"`);
console.log('sheet:', `${out}-sheet.jpg`);
