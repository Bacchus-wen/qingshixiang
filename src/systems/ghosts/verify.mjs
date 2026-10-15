// Offline only: node src/systems/ghosts/verify.mjs (Node 24).
// Generates both shader languages, without starting a browser, renderer or GPU context.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const root = new URL('../../../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three/webgpu') specifier = new URL('node_modules/three/src/Three.WebGPU.js', root).href;
  if (specifier === 'three/tsl') specifier = new URL('node_modules/three/src/Three.TSL.js', root).href;
  return next(specifier, context);
} });
const THREE = await import('three/webgpu');
const { mrt, output, velocity } = await import('three/tsl');
const { default: template } = await import('./index.js');
const { memoryMaskCPU } = await import('../../materials/memory.js');
const { default: WGSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js', root));
const { default: GLSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js', root));

function context() {
  return {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), api: {},
    memory: {
      origin: new THREE.Vector3(-4.4, 1, -13.6), dir: new THREE.Vector3(1, 0, -0.2).normalize(),
      angle: 0.36, range: 40, strength: 1,
    },
  };
}
const ghosts = Object.create(template), ctx = context();
await ghosts.init(ctx);
assert.equal(ctx.api.ghosts.count, 48);
assert.equal(ctx.api.ghosts.childCount, 2);
assert.equal(ctx.api.ghosts.waitingCount, 6);
assert.equal(ctx.api.ghosts.umbrellaCount, 8);
assert(ctx.api.ghosts.visibleCount > 0 && ctx.api.ghosts.visibleCount < 48);
assert.equal(ghosts.meshes.length, 5);
assert(ghosts.meshes.every(m => !m.castShadow && !m.receiveShadow && !m.material.transparent
  && m.material.depthWrite && m.material.depthTest && m.material.blending === THREE.NoBlending));

// Cold-start hidden slots must not contain InstancedMesh's default identity matrices.
const matrix = new THREE.Matrix4(), end = new THREE.Vector3();
for (let i = 0; i < 48; i++) if (!ghosts.visible[i]) {
  ghosts.heads.getMatrixAt(i, matrix);
  assert.equal(matrix.elements[13], -10000);
}
const initial = ghosts.people.map(p => ({ height: p.height, width: p.width, offset: p.offset, speed: p.speed }));
const twin = Object.create(template), twinCtx = context();
await twin.init(twinCtx);
assert.deepEqual(twin.people.map(p => ({ height: p.height, width: p.width, offset: p.offset, speed: p.speed })), initial);
const waiting = ghosts.people.filter(p => p.waiting).map(p => p.position.clone());

// Probe eight minutes of motion, including both turnarounds, kerbs and parent/child grips.
// Broad cone makes every instance observable for the matrix/pose checks.
ctx.memory.origin.set(0, 1, -28); ctx.memory.angle = Math.PI; ctx.memory.range = 200;
for (let t = 0; t <= 480; t += 2) {
  ghosts.update(1 / 60, t, ctx);
  let waiter = 0;
  for (let i = 0; i < 48; i++) {
    const p = ghosts.people[i], v = p.position;
    assert(v.z >= -70 && v.z <= 14);
    assert(v.y >= 0 && v.y <= 0.14);
    if (p.route.axis === 'z') assert(Math.abs(v.x) >= 3.8 && Math.abs(v.x) <= 4.6);
    else { assert(Math.abs(v.x) <= 4.2); assert(Math.abs(v.z + 42) < 4.5); }
    if (p.waiting) assert(v.equals(waiting[waiter++]));
    if (p.child) {
      const adult = ghosts.people[p.partner];
      assert.equal(v.z, adult.position.z);
      assert(Math.abs(Math.abs(v.x - adult.position.x) - 0.5) < 1e-8);
      const hands = [];
      for (const [person, index, other] of [[p, i, adult], [adult, p.partner, p]]) {
        const side = Math.sign((other.position.x - person.position.x) * Math.cos(person.yaw));
        const slot = index * 6 + (side === -1 ? 3 : 5);
        ghosts.limbs.getMatrixAt(slot, matrix);
        hands.push(new THREE.Vector3(0, 0.5, 0).applyMatrix4(matrix));
      }
      assert(hands[0].distanceTo(hands[1]) < 1e-5, 'adult and child hands must meet');
    }
  }
  for (const mesh of ghosts.meshes) assert(mesh.instanceMatrix.array.every(Number.isFinite));
}

// Same t produces the same result regardless of dt/history, including closed-eye intervals.
ghosts.update(0.1, 123, ctx);
const snapshot = ghosts.meshes.map(m => m.instanceMatrix.array.slice());
ctx.memory.strength = 0; ghosts.update(0.1, 999, ctx);
assert.equal(ghosts.group.visible, false);
assert(ghosts.meshes.every(m => m.count === 0));
ctx.memory.strength = 1; ghosts.update(1 / 60, 123, ctx);
ghosts.meshes.forEach((m, i) => assert.deepEqual(m.instanceMatrix.array, snapshot[i]));

// Sweep a narrow cone through the crowd: CPU broad phase must retain a figure if
// any sampled silhouette point is inside the exact CPU mask (including umbrella edges).
ctx.memory.origin.set(-4.4, 1, -13.6); ctx.memory.angle = 0.2; ctx.memory.range = 30;
const probe = new THREE.Vector3();
for (let step = 0; step < 24; step++) {
  const angle = step * Math.PI / 12;
  ctx.memory.dir.set(Math.cos(angle), -0.05, Math.sin(angle)).normalize();
  ghosts.update(1 / 60, 23, ctx);
  for (let i = 0; i < 48; i++) {
    const p = ghosts.people[i];
    for (const y of [0.05, 0.5, 0.9, p.umbrella ? 1.25 : 1]) for (const x of [-0.3, 0, 0.3]) {
      ghosts.pointAt(p, x, y, 0, probe);
      if (memoryMaskCPU(probe, ctx.memory) > 0) assert(ghosts.visible[i], 'CPU cull clipped an illuminated body');
    }
    if (!ghosts.visible[i]) {
      ghosts.heads.getMatrixAt(i, matrix);
      assert.equal(matrix.elements[13], -10000, 'stale hidden instance');
    }
  }
}
ctx.memory.origin.set(1000, 1000, 1000); ghosts.update(0, 23, ctx);
assert(ghosts.meshes.every(m => m.count === 0), 'far cone must submit no instances');
console.log('PASS population, deterministic motion, hand contact, kerbs, culling and reopen checks');

function makeRenderer(forceWebGL) {
  const renderer = new THREE.WebGPURenderer({ forceWebGL, canvas: {
    width: 1280, height: 720, style: {}, addEventListener() {}, removeEventListener() {},
  } });
  renderer.backend.capabilities = { getUniformBufferLimit: () => 16384 };
  renderer.backend.hasFeature = () => false;
  renderer.hasFeature = () => false;
  renderer.backend.extensions = { has: () => false };
  const target = new THREE.RenderTarget(1280, 720, { count: 2 });
  target.textures[0].name = 'output'; target.textures[1].name = 'velocity';
  renderer.setRenderTarget(target); renderer.setMRT(mrt({ output, velocity }));
  return { renderer, target };
}
const diagnostics = [], warn = console.warn, error = console.error;
console.warn = (...v) => diagnostics.push(v.join(' '));
console.error = (...v) => diagnostics.push(v.join(' '));
try {
  for (const Builder of [WGSLNodeBuilder, GLSLNodeBuilder]) {
    // Three caches generated TSL functions per backend. Never reuse a backend across languages.
    const { renderer, target } = makeRenderer(Builder === GLSLNodeBuilder);
    for (const mesh of ghosts.meshes) {
      const builder = new Builder(mesh, renderer);
      builder.camera = ctx.camera; builder.scene = ctx.scene; builder.build();
      assert(builder.vertexShader.length > 500 && builder.fragmentShader.length > 500);
      assert.match(builder.fragmentShader, /discard/);
      assert(!/NaN|undefined/.test(builder.vertexShader + builder.fragmentShader));
    }
    console.log(`PASS ${Builder.name}: all 5 instanced batches, opaque discard and velocity MRT`);
    target.dispose();
  }
  assert.deepEqual(diagnostics, []);
} finally { console.warn = warn; console.error = error; }
ghosts.dispose(ctx); twin.dispose(twinCtx);
assert.equal(ctx.scene.children.length, 0); assert.equal(ctx.api.ghosts, undefined);
console.log('PASS offline verification. Visuals, GPU execution and frame rate await external screenshot review.');
