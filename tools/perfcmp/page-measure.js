// Functions evaluated inside the page (stringified by measure.mjs). Must be self-contained.
window.__pmMeasure = async function (seconds) {
  const PM = window.__pm, r = window.__pmRenderer;
  if (!r) return { error: 'no renderer captured' };
  PM.passAgg = new Map();
  PM.frameStats = { cpu: [] };
  const deltas = [], draws = [], tris = [], calls = [], heap = [];
  const pipesBefore = PM.pipes.length, bgBefore = PM.bindGroups, smBefore = PM.shaderModules;
  const texBefore = PM.texBytes, bufBefore = PM.bufBytes;
  let last = null, frames = 0;
  const t0 = performance.now(), tEnd = t0 + seconds * 1000;
  const longTasks = [];
  let obs = null;
  try { obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(Math.round(e.duration)); }); obs.observe({ type: 'longtask', buffered: false }); } catch {}
  const ts = !!(window.__pmTimestamps && r.backend.trackTimestamp);
  PM.tsBatches.length = 0; PM.uidLabel.clear();
  const frame0 = r.info.frame;
  let resolving = false;
  const resolveNow = async () => { if (!ts || resolving) return; resolving = true; try { await r.resolveTimestampsAsync('render'); await r.resolveTimestampsAsync('compute'); } catch (e) { PM.errors.push('res ' + e.message); } resolving = false; };
  await new Promise((resolve) => {
    const loop = (t) => {
      if (last !== null) deltas.push(t - last);
      last = t; frames++;
      if (ts && frames % 4 === 0) resolveNow();
      draws.push(r.info.render.drawCalls); tris.push(r.info.render.triangles); calls.push(r.info.render.frameCalls);
      if (performance.memory) heap.push(performance.memory.usedJSHeapSize);
      if (t < tEnd) requestAnimationFrame(loop); else resolve();
    };
    requestAnimationFrame(loop);
  });
  obs?.disconnect();
  const frame1 = r.info.frame;
  if (ts) { while (resolving) await new Promise((res) => setTimeout(res, 10)); await resolveNow(); await new Promise((res) => setTimeout(res, 100)); await resolveNow(); }
  // GPU busy time per frame: union of [begin,end] of every pass/compute in that frame (render + compute merged)
  const frameIv = new Map();
  for (const b of PM.tsBatches) {
    for (const [uid, off] of b.offsets) {
      const m = /:f(\d+)$/.exec(uid); if (!m) continue;
      const s0 = b.data[off], e0 = b.data[off + 1];
      if (!s0 || !e0 || e0 < s0) continue;
      const f = +m[1];
      if (f <= frame0 || f >= frame1) continue;
      (frameIv.get(f) || frameIv.set(f, []).get(f)).push({ s: Number(s0) / 1e6, e: Number(e0) / 1e6, label: PM.uidLabel.get(uid) || uid.split(':')[0] });
    }
  }
  const gpuBusy = [], gpuSpan = [], attr = new Map();
  const fkeys = [...frameIv.keys()].sort((a, b) => a - b);
  const counts = fkeys.map((f) => frameIv.get(f).length).sort((a, b) => a - b);
  const fullCount = counts.length ? counts[Math.floor(counts.length * 0.75)] : 0;
  let dropped = 0;
  for (const f of fkeys.slice(1, -1)) { // drop partial first/last frames and frames with missing passes
    if (frameIv.get(f).length < fullCount * 0.9) { dropped++; continue; }
    const iv = frameIv.get(f).sort((a, b) => a.s - b.s);
    let busy = 0, curE = -Infinity; const s0 = iv[0].s; let eMax = -Infinity;
    for (const x of iv) {
      const add = Math.max(0, x.e - Math.max(x.s, curE));
      busy += add; curE = Math.max(curE, x.e); eMax = Math.max(eMax, x.e);
      attr.set(x.label, (attr.get(x.label) || 0) + add);
    }
    gpuBusy.push(busy); gpuSpan.push(eMax - s0);
  }
  const nG = Math.max(1, gpuBusy.length);
  const gpuPasses = [...attr.entries()].map(([label, ms]) => ({ label, ms: +(ms / nG).toFixed(2) })).sort((a, b) => b.ms - a.ms);
  const agg = PM.passAgg; PM.passAgg = null;
  const cpu = PM.frameStats.cpu; PM.frameStats = null;
  const st = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    return { n: a.length, mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p90: +q(0.9).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2), min: +s[0].toFixed(2) };
  };
  const nf = Math.max(1, cpu.length);
  const passes = [...agg.entries()].map(([label, e]) => ({ label, perFrame: +(e.n / nf).toFixed(2), drawsPerFrame: +(e.draws / nf).toFixed(1), trisPerFrame: Math.round(e.tris / nf) }))
    .sort((a, b) => b.trisPerFrame - a.trisPerFrame || b.drawsPerFrame - a.drawsPerFrame);
  const newPipes = PM.pipes.slice(pipesBefore);
  let gcDrops = 0; for (let i = 1; i < heap.length; i++) if (heap[i] < heap[i - 1] - 1e6) gcDrops++;
  return {
    seconds: +((performance.now() - t0) / 1000).toFixed(2), frames, fps: +(frames / seconds).toFixed(1), loopCallbacks: cpu.length,
    rafDelta: st(deltas), over20: deltas.filter((d) => d > 20).length, over34: deltas.filter((d) => d > 34).length, over50: deltas.filter((d) => d > 50).length,
    cpuMs: st(cpu), gpuBusyMs: st(gpuBusy), gpuSpanMs: st(gpuSpan), gpuFrames: gpuBusy.length, gpuFramesDropped: dropped, gpuFrameRange: [frame0, frame1], gpuPassesPerFrame: fullCount, gpuPasses,
    drawCalls: st(draws), triangles: st(tris), renderCallsPerFrame: st(calls),
    passes,
    pipelinesCreatedDuring: newPipes.length, pipelinesDuring: newPipes.slice(0, 20).map((p) => ({ kind: p.kind, ms: p.ms && +p.ms.toFixed(1) })),
    shaderModulesDuring: PM.shaderModules - smBefore, bindGroupsPerFrame: +((PM.bindGroups - bgBefore) / Math.max(1, frames)).toFixed(1),
    gpuTexBytesDelta: PM.texBytes - texBefore, gpuBufBytesDelta: PM.bufBytes - bufBefore,
    heapMB: heap.length ? { start: +(heap[0] / 1048576).toFixed(1), end: +(heap[heap.length - 1] / 1048576).toFixed(1), max: +(Math.max(...heap) / 1048576).toFixed(1), allocMBps: +(heap.reduce((a, h, i) => a + (i ? Math.max(0, h - heap[i - 1]) : 0), 0) / 1048576 / seconds).toFixed(2) } : null,
    gcDrops, longTasks,
  };
};

window.__pmSnapshot = function () {
  const PM = window.__pm, r = window.__pmRenderer, be = r.backend;
  const MB = (b) => +(b / 1048576).toFixed(2);
  const classify = (t) => {
    const n = t.name || '';
    if (/shadow/i.test(n)) return 'rt:shadow';
    if (t.mapping === 306 || /pmrem/i.test(n)) return 'rt:pmrem';
    if (t.isDepthTexture) return 'rt:depth';
    if (t.isRenderTargetTexture || t.isFramebufferTexture) return 'rt:color';
    if (t.isStorageTexture) return 'storage-tex';
    if (t.isCompressedTexture || t.isCompressedArrayTexture) return 'tex:compressed';
    if (t.isData3DTexture || t.isDataArrayTexture) return 'tex:data3d';
    if (t.isDataTexture) return 'tex:data';
    if (t.isCanvasTexture) return 'tex:canvas';
    if (t.isVideoTexture) return 'tex:video';
    return 'tex:image';
  };
  const srcOf = (t) => {
    const im = t.image;
    if (!im) return '';
    if (im.src) { try { return new URL(im.src).pathname; } catch { return String(im.src).slice(0, 80); } }
    if (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) return 'ImageBitmap(glb)';
    if (im instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && im instanceof OffscreenCanvas)) return 'canvas';
    if (im.data) return 'data:' + im.data.constructor.name;
    return im.constructor?.name || '';
  };
  const owner = new Map();
  for (const t of PM.threeTex) {
    let d; try { d = be.get(t); } catch { continue; }
    const cat = classify(t);
    for (const g of [d.texture, d.msaaTexture, ...(d.msaaTextures || [])]) if (g) owner.set(g, { cat, t });
  }
  const texCat = {}, texList = [];
  for (const [g, rec] of PM.tex) {
    const o = owner.get(g);
    const cat = o ? o.cat : 'internal';
    const c = texCat[cat] || (texCat[cat] = { n: 0, bytes: 0 }); c.n++; c.bytes += rec.bytes;
    texList.push({ cat, bytes: rec.bytes, w: rec.w, h: rec.h, z: rec.z, mips: rec.mips, samples: rec.samples, format: rec.format, label: rec.label, name: o?.t?.name || '', src: o ? srcOf(o.t) : '' });
  }
  for (const c of Object.values(texCat)) c.MB = MB(c.bytes);
  texList.sort((a, b) => b.bytes - a.bytes);
  // image textures grouped by source kind and size
  const imgGroups = {};
  for (const x of texList) {
    if (!x.cat.startsWith('tex:')) continue;
    const kind = x.src.startsWith('ImageBitmap') ? 'glb-embedded' : x.src.startsWith('/') ? x.src.split('/').slice(0, 3).join('/') : x.cat;
    const key = `${kind} ${x.w}x${x.h} ${x.format}`;
    const g = imgGroups[key] || (imgGroups[key] = { n: 0, MB: 0 }); g.n++; g.MB = +(g.MB + x.bytes / 1048576).toFixed(1);
  }
  const bufCat = {};
  for (const rec of PM.buf.values()) {
    const u = rec.usage;
    const cat = u & 128 ? 'storage' : u & 16 ? 'index' : u & 32 ? 'vertex' : u & 64 ? 'uniform' : u & 512 ? 'query-resolve' : u & 1 ? 'readback' : u & 256 ? 'indirect' : 'other';
    const c = bufCat[cat] || (bufCat[cat] = { n: 0, bytes: 0 }); c.n++; c.bytes += rec.size;
  }
  for (const c of Object.values(bufCat)) c.MB = MB(c.bytes);
  // render targets (distinct RenderTarget objects among tracked textures)
  const rts = new Map();
  for (const t of PM.threeTex) if (t.renderTarget && (t.isRenderTargetTexture || t.isDepthTexture)) {
    const rt = t.renderTarget; if (!rts.has(rt)) rts.set(rt, { name: rt.texture?.name || '', w: rt.width, h: rt.height, n: rt.textures?.length || 1, depth: !!rt.depthTexture, samples: rt.samples || 0 });
  }
  // scene stats
  const scene = window.__engine?.scene;
  const S = { meshes: 0, visibleMeshes: 0, instancedMeshes: 0, instances: 0, batched: 0, skinned: 0, points: 0, lines: 0, sprites: 0,
    lights: {}, lightsOn: 0, shadowLights: [], castShadowMeshes: 0, transparentMeshes: 0, materials: 0, materialTypes: {}, geometries: 0, geomBytes: 0, staticTris: 0 };
  const mats = new Set(), geos = new Map(), byName = new Map();
  const geoBytes = (g) => {
    let b = 0; const seen = new Set();
    for (const a of Object.values(g.attributes)) { const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; if (arr && !seen.has(arr)) { seen.add(arr); b += arr.byteLength; } }
    if (g.index?.array) b += g.index.array.byteLength;
    return b;
  };
  scene?.traverse((o) => {
    if (o.isLight) {
      S.lights[o.type] = (S.lights[o.type] || 0) + 1;
      if (o.intensity > 0) S.lightsOn++;
      if (o.castShadow) S.shadowLights.push({ type: o.type, name: o.name, map: o.shadow?.mapSize ? o.shadow.mapSize.x + 'x' + o.shadow.mapSize.y : '', on: o.intensity > 0, autoUpdate: o.shadow?.autoUpdate });
      return;
    }
    if (o.isPoints) S.points++;
    else if (o.isLine) S.lines++;
    else if (o.isSprite) S.sprites++;
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    S.meshes++;
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
    if (vis) S.visibleMeshes++;
    if (o.isInstancedMesh) { S.instancedMeshes++; S.instances += o.count; }
    if (o.isBatchedMesh) S.batched++;
    if (o.isSkinnedMesh) S.skinned++;
    if (o.castShadow) S.castShadowMeshes++;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (m) { if (!mats.has(m)) { mats.add(m); S.materialTypes[m.type] = (S.materialTypes[m.type] || 0) + 1; } if (m.transparent) S.transparentMeshes++; }
    const g = o.geometry;
    if (g) {
      if (!geos.has(g)) geos.set(g, geoBytes(g));
      const tri = g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
      const inst = o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? (g.instanceCount === Infinity ? 1 : g.instanceCount) : 1);
      S.staticTris += tri * inst;
      const key = (o.name || o.parent?.name || o.type).replace(/[_-]?\d+$/, '');
      const e = byName.get(key) || { meshes: 0, tris: 0, bytes: 0, geos: new Set() };
      e.meshes++; e.tris += tri * inst; if (!e.geos.has(g)) { e.geos.add(g); e.bytes += geos.get(g); } byName.set(key, e);
    }
  });
  S.materials = mats.size; S.geometries = geos.size; S.geomMB = MB([...geos.values()].reduce((a, b) => a + b, 0)); S.staticTris = Math.round(S.staticTris);
  const geoTop = [...byName.entries()].map(([k, e]) => ({ name: k, meshes: e.meshes, tris: Math.round(e.tris), MB: MB(e.bytes) })).sort((a, b) => b.MB - a.MB).slice(0, 25);
  return {
    backend: be.isWebGPUBackend ? 'webgpu' : 'webgl2', timestamps: !!be.trackTimestamp,
    pixelRatio: r.getPixelRatio(), canvas: [r.domElement.width, r.domElement.height],
    gpuTotalMB: MB(PM.texBytes + PM.bufBytes), gpuTexMB: MB(PM.texBytes), gpuBufMB: MB(PM.bufBytes), gpuPeakTexMB: MB(PM.texPeak), gpuPeakBufMB: MB(PM.bufPeak),
    gpuTextures: PM.tex.size, gpuBuffers: PM.buf.size, texCat, bufCat, imgGroups,
    texTop: texList.slice(0, 45).map((x) => ({ ...x, MB: MB(x.bytes), bytes: undefined })),
    rtList: texList.filter((x) => x.cat.startsWith('rt:') || x.cat === 'internal').map((x) => ({ cat: x.cat, name: x.name || x.label, w: x.w, h: x.h, z: x.z, mips: x.mips, format: x.format, MB: MB(x.bytes) })),
    rtCount: rts.size, rts: [...rts.values()],
    threeInfo: { ...r.info.memory, texturesMB: MB(r.info.memory.texturesSize), attributesMB: MB(r.info.memory.attributesSize), indexMB: MB(r.info.memory.indexAttributesSize), storageMB: MB(r.info.memory.storageAttributesSize), totalMB: MB(r.info.memory.total) },
    pipelinesTotal: PM.pipes.length, pipelinesAsync: PM.pipes.filter((p) => p.async).length,
    pipelineCompileMs: +PM.pipes.reduce((a, p) => a + (p.ms > 0 ? p.ms : 0), 0).toFixed(0),
    shaderModules: PM.shaderModules,
    scene: S, geoTop,
    heapMB: performance.memory ? { used: MB(performance.memory.usedJSHeapSize), total: MB(performance.memory.totalJSHeapSize) } : null,
    errors: PM.errors.slice(0, 10),
  };
};
