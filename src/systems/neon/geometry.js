import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { artKey, flickerAt } from './layout.js';

function constant(g, key, values) {
  const a = new Float32Array(g.attributes.position.count * values.length);
  for (let i = 0; i < g.attributes.position.count; i++) a.set(values, i * values.length);
  g.setAttribute(key, new THREE.BufferAttribute(a, values.length));
}
function data(g, s) {
  const c = new THREE.Color(s.tint);
  constant(g, 'neonTint', [c.r, c.g, c.b]);
  constant(g, 'neonPower', [s.alive]);
  constant(g, 'neonStyle', [s.kind === 'box' ? 1 : 0, s.broken]);
  const paper = new THREE.Color(s.paper);
  constant(g, 'neonPaper', [paper.r, paper.g, paper.b]);
  constant(g, 'neonAnchor', [s.x, s.y, s.z]);
  g.userData.sign = s;
  return g;
}
function transform(g, yaw, x, y, z) { return g.rotateY(yaw).translate(x, y, z); }
function batch(parts, material, name, animated = false) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error(`[neon] cannot merge ${name}`);
  let offset = 0;
  geometry.userData.ranges = [];
  for (const g of parts) {
    if (g.userData.sign?.alive) geometry.userData.ranges.push({ offset, count: g.attributes.position.count, sign: g.userData.sign });
    offset += g.attributes.position.count; g.dispose();
  }
  if (animated) geometry.attributes.neonPower.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
  return mesh;
}

export function buildMeshes(signs, atlas, materials) {
  const cabinets = [], faces = [], pools = [];
  for (const s of signs) {
    const depth = s.depth;
    const round = s.kind === 'box' && s.shape === 'round';
    const cabinet = round
      ? new THREE.CylinderGeometry((s.w + 0.1) / 2, (s.w + 0.1) / 2, depth, 32).rotateX(Math.PI / 2)
      : new THREE.BoxGeometry(s.w + 0.1, s.h + 0.1, depth);
    cabinets.push(transform(cabinet, s.yaw, s.x, s.y, s.z));
    const rect = atlas.entries.get(artKey(s)).uv;
    // Explicit front and back faces: correct reading direction on both sides, one merged opaque draw.
    for (const back of s.kind === 'blade' ? [false, true] : [false]) {
      const g = data(round ? new THREE.CircleGeometry(s.w / 2, 32) : new THREE.PlaneGeometry(s.w, s.h), s);
      g.setAttribute('neonUV', g.attributes.uv.clone());
      const u = g.attributes.uv;
      for (let i = 0; i < u.count; i++) u.setXY(i, rect[0] + u.getX(i) * rect[2], rect[1] + u.getY(i) * rect[3]);
      const yaw = s.yaw + (back ? Math.PI : 0), d = depth / 2 + 0.004;
      faces.push(transform(g, yaw, s.x + Math.sin(yaw) * d, s.y, s.z + Math.cos(yaw) * d));
    }
    if (s.kind === 'blade') {
      // Two wall anchors hidden behind the sign; geometry only, no lights or per-sign material.
      for (const dy of [-s.h * 0.34, s.h * 0.34]) {
        const len = Math.abs(s.frontX - s.x) + 0.06;
        cabinets.push(new THREE.BoxGeometry(len, 0.075, 0.075).translate((s.frontX + s.x) / 2, s.y + dy, s.z));
      }
    } else if (s.kind === 'hanger') {
      // Two cantilever arms and short drops make the extra depth visibly supported.
      for (const dz of [-s.w * 0.33, s.w * 0.33]) {
        const len = Math.abs(s.frontX - s.x);
        cabinets.push(new THREE.BoxGeometry(len, 0.065, 0.065).translate((s.frontX + s.x) / 2, s.y + s.h / 2 + 0.3, s.z + dz));
        cabinets.push(new THREE.BoxGeometry(0.045, 0.3, 0.045).translate(s.x, s.y + s.h / 2 + 0.15, s.z + dz));
      }
    } else if (s.kind === 'box') {
      const len = Math.abs(s.frontX - s.x);
      cabinets.push(new THREE.BoxGeometry(len, 0.12, 0.12).translate((s.frontX + s.x) / 2, s.y, s.z));
    } else if (s.kind === 'roof') {
      for (const dz of [-s.w * 0.33, s.w * 0.33]) cabinets.push(new THREE.BoxGeometry(0.09, 1.3, 0.09).translate(s.x, s.y - 1.1, s.z + dz));
    }
    // Two clipped pieces of ONE pool follow the 14 cm curb; do not float a plane across it.
    // Lane dimensions are the existing scene's contract; no street module import/mutation.
    const cx = s.side * 3.7, rz = Math.max(1.1, Math.min(2.2, s.w * 0.65));
    for (const [a, b, y] of [[1.9, 3.4, 0.012], [3.4, Math.min(5, Math.abs(s.frontX)), 0.152]]) {
      const x0 = s.side * a, x1 = s.side * b;
      const g = data(new THREE.PlaneGeometry(b - a, rz * 2), s);
      g.rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, s.z);
      const p = g.attributes.position, u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) u.setXY(i, (p.getX(i) - cx) / 3.6 + 0.5, (p.getZ(i) - s.z) / (rz * 2) + 0.5);
      pools.push(g);
    }
  }
  if (!signs.length) return [];
  const housing = batch(cabinets, materials.housing, 'neon-housing');
  const front = batch(faces, materials.face, 'neon-faces', true);
  const ground = batch(pools, materials.ground, 'neon-pools', true);
  // Opaque cabinets/signs participate in the volume occluder pass (2 additional draws).
  housing.layers.enable(1); front.layers.enable(1);
  ground.renderOrder = 1;
  return [housing, front, ground];
}

export function updatePowers(meshes, time) {
  for (const mesh of meshes) {
    const a = mesh.geometry.attributes.neonPower;
    if (!a) continue;
    a.clearUpdateRanges();
    let dirty = false;
    for (const { offset, count, sign } of mesh.geometry.userData.ranges) {
      const power = Math.fround(flickerAt(sign.seed, time));
      if (a.array[offset] === power) continue;
      a.array.fill(power, offset, offset + count); a.addUpdateRange(offset, count); dirty = true;
    }
    if (dirty) a.needsUpdate = true;
  }
}
