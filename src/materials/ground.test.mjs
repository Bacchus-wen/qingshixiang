// Offline only: no browser, GPU device, HTTP server or listening port.
// Run from project root: node src/materials/ground.test.mjs
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import { float, vec2, vec3 } from 'three/tsl';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
import { groundLayout } from './ground-layout.js';
import { GROUND_TEXTURE_NAMES, loadGroundTextures, installGround, groundRoad, groundWalk, createGroundDecals, roadWaterProfile, roadSurfaceVariation } from './ground.js';
import { wetLayer, puddleMask, rippleNormal, wetUniforms } from './wet.js';
import { mergeStatic } from '../systems/street/merge.js';

// Evaluate the production scalar TSL graph, substituting only procedural noise samples.
// This checks wetness/threshold behaviour without a GPU or a duplicate water formula.
function scalar(node, noise = 0) {
  if (node.isConstNode || node.isUniformNode) return node.value;
  if (node.isConvertNode || node.isVarNode) return scalar(node.node, noise);
  if (node.isShaderCallNodeInternal || node.type === 'FunctionOverloadingNode') return noise;
  if (node.condNode) return scalar(scalar(node.condNode, noise) ? node.ifNode : node.elseNode, noise);
  const a = node.aNode && scalar(node.aNode, noise);
  const b = node.bNode && scalar(node.bNode, noise);
  const c = node.cNode && scalar(node.cNode, noise);
  switch (node.op || node.method) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '>=': return a >= b;
    case 'abs': return Math.abs(a);
    case 'max': return Math.max(a, b);
    case 'mix': return a * (1 - c) + b * c;
    case 'clamp': return Math.max(b, Math.min(c, a));
    case 'smoothstep': {
      const t = Math.max(0, Math.min(1, (c - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    default: throw new Error(`Unsupported scalar node: ${node.type} ${node.op || node.method || ''}`);
  }
}
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);

async function run() {
  const layout = groundLayout(), L = layout.lane;
  for (const halfRoad of [L.halfRoad, 5]) {
    const profile = x => roadWaterProfile(float(x), halfRoad);
    near(scalar(profile(0).waterLevel), -0.08, 'crown drains the road centre');
    near(scalar(profile(0).flow), 0, 'no central gutter flow');
    for (const side of [-1, 1]) {
      near(scalar(profile(side * halfRoad).waterLevel), 0.25, 'curb raises water level');
      near(scalar(profile(side * halfRoad).flow), 0.35, 'curb flow speed');
      near(scalar(profile(side * (halfRoad - 0.15)).flow), 0.175, 'smooth gutter transition');
      near(scalar(profile(side * (halfRoad - 0.3)).flow), 0, 'gutter is only 0.3 m wide');
      near(scalar(profile(side * (halfRoad + 0.01)).flow), 0, 'no flow beyond curb');
    }
  }
  const savedWetness = wetUniforms.wetness.value;
  try {
    wetUniforms.wetness.value = 1;
    const variation = roadSurfaceVariation(vec2(0));
    near(scalar(variation.roughnessScale, -1), 0.75, 'micro roughness minimum');
    near(scalar(variation.roughnessScale, 1), 1.25, 'micro roughness maximum');
    near(scalar(variation.wetness, 0.35 * 2 - 1), 1, 'semi-dry lower threshold');
    near(scalar(variation.wetness, 0.7 * 2 - 1), 0.7, 'semi-dry upper threshold');
    near(scalar(variation.wetness, 0.525 * 2 - 1), 0.85, 'semi-dry transition');
    const threshold = 0.68 - 0.75 * 0.15;
    const mask = puddleMask(vec2(0), 0.75);
    near(scalar(mask, threshold * 2 - 1), 0, 'puddle lower threshold');
    near(scalar(mask, (threshold + 0.03) * 2 - 1), 0.5, 'soft puddle rim');
    near(scalar(mask, (threshold + 0.06) * 2 - 1), 1, 'full puddle threshold');
    const center = puddleMask(vec2(0), 0.75, roadWaterProfile(float(0), L.halfRoad));
    const curb = puddleMask(vec2(0), 0.75, roadWaterProfile(float(L.halfRoad), L.halfRoad));
    near(scalar(center, 0), 0, 'same terrain stays dry at crown');
    near(scalar(curb, 0), 1, 'same terrain pools at curb');
    const partlyWet = puddleMask(vec2(0), 0.75, { wetness: float(0.7) });
    near(scalar(partlyWet, 1), 0.7, 'local wetness controls puddle coverage');
    const layer = puddle => wetLayer({ albedo: float(0.8), roughness: float(0.6),
      porosity: 0, puddle: float(puddle), worldPos: vec3(0) });
    near(scalar(layer(1).roughness), 0.015, 'mirror puddle roughness');
    near(scalar(layer(1).albedo), scalar(layer(0).albedo) * 0.5, 'puddle halves albedo');
    const locallyDry = wetLayer({ albedo: float(0.8), roughness: float(0.6), worldPos: vec3(0), wetness: float(0) });
    near(scalar(locallyDry.roughness), 0.6, 'local wetness also controls film');
    near(scalar(locallyDry.albedo), 0.8, 'local wetness also controls darkening');
    wetUniforms.wetness.value = 0;
    near(scalar(variation.wetness, 1), 0, 'dry global state overrides semi-dry patches');
    near(scalar(curb, 1), 0, 'dry weather removes even curb puddles');
    near(scalar(layer(0).roughness), 0.6, 'dry weather restores asphalt roughness');
  } finally { wetUniforms.wetness.value = savedWetness; }
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
      for (const debug of ['', 'surfdbg=nopud', 'surfdbg=norip', 'surfdbg=nopud,norip']) {
        const c = { params: new URLSearchParams(debug) };
        const meshes = [new THREE.Mesh(new THREE.BoxGeometry(), groundRoad(T, c)),
          new THREE.Mesh(new THREE.BoxGeometry(), groundWalk(T, c)), ...createGroundDecals(T, c).children];
        near(scalar(meshes[0].material.roughnessNode.bNode), 0.015, 'material must not clamp puddles back to 0.03');
        for (const mesh of meshes) {
          const builder = new Builder(mesh, renderer);
          builder.scene = new THREE.Scene(); builder.camera = new THREE.PerspectiveCamera();
          builder.build();
          assert(builder.fragmentShader.length > 1000 && builder.vertexShader.length > 500);
          assert(!builder.fragmentShader.includes('NaN'));
        }
      }
      // Existing surface/robot callers still use rippleNormal(xz) with no flow argument.
      const legacy = new THREE.MeshBasicNodeMaterial();
      legacy.colorNode = vec3(rippleNormal(vec2(0)), 0);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), legacy);
      const builder = new Builder(mesh, renderer);
      builder.scene = new THREE.Scene(); builder.camera = new THREE.PerspectiveCamera();
      builder.build();
      assert(builder.fragmentShader.length > 1000 && !builder.fragmentShader.includes('NaN'));
      mesh.geometry.dispose(); legacy.dispose();
      console.log(`${Builder.name}: 5 materials x 4 debug modes generated`);
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
  console.log(`PASS: water profile/thresholds/dry state, geometry/oldground/loading/disposal/merge, 42 shader builds, ${bytes} texture bytes`);
}

// Use one source-module TSL registry for the offline builders. Mixing package's bundled TSL
// with src/ builders creates false 'No stack defined' errors, unrelated to the application.
if (process.env.CC_GROUND_TEST_BUNDLED === '1') {
  await run();
} else {
  const { build } = await import('esbuild');
  const result = await build({ entryPoints: ['src/materials/ground.test.mjs'], bundle: true,
    platform: 'node', format: 'esm', write: false, external: ['esbuild'],
    alias: { 'three/src': './node_modules/three/src', 'three/addons': './node_modules/three/examples/jsm',
      'three/webgpu': './node_modules/three/src/Three.WebGPU.js', 'three/tsl': './node_modules/three/src/Three.TSL.js', 'three': './node_modules/three/src/Three.js' } });
  process.env.CC_GROUND_TEST_BUNDLED = '1';
  try { await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
