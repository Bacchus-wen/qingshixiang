import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { planSigns, artKey, flickerAt, TUBE_INTENSITY, LIGHTBOX_RATIO } from './layout.js';
import { buildMeshes, updatePowers } from './geometry.js';
import { createMaterials } from './materials.js';
import neon from './index.js';
import { planAtlas } from './atlas.js';

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

test('layered signs retain 8 surviving circuits, home clearance, local names and determinism', () => {
  const signs = planSigns(facades);
  assert.deepEqual(signs, planSigns(facades));
  assert.equal(signs.filter(s => s.alive).length, 8);
  for (const side of [-1, 1]) assert.equal(signs.filter(s => s.side === side && s.alive).length, 4);
  facades.forEach((f, i) => {
    const local = signs.filter(s => s.facade === i);
    assert.ok(local.length >= 1 && local.length <= 7);
    if (f.home) assert.ok(local.every(s => s.y - s.h / 2 >= 3.8 && !s.alive));
    else assert.equal(local.find(s => s.kind === 'fascia').text, f.signName);
    const blade = local.find(s => s.kind === 'blade');
    assert.ok(blade.h >= 2.4 && blade.h <= (blade.multiStorey ? 9 : 7.1));
    assert.ok(Math.abs(blade.x) + blade.w / 2 < Math.abs(f.frontX));
  });
  const fallback = planSigns([{ ...facades[0], signName: undefined }], [{ side: -1, z: facades[0].z, name: '永记士多' }]);
  assert.equal(fallback.find(s => s.kind === 'fascia').text, '永记士多');
});

test('one diffuser per shop, three size tiers, seeded ±0.8 m heights, 0.35 m boxes and 0.6–1.2 m hangers', () => {
  const signs = planSigns(facades);
  for (const [i, f] of facades.entries()) {
    assert.equal(signs.filter(s => s.facade === i && s.kind === 'box' && !s.upper).length, f.home ? 0 : 1);
  }
  const blades = signs.filter(s => s.kind === 'blade' && !s.upper);
  assert.equal(new Set(blades.map(s => s.w)).size, 3);
  assert.equal(new Set(blades.map(s => s.stroke)).size, 3);
  assert.ok(signs.every(s => Math.abs(s.heightOffset) <= 0.8));
  assert.ok(blades.some(s => s.heightOffset < -0.5) && blades.some(s => s.heightOffset > 0.5));
  const boxes = signs.filter(s => s.kind === 'box');
  assert.deepEqual(new Set(boxes.map(s => s.shape)), new Set(['square', 'round']));
  assert.equal(new Set(boxes.map(s => s.paper)).size, 2);
  for (const s of boxes) {
    assert.equal(s.w, s.h);
    assert.ok(Math.abs(Math.abs(s.frontX - s.x) + s.depth / 2 + 0.004 - 0.35) < 1e-9);
    assert.equal(s.alive, 0);
  }
  const hanging = signs.filter(s => s.kind === 'hanger');
  assert.ok(hanging.length > 0 && hanging.length < facades.length);
  for (const s of hanging) {
    const faceProjection = Math.abs(s.frontX - s.x) + s.depth / 2 + 0.004;
    assert.ok(faceProjection >= 0.6 && faceProjection <= 1.2);
  }
  assert.equal(TUBE_INTENSITY * LIGHTBOX_RATIO, 2.16);
});

test('nearest-integer 30% broken tube selection reaches every vertex and never affects diffusers', () => {
  const f = fixture();
  const tubes = f.signs.filter(s => s.kind !== 'box');
  assert.equal(tubes.filter(s => s.broken).length, Math.round(tubes.length * 0.3));
  assert.ok(f.signs.filter(s => s.kind === 'box').every(s => s.broken === 0));
  for (const mesh of f.meshes.slice(1)) {
    const { neonAnchor: anchors, neonStyle: styles } = mesh.geometry.attributes;
    for (let i = 0; i < styles.count; i++) {
      const s = f.signs.find(s => Math.abs(s.x - anchors.getX(i)) < 1e-5 && Math.abs(s.y - anchors.getY(i)) < 1e-5 && Math.abs(s.z - anchors.getZ(i)) < 1e-5);
      assert.ok(s);
      assert.equal(styles.getX(i), s.kind === 'box' ? 1 : 0);
      assert.equal(styles.getY(i), s.broken);
    }
  }
  cleanup(f);
});

test('diffuser and tube artwork packs without collisions inside the existing atlas budget', () => {
  const { entries, width, height } = planAtlas(planSigns(facades));
  assert.equal(width, 2048);
  assert.ok(height <= 4096);
  const cells = [...entries.values()];
  for (const [i, a] of cells.entries()) {
    assert.ok(a.x >= 8 && a.y >= 8 && a.x + a.w <= width - 8 && a.y + a.h <= height - 8);
    if (a.sign.kind === 'box') assert.equal(a.w, a.h);
    for (const b of cells.slice(i + 1)) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  const base = planSigns(facades)[0];
  assert.notEqual(artKey(base), artKey({ ...base, stroke: base.stroke * 2 }));
  assert.notEqual(artKey(base), artKey({ ...base, kind: 'box', shape: 'square' }));
  const box = { ...base, kind: 'box', shape: 'square' };
  assert.equal(artKey(box), artKey({ ...box, stroke: 0.05, paper: '#fff' }));
  // More than the current street's expected bays: unique names must not overflow the startup texture.
  const dense = Array.from({ length: 40 }, (_, i) => ({ ...facades[i % facades.length], home: false, signName: `店铺${i}` }));
  assert.ok(planAtlas(planSigns(dense)).height <= 4096);
});

test('street-eye camera rays encounter at least three opaque sign layers across neighbouring facades', () => {
  const f = fixture();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(0.6, 1.55, 10); camera.lookAt(0, 1.8, -30); camera.updateMatrixWorld();
  const face = f.meshes[1]; face.updateMatrixWorld();
  const ray = new THREE.Raycaster(), anchors = face.geometry.attributes.neonAnchor;
  let overlap = false;
  for (let y = 0; y < 0.9 && !overlap; y += 0.025) for (let x = -0.9; x < 0.9 && !overlap; x += 0.025) {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const signs = new Set(ray.intersectObject(face).map(hit => f.signs.find(s =>
      Math.abs(s.x - anchors.getX(hit.face.a)) < 1e-5 && Math.abs(s.z - anchors.getZ(hit.face.a)) < 1e-5)));
    const bays = [...new Set([...signs].map(s => s.facade))].sort((a, b) => a - b);
    overlap = signs.size >= 3 && bays.some((v, i) => i > 0 && v - bays[i - 1] === 1);
  }
  assert.ok(overlap, 'no shared camera ray through three sign faces on adjacent bays');
  cleanup(f);
});

test('neon=off needs no document, atlas or scene objects; disposal leaves API clean', async () => {
  const ctx = { params: new URLSearchParams('neon=off'), api: {}, scene: new THREE.Scene() };
  await neon.init(ctx);
  assert.deepEqual(ctx.api.neon, { enabled: false, count: 0 });
  assert.equal(ctx.scene.children.length, 0);
  neon.dispose();
  assert.equal(ctx.api.neon, undefined);
});

test('3 shared material batches, correct outward face normals, opaque SSR depth and clipped curb pools', () => {
  const f = fixture();
  assert.equal(f.meshes.length, 3);
  assert.equal(new Set(f.meshes.map(m => m.material)).size, 3);
  assert.equal(f.meshes.filter(m => m.layers.isEnabled(1)).length, 2);
  assert.ok(f.meshes.length + f.meshes.filter(m => m.layers.isEnabled(1)).length <= 15);
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
        assert.equal(sign.power, expected, 'lightPool callback must share geometry flicker');
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

test('upper signs stay below the top storey, cap at two per facade and leave survivors unchanged', () => {
  const tall = Array.from({ length: 400 }, (_, i) => ({ ...facades[i % facades.length], h: 26.3, home: false, w: 8 }));
  const signs = planSigns(tall), upper = signs.filter(s => s.upper);
  assert.deepEqual(new Set(upper.map(s => s.kind)), new Set(['upper', 'box', 'blade']));
  for (let i = 0; i < tall.length; i++) {
    const local = upper.filter(s => s.facade === i);
    assert.ok(local.length <= 2);
    assert.equal(new Set(local.map(s => s.floor)).size, local.length);
    for (const s of local) {
      assert.ok(s.floor >= 3 && s.floor < 8);
      assert.ok(s.y - s.h / 2 > 6.3 && s.y + s.h / 2 < 21.8);
      assert.equal(s.alive, 0);
      if (s.kind === 'upper') assert.ok(s.w >= 2.5 && s.w <= 7);
      if (s.kind === 'box') assert.equal(s.shape, 'square');
    }
  }
  const rate = upper.filter(s => s.floor === 3).length / tall.length;
  assert.ok(rate > 0.26 && rate < 0.38, `third-floor sampling rate ${rate}`);
  const blades = signs.filter(s => s.kind === 'blade');
  const ledRate = blades.filter(s => s.led).length / blades.length;
  assert.ok(ledRate > 0.39 && ledRate < 0.51, `LED sampling rate ${ledRate}`);
  assert.ok(signs.filter(s => s.alive).every(s => !s.upper));
  assert.equal(planSigns(tall.map(f => ({ ...f, h: 10.1 }))).filter(s => s.upper).length, 0);
  assert.equal(TUBE_INTENSITY, 5);
});

test('LED rails and downward shop lenses share the opaque face batch without extra draws', () => {
  const f = fixture(), face = f.meshes[1];
  const { neonAccent: accent, neonTint: tint, position, normal } = face.geometry.attributes;
  let ledVertices = 0, lensVertices = 0;
  for (let i = 0; i < accent.count; i++) {
    if (Math.abs(accent.getX(i) - 3.2) < 1e-5) {
      ledVertices++;
      assert.ok(Math.abs(normal.getZ(i)) > 0.99);
    }
    if (Math.abs(accent.getX(i) - 1.6) < 1e-5) {
      lensVertices++;
      assert.ok(normal.getY(i) < -0.99);
      assert.ok(Math.abs(position.getY(i) - 3.049) < 1e-5);
      assert.equal(tint.getX(i), 1);
      assert.ok(Math.abs(tint.getY(i) - 0.72) < 1e-5);
    }
  }
  assert.equal(ledVertices, f.signs.filter(s => s.led).length * 4 * 4); // 2 rails, 2 sides, 4 vertices
  const shops = f.signs.filter(s => s.shopOpening);
  assert.equal(shops.length, facades.filter(s => s.shop && !s.home).length);
  const lensCount = shops.reduce((sum, s) => {
    const count = Math.ceil(s.shopOpening.w / 2.2), spacing = s.shopOpening.w / count;
    assert.ok(spacing >= 1.4 && spacing <= 2.2);
    return sum + count;
  }, 0);
  assert.equal(lensVertices, lensCount * 14); // centre + 13 points around the closed circle
  assert.equal(f.meshes.length + f.meshes.filter(m => m.layers.isEnabled(1)).length, 5);
  cleanup(f);
});

test('unchanged init registers every upper sign plus one warm candidate per shop in lightPool', async () => {
  // No browser or rasterization: blank mask buffers exercise only atlas packing/init plumbing.
  const oldDocument = globalThis.document;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const g = { getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }) };
    for (const name of ['fillText', 'strokeText', 'strokeRect', 'beginPath', 'arc', 'stroke', 'drawImage', 'fillRect', 'moveTo', 'lineTo']) g[name] = () => {};
    canvas.getContext = () => g;
    return canvas;
  } };
  const candidates = [];
  const ctx = { params: new URLSearchParams(), api: { street: { facades } }, scene: new THREE.Scene(),
    lightPool: { add: c => candidates.push(c) } };
  try {
    await neon.init(ctx);
    assert.ok(neon.signs.some(s => s.upper));
    assert.equal(candidates.length, neon.signs.length + facades.filter(f => f.shop && !f.home).length);
    updatePowers(neon.meshes, 6);
    for (const [i, sign] of neon.signs.entries()) {
      const light = candidates[i];
      assert.equal(light.alive, sign.alive);
      assert.equal(light.power(), sign.power ?? 1);
      assert.equal(light.pos.y, sign.y - 0.25 * sign.h);
      assert.ok(light.intensity > 0 && light.distance > 0);
    }
  } finally {
    neon.dispose();
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
