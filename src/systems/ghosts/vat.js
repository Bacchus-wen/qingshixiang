// Adapted from xikhar/cybercity src/systems/crowd/vat.js, internal demo only.
// Offline-baked Float32 VAT: no runtime mixers, skinning, or texture downloads.
// See assets/models/crowd/CREDITS.md and bake-crowd.mjs.
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vertexIndex, int, ivec2, floor, mod, mix, vec3, cos, sin,
  textureLoad, normalLocal, positionPrevious,
} from 'three/tsl';
import { silhouette, coverage, lifeMask } from './life.js';

const BASE = import.meta.env?.BASE_URL || '/';
async function fetchChecked(url, kind) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return kind === 'json' ? response.json() : response.arrayBuffer();
}
export async function loadCrowd() {
  const base = `${BASE}models/crowd/`;
  const manifest = await fetchChecked(`${base}manifest.json`, 'json');
  if (manifest.version !== 1 || manifest.variants?.length !== 4) throw new Error('Unsupported memory crowd manifest');
  return Promise.all(manifest.variants.map(async meta => ({ meta, buffer: await fetchChecked(base + meta.file) })));
}

export function decodeVAT(meta, buffer) {
  const { vertexCount, indexCount, frames } = meta;
  if (![vertexCount, indexCount, frames].every(n => Number.isInteger(n) && n > 0) || vertexCount > 65536 || frames > 120) {
    throw new Error('Invalid VAT dimensions');
  }
  const samples = vertexCount * frames * 3;
  const expected = (indexCount + samples * 2) * 4;
  if (buffer.byteLength !== expected) throw new Error(`Truncated VAT ${meta.file}: ${buffer.byteLength}/${expected}`);
  const indices = new Uint32Array(buffer, 0, indexCount);
  if (!indices.every(i => i < vertexCount)) throw new Error('Invalid VAT indices');
  const positions = new Float32Array(buffer, indexCount * 4, samples);
  const normals = new Float32Array(buffer, (indexCount + samples) * 4, samples);
  if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite)) throw new Error('Nonfinite VAT');
  return { indices, positions, normals };
}

export class MemoryOutfit {
  constructor({ meta, buffer }, state, maxInstances) {
    this.meta = meta;
    const { indices, positions, normals } = decodeVAT(meta, buffer);
    const width = Math.min(1024, meta.vertexCount), rows = Math.ceil(meta.vertexCount / width);
    const height = rows * meta.frames;
    const makeTexture = (samples, w) => {
      const data = new Float32Array(width * height * 4);
      for (let f = 0; f < meta.frames; f++) for (let v = 0; v < meta.vertexCount; v++) {
        const from = (f * meta.vertexCount + v) * 3, to = (f * rows * width + v) * 4;
        data[to] = samples[from]; data[to + 1] = samples[from + 1]; data[to + 2] = samples[from + 2]; data[to + 3] = w;
      }
      const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
      texture.minFilter = texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false; texture.needsUpdate = true;
      return texture;
    };
    this.positions = makeTexture(positions, 1);
    this.normals = makeTexture(normals, 0);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, meta.vertexCount * 3), 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(0, meta.vertexCount * 3), 3));
    const instanced = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * size), size);
      a.setUsage(THREE.DynamicDrawUsage); this.geometry.setAttribute(name, a); return a;
    };
    this.pose = instanced('crowdPose', 4); // xyz, yaw; already in group-local world metres
    this.motion = instanced('crowdMotion', 2); // fractional frame, scale
    this.previousPose = instanced('crowdPreviousPose', 4);
    this.previousMotion = instanced('crowdPreviousMotion', 2);
    this.tint = instanced('lifeTint', 4); // nearest sign RGB, CPU visibility * near-camera fade
    this.attributes = [this.pose, this.motion, this.previousPose, this.previousMotion, this.tint];
    this.geometry.instanceCount = maxInstances;
    const pose = attribute('crowdPose', 'vec4'), motion = attribute('crowdMotion', 'vec2');
    const previousPose = attribute('crowdPreviousPose', 'vec4'), previousMotion = attribute('crowdPreviousMotion', 'vec2');
    const tint = attribute('lifeTint', 'vec4');
    const sample = (texture, frame) => {
      const vertex = int(vertexIndex), f0 = floor(frame);
      const x = vertex.mod(width), y = vertex.div(width);
      const row0 = int(mod(f0, meta.frames)).mul(rows).add(y);
      const row1 = int(mod(f0.add(1), meta.frames)).mul(rows).add(y);
      return mix(textureLoad(texture, ivec2(x, row0)).xyz, textureLoad(texture, ivec2(x, row1)).xyz, frame.sub(f0));
    };
    const rotate = (p, yaw) => {
      const c = cos(yaw), s = sin(yaw);
      return vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s)));
    };
    const deform = (pose, motion) => rotate(sample(this.positions, motion.x), pose.w).mul(motion.y).add(pose.xyz);
    this.material = silhouette(state, tint.rgb);
    this.material.name = `memory-${meta.outfit}`;
    this.material.maskNode = coverage(lifeMask(state).mul(tint.w));
    this.material.positionNode = Fn(() => {
      // Explicit previous VAT pose is essential: otherwise TRAA treats walking
      // vertices as if they came from the unanimated mesh at the world origin.
      positionPrevious.assign(deform(previousPose, previousMotion));
      normalLocal.assign(rotate(sample(this.normals, motion.x), pose.w).normalize());
      return deform(pose, motion);
    })();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = `ghosts-${meta.outfit}`;
    // Bounds would be invalid for shader-transformed instances. CPU cone culling
    // owns visibility, including during the mandatory first 30 warmup frames.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
  }
  begin() {
    this.previousPose.array.set(this.pose.array);
    this.previousMotion.array.set(this.motion.array);
    this.active = 0;
  }
  set(slot, person, frame, tint, opacity, resetHistory = false) {
    const p = person.position;
    this.pose.setXYZW(slot, p.x, p.y, p.z, person.yaw);
    this.motion.setXY(slot, frame, person.scale);
    this.tint.setXYZW(slot, tint.r, tint.g, tint.b, opacity);
    if (resetHistory) {
      this.previousPose.setXYZW(slot, p.x, p.y, p.z, person.yaw);
      this.previousMotion.setXY(slot, frame, person.scale);
    }
    if (opacity > 0) this.active++;
  }
  end(warmup) {
    this.mesh.visible = warmup || this.active > 0;
    for (const attribute of this.attributes) attribute.needsUpdate = true;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose(); this.material.dispose(); this.positions.dispose(); this.normals.dispose();
  }
}
