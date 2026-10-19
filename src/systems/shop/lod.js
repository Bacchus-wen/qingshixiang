// Screen-error levels of detail for the raw Tripo models (built by tools/lod-build.mjs; docs/tripo-compare).
// L0 is the generated mesh itself, every triangle, at its original texture resolution. Coarser levels are meshopt
// simplifications, each tagged with its measured geometric error (metres) and texel density (texels per metre of
// surface). Every placed copy shows the coarsest level whose error is under one screen pixel and whose texture is at
// least as sharp as the screen at that distance -- so a switch is not visible. Only the coarsest level of each model is
// loaded up front; finer ones stream in when something comes close. A GPU memory budget is kept: the copies that are
// biggest on screen get their levels first, the rest wait at a coarser one, and unused levels are released.
import * as THREE from 'three/webgpu';

const _s = new THREE.Sphere(), _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _db = new THREE.Vector2();
// Shadow proxies: a copy showing the raw mesh (L0) does not cast its own shadow -- every shadow-casting light would
// draw its ~2 million triangles again into its shadow map. L1 (0.3-0.5 mm from L0, far below a shadow-map texel) casts
// instead, on this layer only; shadow-casting lights must see it: light.shadow.camera.layers.enable(SHADOW_LAYER).
export const SHADOW_LAYER = 5;
// the robot draws on its own layers, so the light from its own eye can leave it out of its shadow map (a cable next to
// the lens would throw a metre-long shadow across the wall it looks at): ROBOT_LAYER for its visible levels, enabled on
// the main camera and on every shadow camera except the eye's; ROBOT_SHADOW_LAYER for its shadow proxy
export const ROBOT_LAYER = 7, ROBOT_SHADOW_LAYER = 8;
const tintCache = new Map();

export class LodLibrary {
  constructor(loader, baseUrl, { budgetMB = 600, maxLoads = 2 } = {}) {
    this.loader = loader; this.base = baseUrl; this.budget = budgetMB * 1048576; this.maxLoads = maxLoads;
    this.sets = new Map();      // name -> { name, meta, levels: [{ ...meta level, promise, scene, gpu, users: Set, used }] }
    this.instances = [];        // LodObject
    this.hooks = new Map();     // name -> fn(scene, levelIndex), applied once to each level as it loads
    this.proxyLayers = new Map(); // name -> layer of its shadow proxy (default SHADOW_LAYER)
    this.loading = 0; this.frame = 0; this.gpuBytes = 0; this.stats = { loads: 0, evictions: 0 };
  }
  hook(name, fn) { this.hooks.set(name, fn); }
  // the model's metadata and its coarsest level (what the scene starts with)
  async prepare(name) {
    let set = this.sets.get(name);
    if (!set) {
      set = { name, meta: null, levels: [] }; this.sets.set(name, set);
      set.ready = (async () => {
        const r = await fetch(`${this.base}${name}/lod.json`); if (!r.ok) throw new Error(`lod.json ${r.status}`);
        set.meta = await r.json();
        set.levels = set.meta.levels.map((L) => ({ ...L, promise: null, scene: null, gpu: estimateGPU(L), users: new Set(), used: 0 }));
        await this.load(set, set.levels.length - 1);
      })();
    }
    await set.ready; return set;
  }
  load(set, i) {
    const L = set.levels[i];
    if (!L.promise) {
      this.loading++;
      L.promise = this.loader.loadAsync(`${this.base}${set.name}/${L.file}`).then((g) => {
        g.scene.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; if (!m.material.isNodeMaterial) m.material = toNodeMaterial(m.material); } });
        // every level stands where L0 stands: a coarse level's lowest point can only be at or above L0's
        g.scene.position.y = -((L.minY ?? 0) - (set.levels[0].minY ?? 0));
        this.hooks.get(set.name)?.(g.scene, i);
        L.scene = g.scene; this.stats.loads++; return g.scene;
      }).catch((e) => { L.promise = null; L.failed = (L.failed || 0) + 1; throw e; }).finally(() => this.loading--);
    }
    return L.promise;
  }
  // a placed copy: a Group whose single child is the current level (clones share geometry, materials and textures)
  instance(name, opts = {}) {
    const o = new LodObject(this, this.sets.get(name), opts);
    this.instances.push(o); return o;
  }
  release(o) { this.instances = this.instances.filter((x) => x !== o); o.dropProxy(); if (o.cur >= 0) o.set.levels[o.cur].users.delete(o); o.removeFromParent(); }
  // true while some copy on screen is not yet showing the level it needs (screenshots wait for this)
  busy() { return this.loading > 0 || this.instances.some((o) => o.parent && o.target >= 0 && o.cur !== o.target && !o.set.levels[o.target].failed); }
  update(camera, renderer, every = 4) {
    if (++this.frame % every !== 0) return;
    renderer.getSize(_db); // CSS pixels: a high-density screen renders sharper (pixel ratio), not heavier (finer levels, more memory)
    const k = (_db.y || 1080) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pv);
    // 1. the level each copy needs, and how much it matters (its radius on screen, in pixels; off screen = 0)
    const items = [];
    for (const o of this.instances) {
      if (!o.parent) continue;
      o.worldSphere(_s);
      // screen pixels per model metre at the copy's nearest point (its own scale included)
      const d = Math.max(0.02, camera.position.distanceTo(_s.center) - _s.radius), pxPerM = (k / d) * o.matrixWorld.getMaxScaleOnAxis();
      const lv = o.set.levels, onScreen = o.visibleInTree() && _frustum.intersectsSphere(_s);
      // coarsest level that passes both tests: geometric error under a pixel, texture at least as sharp as the screen.
      // Coarsening needs some margin (hysteresis) so a copy at the threshold does not flip every frame.
      const ok = (L, slack) => L.errM * pxPerM <= slack && L.texelsPerM >= 0.75 * pxPerM / slack; // texture: at most 1.33x magnified
      let t = 0;
      for (let i = lv.length - 1; i >= 0; i--) if (ok(lv[i], i > o.cur && o.cur >= 0 ? 0.85 : 1.0)) { t = i; break; }
      if (!onScreen) t = Math.max(t, o.cur); // off screen: keep what it has, never load finer for it
      items.push({ o, t, pri: onScreen ? _s.radius * k / d : 0 });
    }
    // 2. GPU budget: biggest on screen first; each level costs once however many copies show it. A copy whose level
    //    would not fit waits at the finest coarser level that does (the coarsest levels are always resident).
    items.sort((a, b) => b.pri - a.pri);
    const counted = new Set(); let total = 0;
    for (const set of this.sets.values()) { const L = set.levels[set.levels.length - 1]; if (L) { counted.add(L); total += L.gpu; } }
    for (const it of items) {
      const lv = it.o.set.levels; let t = it.t;
      const cost = (i) => (counted.has(lv[i]) ? 0 : lv[i].gpu) + (i === 0 && lv[1] && !counted.has(lv[1]) ? lv[1].gpu : 0); // L0 brings its shadow proxy L1
      while (t < lv.length - 1 && total + cost(t) > this.budget) t++;
      total += cost(t); counted.add(lv[t]); if (t === 0 && lv[1]) counted.add(lv[1]);
      it.o.target = t;
    }
    // 3. show what is loaded, queue what is missing (most important first)
    const want = [];
    for (const it of items) {
      const { o } = it, L = o.set.levels[o.target];
      if (o.cur >= 0) o.set.levels[o.cur].used = performance.now();
      if (L.scene) o.show(o.target);
      else { if (!L.promise && !(L.failed >= 3)) want.push([o.set, o.target, it.pri]); this.bestLoaded(o, o.target); }
      if (o.cur === 0 && o.set.levels.length > 1) { const P = o.set.levels[1]; if (P.scene) o.attachProxy(); else if (!P.promise) want.push([o.set, 1, it.pri]); }
    }
    want.sort((a, b) => b[2] - a[2]);
    for (const [set, i] of want) {
      if (this.loading >= this.maxLoads) break;
      if (!set.levels[i].promise) this.load(set, i).catch((e) => console.warn('[lod] load failed', set.name, i, e.message));
    }
    this.evict(counted);
  }
  // while the wanted level streams in: the nearest loaded level, finer preferred (never coarser than necessary)
  bestLoaded(o, t) {
    const lv = o.set.levels; let best = -1;
    for (let i = t; i >= 0; i--) if (lv[i].scene) { best = i; break; }
    if (best < 0) for (let i = t + 1; i < lv.length; i++) if (lv[i].scene) { best = i; break; }
    if (best >= 0 && best !== o.cur) o.show(best);
  }
  // release levels nobody shows and nobody needs, least recently used first, while over the budget
  evict(needed) {
    let total = 0; const spare = [];
    for (const set of this.sets.values()) set.levels.forEach((L, i) => {
      if (!L.scene) return; total += L.gpu;
      if (i < set.levels.length - 1 && L.users.size === 0 && !needed.has(L)) spare.push(L);
    });
    spare.sort((a, b) => a.used - b.used);
    for (const L of spare) {
      if (total <= this.budget) break;
      disposeScene(L.scene); L.scene = null; L.promise = null; total -= L.gpu; this.stats.evictions++;
    }
    this.gpuBytes = total;
  }
}

class LodObject extends THREE.Group {
  constructor(lib, set, { tint } = {}) {
    super(); this.lib = lib; this.set = set; this.tint = tint; this.cur = -1; this.target = -1; this.isLodObject = true;
    this.show(set.levels.length - 1);
  }
  show(i) {
    const L = this.set.levels[i]; if (!L.scene || i === this.cur) return;
    const prev = this.cur >= 0 ? this.set.levels[this.cur] : null;
    const c = this.tinted(L.scene.clone(true));
    if (this.view) this.remove(this.view);
    this.dropProxy();
    this.add(c); this.view = c; this.cur = i; c.updateMatrixWorld(true);
    prev?.users.delete(this); L.users.add(this); L.used = performance.now();
    if (i === 0) this.attachProxy();
  }
  // L0 shown: it stops casting, L1 casts on the shadow layer (if L1 is loaded; until then L0 casts itself)
  attachProxy() {
    if (this.proxy || this.cur !== 0) return;
    const P = this.set.levels[1]; if (!P?.scene) return;
    const p = this.tinted(P.scene.clone(true));
    const layer = this.lib.proxyLayers.get(this.set.name) ?? SHADOW_LAYER;
    p.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; m.layers.set(layer); } });
    this.view.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    this.add(p); this.proxy = p; p.updateMatrixWorld(true); P.users.add(this);
  }
  dropProxy() {
    if (!this.proxy) return;
    this.remove(this.proxy); this.proxy = null; this.set.levels[1].users.delete(this);
  }
  tinted(c) {
    if (this.tint) c.traverse((m) => { // one tinted material per source material and tint
      if (!m.isMesh) return; const key = m.material.uuid + this.tint.join();
      let t = tintCache.get(key); if (!t) { t = m.material.clone(); t.color.setRGB(...this.tint); tintCache.set(key, t); }
      m.material = t;
    });
    return c;
  }
  worldSphere(s) {
    const m = this.set.meta;
    s.center.set(0, m.dims[1] / 2, 0).applyMatrix4(this.matrixWorld);
    s.radius = m.radius * this.matrixWorld.getMaxScaleOnAxis(); return s;
  }
  visibleInTree() { let o = this; while (o) { if (!o.visible) return false; o = o.parent; } return true; }
}

// glTF MeshStandardMaterial -> MeshStandardNodeMaterial with the same maps and factors, so every level is a node
// material that hooks can extend (emissive masks, the robot's neck). (The "camouflage" once blamed on the automatic
// conversion was the r186 geometry cache key: see src/engine/threeFixes.js.)
function toNodeMaterial(src) {
  const nm = new THREE.MeshStandardNodeMaterial();
  for (const k of ['name', 'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissiveMap', 'roughness', 'metalness', 'transparent', 'opacity', 'alphaTest', 'side', 'vertexColors', 'envMapIntensity'])
    if (src[k] !== undefined) nm[k] = src[k];
  for (const k of ['color', 'emissive']) if (src[k]) nm[k].copy(src[k]);
  if (src.normalScale) nm.normalScale.copy(src.normalScale);
  if (src.emissiveIntensity !== undefined) nm.emissiveIntensity = src.emissiveIntensity;
  src.dispose();
  return nm;
}
// GPU bytes of one level from its metadata: quantised vertices (~16 B) + 32-bit indices; textures at 1 byte/texel
// (UASTC -> BC7/ASTC) or 0.5 (ETC1S -> BC1/ETC2), three maps, with mipmaps
function estimateGPU(L) { return L.tris * 0.65 * 16 + L.tris * 12 + L.tex * L.tex * (L.tex > 1024 ? 1 : 0.5) * 3 * 1.33; }
function disposeScene(scene) {
  scene.traverse((m) => {
    if (!m.isMesh) return; m.geometry.dispose();
    for (const mat of [].concat(m.material)) {
      for (const [key, t] of tintCache) if (key.startsWith(mat.uuid)) { t.dispose(); tintCache.delete(key); }
      for (const v of Object.values(mat)) if (v && v.isTexture) v.dispose();
      mat.dispose();
    }
  });
}
