// Pure Node scene/logic checks; no renderer, browser, listening port or Blender.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import { float } from 'three/tsl';
import system from './index.js';

const ctx = { THREE, scene: new THREE.Scene(), params: new URLSearchParams(), api: {},
  world: { wind: new THREE.Vector2(0.4, -0.15), rain: 1, lightning: 0 } };
const street = new THREE.Group(); street.name = 'street'; ctx.scene.add(street);
const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.59), material);
notice.renderOrder = 4; notice.userData.dynamic = true; notice.rotation.y = Math.PI / 2; street.add(notice);
const paint = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), material);
paint.renderOrder = 4; paint.userData.dynamic = true; street.add(paint);
const merged = new THREE.Mesh(notice.geometry.clone(), material); merged.name = 'merged_paper'; merged.renderOrder = 4; street.add(merged);
const laundry = new THREE.Group(); laundry.userData.prop = 'props2/laundry'; laundry.rotation.y = -Math.PI / 2; street.add(laundry);
const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7, 4, 6), material); cloth.name = 'garment_shirt'; laundry.add(cloth);
const rail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, 0.02), material); rail.name = 'laundry_rail'; laundry.add(rail);
const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 8, 0), new THREE.Vector3(0, 7, -2), new THREE.Vector3(0, 8, -4),
]), 24, 0.012, 4), material); street.add(wire);
const glass = new THREE.MeshStandardNodeMaterial({ color: 0x0b0c0d, roughness: 0.08 }); glass.emissiveNode = float(0);
const window = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 1.1), glass); window.name = 'merged_glass'; street.add(window);
const balcony = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.6), material); balcony.position.set(4.55, 3.3, -5); street.add(balcony);
const lamp = new THREE.SpotLight(0xffffff, 650, 26, 0.62, 0.7); lamp.position.set(3.1, 6.8, -3); lamp.target.position.set(-0.5, 0, -5); ctx.scene.add(lamp, lamp.target); ctx.api.street = { lamp };
const originalGeometry = notice.geometry, mergedGeometry = merged.geometry;
const wind = Object.assign({}, system); wind.init(ctx);
assert.equal(wind.api.counts.cloth, 1); assert.equal(wind.api.counts.notice, 1); assert.equal(wind.api.counts.cable, 1);
assert.equal(wind.api.counts.debris, 32); assert(wind.api.counts.runoff > 0); assert.equal(wind.api.counts.glass, 1);
assert.equal(merged.material, material); assert.equal(merged.geometry, mergedGeometry);
assert.equal(paint.material, material); assert.equal(rail.material, material);
assert.equal(material.positionNode, null); assert(window.material.roughnessNode);
for (const mesh of [notice, cloth, wire]) {
  assert(mesh.material.positionNode); const w = mesh.geometry.attributes.windWeight, uv = mesh.geometry.attributes.uv;
  let pinned = 0, loose = 0;
  for (let i = 0; i < w.count; i++) {
    const pin = mesh === wire ? uv.getX(i) === 0 || uv.getX(i) === 1 : uv.getY(i) === 1;
    if (pin) { assert(w.getX(i) < 1e-12); pinned++; }
    if (w.getX(i) > 0.99) loose++;
  }
  assert(pinned > 0 && loose > 0, 'fixed supports and loose middle/hem');
}
const firstGust = wind.nextGust;
wind.update(0, firstGust, ctx); const duration = wind.gustDuration;
assert(duration >= 2 && duration <= 4);
wind.update(0, firstGust + duration / 2, ctx); assert(ctx.world.windGust > 0.8);
wind.update(0, firstGust + duration, ctx); assert(ctx.world.windGust < 0.3);
let previous = firstGust;
for (let i = 0; i < 12; i++) {
  assert(wind.nextGust - previous >= 20 && wind.nextGust - previous <= 40);
  previous = wind.nextGust; wind.update(0, previous, ctx);
  assert(wind.gustDuration >= 2 && wind.gustDuration <= 4);
}
wind.update(0, 0, ctx); const calm = ctx.world.windGust;
ctx.world.lightning = 1; wind.update(0, 0, ctx); assert(Math.abs(ctx.world.windGust - calm - 0.1) < 1e-9);
ctx.world.lightning = 0;
assert.equal(wind.nextGust, firstGust, 'seeded clock rewind');
const bit = wind.bits[0]; bit.x = 3.4 - bit.radius - 0.001; bit.z = -10;
wind.update(0.1, 0.1, ctx); assert(bit.stopped, 'curb collision'); const stopX = bit.x;
for (let i = 0; i < 3600; i++) wind.update(1 / 60, i / 60, ctx);
assert.equal(bit.x, stopX); assert.deepEqual(ctx.world.wind.toArray(), [0.4, -0.15]);
for (const mesh of wind.owned) {
  assert(mesh.visible); assert.equal(mesh.frustumCulled, false);
  if (mesh.isInstancedMesh) assert(mesh.instanceMatrix.array.every(Number.isFinite));
}
assert(lamp.visible); assert.equal(lamp.intensity, 650);
const m = new THREE.Matrix4(), v = new THREE.Vector3();
for (const bit of wind.bits) {
  bit.mesh.getMatrixAt(bit.i, m);
  const p = bit.mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) assert(v.fromBufferAttribute(p, i).applyMatrix4(m).y >= 0.0119, 'no ground penetration');
}
wind.dispose(ctx);
assert.equal(notice.geometry, originalGeometry); assert.equal(notice.material, material); assert.equal(window.material, glass);
assert.equal(ctx.world.windGust, 0); assert(!ctx.api.wind);
const isolated = Object.assign({}, system);
const alone = { ...ctx, scene: new THREE.Scene(), api: {}, params: new URLSearchParams('only=wind&q=low&windGust=1') };
isolated.init(alone); isolated.update(1 / 60, 1, alone);
assert.equal(alone.world.windGust, 1); assert.equal(isolated.bits.length, 24);
assert.equal(isolated.lights[0].intensity.value, 0); isolated.dispose(alone);
// Verify actual optimized GLB UV orientation without launching Blender.
const data = readFileSync(new URL('../../../assets/models/props2/laundry.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
gltf.scene.userData.prop = 'props2/laundry';
gltf.scene.traverse(mesh => { if (mesh.isMesh) mesh.material = material; });
alone.scene.add(gltf.scene);
const actual = Object.assign({}, system); actual.init(alone);
assert.equal(actual.api.counts.cloth, 3);
for (const item of actual.swaying) {
  const p = item.mesh.geometry.attributes.position, w = item.mesh.geometry.attributes.windWeight;
  let highest = 0, lowest = 0;
  for (let i = 1; i < p.count; i++) {
    if (p.getY(i) > p.getY(highest)) highest = i;
    if (p.getY(i) < p.getY(lowest)) lowest = i;
  }
  assert(w.getX(highest) < 1e-6, 'real GLB clips pinned');
  assert(w.getX(lowest) > 0.99, 'real GLB hem free');
}
actual.dispose(alone);
console.log('PASS wind: seeded gust timing, supports, merge protection, curb/ground collision, lights, low/isolated mode, disposal');
