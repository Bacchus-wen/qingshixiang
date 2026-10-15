// Offline checks for a restricted worker. Does not replace tools/shot.mjs:
// node src/systems/rain/verify.mjs (Node 24, installed three 0.186.1).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Use a single TSL module graph with Three's internal shader builders.
const root = new URL('../../../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three/webgpu') specifier = new URL('node_modules/three/src/Three.WebGPU.js', root).href;
  if (specifier === 'three/tsl') specifier = new URL('node_modules/three/src/Three.TSL.js', root).href;
  return next(specifier, context);
} });
const THREE = await import('three/webgpu');
const { mrt, output, velocity } = await import('three/tsl');
const { default: template } = await import('./index.js');
const { default: WGSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js', root));
const { default: GLSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js', root));

const renderer = new THREE.WebGPURenderer({ canvas: {
  width: 1280, height: 720, style: {}, addEventListener() {}, removeEventListener() {},
} });
// Shader generation only: no fake GPU execution, no device/context creation.
renderer.backend.capabilities = { getUniformBufferLimit: () => 65536 };
renderer.backend.hasFeature = () => false;
renderer.hasFeature = () => false;
renderer.backend.extensions = { has: () => false };
// The real engine renders color + velocity into an MRT before TRAA/bloom.
const target = new THREE.RenderTarget(1280, 720, { count: 2 });
target.textures[0].name = 'output'; target.textures[1].name = 'velocity';
renderer.setRenderTarget(target); renderer.setMRT(mrt({ output, velocity }));
const diagnostics = [];
const warn = console.warn, error = console.error;
console.warn = (...v) => diagnostics.push(v.join(' '));
console.error = (...v) => diagnostics.push(v.join(' '));

function context(gpu, low) {
  return {
    THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    renderer: { backend: { isWebGPUBackend: gpu }, computeAsync: async () => {} },
    params: new URLSearchParams(low ? 'q=low' : ''),
    world: { rain: 1, wind: new THREE.Vector2(0.4, -0.15) },
    memory: { origin: new THREE.Vector3(-4, 1.45, 1.6), dir: new THREE.Vector3(8, -0.25, -11.6).normalize(), angle: 0.32, range: 40, strength: 1 },
    api: {},
  };
}

try {
  for (const gpu of [false, true]) for (const low of [true, false]) {
    const rain = Object.create(template), ctx = context(gpu, low);
    await rain.init(ctx);
    assert.equal(ctx.api.rain.particleCount, gpu ? (low ? 20000 : 60000) : (low ? 2400 : 6000));
    assert.equal(rain.meshes.length, 5);
    assert(rain.meshes.every(m => m.material.transparent && !m.material.depthWrite));
    if (gpu) {
      const b = new WGSLNodeBuilder(null, renderer); b.compute = rain.compute; b.build();
      assert.match(b.computeShader, /@compute/);
      assert.match(b.computeShader, /read_write/);
      assert.match(b.computeShader, /if/);
    } else {
      // Actual simulation: swept ground crossing, exact receiver location and life.
      const p = rain.cpuDrops.array, h = rain.cpuImpacts.array;
      p.set([0, 0.01, 0, 12], 0);
      rain.update(1 / 60, 1 / 60, ctx);
      assert(Math.abs(h[0] - 0.4 * (0.01 / 12)) < 1e-6);
      assert(Math.abs(h[2] + 0.15 * (0.01 / 12)) < 1e-6);
      assert(Math.abs(h[1] - 0.018) < 1e-6);
      assert(h[3] > 0 && h[3] < 1 / 60);
      assert(p[1] > 15 && p[1] < 16);
      for (let frame = 1; frame <= 120; frame++) rain.update(1 / 60, frame / 60, ctx);
      assert(p.every(Number.isFinite)); assert(h.every(Number.isFinite));
      for (let i = 0; i < rain.count; i++) {
        assert(p[i * 4] >= -13 && p[i * 4] <= 13);
        assert(p[i * 4 + 1] >= 0 && p[i * 4 + 1] <= 16);
        assert(p[i * 4 + 2] >= -48 && p[i * 4 + 2] <= 16);
      }
      // Changing wind at dt=0 must not translate particles or distant curtains.
      const before = p.slice(), travel = rain.u.windTravel.value.clone();
      ctx.world.wind.set(-4, 3); rain.update(0, 2, ctx);
      assert.deepEqual(p, before); assert(rain.u.windTravel.value.equals(travel));
      ctx.world.rain = 0; ctx.memory.strength = 0; rain.sync(ctx);
      assert.equal(rain.group.visible, false); assert.equal(rain.u.strength.value, 0);
      ctx.world.rain = 1; ctx.memory.origin.set(1, 2, 3); rain.sync(ctx);
      assert(rain.u.origin.value.equals(ctx.memory.origin));
      assert.equal(rain.group.visible, true);
    }
    const Builder = gpu ? WGSLNodeBuilder : GLSLNodeBuilder;
    for (const mesh of rain.meshes) {
      const b = new Builder(mesh, renderer); b.camera = ctx.camera; b.scene = ctx.scene; b.build();
      assert(b.vertexShader.length > 500 && b.fragmentShader.length > 500);
      assert(!/NaN|undefined/.test(b.vertexShader + b.fragmentShader));
    }
    const mode = ctx.api.rain.mode, count = ctx.api.rain.particleCount;
    rain.dispose(ctx); assert.equal(ctx.scene.children.length, 0); assert.equal(ctx.api.rain, undefined);
    console.log(`PASS ${mode} ${low ? 'low' : 'default'}: ${count} particles, 5 materials generated`);
  }
  assert.deepEqual(diagnostics, [], 'shader generation must not emit warnings or errors');
  console.log('PASS offline checks. GPU execution, screenshot and frame rate remain unverified.');
} finally { console.warn = warn; console.error = error; }
