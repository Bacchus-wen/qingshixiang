// Offline only: real GLB parsing, instance updates and both shader builders.
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
const { default: template, prepareCar, makeCars, poseCar } = await import('./index.js');
const { crowd } = await import('../ghosts/state.js');
const { default: WGSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js', root));
const { default: GLSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js', root));
const bytes = await readFile(new URL('assets/models/props/car.glb', root));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const traffic = Object.create(template);
traffic.loadCar = async () => prepareCar(gltf.scene);
const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), params: new URLSearchParams('memlife=1'), api: {},
  memory: { origin: new THREE.Vector3(), dir: new THREE.Vector3(0,0,-1), angle: .3, range: 40, strength: 0 } };
await traffic.init(ctx);
assert.equal(ctx.api.traffic.count, 11);
assert.equal(traffic.cars.filter(c => c.speed === 0).length, 4);
assert.equal(traffic.cars.filter(c => c.axis === 'x').length, 4);
assert.equal(traffic.parts.length, 4);
assert(traffic.parts.every(p => p.mesh.isInstancedMesh && !p.geometry.groups.length));
for (const p of traffic.parts) assert.equal(p.mesh.instanceMatrix.count, 11 * p.multiplier);
const parked = traffic.cars.filter(c => c.speed === 0).map(c => c.position.clone());
for (let t = 0; t <= 480; t += .25) {
  traffic.update(.25,t,ctx);
  for (const c of traffic.cars) {
    const along = c.axis === 'x' ? c.position.x : c.position.z;
    assert(along >= c.min && along <= c.max);
    if (c.axis === 'z') assert(Math.abs(c.position.x) + .95 < 3.4, 'Body stays off pavement');
  }
  // Same-lane headway, including wrap, stays above the 4.2 m car length.
  for (const c of traffic.cars.filter(c => c.speed)) for (const other of traffic.cars) {
    if (c === other || c.axis !== other.axis || c.fixed !== other.fixed) continue;
    const a = c.axis === 'x' ? c.position.x : c.position.z;
    const b = c.axis === 'x' ? other.position.x : other.position.z;
    const d = Math.abs(a-b);
    assert(Math.min(d,c.max-c.min-d) > 4.2);
  }
  for (const p of traffic.parts) {
    assert.equal(p.mesh.count,11*p.multiplier);
    assert(p.mesh.instanceMatrix.array.every(Number.isFinite));
  }
}
traffic.cars.filter(c => c.speed === 0).forEach((c,i) => assert(c.position.equals(parked[i])));
for (const car of makeCars().filter(c => c.speed)) {
  poseCar(car,0); const before = car.position.clone(); poseCar(car,.01);
  const movement = car.position.clone().sub(before);
  assert((car.axis === 'x' ? movement.x : movement.z) * car.direction > 0, 'Travel matches headlights');
}
traffic.update(0,23,ctx);
const snapshot = traffic.parts.map(p => p.mesh.instanceMatrix.array.slice());
traffic.update(0,999,ctx); traffic.update(0,23,ctx);
traffic.parts.forEach((p,i) => assert.deepEqual(p.mesh.instanceMatrix.array,snapshot[i]));
ctx.params.delete('memlife'); crowd.value = 0;
traffic.update(0,23,ctx); assert(!traffic.group.visible);
assert(traffic.parts.every(p => p.mesh.count === 0));
crowd.value = 1; ctx.params.set('memlife','1'); traffic.update(0,23,ctx);
ctx.scene.traverse(n => assert(!n.isLight));
for (const Builder of [WGSLNodeBuilder, GLSLNodeBuilder]) {
  const renderer = new THREE.WebGPURenderer({ forceWebGL: Builder === GLSLNodeBuilder,
    canvas: { width:1280, height:720, style:{}, addEventListener(){}, removeEventListener(){} } });
  renderer.backend.capabilities = { getUniformBufferLimit: () => 65536 };
  renderer.backend.hasFeature = renderer.hasFeature = () => false;
  renderer.backend.extensions = { has: () => false };
  const target = new THREE.RenderTarget(1280,720,{ count:2 });
  target.textures[0].name = 'output'; target.textures[1].name = 'velocity';
  renderer.setRenderTarget(target); renderer.setMRT(mrt({ output, velocity }));
  for (const p of traffic.parts) {
    const builder = new Builder(p.mesh,renderer); builder.scene = ctx.scene; builder.camera = ctx.camera; builder.build();
    assert(builder.vertexShader.length > 500 && builder.fragmentShader.length > 500);
    assert(!/NaN|undefined/.test(builder.vertexShader + builder.fragmentShader));
  }
  target.dispose();
  console.log(`PASS ${Builder.name}: 4 instanced traffic materials`);
}
traffic.dispose(ctx); assert.equal(ctx.scene.children.length,0); assert(!ctx.api.traffic);
gltf.scene.traverse(n => { if(n.isMesh) { n.geometry.dispose(); for(const m of [n.material].flat()) m.dispose(); } });
console.log('PASS 11 cars, 4 parked / 7 moving, 4 batches, 8-minute routes/headway, direction, seek, memory gate and disposal');
