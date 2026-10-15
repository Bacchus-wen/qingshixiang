// CPU-only contract checks. No renderer, browser, server, network or Blender.
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import cat from './index.js';

function fixture() {
  const scene = new THREE.Group();
  const add = (name, parent, x = 0, y = 0, z = 0) => {
    const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); parent.add(p); return p;
  };
  const body = add('body', scene, 0, .29, 0);
  const head = add('head', body, 0, .075, .225);
  add('ear_l', head, -.048, .067, .043); add('ear_r', head, .048, .067, .043);
  for (const [name, x, z] of [['leg_fl', -.061, .17], ['leg_fr', .061, .17],
    ['leg_bl', -.061, -.16], ['leg_br', .061, -.16]]) add(name, body, x, -.026, z);
  let tail = body;
  for (let i = 0; i < 5; i++) tail = add(`tail_${i}`, tail, 0, i === 0 ? .022 : 0, i === 0 ? -.225 : -.096);
  const material = new THREE.MeshStandardMaterial(); material.name = 'cat_fur';
  body.add(new THREE.Mesh(new THREE.BoxGeometry(.15, .2, .4), material));
  return { scene };
}

function context(query = '') {
  const robotParent = new THREE.Group(); robotParent.position.set(-5, .14, -10);
  const robot = new THREE.Group(); robot.position.set(.42, 0, -3.5); robotParent.add(robot);
  return { scene: new THREE.Scene(), params: new URLSearchParams(query),
    memory: { strength: 0, dir: new THREE.Vector3(1, .12, 0) }, world: { lightning: 0 },
    api: { robot: { root: robot }, director: { phase: 'wait' } } };
}
function step(s, ctx, seconds, hz = 60) {
  for (let i = 0; i < Math.round(seconds * hz); i++) s.update(1 / hz, (i + 1) / hz, ctx);
}

const originalLoad = GLTFLoader.prototype.loadAsync;
try {
  GLTFLoader.prototype.loadAsync = async () => { throw new Error('missing GLB'); };
  const missing = { ...cat }, missingCtx = context();
  await missing.init(missingCtx);
  assert.equal(missing.root, null);
  assert.equal(missingCtx.api.cat, undefined);
  missing.update(1 / 60, 0, missingCtx);

  GLTFLoader.prototype.loadAsync = async () => ({ scene: new THREE.Group() });
  const invalid = { ...cat };
  await invalid.init(context());
  assert.equal(invalid.root, null, 'missing pivots quietly reject malformed models');

  GLTFLoader.prototype.loadAsync = async () => fixture();
  const s = { ...cat }, ctx = context();
  await s.init(ctx);
  assert.equal(s.state, 'sleep');
  assert.ok(s.origin.distanceTo(new THREE.Vector3(-4.13, .14, -14.02)) < 1e-10,
    'placement uses robot world position, including ancestors');
  const mesh = s.nodes.body.children.find((o) => o.isMesh);
  assert.ok(mesh.material.isMeshStandardNodeMaterial && mesh.castShadow && mesh.receiveShadow);
  assert.equal(mesh.material.metalness, 0);
  const floor = s.root.position.y;
  step(s, ctx, .5);
  const breath = s.nodes.body.position.y;
  step(s, ctx, .5);
  assert.notEqual(s.nodes.body.position.y, breath);
  ctx.memory.strength = .3; step(s, ctx, .1);
  assert.equal(s.state, 'sleep');
  ctx.memory.strength = .31; step(s, ctx, 3);
  assert.equal(s.state, 'alert');
  assert.ok(s.awake > .97);
  ctx.memory.dir.set(0, .2, -1); step(s, ctx, 2);
  assert.ok(s.yaw > .9 && s.pitch < 0, 'head follows world-space beam, with neck limits');
  ctx.memory.strength = 0; step(s, ctx, .5);
  assert.equal(s.state, 'alert', 'beam flicker cannot repeatedly wake/reset the cat');

  ctx.world.lightning = .8; step(s, ctx, .1);
  assert.ok(s.shockAge < .11);
  step(s, ctx, 1);
  assert.ok(s.shockAge > 1, 'held lightning does not retrigger');
  ctx.world.lightning = 0; step(s, ctx, .1);
  ctx.world.lightning = .8; step(s, ctx, .05);
  assert.ok(s.shockAge < .06, 'another strike retriggers');
  ctx.world.lightning = 0;
  ctx.api.director.phase = 'end'; step(s, ctx, 1);
  assert.equal(s.state, 'leave');
  assert.equal(s.root.position.z, s.origin.z, 'rise precedes translation');
  step(s, ctx, 1);
  assert.ok(s.root.position.z < s.origin.z - .4);
  assert.equal(s.root.position.x, s.origin.x);
  assert.equal(s.root.position.y, floor);
  assert.ok(Math.abs(s.nodes.leg_fl.rotation.x + s.nodes.leg_fr.rotation.x) < 1e-6);
  assert.ok(s.nodes.tail_0.rotation.x > 1);
  step(s, ctx, 3);
  assert.ok(s.presence.value > 0 && s.presence.value < 1, 'exit fades without popping');
  step(s, ctx, .6);
  assert.equal(s.state, 'gone');
  assert.equal(s.root.parent, null);
  const finalZ = s.root.position.z;
  step(s, ctx, 1);
  assert.equal(s.root.position.z, finalZ);
  s.dispose(ctx);
  assert.equal(ctx.api.cat, undefined);

  // Same fixed time produces the same poses; independent of global Math.random/time.
  const a = { ...cat }, b = { ...cat }, ca = context('cat=walk'), cb = context('cat=walk');
  await a.init(ca); await b.init(cb);
  step(a, ca, 3, 30); step(b, cb, 3, 60);
  assert.ok(a.root.position.distanceTo(b.root.position) < 1e-10);
  assert.ok(a.nodes.tail_4.quaternion.angleTo(b.nodes.tail_4.quaternion) < 1e-6);
  a.dispose(ca); b.dispose(cb);
  console.log('cat: optional loading, placement, materials, sleep/alert, lightning, exit and deterministic poses passed');
} finally {
  GLTFLoader.prototype.loadAsync = originalLoad;
}
