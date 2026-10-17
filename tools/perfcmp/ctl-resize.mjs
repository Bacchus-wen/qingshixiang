// Controlled test: does a pixel-ratio change alone (what Engine.adaptResolution does) rebuild pipelines and freeze?
//   node ctl-resize.mjs  -> /tmp/perfcmp/H-resize.json
import { chromium } from '/Users/wenbin/Games/新游戏/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const hook = readFileSync('/tmp/perfcmp/hook.js', 'utf8');
const log = (...m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ctl-resize ` + m.join(' '); console.log(s); appendFileSync('/tmp/perfcmp/measure.log', s + '\n'); };
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-precise-memory-info'] });
const out = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const shot of ['street-eye', 'flood']) {
    const page = await ctx.newPage();
    await page.addInitScript({ content: hook });
    await page.addInitScript({ content: `(() => { const F = window.__frames = []; const loop = (t) => { F.push(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); })();` });
    await page.goto(`http://127.0.0.1:5173/?shot=${shot}&frames=180`, { timeout: 180000 });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000, polling: 250 });
    await page.evaluate(() => window.__engine.start());
    await page.waitForTimeout(3000);
    const phase = async (label, action, seconds) => {
      const t0 = await page.evaluate((a) => { const PM = window.__pm; window.__p0 = PM.pipes.length; window.__b0 = PM.bindGroups; window.__x0 = PM.tex.size; const t = performance.now();
        if (a) (0, eval)(a); return t; }, action);
      await page.waitForTimeout(seconds * 1000);
      const r = await page.evaluate((t0) => {
        const PM = window.__pm, F = window.__frames.filter((t) => t >= t0);
        const d = []; for (let i = 1; i < F.length; i++) d.push(F[i] - F[i - 1]);
        const s = [...d].sort((a, b) => a - b);
        const gapToNow = performance.now() - (F[F.length - 1] ?? t0);
        return { frames: F.length, p50: +(s[Math.floor(s.length * 0.5)] ?? 0).toFixed(1), max: +(s[s.length - 1] ?? 0).toFixed(1), over250: d.filter((x) => x > 250).length,
          openGapMs: Math.round(gapToNow), pipelines: PM.pipes.length - window.__p0, bindGroups: PM.bindGroups - window.__b0, pixelRatio: window.__pmRenderer.getPixelRatio(),
          gpuMB: +((PM.texBytes + PM.bufBytes) / 1048576).toFixed(1) };
      }, t0);
      log(shot, label, JSON.stringify(r));
      out.push({ shot, label, ...r });
      writeFileSync('/tmp/perfcmp/H-resize.json', JSON.stringify(out, null, 1));
    };
    await phase('steady (no change)', null, 8);
    await phase('setPixelRatio(0.85)', 'window.__pmRenderer.setPixelRatio(0.85)', 15);
    await phase('steady after', null, 6);
    await phase('setPixelRatio(0.7)', 'window.__pmRenderer.setPixelRatio(0.7)', 15);
    await phase('steady after 2', null, 6);
    await page.close();
  }
} finally { await browser.close(); }
