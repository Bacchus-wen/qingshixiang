// Measurement driver (scratch, /tmp only). Playwright's own Chromium, never the user's Chrome.
//   node measure.mjs [--uncap] [--runs 2] [--seconds 5] [--warm 3] [--out file.json] name=url [name=url ...]
// URL readiness: pages with window.__shotReady (+ optional "&resume" handled for our engine which freezes the loop).
import { chromium } from '/Users/wenbin/Games/新游戏/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const flag = (k) => { const i = args.indexOf(`--${k}`); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const uncap = flag('uncap');
const runs = Number(opt('runs', '2'));
const seconds = Number(opt('seconds', '5'));
const warm = Number(opt('warm', '3'));
const out = opt('out', '/tmp/perfcmp/results.json');
const noFootprint = flag('nofootprint');
const timestamps = flag('timestamps');
const targets = args.map((a) => { const i = a.indexOf('='); const [name, n, vp] = a.slice(0, i).split('@'); return { name, url: a.slice(i + 1), runs: n ? Number(n) : null, vp: vp ? vp.split('x').map(Number) : null }; });

const hook = readFileSync('/tmp/perfcmp/hook.js', 'utf8');
const pageFns = readFileSync('/tmp/perfcmp/page-measure.js', 'utf8');
const log = (...m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ` + m.join(' '); console.log(s); appendFileSync('/tmp/perfcmp/measure.log', s + '\n'); };

const launchArgs = ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-precise-memory-info', ...(uncap ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])];
log('launch', JSON.stringify(launchArgs));
const browser = await chromium.launch({ channel: 'chromium', args: launchArgs });
const bcdp = await browser.newBrowserCDPSession();

function footprint(pid) {
  try {
    const txt = execFileSync('/usr/bin/footprint', ['-p', String(pid)], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    const head = /Footprint:\s*([\d.]+)\s*(KB|MB|GB|B)/.exec(txt);
    const unit = { B: 1 / 1048576, KB: 1 / 1024, MB: 1, GB: 1024 };
    const total = head ? +(parseFloat(head[1]) * unit[head[2]]).toFixed(1) : null;
    const cats = [];
    for (const line of txt.split('\n')) {
      const m = /^\s*([\d.]+)\s*(B|KB|MB|GB)\s+([\d.]+)\s*(B|KB|MB|GB)\s+([\d.]+)\s*(B|KB|MB|GB)\s+(\d+)\s+(.+)$/.exec(line);
      if (m && m[8].trim() !== 'TOTAL') cats.push({ cat: m[8].trim(), dirtyMB: +(parseFloat(m[1]) * unit[m[2]]).toFixed(1) });
    }
    cats.sort((a, b) => b.dirtyMB - a.dirtyMB);
    return { footprintMB: total, top: cats.slice(0, 6) };
  } catch (e) { return { error: e.message.split('\n')[0] }; }
}
async function procMem() {
  if (noFootprint) return null;
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
  const res = {};
  for (const p of processInfo) {
    if (p.type !== 'GPU' && p.type !== 'renderer' && p.type !== 'gpu-process' && p.type !== 'browser') continue;
    const f = footprint(p.id);
    (res[p.type] ||= []).push({ pid: p.id, ...f });
  }
  return res;
}

const results = [];
// one context for every run: run 2 of a URL reuses the browser's GPU pipeline/shader caches (warm), like a reload
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
try {
  // baseline: empty page
  {
    const page = await ctx.newPage();
    await page.goto('about:blank');
    await page.waitForTimeout(1500);
    const pm = await procMem();
    log('baseline', JSON.stringify(pm));
    results.push({ name: 'baseline-blank', proc: pm });
    await page.close();
  }
  for (const tg of targets) {
    for (let run = 1; run <= (tg.runs ?? runs); run++) {
      const page = await ctx.newPage();
      const consoleErr = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => consoleErr.push('pageerror ' + e.message.slice(0, 200)));
      const net = { reqs: 0, bytes: 0, byType: {} };
      const pending = [];
      page.on('requestfinished', (req) => {
        pending.push((async () => {
          try {
            const s = await req.sizes();
            const u = new URL(req.url());
            const ext = (u.pathname.match(/\.([a-z0-9]+)$/i)?.[1] || req.resourceType()).toLowerCase();
            const b = (s.responseBodySize || 0) + (s.responseHeadersSize || 0);
            net.reqs++; net.bytes += b;
            const k = ['js', 'mjs', 'ts'].includes(ext) || req.resourceType() === 'script' ? 'js' : ext;
            const e = net.byType[k] || (net.byType[k] = { n: 0, bytes: 0 }); e.n++; e.bytes += b;
          } catch {}
        })());
      });
      if (timestamps) await page.addInitScript({ content: 'window.__pmTimestamps = true;' });
      await page.addInitScript({ content: hook });
      if (tg.vp) await page.setViewportSize({ width: tg.vp[0], height: tg.vp[1] });
      const t0 = Date.now();
      const rec = { name: tg.name, url: tg.url, run, uncap, vp: tg.vp || [1920, 1080] };
      try {
        await page.goto(tg.url, { timeout: 180000 });
        await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000, polling: 250 });
        rec.loadToReadyS = +((Date.now() - t0) / 1000).toFixed(1);
        await page.addScriptTag({ content: pageFns });
        // our engine freezes its loop at the shot frame: resume continuous rendering (frame counter is already past it)
        const resumed = await page.evaluate(() => { const e = window.__engine; if (e && e.params && e.shot && typeof e.start === 'function') { e.start(); return true; } return false; });
        rec.resumed = resumed;
        await page.waitForTimeout(warm * 1000);
        rec.m = await page.evaluate((s) => window.__pmMeasure(s), seconds);
        rec.snap = await page.evaluate(() => window.__pmSnapshot());
        rec.adapter = await page.evaluate(async () => { try { const a = await navigator.gpu.requestAdapter(); return a?.info ? { vendor: a.info.vendor, architecture: a.info.architecture, description: a.info.description } : null; } catch { return null; } });
        rec.proc = await procMem();
        await page.screenshot({ path: `/tmp/perfcmp/shot-${tg.name}-r${run}${uncap ? '-uncap' : ''}.png` });
        await Promise.allSettled(pending);
        rec.net = { reqs: net.reqs, MB: +(net.bytes / 1048576).toFixed(2), byType: Object.fromEntries(Object.entries(net.byType).map(([k, v]) => [k, { n: v.n, MB: +(v.bytes / 1048576).toFixed(2) }])) };
        const m = rec.m, sn = rec.snap;
        log(`${tg.name} run${run}${uncap ? ' uncap' : ''}: ready ${rec.loadToReadyS}s, fps ${m.fps}, raf p50 ${m.rafDelta?.p50} p95 ${m.rafDelta?.p95} max ${m.rafDelta?.max}, >34ms ${m.over34}, cpu ${m.cpuMs?.mean} (p95 ${m.cpuMs?.p95}), gpuBusy ${m.gpuBusyMs?.mean} (p95 ${m.gpuBusyMs?.p95}, n ${m.gpuFrames}), draws ${m.drawCalls?.p50}, tris ${m.triangles?.p50}, gpuMem ${sn.gpuTotalMB}MB (tex ${sn.gpuTexMB}, buf ${sn.gpuBufMB}), heap ${sn.heapMB?.used}MB, pipesDuring ${m.pipelinesCreatedDuring}, net ${rec.net.MB}MB`);
      } catch (e) {
        rec.error = e.message.split('\n')[0];
        log(`${tg.name} run${run} ERROR ${rec.error}`);
        try { await page.screenshot({ path: `/tmp/perfcmp/shot-${tg.name}-r${run}-error.png` }); } catch {}
      }
      rec.consoleErr = consoleErr.slice(0, 12);
      results.push(rec);
      writeFileSync(out, JSON.stringify(results, null, 1));
      await page.close();
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
} finally {
  writeFileSync(out, JSON.stringify(results, null, 1));
  await browser.close();
  log('done ->', out);
}
