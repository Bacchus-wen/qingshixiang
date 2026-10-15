import * as THREE from 'three/webgpu';
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
    this.only = (this.params.get('only') || '').split(',').filter(Boolean);
    this.skip = (this.params.get('skip') || '').split(',').filter(Boolean);
    this.systems = [];
    this.time = 0;
    this.frame = 0;
  }

  async init(systems, onProgress = () => {}) {
    const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(this.shot ? 1 : Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    this.container.appendChild(renderer.domElement);
    await renderer.init();
    const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    if (backend !== 'webgpu') console.warn('[engine] WebGPU unavailable, running on WebGL2 fallback');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 600);
    camera.position.set(0, 1.6, 8);
    scene.add(camera);

    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.timer = new THREE.Timer();

    this.ctx = {
      THREE, renderer, scene, camera, engine: this, backend,
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
    this.postfx.build();
    addEventListener('resize', () => this.resize());
    window.__engine = this;
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

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  start() {
    const step = 1 / 60;
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = this.shot ? step : Math.min(this.timer.getDelta(), 0.1);
      this.time += dt;
      if (this.shot) this.applyShot();
      for (const s of this.systems) {
        if (s._failed || !s.update) continue;
        try { s.update(dt, this.time, this.ctx); } catch (e) { console.error(`[engine] ${s.name}.update`, e); s._failed = true; }
      }
      this.ctx.input.endFrame();
      this.postfx.render(dt);
      this.frame++;
      if (this.shot && this.frame === this.shotFrames) window.__shotReady = true;
    });
  }
}
