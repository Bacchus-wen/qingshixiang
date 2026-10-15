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
const { preparePeople } = await import('./people.js');
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
// Simulate a missing GLB without network or a browser.
ghosts.loadPeople = async () => { throw new Error('fixture: missing GLB'); };
const fallbackWarnings = [], originalWarn = console.warn;
console.warn = (...args) => fallbackWarnings.push(args.join(' '));
try { await ghosts.init(ctx); } finally { console.warn = originalWarn; }
assert.equal(fallbackWarnings.length, 1);
assert.equal(ctx.api.ghosts.source, 'procedural');
assert.equal(ctx.api.ghosts.count, 52);
assert.equal(ctx.api.ghosts.childCount, 2);
assert.equal(ctx.api.ghosts.waitingCount, 6);
assert.equal(ctx.api.ghosts.umbrellaCount, 8);
assert(ctx.api.ghosts.visibleCount > 0 && ctx.api.ghosts.visibleCount < 52);
assert.equal(ghosts.meshes.length, 5);
assert(ghosts.meshes.every(m => !m.castShadow && !m.receiveShadow && !m.material.transparent
  && m.material.depthWrite && m.material.depthTest && m.material.blending === THREE.NoBlending));

// Cold-start hidden slots must not contain InstancedMesh's default identity matrices.
const matrix = new THREE.Matrix4(), end = new THREE.Vector3();
for (let i = 0; i < 52; i++) if (!ghosts.visible[i]) {
  ghosts.heads.getMatrixAt(i, matrix);
  assert.equal(matrix.elements[13], -10000);
}
const initial = ghosts.people.map(p => ({ height: p.height, width: p.width, offset: p.offset, speed: p.speed }));
const twin = Object.create(template), twinCtx = context();
twin.loadPeople = async () => null;
await twin.init(twinCtx);
assert.deepEqual(twin.people.map(p => ({ height: p.height, width: p.width, offset: p.offset, speed: p.speed })), initial);
const waiting = ghosts.people.filter(p => p.waiting).map(p => p.position.clone());

// Probe eight minutes of motion, including both turnarounds, kerbs and parent/child grips.
// Broad cone makes every instance observable for the matrix/pose checks.
ctx.memory.origin.set(0, 1, -28); ctx.memory.angle = Math.PI; ctx.memory.range = 200;
for (let t = 0; t <= 480; t += 2) {
  ghosts.update(1 / 60, t, ctx);
  let waiter = 0;
  for (let i = 0; i < 52; i++) {
    const p = ghosts.people[i], v = p.position;
    assert(v.z >= -70 && v.z <= 14);
    assert(v.y >= 0 && v.y <= 0.14);
    if (p.route.axis === 'z') assert(Math.abs(v.x) >= 3.8 && Math.abs(v.x) <= 4.6);
    else { assert(Math.abs(v.x) <= 4.2); assert.equal(v.z, p.route.fixed); }
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
  for (let i = 0; i < 52; i++) {
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

// Synthetic Y-up meshes exercise the GLB normalization/instancing path, including
// nonidentity mesh transforms and duplicate part names. This does not validate
// Blender's actual export; that remains the external Blender/screenshot gate.
function fixture() {
  const scene = new THREE.Scene();
  for (let type = 0; type < 8; type++) {
    const root = new THREE.Group(); root.name = `person_${type}`;
    root.userData.height = type === 2 ? 1.1 : 1.7;
    const h = root.userData.height;
    for (const name of ['body', 'leg_l', 'leg_r', 'arm_l', 'arm_r', ...(type === 1 ? ['bag'] : [])]) {
      const joint = name === 'bag' ? 'arm_r' : name;
      const arm = joint.startsWith('arm'), side = joint.endsWith('_l') ? -1 : 1;
      const geometry = new THREE.BoxGeometry(.10 * h, (arm ? .30 : .45) * h, .08 * h);
      geometry.translate(0, arm ? -.15 * h : 0, 0);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.position.set(joint === 'body' ? 0 : side * .14 * h, (arm ? .80 : .5) * h, 0);
      // Model pivots/vertex transforms must survive conversion, not be discarded.
      mesh.rotation.y = .17;
      mesh.name = name; mesh.userData = { part: name, joint, swing: joint === 'body' ? 0 : .15 };
      if (arm) mesh.userData.hand = [0, -.3 * h, 0];
      if (name === 'bag') mesh.userData.hideWhenHolding = true;
      root.add(mesh);
    }
    scene.add(root);
  }
  return scene;
}
const fixtureScene = fixture();
const model = Object.create(template), modelCtx = context();
model.loadPeople = async () => preparePeople(fixtureScene);
await model.init(modelCtx);
assert.equal(modelCtx.api.ghosts.source, 'glb');
assert.equal(modelCtx.api.ghosts.count, 52);
assert.equal(new Set(model.people.map(p => p.modelType)).size, 8);
assert.equal(model.meshes.length, 41);
modelCtx.memory.origin.set(0, 1, -28); modelCtx.memory.angle = Math.PI; modelCtx.memory.range = 200;
for (const t of [0, 1.5, 23, 123, 300, 480]) {
  model.update(1 / 60, t, modelCtx);
  for (let i = 0; i < model.people.length; i++) {
    const p = model.people[i], rig = model.rigs[p.modelType];
    assert(model.visible[i]);
    if (p.partner >= 0) {
      const other = model.people[p.partner];
      const side = Math.sign((other.position.x - p.position.x) * Math.cos(p.yaw));
      const arm = rig.parts.find(part => part.name === (side < 0 ? 'arm_l' : 'arm_r'));
      arm.mesh.getMatrixAt(i, matrix);
      const actual = arm.hand.clone().applyMatrix4(matrix);
      const expected = p.position.clone().add(other.position).multiplyScalar(.5);
      expected.y += Math.min(p.height, other.height) * .64;
      assert(actual.distanceTo(expected) < 1e-5, 'GLB hands must meet exactly');
      const bag = rig.parts.find(part => part.hideWhenHolding);
      if (bag && side === 1) { bag.mesh.getMatrixAt(i, matrix); assert.equal(matrix.elements[13], -10000); }
    }
    for (let type = 0; type < 8; type++) if (type !== p.modelType) {
      for (const part of model.rigs[type].parts) {
        part.mesh.getMatrixAt(i, matrix);
        assert.equal(matrix.elements[13], -10000, 'other model types must stay hidden');
      }
    }
  }
  assert(model.meshes.every(mesh => mesh.instanceMatrix.array.every(Number.isFinite)));
}
model.update(0, 23, modelCtx);
const modelSnapshot = model.meshes.map(mesh => mesh.instanceMatrix.array.slice());
modelCtx.memory.strength = 0; model.update(0, 456, modelCtx);
assert(model.meshes.every(mesh => mesh.count === 0));
modelCtx.memory.strength = 1; model.update(0, 23, modelCtx);
model.meshes.forEach((mesh, i) => assert.deepEqual(mesh.instanceMatrix.array, modelSnapshot[i]));
// Narrow cone: probe actual animated vertices, including shoulders, hands and props.
modelCtx.memory.angle = .18; modelCtx.memory.range = 30;
modelCtx.memory.origin.set(-4.4, 1, -13.6);
const sample = new THREE.Vector3();
for (let step = 0; step < 24; step++) {
  modelCtx.memory.dir.set(Math.cos(step * Math.PI / 12), -.05, Math.sin(step * Math.PI / 12)).normalize();
  model.update(0, 23, modelCtx);
  for (let i = 0; i < model.people.length; i++) {
    const p = model.people[i];
    // Evaluate full pose even for culled figures to test the broad phase.
    model.drawModel(p, i);
    for (const part of model.rigs[p.modelType].parts) {
      part.mesh.getMatrixAt(i, matrix);
      const attr = part.geometry.getAttribute('position');
      for (let v = 0; v < attr.count; v++) {
        sample.fromBufferAttribute(attr, v).applyMatrix4(matrix);
        if (memoryMaskCPU(sample, modelCtx.memory) > 0) assert(model.visible[i], 'GLB broad phase clipped a limb');
      }
    }
    if (!model.visible[i]) model.hidePerson(p, i);
  }
}
modelCtx.memory.origin.set(1000, 1000, 1000); model.update(0, 23, modelCtx);
assert(model.meshes.every(mesh => mesh.count === 0));
const broken = fixture(); broken.remove(broken.getObjectByName('person_7'));
assert.throws(() => preparePeople(broken), /person_7/);
const badModel = Object.create(template), badCtx = context();
badModel.loadPeople = async () => preparePeople(broken);
console.warn = () => {};
try { await badModel.init(badCtx); } finally { console.warn = originalWarn; }
assert.equal(badCtx.api.ghosts.source, 'procedural');
badModel.dispose(badCtx);
console.log('PASS GLB fixtures: 8 types, 52 slots, grips, transforms, culling, reopen and malformed-asset fallback');

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
    for (const mesh of [...ghosts.meshes, model.rigs[1].parts[3].mesh]) {
      const builder = new Builder(mesh, renderer);
      builder.camera = ctx.camera; builder.scene = ctx.scene; builder.build();
      assert(builder.vertexShader.length > 500 && builder.fragmentShader.length > 500);
      assert.match(builder.fragmentShader, /discard/);
      assert(!/NaN|undefined/.test(builder.vertexShader + builder.fragmentShader));
    }
    console.log(`PASS ${Builder.name}: fallback and model batches, opaque discard and velocity MRT`);
    target.dispose();
  }
  assert.deepEqual(diagnostics, []);
} finally { console.warn = warn; console.error = error; }
ghosts.dispose(ctx); twin.dispose(twinCtx); model.dispose(modelCtx);
for (const scene of [fixtureScene, broken]) scene.traverse(node => {
  if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); }
});
assert.equal(ctx.scene.children.length, 0); assert.equal(ctx.api.ghosts, undefined);
console.log('PASS offline verification. Visuals, GPU execution and frame rate await external screenshot review.');
