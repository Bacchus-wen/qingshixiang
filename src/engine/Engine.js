import * as THREE from 'three/webgpu';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { LightPool } from './LightPool.js';
import { applyThreeFixes } from './threeFixes.js';
import { PostFX } from './PostFX.js';
import { Input } from './Input.js';
import { SHOTS } from './shots.js';

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
    // internal resolution: up to 1.5x on high-density screens (1x there is visibly soft, upscaled 2x by the browser;
    // TRAA cleans the rest); lowered automatically if frames run long (see adaptResolution). ?dpr=2 for full density
    this.pixelRatio = this.shot ? 1 : Math.min(devicePixelRatio, parseFloat(this.params.get('dpr') || '1.5'));
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    this.container.appendChild(renderer.domElement);
    await renderer.init();
    if (this.params.get('nofix') === null) applyThreeFixes(renderer); // r186 pipeline-sharing bug, see threeFixes.js (?nofix = off, for A/B)
    const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    if (backend !== 'webgpu') console.warn('[engine] WebGPU unavailable, running on WebGL2 fallback');
    // quality: ?q=low|high; WebGL2 defaults to low (no SSR/DOF, fewer volume steps, smaller shadows)
    const quality = this.params.get('q') || (backend === 'webgpu' ? 'high' : 'low');
    // v3: Forward+ clustered lighting so dozens of signs and shop openings can really light the street (WebGPU only)
    const clustered = backend === 'webgpu' && quality !== 'low' && this.params.get('noclustered') === null;
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
      onProgress((i + 1) / active.length, s.name);
    }
    if (this.params.get('flatmat') !== null) scene.overrideMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x777777, roughness: 0.5 }); // perf test only
    // a story-critical system that failed would leave the experience stuck: stop with a visible error instead
    const core = ['street', 'robot', 'director', 'shop', 'eye', 'story'];
    const broken = this.systems.filter((x) => x._failed && core.includes(x.name)).map((x) => x.name);
    if (broken.length) throw new Error(`核心系统初始化失败:${broken.join('、')}`);
    this.postfx.build();
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

  applyShot() {
    const v = SHOTS[this.shot];
    if (!v) return;
    this.camera.position.set(...v.pos);
    this.camera.fov = v.fov ?? 50;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(...v.look);
    v.setup?.(this.ctx, this.time);
  }

  // dynamic resolution: if the average frame stays over ~20 ms for 2 s, render at a smaller internal size.
  // Steps down only (no oscillation); each step is a one-off render-target reallocation.
  adaptResolution(now) {
    const p = this.perf;
    if (!p || p.n < 120 || this.params.get('dpr')) return;
    this._slowSince ??= null;
    // slow = long frames AND a long render call (a 30 Hz display alone is not slow: render returns quickly there)
    if (document.hidden) { this._slowSince = null; return; }
    if (p.frameMs > 20.5 && p.submitMs > 9) {
      this._slowSince ??= now;
      if (now - this._slowSince > 2000 && this.pixelRatio > 0.6) {
        this.pixelRatio = Math.max(0.6, +(this.pixelRatio - 0.15).toFixed(2));
        this.renderer.setPixelRatio(this.pixelRatio);
        console.log(`[engine] slow frames (${p.frameMs.toFixed(1)} ms): internal resolution -> ${this.pixelRatio}x`);
        this._slowSince = null; p.n = 0;
      }
    } else this._slowSince = null;
  }

  resize() {
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
      if (this.shot && this.frame >= this.shotFrames && !(this.ctx.busy?.() && this.frame < this.shotFrames + 1800)) { window.__shotReady = true; this.renderer.setAnimationLoop(null); }
    });
  }
}
