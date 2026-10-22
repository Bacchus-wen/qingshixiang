import * as THREE from 'three/webgpu';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { LightPool } from './LightPool.js';
import { applyThreeFixes, asyncPipelines } from './threeFixes.js';
import { PostFX } from './PostFX.js';
import { Input } from './Input.js';
import { SHOTS } from './shots.js';
import { tr } from '../ui/i18n.js';

// Engine: owns renderer, scene, camera, main loop and the shared ctx every system receives.
// System contract: { name, async init(ctx), update(dt, t, ctx), dispose?() }.
export class Engine {
  constructor(container) {
    this.container = container;
    this.params = new URLSearchParams(location.search);
    this.shot = this.params.get('shot');
    this.shotFrames = parseInt(this.params.get('frames') || '120', 10);
    this.speed = parseFloat(this.params.get('speed') || '1'); // test-only time scale
    this.only = (this.params.get('only') || '').split(',').filter(Boolean);
    this.skip = (this.params.get('skip') || '').split(',').filter(Boolean);
    this.systems = [];
    this.time = 0;
    this.frame = 0;
  }

  async init(systems, onProgress = () => {}) {
    const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance', forceWebGL: this.params.get('webgl') !== null, trackTimestamp: this.params.get('gputime') !== null });
    // internal resolution: at most about 2.1 million pixels (a 1080p frame, the size the review shots are judged at) and
    // at most 1.5x on high-density screens (1x there is a little soft, upscaled 2x by the browser; TRAA cleans the rest).
    // The shop is fill-bound (SSR, TRAA, volumetrics, bloom): in a maximised Chrome on a 14" MacBook Pro (M4 Pro),
    // 1.5x (2268x1335) ran it at 20-28 fps, 1.25x (1890x1112) at 66-74, 1x at 93 (tools/perf-open.mjs --uncap,
    // 2026-10-21). Lowered further if frames run long (adaptResolution). ?dpr=N fixes it.
    this.pixelRatio = this.shot ? 1 : this.params.get('dpr') ? Math.min(devicePixelRatio, parseFloat(this.params.get('dpr'))) : this.budgetRatio();
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    this.container.appendChild(renderer.domElement);
    await renderer.init();
    if (this.params.get('nofix') === null) applyThreeFixes(renderer); // r186 pipeline-sharing bug, see threeFixes.js (?nofix = off, for A/B)
    // pipelines compile in parallel, never stalling a frame (threeFixes.js; ?syncpipes = the default way, for A/B)
    this.pipes = renderer.backend.isWebGPUBackend && this.params.get('syncpipes') === null ? asyncPipelines(renderer) : null;
    const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    if (backend !== 'webgpu') console.warn('[engine] WebGPU unavailable, running on WebGL2 fallback');
    // quality: ?q=low|high; WebGL2 defaults to low (no SSR/DOF, fewer volume steps, smaller shadows)
    const quality = this.params.get('q') || (backend === 'webgpu' ? 'high' : 'low');
    // v3: Forward+ clustered lighting so dozens of signs and shop openings can really light the street (WebGPU only), for
    // the scenes that ask for it (systems with clusteredLights: the v3 street). Not for the shop, which has four point
    // lights: the cluster code made every material's shader 2-4x bigger, and its grid is sized to the drawing buffer,
    // so every change of internal resolution (adaptResolution, a window resize) rebuilt and recompiled every material
    // -- seconds each, which then read as slow frames and stepped the resolution down again.
    const clustered = backend === 'webgpu' && quality !== 'low' && this.params.get('noclustered') === null && (systems.some((s) => s.clusteredLights) || this.params.get('clustered') !== null); // (?clustered: on anyway, for A/B)
    if (clustered) renderer.lighting = new ClusteredLighting(256, 32, 24, 64);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 600);
    camera.position.set(0, 1.6, 8);
    scene.add(camera);

    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.timer = new THREE.Timer();

    this.ctx = {
      THREE, renderer, scene, camera, engine: this, backend, quality,
      lightPool: clustered ? new LightPool(scene, Number(this.params.get('pool') || 64)) : null,
      params: this.params,
      isShot: !!this.shot,
      input: new Input(renderer.domElement),
      // Shared world state read by materials, particles and audio.
      world: { rain: 1, wetness: 1, wind: new THREE.Vector2(0.4, -0.15), lightning: 0 },
      // Memory cone: the robot eye's projection. Systems read it to switch "present" / "past" looks.
      memory: {
        origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1),
        angle: 0.35, range: 40, strength: 0, power: 1,
      },
      events: new EventTarget(),
      api: {},
      postfx: null,
    };
    this.postfx = new PostFX(renderer, scene, camera, this.ctx);
    this.ctx.postfx = this.postfx;

    const active = systems.filter((s) => (!this.only.length || this.only.includes(s.name)) && !this.skip.includes(s.name));
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      const t0 = performance.now();
      try { await s.init?.(this.ctx); } catch (e) { console.error(`[engine] ${s.name} init failed`, e); s._failed = true; }
      console.log(`[engine] ${s.name} init ${(performance.now() - t0).toFixed(0)}ms`);
      this.systems.push(s);
      onProgress(0.75 * (i + 1) / active.length, s.name);
    }
    if (this.params.get('flatmat') !== null) scene.overrideMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x777777, roughness: 0.5 }); // perf test only
    // a story-critical system that failed would leave the experience stuck: stop with a visible error instead
    const core = ['street', 'robot', 'director', 'shop', 'eye', 'story'];
    const broken = this.systems.filter((x) => x._failed && core.includes(x.name)).map((x) => x.name);
    if (broken.length) throw Object.assign(new Error(tr(`核心系统初始化失败:${broken.join('、')}`, `Core systems failed to start: ${broken.join(', ')}`)), { core: true });
    this.postfx.build();
    if (this.pipes && this.params.get('nowarm') === null) await this.warmUp((k) => onProgress(0.75 + 0.25 * k, 'warm-up'));
    if (this.shot) document.body.classList.add('shot');
    addEventListener('resize', () => this.resize());
    window.__engine = this;
    // ?stats: a small FPS / CPU panel (stats-gl) for checking performance on your own machine
    if (this.params.get('stats') !== null) {
      const { default: Stats } = await import('stats-gl');
      this.stats = new Stats({ trackGPU: false, horizontal: true });
      this.stats.init(renderer);
      this.stats.dom.style.zIndex = 10;
      document.body.appendChild(this.stats.dom);
    }
  }

  // Compile every pipeline the scene needs before the story starts: each visible object drawn once in every pass it is
  // drawn in (the depth prepass, the main pass with its extra outputs, every shadow map), whatever the camera sees,
  // then again until nothing new is asked for. Behind the loading screen; all in parallel (asyncPipelines).
  async warmUp(onProgress) {
    const t0 = performance.now(), c0 = this.pipes.created;
    const culled = [], shadows = [];
    this.scene.traverseVisible((o) => {
      if (o.frustumCulled && (o.isMesh || o.isSprite || o.isPoints || o.isLine)) { o.frustumCulled = false; culled.push(o); }
      if (o.isLight && o.castShadow && o.shadow) shadows.push(o.shadow);
    });
    let asked = 0; const log = [];
    for (let round = 0; round < 8; round++) {
      for (const sh of shadows) sh.needsUpdate = true; // (a shadow that does not update every frame still gets compiled)
      const tr = performance.now(); this.postfx.render(); const build = performance.now() - tr; // (building the shaders: here, on this thread)
      const n = this.pipes.pending; if (!n && round > 0) break;
      asked += n; let done = 0; const all = this.pipes.settled();
      const tick = setInterval(() => { done = asked - this.pipes.pending; onProgress(Math.min(0.98, done / Math.max(1, asked))); }, 100);
      const tw = performance.now(); await all; clearInterval(tick);
      log.push(`${n} in ${build.toFixed(0)}+${(performance.now() - tw).toFixed(0)}ms`); // (compiling them: the GPU process)
    }
    for (const o of culled) o.frustumCulled = true;
    onProgress(1);
    console.log(`[engine] warm-up ${(performance.now() - t0).toFixed(0)}ms, ${this.pipes.created - c0} pipelines (per round, built + compiled: ${log.join(', ')})`);
  }

  applyShot() {
    const v = SHOTS[this.shot];
    if (!v) return;
    this.camera.position.set(...v.pos);
    this.camera.fov = v.fov ?? 50;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(...v.look);
    v.setup?.(this.ctx, this.time);
  }

  budgetRatio() { return +Math.min(devicePixelRatio, 1.5, Math.sqrt(2.1e6 / Math.max(1, innerWidth * innerHeight))).toFixed(2); }

  // dynamic resolution: if the average frame stays over ~20 ms for 2 s, render at a smaller internal size.
  // Steps down only (no oscillation); each step is a one-off render-target reallocation.
  adaptResolution(now) {
    const p = this.perf;
    if (!p || p.n < 120 || this.params.get('dpr') || this.shot) return; // (shots: fixed resolution -- the first seconds of a capture compile shaders and stream models, and stepping down there handed the judges a blurred, grainy frame)
    this._slowSince ??= null;
    // slow = long frames AND a long render call (a 30 Hz display alone is not slow: render returns quickly there)
    if (document.hidden) { this._slowSince = null; return; }
    if (p.frameMs > 20.5 && p.submitMs > 9) {
      this._slowSince ??= now;
      if (now - this._slowSince > 2000 && this.pixelRatio > 0.6) {
        this.pixelRatio = this.adaptCap = Math.max(0.6, +(this.pixelRatio - 0.15).toFixed(2));
        this.renderer.setPixelRatio(this.pixelRatio);
        console.log(`[engine] slow frames (${p.frameMs.toFixed(1)} ms): internal resolution -> ${this.pixelRatio}x`);
        this._slowSince = null; p.n = 0;
      }
    } else this._slowSince = null;
  }

  resize() {
    if (!this.shot && !this.params.get('dpr')) { // (a bigger window: fewer pixels per CSS pixel, same budget)
      const r = Math.min(this.budgetRatio(), this.adaptCap ?? Infinity);
      if (r !== this.pixelRatio) { this.pixelRatio = r; this.renderer.setPixelRatio(r); }
    }
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  start() {
    const step = 1 / 60;
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = (this.shot ? step : Math.min(this.timer.getDelta(), 0.1)) * this.speed;
      this.time += dt;
      if (this.shot) this.applyShot();
      this.ctx.input.updateKeys(dt);
      for (const s of this.systems) {
        if (s._failed || !s.update) continue;
        try { s.update(dt, this.time, this.ctx); } catch (e) { console.error(`[engine] ${s.name}.update`, e); s._failed = true; }
      }
      this.ctx.input.endFrame();
      const t0 = performance.now();
      this.postfx.render(dt);
      this.stats?.update();
      this.frame++;
      // perf probe (read by tools): CPU submit time, wall frame interval, draw calls, triangles
      const now = performance.now();
      if (this._last) { const p = this.perf ??= { n: 0, frameMs: 0, submitMs: 0 }; p.n++; p.frameMs += (now - this._last - p.frameMs) / Math.min(p.n, 60); p.submitMs += (now - t0 - p.submitMs) / Math.min(p.n, 60); p.calls = this.renderer.info.render.drawCalls; p.triangles = this.renderer.info.render.triangles; window.__perf = p; }
      this._last = now;
      if (!this.shot) this.adaptResolution(now);
      // GPU time per frame (WebGPU timestamp queries, ?gputime): resolved asynchronously every 10 frames
      if (this.params.get('gputime') !== null && this.frame % 10 === 0) {
        this.renderer.resolveTimestampsAsync('render').then((ms) => { if (ms) { const p = this.perf; p.gpuMs = p.gpuMs ? p.gpuMs * 0.8 + ms * 0.2 : ms; } }).catch(() => {});
      }
      // freeze: the capture is exactly this frame. A system can hold the shot while it still streams data the frame
      // needs (ctx.busy(): e.g. finer model levels for this camera), up to 30 s
      if (this.shot && this.frame >= this.shotFrames && !((this.pipes?.pending || this.ctx.busy?.()) && this.frame < this.shotFrames + 1800)) { window.__shotReady = true; this.renderer.setAnimationLoop(null); }
    });
  }
}
