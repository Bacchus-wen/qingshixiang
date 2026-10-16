import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { mergeStatic } from './merge.js';

test('merge retains facade/room attributes and root-local placement; dynamic shutters stay separate', () => {
  const root = new THREE.Group(); root.position.set(2, 0, 3);
  const material = new THREE.MeshStandardNodeMaterial();
  const originals = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('ccRoom', new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => [i, 1, 2, 1]).flat(), 4));
    const mesh = new THREE.Mesh(g, material); mesh.position.x = i * 3;
    root.add(mesh); originals.push(mesh);
  }
  const dynamic = new THREE.Mesh(new THREE.BoxGeometry(), material);
  dynamic.userData.dynamic = true; root.add(dynamic);
  mergeStatic(root); root.updateMatrixWorld(true);
  const merged = root.children.find(m => m.name.startsWith('merged_'));
  assert.ok(merged.geometry.getAttribute('ccRoom'), 'room indices must survive batching');
  assert.equal(merged.geometry.getAttribute('ccRoom').count, 12);
  assert.equal(merged.geometry.getAttribute('ccRoom').getX(6), 1);
  const bounds = new THREE.Box3().setFromObject(merged);
  assert.equal(bounds.min.x, 1.5, 'root transform must not be applied twice');
  assert.equal(root.children.length, 2);
  assert.ok(root.children.includes(dynamic));
});

import { occupyWindows, roomQuad, constantAttribute, wallData } from './cc-geometry.js';
import { buildingMemoryCPU, createWallMaterial, createWindowMaterial, createShutterMaterial, createShopMaterial } from './cc-materials.js';

test('exactly three cold occupied windows survive material batching; facade normals face the street', () => {
  const root = new THREE.Group(), windows = [], mat = new THREE.MeshStandardNodeMaterial();
  for (const side of [-1, 1]) for (const z of [8, -8, -20, -40, -58]) {
    const mesh = roomQuad(root, mat, { side, frontX: side * 5 }, 4.9, z, 1.1, 1.3, -0.065, [4, 0, 2.5, 1]);
    windows.push({ mesh, side, z, y: 4.9 });
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    assert.ok(Math.abs(normal.x + side) < 1e-6);
  }
  assert.equal(occupyWindows(windows).length, 3);
  assert.equal(windows.filter(w => w.mesh.geometry.attributes.ccRoom.getY(0) === 1).length, 3);
  mergeStatic(root);
  assert.equal(root.children.length, 1, 'all windows share one draw batch');
  const a = root.children[0].geometry.attributes.ccRoom;
  let litVertices = 0; for (let i = 0; i < a.count; i++) litVertices += a.getY(i);
  assert.equal(litVertices, 18);
});

test('debug CPU shutter state follows forced past/present, default follows cone', () => {
  assert.equal(buildingMemoryCPU(new URLSearchParams('ccmemory=present'), 1), 0);
  assert.equal(buildingMemoryCPU(new URLSearchParams('ccmemory=past'), 0), 1);
  assert.equal(buildingMemoryCPU(new URLSearchParams(), 0.4), 0.4);
});

test('material graphs construct with r186 TSL APIs without a DOM/GPU', () => {
  const tex = Object.fromEntries(['atlas_albedo', 'atlas_normal', 'interior_atlas', 'shutter', 'shelves', 'shop_ramen'].map(k => [k, new THREE.Texture()]));
  for (const mode of ['', 'ccmemory=past', 'ccmemory=present&ccflat']) {
    const p = new URLSearchParams(mode);
    for (const m of [createWallMaterial(tex, p), createWindowMaterial(tex, p), createShutterMaterial(tex), createShopMaterial(tex.shelves, p, 'shelves')]) {
      assert.ok(m.isNodeMaterial); assert.ok(m.colorNode);
    }
  }
});
