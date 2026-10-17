// Hitch test in the REAL experience (not shot mode): frame-interval time series + pipeline creation + allocations.
//   node realplay.mjs ours|cc [--speed 2] [--out file.json]
import { chromium } from '/Users/wenbin/Games/新游戏/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const which = args[0];
const speed = Number(opt('speed', '2'));
const out = opt('out', `/tmp/perfcmp/E-${which}.json`);
const uncap = args.includes('--uncap');
const hook = readFileSync('/tmp/perfcmp/hook.js', 'utf8');
const log = (...m) => { const s = `[${new Date().toISOString().slice(11, 19)}] realplay ${which}: ` + m.join(' '); console.log(s); appendFileSync('/tmp/perfcmp/measure.log', s + '\n'); };
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-precise-memory-info', ...(uncap ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] });
const res = { which, speed, runs: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (let run = 1; run <= 2; run++) {
    const page = await ctx.newPage();
    await page.addInitScript({ content: hook });
    // frame recorder installed before page scripts: every rAF timestamp, plus marks
    await page.addInitScript({ content: `(() => { const F = window.__frames = []; const M = window.__marks = []; window.__mark = (s) => M.push([performance.now(), s]);
      const loop = (t) => { F.push(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); })();` });
    const url = which === 'ours' ? `http://127.0.0.1:5173/?phase=wait&speed=${speed}` : 'http://127.0.0.1:5190/';
    const t0 = Date.now();
    await page.goto(url, { timeout: 180000 });
    await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 400000, polling: 250 });
    const loadS = (Date.now() - t0) / 1000;
    const mark = (s) => page.evaluate((x) => window.__mark(x), s);
    const tStart = await page.evaluate(() => performance.now());
    await mark('ready');
    const W = (s) => page.waitForTimeout(s * 1000);
    if (which === 'ours') {
      const ws = (s) => W(s / speed);
      await page.mouse.move(960, 540);
      await ws(6); await mark('attempt1');
      await page.keyboard.down('Space'); await ws(1.2); await page.keyboard.up('Space');
      await ws(1.5); await mark('attempt2-hold');
      await page.keyboard.down('Space');
      await ws(5); await mark('look-right');
      await page.mouse.move(1650, 450, { steps: 25 }); await ws(4); await mark('look-left-up');
      await page.mouse.move(380, 380, { steps: 25 }); await ws(5); await mark('look-down');
      await page.mouse.move(1050, 640, { steps: 25 }); await ws(4); await mark('rest-door');
      await page.mouse.move(960, 540, { steps: 25 });
      await ws(30); await mark('late');
      await ws(25); await mark('end');
    } else {
      await page.keyboard.press('Enter'); await mark('start'); await W(4); await mark('walk');
      await page.keyboard.down('KeyW'); await W(14); await page.keyboard.up('KeyW');
      await mark('turn'); await page.keyboard.down('KeyD'); await W(4); await page.keyboard.up('KeyD');
      await mark('walk2'); await page.keyboard.down('KeyW'); await W(10); await page.keyboard.up('KeyW');
      await mark('end');
    }
    const data = await page.evaluate((tS) => {
      const PM = window.__pm, r = window.__pmRenderer, F = window.__frames.filter((t) => t >= tS);
      const d = []; for (let i = 1; i < F.length; i++) d.push([F[i] - tS, F[i] - F[i - 1]]);
      const pipes = PM.pipes.filter((p) => p.t >= tS).map((p) => [Math.round(p.t - tS), p.kind.replace('create', '').replace('Pipeline', ''), p.ms == null ? null : +p.ms.toFixed(1)]);
      const allocs = [...PM.tex.values()].filter((x) => x.t >= tS).map((x) => [Math.round(x.t - tS), x.w + 'x' + x.h, x.format, +(x.bytes / 1048576).toFixed(1), x.label]);
      return { frames: d, pipes, allocs, marks: window.__marks.map(([t, s]) => [Math.round(t - tS), s]), pixelRatio: r.getPixelRatio(), gpuMB: +((PM.texBytes + PM.bufBytes) / 1048576).toFixed(1), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) };
    }, tStart);
    const ds = data.frames.map((x) => x[1]).sort((a, b) => a - b), q = (p) => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))];
    const hitches = data.frames.filter((x) => x[1] > 50).map((x) => [Math.round(x[0]), Math.round(x[1])]);
    const summary = { run, loadS, frames: ds.length, durS: +(data.frames.at(-1)?.[0] / 1000).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +ds.at(-1).toFixed(1),
      over34: ds.filter((x) => x > 34).length, over50: hitches.length, over100: ds.filter((x) => x > 100).length, over250: ds.filter((x) => x > 250).length,
      pipelinesDuring: data.pipes.length, texAllocsDuring: data.allocs.length, pixelRatioEnd: data.pixelRatio, gpuMB: data.gpuMB, heapMB: data.heapMB };
    log(`run${run}`, JSON.stringify(summary));
    res.runs.push({ summary, hitches: hitches.slice(0, 80), pipes: data.pipes.slice(0, 200), allocs: data.allocs.slice(0, 120), marks: data.marks, series: data.frames.filter((_, i) => i % 3 === 0).map((x) => [Math.round(x[0]), +x[1].toFixed(1)]) });
    writeFileSync(out, JSON.stringify(res));
    await page.screenshot({ path: `/tmp/perfcmp/real-${which}-r${run}.png` });
    await page.close();
    await new Promise((r) => setTimeout(r, 2000));
  }
} finally { writeFileSync(out, JSON.stringify(res)); await browser.close(); }
