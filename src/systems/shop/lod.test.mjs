import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { LodLibrary } from './lod.js';

async function fixture(t, options) {
  const meta = {
    dims: [1, 1, 1], radius: 0.7,
    levels: [0, 1, 2].map((i) => ({
      file: `L${i}.glb`, minY: 0, tris: 100, tex: 16,
      errM: i * 0.001, texelsPerM: i === 0 ? 100000 : 10,
    })),
  };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(meta)));
  const lib = new LodLibrary({ loadAsync: async () => ({ scene: new THREE.Group() }) }, '/', { fade: false });
  const set = await lib.prepare('robot', options);
  for (let i = 0; i < set.levels.length; i++) await lib.load(set, i);
  const object = lib.instance('robot');
  new THREE.Scene().add(object);
  object.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 100);
  camera.position.set(0, 0.5, 1.5); camera.lookAt(0, 0.5, 0); camera.updateMatrixWorld();
  const renderer = { getDrawingBufferSize: (v) => v.set(1280, 720) };
  return { lib, object, camera, renderer };
}

test('a pinned hero keeps its material level when the camera approaches', async (t) => {
  const { lib, object, camera, renderer } = await fixture(t, { finest: 1, coarsest: 1 });
  lib.update(camera, renderer, 1);
  assert.equal(object.cur, 1, 'the hero must not swap to its differently encoded L0 textures');
  assert.equal(object.target, 1);
});

test('ordinary streamed props can still select L0 up close', async (t) => {
  const { lib, object, camera, renderer } = await fixture(t, { coarsest: 2 });
  lib.update(camera, renderer, 1);
  assert.equal(object.cur, 0);
});

test('a finest limit beyond the available range stays within the model coarsest level', async (t) => {
  const { lib, object, camera, renderer } = await fixture(t, { finest: 99, coarsest: 1 });
  lib.update(camera, renderer, 1);
  assert.equal(object.cur, 1);
});
