// What a viewer sees when opening the experience: time to the title (loading done), then the frame times through the
// opening after the click, with every long frame and what was streaming at the time. Playwright's Chromium only.
//   node tools/perf-open.mjs [--url http://127.0.0.1:5181/] [--size 1512x890] [--dpr 2] [--query "lodmin=1"] [--seconds 45]
//   --size/--dpr: the browser window in CSS pixels and the screen density (default: a maximised Chrome on a 14" MacBook Pro)
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('url', 'http://127.0.0.1:5181/');
const [W, H] = opt('size', '1512x890').split('x').map(Number);
const dpr = +opt('dpr', '2');
const query = opt('query', '');
const seconds = +opt('seconds', '45');
const profOut = opt('profile', null); // a CPU profile from the click on (.cpuprofile, opens in Chrome DevTools); prints the top functions

const uncap = args.includes('--uncap'); // no vsync, no frame cap: the frame's real cost (headless otherwise paces at 30 fps)
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', ...(uncap ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] });
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const t0 = Date.now(); const sec = () => +((Date.now() - t0) / 1000).toFixed(2);
  const logs = [], loads = [], errors = [];
  page.on('console', (m) => { const t = m.text(); if (/^\[engine\]/.test(t)) logs.push(`${sec()}s ${t}`); if (m.type() === 'error') errors.push(t.slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('response', (r) => { const p = decodeURIComponent(new URL(r.url()).pathname); const m = p.match(/lod\/([^/]+)\/(L\d)\.glb$/); if (m) loads.push({ t: sec(), name: m[1], level: m[2] }); });
  // every GPU pipeline and shader module the page creates: when, and how big (the cost lands in the GPU process)
  await page.addInitScript(() => {
    const L = (window.__gpu = { pipes: [], mods: [] });
    const wrap = () => {
      if (!window.GPUDevice || GPUDevice.prototype.__w) return; GPUDevice.prototype.__w = true;
      const cm = GPUDevice.prototype.createShaderModule; GPUDevice.prototype.createShaderModule = function (d) { L.mods.push([performance.now(), d.code.length, d.code]); return cm.call(this, d); };
      for (const k of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) {
        const f = GPUDevice.prototype[k]; GPUDevice.prototype[k] = function (d) { L.pipes.push([performance.now(), k, d.label || '', d.fragment?.targets?.length ?? -1, d.depthStencil?.format || '']); return f.call(this, d); };
      }
    };
    wrap();
  });
  await page.goto(`${base}${query ? '?' + query : ''}`);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 300000, polling: 100 });
  const tDone = sec();
  const info = await page.evaluate(() => { const e = window.__engine; const s = e.renderer.getDrawingBufferSize(new e.camera.position.constructor()); return { pixelRatio: e.pixelRatio, buffer: `${s.x}x${s.y}` }; });
  // frame log, from before the click: [time since click (s), frame ms, phase, story t, LOD loads in flight, pixel ratio]
  await page.evaluate(() => {
    window.__ft = []; let last = performance.now();
    const f = (now) => { const e = window.__engine, S = e?.ctx?.api?.story; window.__ft.push([now, now - last, S?.phase, S?.t, e?.ctx?.api?.shop?.lod?.loading ?? 0, e?.pixelRatio, window.__perf?.submitMs, window.__perf?.gpuMs]); last = now; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.waitForTimeout(2000);
  let cdp = null;
  if (profOut) { cdp = await ctx.newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const tClick = sec(); const clickPerf = await page.evaluate(() => performance.now());
  await page.mouse.click(W / 2, H / 2);
  // the opening: the arrival, then hold the eye open (space) the way a viewer does when told to
  const phaseNow = () => page.evaluate(() => window.__engine?.ctx?.api?.story?.phase);
  const end = Date.now() + seconds * 1000; let held = false;
  while (Date.now() < end) {
    const p = await phaseNow();
    if (!held && p === 'wait') { await page.waitForTimeout(1500); await page.keyboard.down('Space'); held = true; await page.waitForTimeout(1700); await page.keyboard.up('Space'); await page.waitForTimeout(1500); await page.keyboard.down('Space'); }
    if (held && Math.random() < 0.1) await page.mouse.move(W * (0.15 + 0.7 * Math.random()), H * (0.3 + 0.4 * Math.random()), { steps: 20 }); // looking around
    if (p === 'end') break;
    await page.waitForTimeout(200);
  }
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop'); writeFileSync(profOut, JSON.stringify(profile));
    // self time by function, and inclusive time of the functions that matter for stalls
    const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); const dts = profile.timeDeltas;
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const key = (n) => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}`;
    const incl = new Map();
    profile.samples.forEach((id, i) => {
      const dt = (dts[i + 1] ?? dts[i]) / 1000; const n = byId.get(id); self.set(key(n), (self.get(key(n)) || 0) + dt);
      const seen = new Set(); for (let x = id; x != null; x = parent.get(x)) { const k = key(byId.get(x)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } }
    });
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${(v / 1000).toFixed(2).padStart(7)}s  ${k}`).join('\n');
    console.log('CPU self time, top:\n' + top(self, 25));
    console.log('CPU inclusive time, top (excluding the program root):\n' + top(new Map([...incl].filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k))), 40));
  }
  const gpu = await page.evaluate((c) => { const L = window.__gpu; const uniq = new Set(L.mods.map((m) => m[2]));
    const before = (a) => a.filter((x) => x[0] < c).length; const kinds = {}; for (const p of L.pipes) kinds[p[1]] = (kinds[p[1]] || 0) + 1;
    const sizes = L.mods.map((m) => m[1]).sort((a, b) => a - b);
    return { pipes: L.pipes.length, pipesBeforeClick: before(L.pipes), kinds, mods: L.mods.length, modsBeforeClick: before(L.mods), uniqueMods: uniq.size,
      modKB: { median: Math.round(sizes[sizes.length >> 1] / 1024), max: Math.round(sizes[sizes.length - 1] / 1024), totalUnique: Math.round([...uniq].reduce((s, x) => s + x.length, 0) / 1024) },
      afterClickBySecond: L.pipes.filter((p) => p[0] >= c).reduce((o, p) => { const k = Math.floor((p[0] - c) / 1000); o[k] = (o[k] || 0) + 1; return o; }, {}) };
  }, clickPerf);
  console.log('GPU pipelines/modules:', JSON.stringify(gpu));
  const who = await page.evaluate((c) => { const o = {}; for (const p of window.__gpu.pipes) if (p[0] >= c) { const k = `${p[2].replace(/[0-9a-f]{8,}/g, '#')} [targets ${p[3]}${p[4] ? ', ' + p[4] : ''}]`; o[k] = (o[k] || 0) + 1; } return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25); }, clickPerf);
  console.log('pipelines after the click, by label:\n' + who.map(([k, n]) => `  ${String(n).padStart(3)}  ${k}`).join('\n'));
  const dump = opt('dump', null); // the WGSL of every shader module, for finding why they differ
  if (dump) writeFileSync(dump, JSON.stringify(await page.evaluate((c) => window.__gpu.mods.map((m) => ({ t: (m[0] - c) / 1000, code: m[2] })), clickPerf)));
  const ft = (await page.evaluate(() => window.__ft)).map(([now, dt, ph, st, ld, pr, sub, gpu]) => ({ t: (now - clickPerf) / 1000, dt, ph, st, ld, pr, sub, gpu }));
  // summary
  const pre = ft.filter((f) => f.t < 0), post = ft.filter((f) => f.t >= 0);
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  const sum = (a) => { const d = a.map((f) => f.dt); return { frames: d.length, fps: d.length ? +(d.length / (d.reduce((x, y) => x + y, 0) / 1000)).toFixed(1) : 0, p50: +q(d, 0.5).toFixed(1), p95: +q(d, 0.95).toFixed(1), max: +Math.max(0, ...d).toFixed(0), over50: d.filter((x) => x > 50).length, over100: d.filter((x) => x > 100).length, submit: +q(a.map((f) => f.sub || 0), 0.5).toFixed(1), gpu: +q(a.map((f) => f.gpu || 0), 0.5).toFixed(1), lostS: +(d.filter((x) => x > 34).reduce((x, y) => x + y, 0) / 1000).toFixed(2) }; };
  console.log(`window ${W}x${H} @${dpr}x  query "${query}"  internal ${info.buffer} (pixel ratio ${info.pixelRatio})`);
  console.log(`loading done at ${tDone}s, click at ${tClick}s`);
  console.log('title screen (before the click):', JSON.stringify(sum(pre)));
  const phases = [...new Set(post.map((f) => f.ph))];
  for (const ph of phases) console.log(`${String(ph).padEnd(7)}`, JSON.stringify(sum(post.filter((f) => f.ph === ph))));
  console.log('all after click:', JSON.stringify(sum(post)));
  const long = post.filter((f) => f.dt > 100);
  console.log(`frames over 100 ms (${long.length}):`, long.slice(0, 40).map((f) => `${f.t.toFixed(1)}s ${f.ph}${f.st != null ? '@' + f.st.toFixed(1) : ''} ${f.dt.toFixed(0)}ms${f.ld ? ' (loading ' + f.ld + ')' : ''}`).join(' | '));
  const pr = [...new Set(post.map((f) => f.pr))]; if (pr.length > 1) console.log('pixel ratio stepped:', pr.join(' -> '));
  console.log('LOD files after the title:', loads.filter((l) => l.t >= tDone).map((l) => `${(l.t - tClick).toFixed(1)}s ${l.name}/${l.level}`).join(', '));
  console.log('LOD files before the title:', loads.filter((l) => l.t < tDone).length);
  console.log(logs.join('\n'));
  if (errors.length) console.log('ERRORS:', [...new Set(errors)].slice(0, 8).join('\n'));
} finally { await browser.close(); }
