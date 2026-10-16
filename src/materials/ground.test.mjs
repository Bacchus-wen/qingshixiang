// Offline only: no browser, GPU device, HTTP server or listening port.
// Run from project root: node src/materials/ground.test.mjs
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
import { groundLayout } from './ground-layout.js';
import { GROUND_TEXTURE_NAMES, loadGroundTextures, installGround, groundRoad, groundWalk, createGroundDecals } from './ground.js';
import { mergeStatic } from '../systems/street/merge.js';

async function run() {
  const layout = groundLayout(), L = layout.lane;
  assert.deepEqual(groundLayout(), layout, 'placement must be deterministic');
  for (const item of [...layout.manholes, ...layout.drains, ...layout.litter]) {
    assert(item.z - item.d / 2 > L.zEnd && item.z + item.d / 2 < L.zStart);
    assert(Math.abs(item.x) + item.w / 2 < L.halfRoad);
    assert(item.y > 0.002 && item.y < 0.012);
  }
  for (const item of layout.litter) {
    assert(Math.abs(item.x) - item.w * 0.71 > 1.5, 'keep central reflection corridor clear');
    assert(![1, 2, 3, 5, 6, 11, 12, 13].includes(item.cell), 'no branded/text-heavy cells');
  }

  const makeTexture = () => new THREE.Texture({ width: 768, height: 768 });
  const T = await loadGroundTextures({ loadAsync: async () => makeTexture() });
  for (const name of GROUND_TEXTURE_NAMES) assert.equal(T[name].colorSpace, name.endsWith('_c') ? THREE.SRGBColorSpace : THREE.NoColorSpace);
  let disposed = 0;
  await assert.rejects(loadGroundTextures({ loadAsync: async path => {
    if (path.endsWith('asphalt_a_c.jpg')) throw new Error('test: missing image');
    const t = makeTexture(); t.addEventListener('dispose', () => disposed++); return t;
  } }));
  assert.equal(disposed, GROUND_TEXTURE_NAMES.length - 1, 'release partial loads');

  const ctx = { params: new URLSearchParams(), api: {} };
  const root = new THREE.Group();
  const M = { road: new THREE.MeshStandardNodeMaterial(), walk: new THREE.MeshStandardNodeMaterial() };
  const paint = new THREE.MeshStandardNodeMaterial(), grate = new THREE.MeshStandardNodeMaterial();
  const road = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.04, 84), M.road);
  road.position.set(0, -0.02, -28);
  root.add(road, new THREE.Mesh(new THREE.BoxGeometry(), M.walk), new THREE.Mesh(new THREE.BoxGeometry(), paint), new THREE.Mesh(new THREE.BoxGeometry(), grate));
  const before = root.children.slice(), oldRoad = M.road;
  assert.equal(await installGround({ params: new URLSearchParams('oldground') }, root, M, L, { paint, grate }), null);
  assert.deepEqual(root.children, before); assert.equal(M.road, oldRoad);
  // Mock image IO only: all material, mesh mutation and batching code is the actual implementation.
  const originalLoad = THREE.TextureLoader.prototype.loadAsync;
  let loads = 0;
  THREE.TextureLoader.prototype.loadAsync = async () => { loads++; return makeTexture(); };
  let api;
  try {
    api = await installGround(ctx, root, M, L, { paint, grate });
    assert.equal(loads, 15);
    assert.equal(road.material, M.road);
    assert.deepEqual(road.position.toArray(), [0, -0.02, -28]);
    assert.equal(before[2].parent, null); assert.equal(before[3].parent, null);
    assert.equal(await installGround(ctx, root, M, L, { paint, grate }), api);
    assert.equal(loads, 15, 'idempotent installation');
  } finally { THREE.TextureLoader.prototype.loadAsync = originalLoad; }
  mergeStatic(root);
  assert.equal(api.decals.children.length, 3);
  for (const m of api.decals.children) {
    assert(m.isInstancedMesh && m.geometry.hasAttribute('ccGroundAngle'));
    assert.equal(m.material.transparent, false); assert.equal(m.material.depthWrite, true);
    assert(Number.isFinite(m.boundingSphere.radius));
  }
  api.dispose(); assert.equal(ctx.api.ground, undefined);

  const warnings = [];
  const warn = console.warn, error = console.error;
  console.warn = console.error = (...args) => warnings.push(args.join(' '));
  try {
    for (const [Builder, webgl] of [[WGSLNodeBuilder, false], [GLSLNodeBuilder, true]]) {
      // Renderer constructor only, with dummy canvas; never init(), render() or compileAsync().
      const renderer = new THREE.WebGPURenderer({ forceWebGL: webgl,
        canvas: { width: 64, height: 64, style: {}, addEventListener() {}, removeEventListener() {} } });
      renderer.backend.capabilities = { getUniformBufferLimit: () => 65536 };
      renderer.backend.utils = { getTextureSampleData: () => ({ primarySamples: 1 }) };
      renderer.hasFeature = () => false;
      for (const debug of ['', 'surfdbg=nopud,norip']) {
        const c = { params: new URLSearchParams(debug) };
        const meshes = [new THREE.Mesh(new THREE.BoxGeometry(), groundRoad(T, c)),
          new THREE.Mesh(new THREE.BoxGeometry(), groundWalk(T, c)), ...createGroundDecals(T, c).children];
        for (const mesh of meshes) {
          const builder = new Builder(mesh, renderer);
          builder.scene = new THREE.Scene(); builder.camera = new THREE.PerspectiveCamera();
          builder.build();
          assert(builder.fragmentShader.length > 1000 && builder.vertexShader.length > 500);
          assert(!builder.fragmentShader.includes('NaN'));
        }
      }
      console.log(`${Builder.name}: 5 materials x 2 debug modes generated`);
    }
  } finally { console.warn = warn; console.error = error; }
  assert.deepEqual(warnings, [], 'no TSL warnings or missing attributes');
  let bytes = 0;
  for (const name of GROUND_TEXTURE_NAMES) {
    const path = `assets/textures/cc/ground/${name}.jpg`;
    const data = await readFile(path);
    assert.equal(data.readUInt16BE(0), 0xffd8);
    bytes += (await stat(path)).size;
  }
  assert(bytes <= 6000000);
  console.log(`PASS: geometry/oldground/loading/disposal/merge, 20 shader builds, ${bytes} texture bytes`);
}

// Use one source-module TSL registry for the offline builders. Mixing package's bundled TSL
// with src/ builders creates false 'No stack defined' errors, unrelated to the application.
if (process.env.CC_GROUND_TEST_BUNDLED === '1') {
  await run();
} else {
  const { build } = await import('esbuild');
  const result = await build({ entryPoints: ['src/materials/ground.test.mjs'], bundle: true,
    platform: 'node', format: 'esm', write: false, external: ['esbuild'],
    alias: { 'three/webgpu': './node_modules/three/src/Three.WebGPU.js', 'three/tsl': './node_modules/three/src/Three.TSL.js', 'three': './node_modules/three/src/Three.js' } });
  process.env.CC_GROUND_TEST_BUNDLED = '1';
  try { await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
