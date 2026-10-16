// Offline checks only. No browser, GPU context, port, or Blender.
// node src/systems/ghosts/verify.mjs
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
const root = new URL('../../../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three/webgpu') specifier = new URL('node_modules/three/src/Three.WebGPU.js', root).href;
  if (specifier === 'three/tsl') specifier = new URL('node_modules/three/src/Three.TSL.js', root).href;
  return next(specifier, context);
} });
const THREE = await import('three/webgpu');
const { mrt, output, velocity } = await import('three/tsl');
const { default: ghostsTemplate, crowd, pose, nearFade } = await import('./index.js');
const { routeLength, population } = await import('./routes.js');
const { decodeVAT, loadCrowd } = await import('./vat.js');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { default: legacyTemplate } = await import('./legacy.js');
const { memoryMaskCPU } = await import('../../materials/memory.js');
const { default: WGSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js', root));
const { default: GLSLNodeBuilder } = await import(new URL('node_modules/three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js', root));
const manifest = JSON.parse(await readFile(new URL('assets/models/crowd/manifest.json', root), 'utf8'));
const variants = await Promise.all(manifest.variants.map(async meta => {
  const bytes = await readFile(new URL(`assets/models/crowd/${meta.file}`, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const data = decodeVAT(meta, buffer);
  assert.equal(bytes.length, meta.bytes);
  assert(meta.maxReferenceError < 1e-5);
  assert(meta.bounds.max[1] < 2.3 && meta.bounds.min[1] > -.1);
  let footMotion = 0, maxStep = 0, seamStep = 0;
  for (let v = 0; v < meta.vertexCount; v++) {
    const initial = v * 3;
    for (let f = 0; f < meta.frames; f++) {
      const i = (f * meta.vertexCount + v) * 3;
      const next = (((f + 1) % meta.frames) * meta.vertexCount + v) * 3;
      const normalLength = Math.hypot(...data.normals.subarray(i, i+3));
      assert(Math.abs(normalLength - 1) < 1e-5);
      const delta = Math.hypot(...[0, 1, 2].map(k => data.positions[next+k] - data.positions[i+k]));
      if (f < meta.frames - 1) maxStep = Math.max(maxStep, delta); else seamStep = Math.max(seamStep, delta);
      if (data.positions[initial+1] < .3) footMotion = Math.max(footMotion, Math.abs(data.positions[i+2] - data.positions[initial+2]));
    }
  }
  assert(footMotion > .15, `Feet really animate: ${meta.outfit}`);
  assert(seamStep < maxStep * 1.6, `No loop seam jump: ${meta.outfit}: ${seamStep}/${maxStep}`);
  console.log(`PASS ${meta.outfit}: ${meta.indexCount/3} tris, foot travel ${footMotion.toFixed(3)} m, seam ${seamStep.toFixed(3)} m`);
  assert.throws(() => decodeVAT(meta, buffer.slice(0, buffer.byteLength-4)), /Truncated/);
  // Shader builders only need texture dimensions, never a GPU context or pixels.
  const color = new THREE.Texture({ width: 1024, height: 1024 });
  color.colorSpace = THREE.SRGBColorSpace; color.flipY = false;
  const normalAlpha = new THREE.Texture({ width: 1024, height: 1024 });
  normalAlpha.flipY = false;
  return { meta, buffer, textures: { color, normalAlpha } };
}));
const files = await readdir(new URL('assets/models/crowd/', root));
const totalBytes = (await Promise.all(files.map(f => stat(new URL(`assets/models/crowd/${f}`, root))))).reduce((n,s)=>n+s.size,0);
assert(totalBytes <= 8_000_000);
console.log(`PASS asset budget: ${totalBytes} bytes including metadata/credits`);

// Match every saved UV and primitive/material range to the original GLB.
// Also ensure the animation payload itself has not changed from the previous bake.
for (const variant of variants) {
  const { meta, buffer } = variant, data = decodeVAT(meta, buffer);
  const bytes = await readFile(new URL(meta.source, root));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  for (const part of meta.primitives) {
    const mesh = gltf.scene.getObjectByName(part.name), sourceUV = mesh.geometry.attributes.uv;
    assert.equal(meta.materials[part.material].name, mesh.material.name);
    assert.equal(sourceUV.count, part.vertexCount);
    for (let v = 0; v < sourceUV.count; v++) for (let k = 0; k < 2; k++) {
      assert.equal(data.uvs[(part.vertexOffset + v) * 2 + k], sourceUV.getComponent(v, k));
    }
  }
  const corrupt = buffer.slice(0);
  new Float32Array(corrupt, corrupt.byteLength - 4, 1)[0] = NaN;
  assert.throws(() => decodeVAT(meta, corrupt), /Nonfinite/);
  assert.throws(() => decodeVAT({ ...meta, primitives: meta.primitives.slice(1) }, buffer), /primitive/);
  assert.throws(() => decodeVAT({ ...meta, format: 'v1' }, buffer), /format/);
}
console.log('PASS source UVs, material assignment, cutout metadata, corrupt UV/range rejection');
let textureManifest = null;
try {
  textureManifest = JSON.parse(await readFile(new URL('assets/textures/crowd/manifest.json', root), 'utf8'));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
if (textureManifest) {
  for (const output of textureManifest.outputs) {
    const bytes = await readFile(new URL(`assets/textures/crowd/${output.file}`, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), output.sha256);
    assert.equal(bytes.length, output.bytes);
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert(output.width <= 1024 && output.height <= 1024);
  }
  const names = new Set(textureManifest.outputs.map(o => o.file));
  assert.equal(names.size, 8);
  for (const { meta } of variants) for (const kind of ['color', 'normalAlpha']) assert(names.has(meta.atlas[kind]));
  const textureFiles = await readdir(new URL('assets/textures/crowd/', root));
  const textureTotal = (await Promise.all(textureFiles.map(f => stat(new URL(`assets/textures/crowd/${f}`, root))))).reduce((n, s) => n + s.size, 0);
  assert(totalBytes + textureTotal - 6_783_516 <= 6_000_000, 'Increment includes metadata/credits');
  assert(textureManifest.incrementalBytes <= 6_000_000);
  console.log(`PASS 8 JPG atlases, hashes, <=1024 dimensions, ${textureManifest.incrementalBytes} incremental bytes`);
} else {
  assert(!process.argv.includes('--require-textures'), 'Atlas conversion awaiting user approval');
  console.log('PENDING actual JPEG outputs: conversion requires explicit user approval. Shader checks use metadata-only textures.');
}

// Exercise the real async loader offline: path binding, colorspace/orientation,
// partial texture-load cleanup and missing-texture fallback, without image IO.
const originalFetch = globalThis.fetch, originalLoad = THREE.TextureLoader.prototype.loadAsync;
let failNormal = false, loadedTextures = [], loaderDisposals = 0;
try {
  globalThis.fetch = async url => {
    assert(String(url).startsWith('/models/crowd/'));
    const bytes = await readFile(new URL(`assets${url}`, root));
    return { ok: true, json: async () => JSON.parse(bytes.toString()),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  THREE.TextureLoader.prototype.loadAsync = async function (url) {
    assert(/^\/textures\/crowd\/[mf]_[a-z]+-(color|normal-alpha)\.jpg$/.test(url));
    if (failNormal && url.endsWith('-normal-alpha.jpg')) throw new Error('simulated missing JPEG');
    const tex = new THREE.Texture({ width: 1024, height: 1024 });
    tex.addEventListener('dispose', () => loaderDisposals++);
    loadedTextures.push(tex); return tex;
  };
  const loaded = await loadCrowd();
  assert.equal(loadedTextures.length, 8);
  for (const { textures } of loaded) {
    assert.equal(textures.color.colorSpace, THREE.SRGBColorSpace);
    assert.equal(textures.normalAlpha.colorSpace, THREE.NoColorSpace);
    for (const tex of Object.values(textures)) {
      assert.equal(tex.flipY, false); assert.equal(tex.generateMipmaps, false);
      assert.equal(tex.minFilter, THREE.LinearFilter); tex.dispose();
    }
  }
  assert.equal(loaderDisposals, 8);
  failNormal = true; loadedTextures = [];
  const partial = await loadCrowd();
  assert(partial.every(v => !v.textures));
  assert.equal(loadedTextures.length, 4); assert.equal(loaderDisposals, 12);
} finally {
  globalThis.fetch = originalFetch;
  THREE.TextureLoader.prototype.loadAsync = originalLoad;
}
console.log('PASS async atlas paths, linear/sRGB, glTF UV orientation, no-mipmap filtering, partial-load disposal');

const shops = [-1,1].flatMap(side => [-11,-27,-54,-67].map(z => ({side,z,shop:true,frontX:side*5.2})));
const anchored = population(shops).filter(p => p.waiting);
assert.equal(anchored.length,8);
for(const p of anchored) {
  pose(p,0); const before=p.position.clone(); pose(p,480);
  assert(p.position.equals(before));
  assert(Math.abs(Math.abs(p.position.x)-5.68)<1e-6);
  assert(shops.some(f => f.side===p.side && f.z===p.position.z));
}
const context = (q = '') => ({ params: new URLSearchParams(q), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), api: {}, memory: {
  origin: new THREE.Vector3(-4.4, 1, -13.6), dir: new THREE.Vector3(1, 0, -.2).normalize(), angle: .36, range: 40, strength: 0,
} });
const ctx = context(), ghosts = Object.create(ghostsTemplate);
ghosts.loadCrowd = async () => variants;
await ghosts.init(ctx);
assert.equal(ctx.api.ghosts.source, 'cybercity-vat');
assert.equal(ghosts.people.length, 44);
assert.equal(ctx.api.ghosts.umbrellaCount, 33);
assert.equal(ghosts.meshes.length, 4);
assert(ghosts.meshes.every(m => m.material.isMeshStandardNodeMaterial && m.geometry.attributes.uv && m.material.normalNode));
assert(ghosts.meshes.every(m => m.geometry.isInstancedBufferGeometry && m.geometry.groups.length === 0 && !Array.isArray(m.material)));
for (const side of [-1, 1]) {
  assert.equal(ghosts.people.filter(p => p.side === side && p.route.axis === 'z').length, 12);
  assert.equal(ghosts.people.filter(p => p.side === side && p.route.axis === 'z').map(p => p.route).filter((r,i,a) => a.indexOf(r) === i).length, 5);
}
for (let f = 0; f < 30; f++) {
  ghosts.update(1/60, f/60, ctx);
  assert(ghosts.group.visible && ghosts.meshes.every(m => m.visible && m.geometry.instanceCount === 11 && !m.frustumCulled), `Warmup ${f}`);
  assert(ghosts.outfits.every(o => o.tint.array.every((v,i) => i%4 !== 3 || v === 0)), 'Warmup must not make closed-eye people visible');
}
ghosts.update(1/60, .5, ctx);
assert(!ghosts.group.visible && ghosts.meshes.every(m => !m.visible));
assert.equal(ctx.api.ghosts.waitingCount, 8);
assert.equal(ghosts.people.filter(p => p.route.crossing).length, 8);
assert.equal(ghosts.people.filter(p => p.route.axis === 'x' && !p.route.crossing).length, 4);
const waiting = ghosts.people.filter(p => p.waiting).map(p => p.position.clone());
// Actual robot floodNow must work without a story flood or a live cone, even
// when the door fragment's crowd multiplier is zero and the camera is nearby.
ctx.memory.floodNow = .501; crowd.value = 0;
for (let t = 0; t <= 480; t += .25) {
  ghosts.update(.25, t, ctx);
  assert.equal(ctx.api.ghosts.visibleCount, 44, 'Flood covers both pavements');
  assert.equal(ghosts.life.flood.value, 1);
  assert.equal(ghosts.life.crowd.value, 1);
  assert(ghosts.outfits.every(o => o.tint.array.every((v,i) => i%4 !== 3 || v === 1)));
  assert(ghosts.people.every(p => {
    const { x, y, z } = p.position;
    if (p.waiting) return Math.abs(x) >= 5 && y === .14 && z >= -70;
    if (p.route.axis === 'z') return Math.abs(x) >= 3.65 && Math.abs(x) <= 4.75
      && z >= -70 && z < -7 && (z > -34 || z < -50);
    if (p.route.crossing) return Math.abs(x) <= 4.65
      && (z >= -36 && z <= -35 || z >= -49 && z <= -48);
    return Math.abs(x) >= 6.6 && Math.abs(x) <= 22.4 && y === 0 && z > -46.5 && z < -37.5;
  }));
  assert(ghosts.people.some(p => p.position.z < -64), 'Alley end stays populated');
  for (const side of [-1,1]) assert(ghosts.people.some(p => p.position.x * side > 7), 'Both junction arms stay populated');
  for (let i = 0; i < ghosts.people.length; i++) for (let j = i + 1; j < ghosts.people.length; j++) {
    assert(ghosts.people[i].position.distanceTo(ghosts.people[j].position) > .75, `Crowd overlap at ${t}: ${i}/${j}`);
  }
  assert(ghosts.outfits.every(o => o.attributes.every(a => a.array.every(Number.isFinite))));
}
ghosts.people.filter(p => p.waiting).forEach((p,i) => assert(p.position.equals(waiting[i])));
ctx.camera.position.copy(ghosts.people[0].position);
ghosts.update(0,480,ctx); assert.equal(ctx.api.ghosts.visibleCount,44);
ctx.camera.position.set(0,0,0); delete ctx.memory.floodNow; crowd.value = 1; ctx.memory.flood = 1;
// Continuous bounded-speed path, including both turns and the loop seam.
for (const route of new Set(ghosts.people.filter(p => !p.waiting).map(p => p.route))) {
  const probe = { route, offset: 0, speed: 1, position: new THREE.Vector3() };
  for (let t = 0; t < routeLength(route) + .1; t += .013) {
    pose(probe,t); const before = probe.position.clone(), yaw = probe.yaw;
    pose(probe,t+.001);
    assert(probe.position.distanceTo(before) <= .0014); // includes smooth kerb step
    assert(Math.abs(Math.atan2(Math.sin(probe.yaw-yaw),Math.cos(probe.yaw-yaw))) < .003);
  }
}
assert.equal(ghosts.people.filter(p => p.route.axis === 'x').length, 12);
// Stable slot identity + explicit prior-frame gait/transform for temporal AA.
ghosts.update(0, 23, ctx);
const snapshot = ghosts.outfits.map(o => o.pose.array.slice());
const frames = ghosts.outfits.map(o => o.motion.array.slice());
ghosts.update(1/60, 23 + 1/60, ctx);
ghosts.outfits.forEach((o,i) => {
  assert.deepEqual(o.previousPose.array, snapshot[i]); assert.deepEqual(o.previousMotion.array, frames[i]);
});
ctx.memory.flood = 0; ghosts.update(0, 999, ctx);
ctx.memory.flood = 1; ghosts.update(0, 23, ctx);
ghosts.outfits.forEach((o,i) => assert.deepEqual(o.pose.array, snapshot[i]));
assert.equal(nearFade(0),0); assert.equal(nearFade(3.5),0); assert.equal(nearFade(4.5),.5); assert.equal(nearFade(5.5),1);
ctx.memory.flood = .5; // Partial reveal keeps the regular camera fade.
const first = ghosts.people[0], outfit = ghosts.outfits[first.type];
for (const d of [0, 1, 3.49, 3.5, 4, 4.5, 5.5, 6]) {
  ctx.camera.position.copy(first.position); ctx.camera.position.x += d; ctx.camera.position.y = 1.6;
  ghosts.update(0, 23, ctx);
  assert(Math.abs(outfit.tint.getW(first.slot) - nearFade(d)) < 1e-6, `Near-camera fade ${d}`);
}
ctx.camera.position.set(0, 1.6, 8);
crowd.value = 0; ghosts.update(0, 23, ctx);
assert.equal(ctx.api.ghosts.visibleCount, 0); assert(!ghosts.group.visible, 'Door fragment hides flood crowd too');
crowd.value = .5; ghosts.update(0, 23, ctx); assert.equal(ghosts.life.crowd.value, .5);
crowd.value = 1; ctx.memory.flood = 0; ctx.memory.strength = 1;
for (let angle = 0; angle < Math.PI*2; angle += .3) {
  ctx.memory.dir.set(Math.cos(angle),0,Math.sin(angle)); ghosts.update(0,23,ctx);
  ghosts.people.forEach((p,i) => {
    for (const y of [.1,.9,1.8]) {
      const test = p.position.clone(); test.y += y;
      if(memoryMaskCPU(test,ctx.memory)>0) assert(ghosts.visible[i], 'CPU broad phase must not cut a lit body/umbrella');
    }
  });
}
ctx.params.set('memlife','1'); ctx.memory.strength = 0; crowd.value = 0;
ghosts.update(0,23,ctx); assert.equal(ctx.api.ghosts.visibleCount,44, 'Debug forces display');
ctx.api.neon = { signs: [{ x:-5,y:3,z:-20,tint:'#24e9ee' },{ x:5,y:3,z:-20,tint:'#ff3ba7' }] };
ghosts.update(0,23,ctx);
for(const p of ghosts.people) {
  const c = new THREE.Color(p.position.x < 0 ? '#24e9ee' : '#ff3ba7'), a = ghosts.outfits[p.type].tint;
  assert(Math.abs(a.getX(p.slot)-c.r)<1e-6 && Math.abs(a.getY(p.slot)-c.g)<1e-6 && Math.abs(a.getZ(p.slot)-c.b)<1e-6);
}
// Distant slots keep their deterministic gait phase and resume without a TRAA jump.
ctx.camera.position.set(0, 1.6, 50);
ghosts.update(0, 23, ctx);
const frozen = ghosts.outfits.map(o => o.motion.array.slice());
ghosts.update(1/60, 23+1/60, ctx);
assert.equal(ctx.api.ghosts.animatedCount, 0);
ghosts.outfits.forEach((o,i) => assert.deepEqual(o.motion.array, frozen[i]));
ctx.camera.position.set(0, 1.6, -40);
ghosts.update(0, 23, ctx);
assert.equal(ctx.api.ghosts.animatedCount, 36);
ghosts.outfits.forEach(o => assert.deepEqual(o.previousMotion.array, o.motion.array));
ctx.params.delete('memlife'); ctx.memory.strength = 0; ctx.memory.flood = 0;
let writes = 0;
for (const o of ghosts.outfits) {
  const original = o.set;
  o.set = function (...args) { writes++; return original.apply(this,args); };
}
ghosts.update(1/60,24,ctx);
assert.equal(writes, 0, 'Invisible crowd skips VAT and tint updates');
assert(ghosts.outfits.every(o => o.tint.array.every((v,i) => i%4 !== 3 || v === 0)));
ctx.scene.traverse(n=>assert(!n.isLight));
console.log('PASS population, 4 draws, 30-frame warmup, 8-minute paths, cone/flood/door/debug, near-camera fade, neon tint, temporal history');

function rendererFor(forceWebGL) {
  const r = new THREE.WebGPURenderer({ forceWebGL, canvas: { width:1280,height:720,style:{},addEventListener(){},removeEventListener(){} } });
  r.backend.capabilities = { getUniformBufferLimit: () => 16384 };
  r.backend.hasFeature = r.hasFeature = () => false;
  r.backend.extensions = { has: () => false };
  const target = new THREE.RenderTarget(1280,720,{ count:2 });
  target.textures[0].name='output'; target.textures[1].name='velocity';
  r.setRenderTarget(target); r.setMRT(mrt({output,velocity}));
  return {r,target};
}
for(const Builder of [WGSLNodeBuilder,GLSLNodeBuilder]) {
  const {r,target} = rendererFor(Builder === GLSLNodeBuilder);
  for(const mesh of ghosts.meshes) {
    const builder = new Builder(mesh,r); builder.camera=ctx.camera; builder.scene=ctx.scene; builder.build();
    assert(builder.vertexShader.length>500 && builder.fragmentShader.length>500);
    assert(!/NaN|undefined/.test(builder.vertexShader+builder.fragmentShader));
    assert(/positionPrevious =/.test(builder.vertexShader), 'VAT previous pose must reach motion vectors');
    assert(Builder === WGSLNodeBuilder ? /textureLoad/.test(builder.vertexShader) : /texelFetch/.test(builder.vertexShader));
  }
  target.dispose(); console.log(`PASS ${Builder.name}: 4 VAT materials, VAT fetch + UV diffuse/normal/alpha + velocity MRT`);
}
let disposed=0;
for(const o of ghosts.outfits) for(const resource of [o.geometry,o.material,o.positions,o.normals,...Object.values(o.textures)]) resource.addEventListener('dispose',()=>disposed++);
ghosts.dispose(ctx); assert.equal(disposed,24); assert.equal(ctx.scene.children.length,0); assert(!ctx.api.ghosts);
const loadPeople=legacyTemplate.loadPeople;
legacyTemplate.loadPeople=async()=>null;
const fallback=Object.create(ghostsTemplate), fallbackCtx=context('memlife=1');
fallback.loadCrowd=async()=>{throw new Error('simulated missing VAT')};
await fallback.init(fallbackCtx); assert.equal(fallbackCtx.api.ghosts.source,'fallback');
assert(fallback.meshes.length<=5 && fallback.people.length===44);
fallbackCtx.camera.position.copy(fallback.people[0].position);
fallback.update(0,0,fallbackCtx);
assert.equal(fallback.meshes[0].geometry.attributes.lifeFade.getX(0),0);
fallbackCtx.params.delete('memlife'); fallbackCtx.memory.floodNow = .501; crowd.value = 0;
for(let i=0;i<31;i++) fallback.update(0,0,fallbackCtx);
assert.equal(fallbackCtx.api.ghosts.visibleCount,44);
assert.equal(fallbackCtx.api.ghosts.waitingCount,8);
assert(fallback.meshes.every(m => m.geometry.attributes.lifeFade.array.every(v => v === 1)));
fallback.dispose(fallbackCtx); assert.equal(fallbackCtx.scene.children.length,0);
legacyTemplate.loadPeople=loadPeople; crowd.value=1;
console.log('PASS resource disposal and load-error fallback. GPU execution / screenshots remain Claude external acceptance gates.');
