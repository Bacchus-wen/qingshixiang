// Offline scene/shader checks: no browser, GPU context, service or Blender.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
const root = new URL('../../../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three/webgpu') specifier = new URL('node_modules/three/src/Three.WebGPU.js', root).href;
  if (specifier === 'three/tsl') specifier = new URL('node_modules/three/src/Three.TSL.js', root).href;
  return next(specifier, context);
} });
const THREE = await import('three/webgpu');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { mrt, output, velocity } = await import('three/tsl');
const { default: ghostsTemplate, crowd } = await import('./index.js');
const { preparePeople } = await import('./people.js');
const { default: trafficTemplate, prepareCar } = await import('../traffic/index.js');
const { memoryMaskCPU } = await import('../../materials/memory.js');
const { default: WGSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js', root));
const { default: GLSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js', root));
async function asset(path, prepare) {
  const bytes = await readFile(new URL(path, root));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const result = prepare(gltf.scene);
  gltf.scene.traverse(n => { if (n.isMesh) { n.geometry.dispose(); (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose()); } });
  return result;
}
const context = (q = '') => ({ params: new URLSearchParams(q), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), api: {}, memory: {
  origin: new THREE.Vector3(-4.4, 1, -13.6), dir: new THREE.Vector3(1, 0, -.2).normalize(), angle: .36, range: 40, strength: 0,
} });
const ctx = context(), ghosts = Object.create(ghostsTemplate);
ghosts.loadPeople = () => asset('assets/models/people.glb', preparePeople);
await ghosts.init(ctx);
assert(ghosts.meshes.every(m => m.count > 0 && !m.frustumCulled), 'closed-eye cold start must submit EVERY material for prewarm');
const traffic = Object.create(trafficTemplate);
traffic.loadCar = () => asset('assets/models/props/car.glb', prepareCar);
await traffic.init(ctx);
const meshes = [...ghosts.meshes, ...traffic.parts.map(p => p.mesh)];
assert(meshes.length <= 12, 'combined scene draw budget');
assert(meshes.every(m => m.isInstancedMesh && m.geometry.groups.length <= 1));
assert.equal(ctx.api.traffic.count, 4);
assert(ghosts.people.every(p => p.height >= 1.55 && p.height <= 1.8));
for (const side of [-1, 1]) {
  const people = ghosts.people.filter(p => Math.sign(p.route.fixed) === side);
  assert(people.length >= 6 && people.length <= 10);
  assert(people.filter(p => p.umbrella).length > people.length / 2);
  assert(people.some(p => p.waiting) && people.some(p => !p.waiting));
}
for (let frame = 0; frame < 30; frame++) {
  ghosts.update(1/60, frame/60, ctx); traffic.update(1/60, frame/60, ctx);
  assert(meshes.every(m => m.count > 0 && !m.frustumCulled), `prewarm frame ${frame}`);
}
ghosts.update(0, 2, ctx); traffic.update(0, 2, ctx);
assert(meshes.every(m => m.count === 0), 'closed eye after warmup');
ctx.memory.flood = 1;
for (let t = 0; t <= 480; t += 2) {
  ghosts.update(1/60, t, ctx); traffic.update(1/60, t, ctx);
  assert.equal(ctx.api.ghosts.visibleCount, 16, 'flood covers both sides including behind cone');
  assert.equal(ctx.api.traffic.visibleCount, 4);
  assert(traffic.cars.every(c => c.position.z >= -40 && c.position.z <= -6));
  assert(ghosts.people.every(p => Math.abs(p.position.x) >= 3.4 && Math.abs(p.position.x) < 5));
  assert(meshes.every(m => m.instanceMatrix.array.every(Number.isFinite)));
}
ghosts.update(0, 23, ctx); traffic.update(0, 23, ctx);
const snapshot = meshes.map(m => m.instanceMatrix.array.slice());
ctx.memory.flood = 0;
ghosts.update(0, 999, ctx); traffic.update(0, 999, ctx);
assert(meshes.every(m => m.count === 0));
ctx.memory.flood = 1;
ghosts.update(0, 23, ctx); traffic.update(0, 23, ctx);
meshes.forEach((m,i) => assert.deepEqual(m.instanceMatrix.array, snapshot[i]));
ctx.memory.flood = 0; ctx.memory.strength = 1;
for (let angle = 0; angle < Math.PI*2; angle += .3) {
  ctx.memory.dir.set(Math.cos(angle), 0, Math.sin(angle));
  ghosts.update(0, 23, ctx); traffic.update(0, 23, ctx);
  ghosts.people.forEach((p,i) => {
    for (const y of [.1,.9,1.25]) {
      const probe = p.position.clone(); probe.y += p.height*y;
      if (memoryMaskCPU(probe, ctx.memory) > 0) assert(ghosts.visible[i]);
    }
  });
}
ctx.params.set('memlife', '1'); ctx.memory.strength = 0; crowd.value = 0;
ghosts.update(0, 23, ctx); traffic.update(0, 23, ctx);
assert.equal(ctx.api.ghosts.visibleCount, 16); assert.equal(ctx.api.traffic.visibleCount, 4);
assert(!ctx.scene.children.some(n => n.isLight));
// Neon initializes after these systems in the engine: late arrival must recolour
// existing instances, without rebuilding materials or changing the draw count.
ctx.api.neon = { signs: [{ x: -5, y: 3, z: -20, tint: '#24e9ee' }, { x: 5, y: 3, z: -20, tint: '#ff3ba7' }] };
ghosts.update(0, 23, ctx);
for (let i = 0; i < ghosts.people.length; i++) {
  const expected = new THREE.Color(ghosts.people[i].position.x < 0 ? '#24e9ee' : '#ff3ba7');
  const tint = ghosts.meshes[0].geometry.attributes.lifeTint;
  assert(Math.abs(tint.getX(i) - expected.r) < 1e-6);
  assert(Math.abs(tint.getY(i) - expected.g) < 1e-6);
  assert(Math.abs(tint.getZ(i) - expected.b) < 1e-6);
}
const lamps = traffic.parts.find(p => p.name === 'lamps').geometry;
for (let i = 0; i < lamps.attributes.position.count; i++) {
  const front = lamps.attributes.position.getZ(i) > 0;
  assert.equal(lamps.attributes.lampTint.getX(i), 1);
  assert(Math.abs(lamps.attributes.lampTint.getY(i) - (front ? .82 : .12)) < 1e-6);
  assert(Math.abs(lamps.attributes.lampTint.getZ(i) - (front ? .5 : .05)) < 1e-6);
  assert.equal(lamps.attributes.lampPower.getX(i), front ? 6 : 3);
}
const pools = traffic.parts.find(p => p.name === 'wet-road-pools');
assert.equal(pools.mesh.material.blending, THREE.AdditiveBlending);
assert.equal(pools.mesh.material.depthWrite, false);
ctx.scene.traverse(n => assert(!n.isLight, 'memory life must not change light counts'));
console.log('PASS actual GLBs: cold start, <=12 draws, population, flood, close/reopen, debug, eight-minute motion');
function rendererFor(forceWebGL) {
  const r = new THREE.WebGPURenderer({ forceWebGL, canvas: { width: 1280, height: 720, style: {}, addEventListener() {}, removeEventListener() {} } });
  r.backend.capabilities = { getUniformBufferLimit: () => 16384 };
  r.backend.hasFeature = r.hasFeature = () => false;
  r.backend.extensions = { has: () => false };
  const target = new THREE.RenderTarget(1280, 720, { count: 2 });
  target.textures[0].name = 'output'; target.textures[1].name = 'velocity';
  r.setRenderTarget(target); r.setMRT(mrt({ output, velocity }));
  return { r, target };
}
for (const Builder of [WGSLNodeBuilder, GLSLNodeBuilder]) {
  const { r, target } = rendererFor(Builder === GLSLNodeBuilder);
  for (const mesh of meshes) {
    const builder = new Builder(mesh, r); builder.camera = ctx.camera; builder.scene = ctx.scene; builder.build();
    assert(builder.vertexShader.length > 500 && builder.fragmentShader.length > 500);
    assert(!/NaN|undefined/.test(builder.vertexShader + builder.fragmentShader));
  }
  target.dispose(); console.log(`PASS ${Builder.name}: all batches with velocity MRT`);
}
ghosts.dispose(ctx); traffic.dispose(ctx); crowd.value = 1;
assert.equal(ctx.scene.children.length, 0);
const fallback = Object.create(ghostsTemplate), fallbackCtx = context('memlife=1');
fallback.loadPeople = async () => null;
await fallback.init(fallbackCtx); assert.equal(fallbackCtx.api.ghosts.count, 16);
assert(fallback.meshes.length <= 5); fallback.dispose(fallbackCtx);
console.log('PASS fallback and resource disposal. GPU execution / appearance remain external screenshot gates.');
