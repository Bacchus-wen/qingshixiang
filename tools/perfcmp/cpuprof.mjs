// CPU profile (CDP sampling profiler) of a page that is already rendering continuously.
//   node cpuprof.mjs name=url [name=url ...]   -> /tmp/perfcmp/F-cpu.json + printed summary
import { chromium } from '/Users/wenbin/Games/新游戏/node_modules/playwright/index.mjs';
import { writeFileSync, appendFileSync } from 'node:fs';
const targets = process.argv.slice(2).map((a) => { const i = a.indexOf('='); return { name: a.slice(0, i), url: a.slice(i + 1) }; });
const log = (...m) => { const s = `[${new Date().toISOString().slice(11, 19)}] cpuprof ` + m.join(' '); console.log(s); appendFileSync('/tmp/perfcmp/measure.log', s + '\n'); };
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const out = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const tg of targets) {
    const page = await ctx.newPage();
    await page.goto(tg.url, { timeout: 180000 });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000, polling: 250 });
    await page.evaluate(() => { const e = window.__engine; if (e?.params && e.shot) e.start(); });
    await page.waitForTimeout(3000);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    const f0 = await page.evaluate(() => window.__engine?.frame ?? 0);
    await cdp.send('Profiler.start');
    await page.waitForTimeout(4000);
    const { profile } = await cdp.send('Profiler.stop');
    const f1 = await page.evaluate(() => window.__engine?.frame ?? 0);
    const frames = Math.max(1, f1 - f0);
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const self = new Map(), byFile = new Map(), bySystem = new Map();
    let total = 0, idle = 0;
    const sysOf = (url) => {
      const m = /\/src\/(systems\/[^/]+|engine|materials|story|ui)\//.exec(url || '');
      if (m) return m[1];
      if (/three\.webgpu|three\/build|three\/src|three\.module|chunk-|deps\/three/.test(url || '')) return 'three.js';
      if (/three\/examples|addons/.test(url || '')) return 'three/addons';
      if (/rapier/.test(url || '')) return 'rapier';
      return url ? url.split('/').slice(-1)[0].split('?')[0] : '(native)';
    };
    profile.samples.forEach((id, i) => {
      const dt = profile.timeDeltas[i] || 0; total += dt;
      const n = byId.get(id); const f = n.callFrame;
      if (f.functionName === '(idle)' || f.functionName === '(program)' && false) { idle += dt; return; }
      if (f.functionName === '(idle)') { idle += dt; return; }
      const key = `${f.functionName || '(anon)'}  ${(f.url || '').split('/').slice(-2).join('/').split('?')[0]}:${f.lineNumber + 1}`;
      self.set(key, (self.get(key) || 0) + dt);
      const sys = sysOf(f.url) === '(native)' || f.url === '' ? (() => { // attribute native/GC to the nearest JS caller system
        let p = parent.get(id); while (p) { const pn = byId.get(p); if (pn.callFrame.url) return sysOf(pn.callFrame.url) + ' (native)'; p = parent.get(p); } return f.functionName || '(native)';
      })() : sysOf(f.url);
      bySystem.set(sys, (bySystem.get(sys) || 0) + dt);
    });
    const busy = total - idle;
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ fn: k, msPerFrame: +(v / 1000 / frames).toFixed(2), pct: +(v / busy * 100).toFixed(1) }));
    const systems = [...bySystem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ sys: k, msPerFrame: +(v / 1000 / frames).toFixed(2), pct: +(v / busy * 100).toFixed(1) }));
    const rec = { name: tg.name, frames, seconds: +(total / 1e6).toFixed(2), busyMsPerFrame: +(busy / 1000 / frames).toFixed(2), idlePct: +(idle / total * 100).toFixed(1), top, systems };
    log(tg.name, `frames ${frames}, main-thread busy ${rec.busyMsPerFrame} ms/frame, idle ${rec.idlePct}%`);
    for (const s of systems.slice(0, 12)) log('   ', String(s.msPerFrame).padStart(6), 'ms', String(s.pct).padStart(5) + '%', s.sys);
    for (const t of top.slice(0, 12)) log('      ', String(t.msPerFrame).padStart(6), 'ms', t.fn);
    out.push(rec);
    writeFileSync('/tmp/perfcmp/F-cpu.json', JSON.stringify(out, null, 1));
    await page.close();
  }
} finally { await browser.close(); }
