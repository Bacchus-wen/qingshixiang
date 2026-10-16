// Offline, deterministic cybercity -> memory crowd VAT. Run from the project root:
// node src/systems/ghosts/bake-crowd.mjs
// No Blender, browser, GL context, external tools, or vertex quantization.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VAT_FORMAT, materialSpec } from './crowd-materials.mjs';

const OUTPUT = 'assets/models/crowd';
const FRAMES = 20;
const selections = [
  { sex: 'male', outfit: 'm_raincoat', clip: 'umbrella_walk', umbrella: true },
  { sex: 'female', outfit: 'f_raincoat', clip: 'umbrella_walk', umbrella: true },
  { sex: 'female', outfit: 'f_trench', clip: 'umbrella_walk', umbrella: true },
  { sex: 'male', outfit: 'm_hoodie', clip: 'walk', umbrella: false },
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = { version: 2, format: VAT_FORMAT, frames: FRAMES, variants: [] };
await mkdir(OUTPUT, { recursive: true });
for (const selection of selections) {
  // Fresh scene per bake prevents animation state from leaking between outfits.
  const source = `reference/cybercity/assets/models/crowd/${selection.sex}.glb`;
  const bytes = await readFile(source);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const meta = JSON.parse(await readFile(source.replace('.glb', '.json'), 'utf8'));
  const meshes = [];
  for (const name of [`outfit_${selection.outfit}_lod1`, ...(selection.umbrella ? ['umbrella_black'] : [])]) {
    const root = gltf.scene.getObjectByName(name);
    assert(root, `Missing ${name}`);
    root.traverse(mesh => { if (mesh.isSkinnedMesh) meshes.push(mesh); });
  }
  gltf.scene.updateMatrixWorld(true);
  const clip = gltf.animations.find(c => c.name === selection.clip);
  assert(clip && meshes.length);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip).play();
  const vertexCount = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
  const indexCount = meshes.reduce((n, m) => n + m.geometry.index.count, 0);
  const indices = new Uint32Array(indexCount);
  const uvs = new Float32Array(vertexCount * 2);
  const materials = [], primitives = [];
  const positions = new Float32Array(FRAMES * vertexCount * 3);
  const normals = new Float32Array(positions.length);
  let vertexOffset = 0, indexOffset = 0;
  for (const mesh of meshes) {
    const idx = mesh.geometry.index;
    const uv = mesh.geometry.attributes.uv;
    assert(uv && uv.count === mesh.geometry.attributes.position.count, `Missing UV: ${mesh.name}`);
    assert(!Array.isArray(mesh.material), 'Expected one source material per primitive');
    let material = materials.findIndex(m => m.name === mesh.material.name);
    if (material < 0) {
      material = materials.length;
      assert(material < 16, 'Atlas tile budget exceeded');
      materials.push(materialSpec(mesh.material.name, meta, material));
    }
    primitives.push({ name: mesh.name, material, vertexOffset, vertexCount: uv.count,
      indexOffset, indexCount: idx.count });
    for (let i = 0; i < uv.count; i++) {
      uvs[(vertexOffset + i) * 2] = uv.getX(i);
      uvs[(vertexOffset + i) * 2 + 1] = uv.getY(i);
    }
    for (let i = 0; i < idx.count; i++) indices[indexOffset++] = idx.getX(i) + vertexOffset;
    vertexOffset += mesh.geometry.attributes.position.count;
  }
  const sole = meta.outfits[selection.outfit].sole;
  const bounds = new THREE.Box3();
  const v = new THREE.Vector3(), n = new THREE.Vector3(), p0 = new THREE.Vector3(), n0 = new THREE.Vector3();
  const tmp = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
  let radius = 0, maxReferenceError = 0, minBodyY = Infinity, maxBodyY = -Infinity;
  for (let f = 0; f < FRAMES; f++) {
    action.time = clip.duration * f / FRAMES;
    mixer.update(0);
    gltf.scene.updateMatrixWorld(true);
    vertexOffset = 0;
    for (const mesh of meshes) {
      mesh.skeleton.update();
      const boneMatrices = mesh.skeleton.bones.map((bone, b) => new THREE.Matrix4()
        .multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[b])
        .premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix));
      const { position, normal, skinIndex, skinWeight } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        p0.fromBufferAttribute(position, i); n0.fromBufferAttribute(normal, i);
        // Weighted skin transform, including each primitive's own bind matrices.
        tmp.elements.fill(0);
        for (let k = 0; k < 4; k++) {
          const weight = skinWeight.getComponent(i, k);
          if (!weight) continue;
          const e = boneMatrices[skinIndex.getComponent(i, k)].elements;
          for (let j = 0; j < 16; j++) tmp.elements[j] += weight * e[j];
        }
        v.copy(p0).applyMatrix4(tmp).applyMatrix4(mesh.matrixWorld);
        // Cross-check independent Three.js skinning on representative vertices.
        if (i % 37 === 0) {
          const reference = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
          maxReferenceError = Math.max(maxReferenceError, v.distanceTo(reference));
        }
        tmp.premultiply(mesh.matrixWorld);
        normalMatrix.getNormalMatrix(tmp);
        n.copy(n0).applyMatrix3(normalMatrix).normalize();
        v.y += sole;
        if (!mesh.name.startsWith('umbrella_')) { minBodyY = Math.min(minBodyY, v.y); maxBodyY = Math.max(maxBodyY, v.y); }
        bounds.expandByPoint(v);
        radius = Math.max(radius, Math.hypot(v.x, v.y - .9, v.z));
        const offset = (f * vertexCount + vertexOffset + i) * 3;
        v.toArray(positions, offset); n.toArray(normals, offset);
      }
      vertexOffset += position.count;
    }
  }
  assert(maxReferenceError < 1e-5, `Skinning differs from Three: ${maxReferenceError}`);
  assert(positions.every(Number.isFinite) && normals.every(Number.isFinite) && uvs.every(Number.isFinite));
  assert(minBodyY > -.15 && maxBodyY > 1.4 && maxBodyY < 2.2, 'Invalid human scale/axis');
  const binary = Buffer.concat([Buffer.from(indices.buffer), Buffer.from(positions.buffer), Buffer.from(normals.buffer), Buffer.from(uvs.buffer)]);
  const file = `${selection.outfit}.vat`;
  await writeFile(`${OUTPUT}/${file}`, binary);
  const result = { ...selection, file, format: VAT_FORMAT, materials, primitives,
    atlas: { size: 1024, color: `${selection.outfit}-color.jpg`, normalAlpha: `${selection.outfit}-normal-alpha.jpg`, normalPacking: 'rg-normal_b-opacity' }, vertexCount, indexCount, frames: FRAMES, duration: clip.duration,
    speed: meta.clips[selection.clip].speed, height: maxBodyY, radius: radius + .02,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, bytes: binary.length,
    sha256: sha256(binary), source, sourceSha256: sha256(bytes), maxReferenceError };
  manifest.variants.push(result);
  console.log(`${file}: ${vertexCount} vertices, ${indexCount/3} triangles, ${FRAMES} frames, ${(binary.length/1e6).toFixed(3)} MB, bounds ${JSON.stringify(result.bounds)}`);
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  gltf.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
}
manifest.bytes = manifest.variants.reduce((n, v) => n + v.bytes, 0);
assert(manifest.bytes < 8_000_000, 'Asset budget exceeded');
await writeFile(`${OUTPUT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`TOTAL ${(manifest.bytes / 1e6).toFixed(3)} MB. Float32 animation positions/normals, UVs and material ranges, no quantization.`);
