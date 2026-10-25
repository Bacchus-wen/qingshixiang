// Screen-error levels of detail for the raw Tripo models (built by tools/lod-build.mjs; docs/tripo-compare).
// L0 is the generated mesh itself, every triangle, at its original texture resolution. Coarser levels are meshopt
// simplifications, each tagged with its measured geometric error (metres) and texel density (texels per metre of
// surface). Every placed copy shows the coarsest level whose error is under one screen pixel and whose texture is at
// least as sharp as the screen at that distance -- so a switch is not visible. Only the coarsest level of each model is
// loaded up front; finer ones stream in when something comes close. A GPU memory budget is kept: the copies that are
// biggest on screen get their levels first, the rest wait at a coarser one, and unused levels are released.
import * as THREE from 'three/webgpu';
import { Fn, uniform, screenCoordinate, fract, dot, vec2, float } from 'three/tsl';

const _s = new THREE.Sphere(), _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _db = new THREE.Vector2();
// Shadow proxies: a copy showing the raw mesh (L0) does not cast its own shadow -- every shadow-casting light would
// draw its ~2 million triangles again into its shadow map. L1 (0.3-0.5 mm from L0, far below a shadow-map texel) casts
// instead, on this layer only; shadow-casting lights must see it: light.shadow.camera.layers.enable(SHADOW_LAYER).
export const SHADOW_LAYER = 5;
// the robot draws on its own layers, so the light from its own eye can leave it out of its shadow map (a cable next to
// the lens would throw a metre-long shadow across the wall it looks at): ROBOT_LAYER for its visible levels, enabled on
// the main camera and on every shadow camera except the eye's; ROBOT_SHADOW_LAYER for its shadow proxy
export const ROBOT_LAYER = 7, ROBOT_SHADOW_LAYER = 8;
// The finest level a copy may use. The web build for GitHub Pages sets VITE_LOD_MIN=1: L0 (the raw mesh, 25-40 MB a
// model) is not shipped, L1 (0.3-0.5 mm from it) is the finest; it then casts its own shadow (no proxy). ?lodmin=1 tries
// it locally.
const FINE = +(new URLSearchParams(globalThis.location?.search ?? '').get('lodfine') ?? 1) || 1; // ?lodfine=8: finer levels sooner (comparisons)
// A production build (the frozen preview too) never loads L0 either: the robot's is 79 MB with an 8K texture, more than the
// GPU budget lets it keep, so it was dropped and loaded again ten times in one viewing, each time a stall. ?lodmin=0
// brings L0 back.
const LODMIN_Q = new URLSearchParams(globalThis.location?.search ?? '').get('lodmin');
const MIN_LEVEL = Math.max(0, LODMIN_Q != null ? +LODMIN_Q || 0 : +(import.meta.env?.VITE_LOD_MIN ?? (import.meta.env?.PROD ? 1 : 0)) || 0);
const tintCache = new Map();
// A change of level is a cross-fade, not a cut. (A viewer saw close-ups "flash": as the camera flew in and out,
// several copies changed level within a second, each a visible jump in sharpness.) During a change both levels draw,
// each on its own half of a random set of pixels -- interleaved gradient noise, shifted every frame, which TRAA
// averages into a smooth blend -- and the incoming level's share grows from 0 to 1 in FADE_S. One mask node, shared
// by every level's materials (shadow maps included: Renderer applies maskNode there too); each mesh's own value is
// read per draw from mesh.userData.lodFade: 1 (or none) = whole; f in [0, 1) = incoming at f; 2 + f = outgoing while
// the incoming is at f.
const FADE_S = 0.35;
const lodFrame = uniform(0).onFrameUpdate((frame) => frame.frameId % 64);
const lodFade = uniform(1).onObjectUpdate(({ object }) => object.userData.lodFade ?? 1);
// the noise itself, 0..1 per pixel, a new pattern each frame (also the far shop's now/then switch: ./farshop.js)
export const ditherNoise = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy.add(lodFrame.mul(5.588238)), vec2(0.06711056, 0.00583715)))));
const lodMask = Fn(() => {
  const n = ditherNoise;
  return lodFade.lessThan(1).and(n.lessThan(lodFade))
    .or(lodFade.greaterThanEqual(1).and(lodFade.lessThan(2)))
    .or(lodFade.greaterThanEqual(2).and(n.greaterThanEqual(lodFade.sub(2))));
})();
const setFade = (g, v) => g.traverse((m) => { if (m.isMesh) m.userData.lodFade = v; });

export class LodLibrary {
  constructor(loader, baseUrl, { budgetMB = 600, maxLoads = 2, fade = true } = {}) {
    this.loader = loader; this.base = baseUrl; this.budget = budgetMB * 1048576; this.maxLoads = maxLoads;
    this.fade = fade; this.fading = new Set(); // (fade: off for review shots, which must not catch a level mid-change)
    this.sets = new Map();      // name -> { name, meta, levels: [{ ...meta level, promise, scene, gpu, users: Set, used }] }
    this.instances = [];        // LodObject
    this.hooks = new Map();     // name -> fn(scene, levelIndex), applied once to each level as it loads
    this.proxyLayers = new Map(); // name -> layer of its shadow proxy (default SHADOW_LAYER)
    this.loading = 0; this.frame = 0; this.gpuBytes = 0; this.stats = { loads: 0, evictions: 0 };
  }
  hook(name, fn) { this.hooks.set(name, fn); }
  // fn(scene, name, levelIndex) for every model's every level, after its own hook (the shop's decay: ./decay.js)
  decorate(fn) { (this.decorators ??= []).push(fn); }
  // the model's metadata and its coarsest level (what the scene starts with). coarsest: the coarsest level this model may
  // ever show (default: its last). The robot starts at L2: its L3 -- ETC1S colour, a PNG normal map -- looked visibly
  // different, and the change to L2 when the camera first came close read as its material flashing (the user, 10-23)
  async prepare(name, { coarsest } = {}) {
    let set = this.sets.get(name);
    if (!set) {
      set = { name, meta: null, levels: [], coarsest: 0 }; this.sets.set(name, set);
      set.ready = (async () => {
        const r = await fetch(`${this.base}${name}/lod.json`); if (!r.ok) throw new Error(`lod.json ${r.status}`);
        set.meta = await r.json();
        set.levels = set.meta.levels.map((L) => ({ ...L, promise: null, scene: null, gpu: estimateGPU(L), users: new Set(), used: 0 }));
        set.coarsest = Math.max(0, Math.min(set.levels.length - 1, coarsest ?? set.levels.length - 1));
        await this.load(set, set.coarsest);
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
        for (const d of this.decorators ?? []) d(g.scene, set.name, i);
        if (this.fade) g.scene.traverse((m) => { if (m.isMesh) for (const mat of [].concat(m.material)) if (mat.isNodeMaterial && !mat.userData.lodMasked) { mat.userData.lodMasked = true; mat.maskNode = mat.maskNode ? mat.maskNode.and(lodMask) : lodMask; } }); // (after the hooks: their materials too; a mask of their own -- the broken/intact swap, ./decay.js -- kept, and the cross-fade's added)
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
  busy() { return this.loading > 0 || this.fading.size > 0 || this.instances.some((o) => o.parent && o.target >= 0 && o.cur !== o.target && !o.set.levels[o.target].failed); }
  update(camera, renderer, every = 4) {
    const now = performance.now();
    for (const o of this.fading) o.stepFade(now);
    if (++this.frame % every !== 0) return;
    // the pixels actually rendered (the internal resolution): a level must hold up against those. (It was the CSS
    // size, to keep high-density screens from needing finer levels; with the coarse level allowed 1.33x magnification
    // on top, a close-up showed a blurred texture and then the sharp one cutting in.)
    renderer.getDrawingBufferSize(_db);
    const k = (_db.y || 1080) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pv);
    // 1. the level each copy needs, and how much it matters (its radius on screen, in pixels; off screen = 0)
    const items = [];
    for (const o of this.instances) {
      if (!o.parent) continue;
      o.worldSphere(_s);
      // screen pixels per model metre at the copy's nearest point (its own scale included)
      const d = Math.max(0.02, camera.position.distanceTo(_s.center) - _s.radius), pxPerM = (k / d) * o.matrixWorld.getMaxScaleOnAxis() * FINE;
      const lv = o.set.levels, onScreen = o.visibleInTree() && _frustum.intersectsSphere(_s);
      // coarsest level that passes both tests: geometric error under a pixel, texture never magnified -- so the finer
      // level comes in while the two still look the same. Going coarser waits for a 2x margin (the coarser level at
      // half a pixel of error, its texture minified 2x: again no visible difference), held for 2 s: a camera flying
      // into a close-up and out again does not make everything around change level twice.
      const ok = (L, slack) => L.errM * pxPerM <= slack && L.texelsPerM >= pxPerM / slack;
      let t = 0;
      for (let i = o.set.coarsest; i >= 0; i--) if (ok(lv[i], i > o.cur && o.cur >= 0 ? 0.5 : 1.0)) { t = i; break; }
      if (o.cur >= 0 && t > o.cur) { o.coarserSince ??= now; if (now - o.coarserSince < 2000) t = o.cur; } else o.coarserSince = null;
      if (!onScreen) t = Math.max(t, o.cur); // off screen: keep what it has, never load finer for it
      t = Math.min(Math.max(t, Math.min(MIN_LEVEL, lv.length - 1)), o.set.coarsest); // (?lodmin= never below a model's own coarsest: Codex robot-lod-1)
      items.push({ o, t, pri: onScreen ? _s.radius * k / d : 0 });
    }
    // 2. GPU budget: biggest on screen first; each level costs once however many copies show it. A copy whose level
    //    would not fit waits at the finest coarser level that does (the coarsest levels are always resident).
    items.sort((a, b) => b.pri - a.pri);
    const counted = new Set(); let total = 0;
    for (const set of this.sets.values()) { const L = set.levels[set.coarsest]; if (L) { counted.add(L); total += L.gpu; } }
    for (const it of items) {
      const lv = it.o.set.levels; let t = it.t;
      const cost = (i) => (counted.has(lv[i]) ? 0 : lv[i].gpu) + (i === 0 && lv[1] && !counted.has(lv[1]) ? lv[1].gpu : 0); // L0 brings its shadow proxy L1
      while (t < it.o.set.coarsest && total + cost(t) > this.budget) t++;
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
      if (i < set.coarsest && L.users.size === 0 && !needed.has(L)) spare.push(L);
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
  // tint: a colour for this copy's materials; look: { key, fn(clone, source) -> material } -- this copy's own version of
  // every material (the far shop's sets carry their own light: ./farshop.js), one per source material and key
  constructor(lib, set, { tint, look } = {}) {
    super(); this.lib = lib; this.set = set; this.tint = tint; this.look = look; this.cur = -1; this.target = -1; this.isLodObject = true;
    this.show(set.coarsest);
  }
  show(i) {
    const L = this.set.levels[i]; if (!L.scene || i === this.cur) return;
    const prev = this.cur >= 0 ? this.set.levels[this.cur] : null;
    const c = this.tinted(L.scene.clone(true));
    this.endFade(); // (a change during a change: the older level goes now)
    if (this.view && this.lib.fade) { // the shown level stays for the cross-fade (and in use: not evicted meanwhile)
      this.leaving = this.view; this.leavingLevel = prev; this.fadeStart = performance.now();
      setFade(this.leaving, 2); setFade(c, 0); this.lib.fading.add(this);
    } else { if (this.view) this.remove(this.view); prev?.users.delete(this); }
    this.dropProxy();
    this.add(c); this.view = c; this.cur = i; c.updateMatrixWorld(true);
    L.users.add(this); L.used = performance.now();
    if (i === 0) this.attachProxy();
  }
  stepFade(now) {
    const f = (now - this.fadeStart) / (FADE_S * 1000);
    if (f >= 1) this.endFade(); else { setFade(this.view, f); setFade(this.leaving, 2 + f); }
  }
  endFade() {
    if (!this.leaving) return;
    this.remove(this.leaving); if (this.leavingLevel !== this.set.levels[this.cur]) this.leavingLevel?.users.delete(this);
    this.leaving = this.leavingLevel = null; setFade(this.view, 1); this.lib.fading.delete(this);
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
    if (this.tint || this.look) c.traverse((m) => { // one tinted / looked material per source material and tint / look
      if (!m.isMesh) return; const src = m.material, key = src.uuid + (this.tint ? this.tint.join() : '') + (this.look ? '|' + this.look.key : '');
      let t = tintCache.get(key);
      if (!t) { t = src.clone(); if (this.tint) t.color.setRGB(...this.tint); if (this.look) t = this.look.fn(t, src) ?? t; tintCache.set(key, t); }
      m.material = t;
    });
    return c;
  }
  worldSphere(s) {
    const m = this.set.meta;
    s.center.set(0, m.dims[1] / 2, 0).applyMatrix4(this.matrixWorld);
    s.radius = m.radius * this.matrixWorld.getMaxScaleOnAxis(); return s;
  }
  visibleInTree() { let o = this; while (o) { if (!o.visible && !(o === this && o.userData.offBeam)) return false; o = o.parent; } return true; } // (offBeam: hidden only while the beam is off it -- index.js -- its level kept ready for when the beam comes)
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
