// Record the shop story's sound through a whole scripted run (real time) -> docs/audio-preview-shop.mp3
//   node tools/audio-capture.mjs [--url http://127.0.0.1:5173/] [--out docs/audio-preview-shop.mp3]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://127.0.0.1:5173/'), out = opt('out', 'docs/audio-preview-shop.mp3');
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url);
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 180000 });
const phase = () => page.evaluate(() => window.__engine?.ctx?.api?.story?.phase);
const until = async (p, maxS) => { for (let i = 0; i < maxS * 4; i++) { if ((await phase()) === p) return; await page.waitForTimeout(250); } };
await page.mouse.click(640, 360);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__engine.ctx.api.audio.startRecording());
const t0 = Date.now(), log = (m) => console.log(((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's', m);
log('arrive'); await until('wait', 60); log('wait');
await page.waitForTimeout(4000); await page.keyboard.down('Space'); await page.waitForTimeout(1800); await page.keyboard.up('Space'); log('failed try');
await page.waitForTimeout(2500); await page.keyboard.down('Space'); await until('look', 20); log('look');
for (const [x, y] of [[640, 360], [200, 330], [380, 160], [800, 380], [1150, 330], [700, 360]]) { await page.mouse.move(x, y, { steps: 40 }); await page.waitForTimeout(4500); }
await page.keyboard.press('KeyD'); await until('door', 10); log('door');
await until('fade', 60); log('fade'); await page.keyboard.up('Space');
await until('end', 20); log('end'); await page.waitForTimeout(20000); log('stop');
const b64 = await page.evaluate(() => window.__engine.ctx.api.audio.stopRecording());
writeFileSync('/tmp/shop-audio.webm', Buffer.from(b64, 'base64'));
await browser.close();
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', '/tmp/shop-audio.webm', '-ac', '2', '-b:a', '128k', out]);
console.log('wrote', out, execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim(), 's');
