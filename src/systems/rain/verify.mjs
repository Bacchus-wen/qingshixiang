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
const { syncMemory, mains } = await import('../../materials/memory.js');
const { createNeonState, syncNeon } = await import('./neon.js');
const { default: WGSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js', root));
const { default: GLSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js', root));

function shaderRenderer(gpu) {
  const renderer = new THREE.WebGPURenderer({ forceWebGL: !gpu, canvas: {
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
  return renderer;
}
const diagnostics = [];
const warn = console.warn, error = console.error;
console.warn = (...v) => diagnostics.push(v.join(' '));
console.error = (...v) => diagnostics.push(v.join(' '));

function context(gpu, low) {
  return {
    THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    renderer: { backend: { isWebGPUBackend: gpu }, computeAsync: async () => {} },
    params: new URLSearchParams(low ? 'q=low' : ''),
    world: { rain: 1, lightning: 0, wind: new THREE.Vector2(0.4, -0.15) },
    memory: { origin: new THREE.Vector3(-4, 1.45, 1.6), dir: new THREE.Vector3(8, -0.25, -11.6).normalize(), angle: 0.32, range: 40, strength: 1 },
    api: {},
  };
}

try {
  // Nearest-source selection, deterministic half-second refresh and memory gates.
  const selectionCtx = context(false, true);
  const signs = Array.from({ length: 12 }, (_, i) => ({
    id: i, x: 0, y: 1, z: -i - 1, alive: i === 1 ? 1 : 0,
    tint: i % 2 ? '#ff3ba7' : '#24e9ee',
  })).reverse();
  const originalOrder = signs.slice();
  selectionCtx.api.neon = { enabled: true, mode: 'cone', signs };
  const state = createNeonState(THREE), camera = new THREE.Vector3();
  selectionCtx.memory.strength = 0;
  syncNeon(state, selectionCtx, camera, 0);
  assert.deepEqual(state.selected.map(s => s.id), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(signs, originalOrder, 'must not reorder another system\'s signs');
  assert.deepEqual(state.positions.array.map(p => p.w), [0, 1, 0, 0, 0, 0, 0, 0]);
  assert(state.colors.array.every(c => c.w === 0), 'closed eye cannot revive dead signs');
  const cyan = new THREE.Color('#24e9ee');
  assert.equal(state.colors.array[0].x, cyan.r);
  assert.equal(state.colors.array[0].y, cyan.g);
  assert.equal(state.colors.array[0].z, cyan.b);
  camera.z = -20;
  syncNeon(state, selectionCtx, camera, 0.499);
  assert.equal(state.selected[0].id, 0, 'camera movement does not sort every frame');
  syncNeon(state, selectionCtx, camera, 0.5);
  assert.deepEqual(state.selected.map(s => s.id), [11, 10, 9, 8, 7, 6, 5, 4]);
  selectionCtx.memory.origin.set(0, 1, 0);
  selectionCtx.memory.dir.set(0, 0, -1); selectionCtx.memory.strength = 1;
  syncNeon(state, selectionCtx, camera, 0.51);
  assert(state.colors.array.every(c => c.w === 1), 'source memory updates before next selection');
  selectionCtx.memory.dir.set(0, 0, 1);
  syncNeon(state, selectionCtx, camera, 0.52);
  assert(state.colors.array.every(c => c.w === 0), 'unlit sources outside cone stay dead');
  selectionCtx.api.neon.mode = 'past';
  syncNeon(state, selectionCtx, camera, 0.53);
  assert.equal(state.past.value, 1); assert(state.colors.array.every(c => c.w === 1));
  camera.z = 0;
  syncNeon(state, selectionCtx, camera, 0);
  assert.equal(state.selected[0].id, 0, 'rewinding deterministic time refreshes selection');
  selectionCtx.api.neon.signs = [signs[0]];
  syncNeon(state, selectionCtx, camera, 0.01);
  assert.equal(state.selected.length, 1);
  assert(state.colors.array.slice(1).every(c => c.lengthSq() === 0), 'unused slots clear all colour');
  selectionCtx.api.neon.enabled = false;
  syncNeon(state, selectionCtx, camera, 0.02);
  assert.equal(state.selected.length, 0);
  assert(state.positions.array.every(p => p.lengthSq() === 0));
  assert(state.colors.array.every(c => c.lengthSq() === 0));
  console.log('PASS neon selection: nearest 8, cadence, rewind, linear RGB, source memory, past/off and clearing');
  for (const gpu of [false, true]) for (const low of [true, false]) {
    // Three caches compiled TSL functions by backend, so never share a backend
    // between GLSL and WGSL builders (memoryMask now uses MaterialX noise Fns).
    const renderer = shaderRenderer(gpu);
    const rain = Object.create(template), ctx = context(gpu, low);
    ctx.api.neon = { enabled: true, mode: 'cone', signs };
    syncMemory(ctx.memory);
    await rain.init(ctx);
    assert.equal(ctx.api.rain.particleCount, gpu ? (low ? 20000 : 60000) : (low ? 2400 : 6000));
    assert.equal(rain.meshes.length, 5);
    assert.equal(ctx.api.rain.lightGated, true);
    assert(rain.meshes.every(m => m.material.transparent && !m.material.depthWrite));
    assert(rain.lights.every(light => light.intensity.value === 0));
    assert.equal(rain.neon.selected.length, 8);
    assert(!ctx.scene.children.some(o => o.isLight), 'rain must not create THREE lights');
    // Real SpotLights, including a transformed parent and changing target.
    const parent = new THREE.Group(); parent.position.set(2, 0, -3);
    const lamp = new THREE.SpotLight(0xe4ebf2, 650, 26, 0.62, 0.7, 2);
    lamp.position.set(3, 6.8, -3); lamp.target.position.set(-0.5, 0, -5);
    parent.add(lamp, lamp.target); ctx.scene.add(parent);
    ctx.api.street = { lamp };
    ctx.world.lightning = 0.75; ctx.camera.position.set(1, 2, 3); rain.sync(ctx);
    const light = rain.lights[0];
    assert(light.position.value.equals(new THREE.Vector3(5, 6.8, -6)));
    assert(light.direction.value.distanceTo(lamp.target.position.clone().sub(lamp.position).normalize()) < 1e-12);
    assert.equal(light.outer.value, Math.cos(lamp.angle));
    assert.equal(light.inner.value, Math.cos(lamp.angle * (1 - lamp.penumbra)));
    assert.equal(light.range.value, 26); assert.equal(light.intensity.value, 650);
    assert(light.color.value.equals(lamp.color));
    assert(rain.u.camera.value.equals(ctx.camera.position)); assert.equal(rain.u.lightning.value, 0.75);
    lamp.intensity = 90; lamp.target.position.x += 2; lamp.penumbra = 0; lamp.distance = 0;
    rain.sync(ctx); assert.equal(light.intensity.value, 90); assert.equal(light.range.value, 1e6);
    assert(light.inner.value > light.outer.value); // No equal-edge smoothstep.
    assert(light.direction.value.distanceTo(lamp.target.position.clone().sub(lamp.position).normalize()) < 1e-12);
    lamp.visible = false; rain.sync(ctx); assert.equal(light.intensity.value, 0);
    delete ctx.api.street; parent.removeFromParent();
    ctx.world.lightning = 0; ctx.camera.position.set(0, 0, 0); rain.sync(ctx);
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
      assert(Math.abs(h[0] - 0.4 * (0.01 / 14.4)) < 1e-6);
      assert(Math.abs(h[2] + 0.15 * (0.01 / 14.4)) < 1e-6);
      assert(Math.abs(h[1] - 0.018) < 1e-6);
      assert(h[3] > 0 && h[3] < 1 / 60);
      assert(p[1] > 15 && p[1] < 16);
      assert(Math.abs(p[0] - h[0]) > 1 && Math.abs(p[2] - h[2]) > 1, 'next fall must change column');
      for (const [z, scale] of [[0, 1.2], [14, 0.9], [30, 0.6]]) {
        ctx.camera.position.set(0, 0, z); p.set([0, 0.5, 0, 12], 0);
        rain.update(1 / 60, 1 / 60, ctx);
        assert(Math.abs(p[1] - (0.5 - 12 * scale / 60)) < 1e-6, 'near/middle/far fall speed');
      }
      ctx.camera.position.set(0, 0, 0);
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
      assert.equal(rain.group.visible, false);
      ctx.world.rain = 1; ctx.memory.origin.set(1, 2, 3); rain.sync(ctx);
      assert.equal(rain.group.visible, true);
    }
    const Builder = gpu ? WGSLNodeBuilder : GLSLNodeBuilder;
    for (const mesh of rain.meshes) {
      const b = new Builder(mesh, renderer); b.camera = ctx.camera; b.scene = ctx.scene; b.build();
      assert(b.vertexShader.length > 500 && b.fragmentShader.length > 500);
      assert(!/NaN|undefined/.test(b.vertexShader + b.fragmentShader));
      if (mesh.name === 'rain-streaks') assert.match(b.fragmentShader, /rainLight\.w/, 'Incident light gates streak opacity');
      if (mesh.name === 'rain-splashes') assert.match(b.fragmentShader, /rainHitLight\.w/, 'Dark splash opacity is also gated');
      if (mesh.name !== 'rain-splashes') {
        // The two packed arrays compile on both backends, and mains is the exact
        // shared live uniform (no CPU copy that could lag by the selection interval).
        const uniforms = [...b.uniforms.vertex, ...b.uniforms.fragment];
        assert(uniforms.some(u => u.node === rain.neon.positions));
        assert(uniforms.some(u => u.node === rain.neon.colors));
        assert(uniforms.some(u => u.node === mains));
      }
    }
    const mode = ctx.api.rain.mode, count = ctx.api.rain.particleCount;
    rain.dispose(ctx); assert.equal(ctx.scene.children.length, 0); assert.equal(ctx.api.rain, undefined);
    console.log(`PASS ${mode} ${low ? 'low' : 'default'}: ${count} particles, 5 materials generated`);
  }
  assert.deepEqual(diagnostics, [], 'shader generation must not emit warnings or errors');
  console.log('PASS offline checks. GPU execution, screenshot and frame rate remain unverified.');
} finally { console.warn = warn; console.error = error; }
