// Measurement hook, injected with page.addInitScript before any page script runs.
// 1) wraps GPUDevice.createTexture / createBuffer / pipeline creation to account every WebGPU allocation;
// 2) traps the WebGPURenderer constructor (assignment of isWebGPURenderer) to get the renderer instance early:
//    enables timestamp queries, wraps info.createTexture/createAttribute (keeps refs for classification),
//    wraps the animation-loop callback (CPU ms) and the inspector begin/finish hooks (per-pass labels, draws).
(() => {
  if (window.__pm) return;
  const PM = window.__pm = {
    tex: new Map(), buf: new Map(), texBytes: 0, bufBytes: 0, texPeak: 0, bufPeak: 0,
    pipes: [], shaderModules: 0, bindGroups: 0,
    renderers: [], threeTex: new Set(), threeAttr: new Set(),
    cpu: [], passAgg: null, frameStats: null, errors: [], tsBatches: [], tsPools: new Set(), uidLabel: new Map(),
  };
  const now = () => performance.now();
  // bytes per texel (uncompressed) or per block (compressed) for WebGPU formats
  const FB = {
    r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1, stencil8: 1,
    r16uint: 2, r16sint: 2, r16float: 2, r16unorm: 2, rg8unorm: 2, rg8snorm: 2, rg8uint: 2, rg8sint: 2, depth16unorm: 2,
    r32uint: 4, r32sint: 4, r32float: 4, rg16uint: 4, rg16sint: 4, rg16float: 4, rgba8unorm: 4, 'rgba8unorm-srgb': 4,
    rgba8snorm: 4, rgba8uint: 4, rgba8sint: 4, bgra8unorm: 4, 'bgra8unorm-srgb': 4, rgb9e5ufloat: 4, rgb10a2uint: 4,
    rgb10a2unorm: 4, rg11b10ufloat: 4, depth24plus: 4, 'depth24plus-stencil8': 4, depth32float: 4, 'depth32float-stencil8': 5,
    rg32uint: 8, rg32sint: 8, rg32float: 8, rgba16uint: 8, rgba16sint: 8, rgba16float: 8,
    rgba32uint: 16, rgba32sint: 16, rgba32float: 16,
  };
  function blockInfo(f) {
    if (/^bc[14]-/.test(f)) return [4, 4, 8];
    if (/^bc[23567]/.test(f)) return [4, 4, 16];
    if (/^etc2-rgb8|^etc2-rgb8a1|^eac-r11/.test(f)) return [4, 4, 8];
    if (/^etc2-rgba8|^eac-rg11/.test(f)) return [4, 4, 16];
    const m = /^astc-(\d+)x(\d+)/.exec(f); if (m) return [+m[1], +m[2], 16];
    return [1, 1, FB[f] ?? 4];
  }
  function texBytes(d) {
    const s = d.size; let w, h, z;
    if (Array.isArray(s) || (s && typeof s[Symbol.iterator] === 'function' && !('width' in s))) { const a = [...s]; w = a[0]; h = a[1] ?? 1; z = a[2] ?? 1; }
    else { w = s.width; h = s.height ?? 1; z = s.depthOrArrayLayers ?? 1; }
    const mips = d.mipLevelCount ?? 1, samples = d.sampleCount ?? 1, dim = d.dimension ?? '2d';
    const [bw, bh, bb] = blockInfo(d.format);
    let total = 0;
    for (let i = 0; i < mips; i++) {
      const mw = Math.max(1, w >> i), mh = Math.max(1, h >> i), mz = dim === '3d' ? Math.max(1, z >> i) : z;
      total += Math.ceil(mw / bw) * Math.ceil(mh / bh) * mz * bb;
    }
    return { bytes: total * samples, w, h, z, mips, samples, dim };
  }
  if (typeof GPUDevice !== 'undefined') {
    const P = GPUDevice.prototype;
    const oCT = P.createTexture;
    P.createTexture = function (d) {
      const t = oCT.call(this, d);
      try {
        const r = texBytes(d);
        const rec = { label: d.label || '', format: d.format, usage: d.usage, ...r, t: now() };
        PM.tex.set(t, rec); PM.texBytes += r.bytes; PM.texPeak = Math.max(PM.texPeak, PM.texBytes);
        const od = t.destroy;
        t.destroy = function () { const x = PM.tex.get(t); if (x) { PM.texBytes -= x.bytes; PM.tex.delete(t); } return od.call(this); };
      } catch (e) { PM.errors.push('tex ' + e.message); }
      return t;
    };
    const oCB = P.createBuffer;
    P.createBuffer = function (d) {
      const b = oCB.call(this, d);
      try {
        const rec = { label: d.label || '', size: d.size, usage: d.usage, t: now() };
        PM.buf.set(b, rec); PM.bufBytes += d.size; PM.bufPeak = Math.max(PM.bufPeak, PM.bufBytes);
        const od = b.destroy;
        b.destroy = function () { const x = PM.buf.get(b); if (x) { PM.bufBytes -= x.size; PM.buf.delete(b); } return od.call(this); };
      } catch (e) { PM.errors.push('buf ' + e.message); }
      return b;
    };
    for (const name of ['createRenderPipeline', 'createComputePipeline']) {
      const o = P[name];
      P[name] = function (d) { const t0 = now(); const r = o.call(this, d); PM.pipes.push({ kind: name, t: t0, ms: now() - t0, async: false }); return r; };
    }
    for (const name of ['createRenderPipelineAsync', 'createComputePipelineAsync']) {
      const o = P[name];
      P[name] = function (d) {
        const rec = { kind: name, t: now(), ms: null, async: true }; PM.pipes.push(rec);
        const p = o.call(this, d); p.then(() => { rec.ms = now() - rec.t; }, () => { rec.ms = -1; }); return p;
      };
    }
    const oSM = P.createShaderModule; P.createShaderModule = function (d) { PM.shaderModules++; return oSM.call(this, d); };
    const oBG = P.createBindGroup; P.createBindGroup = function (d) { PM.bindGroups++; return oBG.call(this, d); };
  }

  // --- renderer trap ----------------------------------------------------------------------------------------
  function capture(r) {
    if (PM.renderers.includes(r)) return;
    PM.renderers.push(r);
    window.__pmRenderer = r;
    // GPU timestamps: on Apple TBDR GPUs per-pass [begin,end] intervals overlap, so per-pass durations cannot be summed.
    // We capture the raw ticks and compute, per frame, the UNION of all pass intervals (= GPU busy time) and attribute
    // each newly covered slice to the pass that extends coverage (critical-path attribution).
    if (window.__pmTimestamps) {
      try {
        const be = r.backend; be.trackTimestamp = true;
        const oInit = be.initTimestampQuery.bind(be);
        be.initTimestampQuery = (type, uid, desc) => {
          const had = !!be.timestampQueryPool[type];
          oInit(type, uid, desc);
          const pool = be.timestampQueryPool[type];
          if (!had && pool && !pool.__pmWrapped) {
            pool.__pmWrapped = true;
            const oRes = pool._resolveQueries.bind(pool);
            PM.tsPools.add(pool);
            pool._resolveQueries = async () => {
              const offsets = new Map(pool.queryOffsets);
              pool.__pmCap = { offsets, data: null };
              const v = await oRes();
              const cap = pool.__pmCap; pool.__pmCap = null;
              if (cap && cap.data) PM.tsBatches.push({ type, offsets: cap.offsets, data: cap.data });
              return v;
            };
          }
        };
        if (typeof GPUBuffer !== 'undefined' && !GPUBuffer.prototype.__pmGMR) {
          const oG = GPUBuffer.prototype.getMappedRange;
          GPUBuffer.prototype.getMappedRange = function (...a) {
            const ab = oG.apply(this, a);
            try { for (const p of PM.tsPools) if (p.resultBuffer === this && p.__pmCap) p.__pmCap.data = new BigUint64Array(ab.slice(0)); } catch (e) { PM.errors.push('gmr ' + e.message); }
            return ab;
          };
          GPUBuffer.prototype.__pmGMR = true;
        }
      } catch (e) { PM.errors.push('ts ' + e.message); }
    }
    const info = r.info;
    if (info) {
      const oc = info.createTexture.bind(info), od = info.destroyTexture.bind(info);
      info.createTexture = (t) => { PM.threeTex.add(t); return oc(t); };
      info.destroyTexture = (t) => { PM.threeTex.delete(t); return od(t); };
      for (const k of ['createAttribute', 'createIndexAttribute', 'createStorageAttribute', 'createIndirectStorageAttribute']) {
        const o = info[k].bind(info); info[k] = (a) => { PM.threeAttr.add(a); return o(a); };
      }
      const oda = info.destroyAttribute.bind(info); info.destroyAttribute = (a) => { PM.threeAttr.delete(a); return oda(a); };
    }
    const oLoop = r.setAnimationLoop.bind(r);
    r.setAnimationLoop = (cb) => oLoop(cb ? function (time, xr) {
      const t0 = now();
      try { return cb.call(this, time, xr); }
      finally { const ms = now() - t0; if (PM.frameStats) PM.frameStats.cpu.push(ms); }
    } : cb);
    // per-pass labels / draws (inspector hooks receive the timestamp uid)
    const ins = r._inspector;
    if (ins) {
      const ob = ins.beginRender.bind(ins), of = ins.finishRender.bind(ins);
      const open = new Map();
      const stack = [];
      ins.beginRender = (uid, scene, camera, rt) => {
        if (PM.passAgg) {
          let label;
          const rtName = rt ? (rt.texture?.name || rt.depthTexture?.name || 'rt') + ' ' + rt.width + 'x' + rt.height : 'canvas';
          if (scene?.isQuadMesh || (scene?.isMesh && !scene.isScene)) label = 'quad|' + rtName + '|' + (scene.material?.name || scene.material?.type || '');
          else label = (scene?.isScene ? 'scene' : (scene?.type || '?')) + '|' + rtName + '|' + (camera?.type || '') + (camera?.layers ? ' L' + camera.layers.mask : '');
          const o = { uid, label, d0: r.info.render.drawCalls, t0: r.info.render.triangles, cd: 0, ct: 0 };
          PM.uidLabel.set(uid, label);
          open.set(uid, o); stack.push(o);
        }
        return ob(uid, scene, camera, rt);
      };
      ins.finishRender = (uid) => {
        const o = open.get(uid);
        if (o) {
          open.delete(uid);
          const i = stack.lastIndexOf(o); if (i >= 0) stack.splice(i, 1);
          const incD = r.info.render.drawCalls - o.d0, incT = r.info.render.triangles - o.t0;
          const parent = stack[stack.length - 1]; if (parent) { parent.cd += incD; parent.ct += incT; }
          if (PM.passAgg) { const e = PM.passAgg.get(o.label) || { n: 0, draws: 0, tris: 0 }; e.n++; e.draws += incD - o.cd; e.tris += incT - o.ct; PM.passAgg.set(o.label, e); }
        }
        return of(uid);
      };
      const obc = ins.beginCompute.bind(ins);
      ins.beginCompute = (uid, nodes) => {
        if (PM.passAgg) { const label = 'compute|' + (Array.isArray(nodes) ? nodes.length + ' nodes' : (nodes?.name || nodes?.type || 'node')); const e = PM.passAgg.get(label) || { n: 0, draws: 0, tris: 0 }; e.n++; PM.passAgg.set(label, e); PM.uidLabel.set(uid, label); }
        return obc(uid, nodes);
      };
    }
  }
  try {
    Object.defineProperty(Object.prototype, 'isWebGPURenderer', {
      configurable: true,
      set(v) {
        Object.defineProperty(this, 'isWebGPURenderer', { value: v, writable: true, configurable: true, enumerable: true });
        if (v === true) { try { capture(this); } catch (e) { PM.errors.push('capture ' + e.message); } }
      },
    });
  } catch (e) { PM.errors.push('trap ' + e.message); }
})();
