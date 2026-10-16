import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { planSigns, artKey, flickerAt } from './layout.js';
import { buildMeshes, updatePowers } from './geometry.js';
import { createMaterials } from './materials.js';

const facades = [-1, 1].flatMap(side => Array.from({ length: 13 }, (_, i) => ({
  side, z: 16 - i * 7, w: 6.8, h: 7 + (i % 4) * 3.1, frontX: side * 5.2,
  shop: true, home: side === 1 && i === 4, signName: `南方${i}号`,
})));
const fixture = () => {
  const signs = planSigns(facades);
  const texture = new THREE.DataTexture(new Uint8Array(16).fill(128), 2, 2);
  const atlas = { texture, entries: new Map(signs.map(s => [artKey(s), { uv: [0, 0, 1, 1] }])) };
  const materials = createMaterials(texture, 'cone');
  return { signs, atlas, materials, meshes: buildMeshes(signs, atlas, materials) };
};
const cleanup = f => { f.meshes.forEach(m => m.geometry.dispose()); Object.values(f.materials).forEach(m => m.dispose()); f.atlas.texture.dispose(); };

test('2–4 signs per facade, 8 surviving circuits, home clear, local names retained, deterministic layout', () => {
  const signs = planSigns(facades);
  assert.deepEqual(signs, planSigns(facades));
  assert.equal(signs.filter(s => s.alive).length, 8);
  for (const side of [-1, 1]) assert.equal(signs.filter(s => s.side === side && s.alive).length, 4);
  facades.forEach((f, i) => {
    const local = signs.filter(s => s.facade === i);
    assert.ok(local.length >= 2 && local.length <= 4);
    if (f.home) assert.ok(local.every(s => s.y - s.h / 2 >= 3.8 && !s.alive));
    else assert.equal(local.find(s => s.kind === 'fascia').text, f.signName);
    const blade = local.find(s => s.kind === 'blade');
    assert.ok(blade.h >= 4 && blade.h <= 9);
    assert.ok(Math.abs(blade.x) + blade.w / 2 < Math.abs(f.frontX));
  });
  const fallback = planSigns([{ ...facades[0], signName: undefined }], [{ side: -1, z: facades[0].z, name: '永记士多' }]);
  assert.equal(fallback.find(s => s.kind === 'fascia').text, '永记士多');
});

test('3 shared material batches, correct outward face normals, opaque SSR depth and clipped curb pools', () => {
  const f = fixture();
  assert.equal(f.meshes.length, 3);
  assert.equal(new Set(f.meshes.map(m => m.material)).size, 3);
  assert.ok(f.meshes.every(m => !m.isLight && !m.castShadow));
  const face = f.meshes[1];
  assert.equal(face.material.transparent, false);
  const p = face.geometry.attributes.position, n = face.geometry.attributes.normal;
  for (let i = 0; i < p.count; i++) if (Math.abs(n.getX(i)) > 0.9) assert.ok(p.getX(i) * n.getX(i) < 0);
  assert.ok([...p.array].every(Number.isFinite));
  const ground = f.meshes[2];
  assert.equal(ground.material.blending, THREE.AdditiveBlending);
  assert.equal(ground.material.depthWrite, false);
  const gp = ground.geometry.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = Math.abs(gp.getX(i)), y = gp.getY(i);
    if (x < 3.39) assert.ok(Math.abs(y - 0.012) < 1e-5);
    if (x > 3.41) assert.ok(Math.abs(y - 0.152) < 1e-5);
  }
  cleanup(f);
});

test('fixed simulation time gives identical face/spill flicker; dead signs never acquire power', () => {
  const f = fixture();
  let dips = 0;
  for (let frame = 0; frame < 1200; frame++) {
    const t = frame / 60;
    updatePowers(f.meshes, t);
    for (const mesh of f.meshes.slice(1)) {
      const a = mesh.geometry.attributes.neonPower;
      for (const { offset, count, sign } of mesh.geometry.userData.ranges) {
        const expected = Math.fround(flickerAt(sign.seed, t));
        assert.equal(a.getX(offset), expected);
        assert.equal(a.getX(offset + count - 1), expected);
        if (expected < 1) dips++;
      }
    }
  }
  assert.ok(dips > 0);
  const face = f.meshes[1];
  const live = new Set(face.geometry.userData.ranges.flatMap(({ offset, count }) => Array.from({ length: count }, (_, i) => offset + i)));
  for (let i = 0; i < face.geometry.attributes.neonPower.count; i++) if (!live.has(i)) assert.equal(face.geometry.attributes.neonPower.getX(i), 0);
  updatePowers(f.meshes, 6);
  const first = Array.from(face.geometry.attributes.neonPower.array);
  updatePowers(f.meshes, 99); updatePowers(f.meshes, 6);
  assert.deepEqual(Array.from(face.geometry.attributes.neonPower.array), first);
  cleanup(f);
});
