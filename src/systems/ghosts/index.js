import * as THREE from 'three/webgpu';
import { uniform, attribute, positionLocal } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lifeState, syncLife, inMemory, silhouette, streetTint } from './life.js';
import { loadPeople } from './people.js';

// Metres, matching street/LANE. Keep this system independent of street's init/assets.
const CURB = 0.14, CROSS_Z = -42, CROSS_HALF = 4.5;
const TAU = Math.PI * 2;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const wrap = (n, span) => ((n % span) + span) % span;

function makePeople() {
  // Eight per pavement, six umbrellas each. Local routes prevent a parade
  // bunching up at a shared endpoint; two shop customers stay under the awnings.
  return [-1, 1].flatMap(side => Array.from({ length: 8 }, (_, i) => {
    const z = -7.5 - i * 4.0 - (side > 0 ? .8 : 0);
    return {
      route: { axis: 'z', fixed: side * (i >= 6 ? 4.55 : 4.05 + (i % 2) * .25), min: z - 1.3, max: z + 1.3 },
      height: 1.55 + ((i * 7 + (side > 0 ? 3 : 0)) % 11) * .025,
      width: .88 + (i % 3) * .06, speed: .38 + (i % 3) * .07,
      offset: i * .59, phase: i * 1.7, umbrella: i < 6,
      waiting: i >= 6, waitZ: z, waitYaw: -side * Math.PI / 2,
      partner: -1, position: new THREE.Vector3(), yaw: 0, bob: 0, stride: 0,
    };
  }));
}

// One instanced draw per joint, regardless of the number of character styles.
// Model variants share a geometry atlas; unmatched vertices collapse in the
// vertex shader and are discarded in the fragment shader, with stable slots.
function batchRigs(rigs, people, batch) {
  const types = [...new Set(people.map(p => p.modelType))];
  for (const joint of ['body', 'leg_l', 'leg_r', 'arm_l', 'arm_r']) {
    const geometries = [];
    for (const type of types) {
      const rig = rigs[type], parts = rig.parts.filter(p => p.joint === joint);
      const primary = parts.find(p => p.name === joint);
      const pieces = parts.map(p => {
        const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
        g.translate(p.pivot.x-primary.pivot.x, p.pivot.y-primary.pivot.y, p.pivot.z-primary.pivot.z);
        return g;
      });
      const g = mergeGeometries(pieces, false);
      pieces.forEach(p => p.dispose());
      g.setAttribute('ghostType', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(type), 1));
      geometries.push(g);
      primary.mergedJoint = true;
    }
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    geometry.setAttribute('personType', new THREE.InstancedBufferAttribute(new Float32Array(people.map(p => p.modelType)), 1));
    const mesh = batch(joint, geometry, people.length);
    for (const type of types) rigs[type].parts.find(p => p.name === joint).mesh = mesh;
  }
  for (const [type, rig] of rigs.entries()) {
    rig.parts.forEach(p => p.geometry.dispose());
    rig.parts = types.includes(type) ? rig.parts.filter(p => p.mergedJoint) : [];
  }
}

function pose(p, t) {
  const r = p.route, span = r.max - r.min;
  const travel = wrap(p.offset + t * p.speed, span * 2);
  const direction = travel < span ? 1 : -1;
  const along = r.min + (direction === 1 ? travel : span * 2 - travel);
  p.position.set(r.axis === 'z' ? r.fixed + (p.lateral || 0) : along, 0,
    r.axis === 'z' ? (p.waiting ? p.waitZ : along) : r.fixed);
  // Sidewalks stop at the crossing. Ease the 14 cm kerb step over 24 cm.
  const kerb = THREE.MathUtils.smoothstep(Math.abs(p.position.z - CROSS_Z), CROSS_HALF, CROSS_HALF + 0.24);
  p.position.y = kerb * CURB;
  p.yaw = p.waiting ? p.waitYaw : r.axis === 'z' ? (direction === 1 ? 0 : Math.PI) : direction * Math.PI / 2;
  const gait = t * p.speed / (p.height * 0.34) * TAU + p.phase;
  p.stride = p.waiting ? 0 : Math.sin(gait);
  p.bob = p.waiting ? Math.sin(t * 0.8 + p.phase) * 0.002 : (1 - Math.cos(gait * 2)) * 0.006;
}

// 1 = the street's crowd is visible in memories; the door fragment fades it to 0 so the child is alone (Claude)
export const crowd = uniform(1);

export default {
  name: 'ghosts',
  loadPeople,
  async init(ctx) {
    this.people = makePeople();
    const count = this.people.length;
    // Stable per-person slots are shared across all five joint batches.
    this.rigs = null;
    try { this.rigs = await this.loadPeople(); }
    catch (error) { console.warn('[ghosts] people.glb unavailable; using procedural people.', error.message); }
    this.group = new THREE.Group(); this.group.name = 'ghosts';
    this.life = lifeState();
    this.tint = new THREE.Color();
    this.material = silhouette(this.life, attribute('lifeTint', 'vec3'));
    if (this.rigs) {
      const selected = attribute('ghostType').equal(attribute('personType'));
      this.material.positionNode = positionLocal.mul(selected.select(1, 0));
      this.material.maskNode = this.material.maskNode.and(selected);
    }
    this.meshes = [];
    const batch = (name, geometry, count) => {
      const mesh = new THREE.InstancedMesh(geometry, this.material, count);
      mesh.name = `ghosts-${name}`;
      geometry.setAttribute('lifeTint', new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(.3), 3));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = mesh.receiveShadow = false;
      // CPU cone broad phase owns culling; a cached instanced bounding sphere is stale as people move.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.push(mesh); this.group.add(mesh);
      return mesh;
    };
    const umbrellas = this.people.filter(p => p.umbrella);
    umbrellas.forEach((p, i) => { p.umbrellaIndex = i; });
    if (this.rigs) {
      this.people.forEach((p, i) => { p.modelType = p.umbrella ? 0 : i % 8 === 6 ? 6 : 4; });
      batchRigs(this.rigs, this.people, batch);
      this.rootMatrix = new THREE.Matrix4(); this.localMatrix = new THREE.Matrix4();
      this.inverseRoot = new THREE.Matrix4(); this.jointRotation = new THREE.Quaternion();
      this.jointScale = new THREE.Vector3(); this.target = new THREE.Vector3();
    } else {
      this.heads = batch('heads', new THREE.SphereGeometry(1, 8, 6), count);
      this.bodies = batch('bodies', new THREE.CylinderGeometry(0.14, 0.11, 0.36, 7), count);
      this.limbs = batch('limbs', new THREE.CylinderGeometry(0.85, 1, 1, 5), count * 6);
      this.canopies = batch('umbrellas', new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, Math.PI / 2), umbrellas.length);
      this.shafts = batch('shafts', new THREE.CylinderGeometry(1, 1, 1, 5), umbrellas.length);
    }
    this.matrix = new THREE.Matrix4(); this.rotation = new THREE.Quaternion();
    this.scale = new THREE.Vector3(); this.point = new THREE.Vector3(); this.delta = new THREE.Vector3();
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Vector3();
    this.center = new THREE.Vector3();
    // Nonsingular near-zero transform, below the street, avoids undefined normal transforms.
    this.hidden = new THREE.Matrix4().makeScale(1e-6, 1e-6, 1e-6).setPosition(0, -10000, 0);
    this.broad = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), strength: 1, angle: 0, range: 0 };
    this.visible = new Uint8Array(count);
    // Initialize every type's unused slots too; default identity matrices must never leak.
    for (const mesh of this.meshes) {
      for (let i = 0; i < mesh.instanceMatrix.count; i++) mesh.setMatrixAt(i, this.hidden);
    }
    ctx.scene.add(this.group);
    ctx.api.ghosts = {
      count, sceneDraws: this.meshes.length, source: this.rigs ? 'glb' : 'procedural', visibleCount: 0, umbrellaCount: umbrellas.length,
      waitingCount: this.people.filter(p => p.waiting).length, childCount: this.people.filter(p => p.child).length,
    };
    this._frames = 0;
    this.update(0, 0, ctx);
    this._frames = 0;
  },

  // Convert normalised body coordinates to world space; reusable vectors, no per-frame geometry.
  pointAt(p, x, y, z, out) {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw), h = p.height;
    return out.set(p.position.x + (x * p.width * c + z * s) * h,
      p.position.y + (y + p.bob) * h,
      p.position.z + (-x * p.width * s + z * c) * h);
  },
  part(mesh, index, point, sx, sy, sz, yaw = 0) {
    this.rotation.setFromAxisAngle(UP, yaw);
    this.scale.set(sx, sy, sz);
    mesh.setMatrixAt(index, this.matrix.compose(point, this.rotation, this.scale));
  },
  segment(mesh, index, a, b, radius) {
    this.delta.subVectors(b, a);
    const length = this.delta.length();
    this.rotation.setFromUnitVectors(UP, this.delta.divideScalar(Math.max(length, 1e-6)));
    this.point.copy(a).add(b).multiplyScalar(0.5);
    this.scale.set(radius, length, radius);
    mesh.setMatrixAt(index, this.matrix.compose(this.point, this.rotation, this.scale));
  },
  drawPerson(p, index) {
    if (this.rigs) return this.drawModel(p, index);
    const h = p.height, w = p.width, base = index * 6;
    this.part(this.heads, index, this.pointAt(p, 0, 0.91, 0, this.a), h * 0.083 * w, h * 0.095, h * 0.085, p.yaw);
    this.part(this.bodies, index, this.pointAt(p, 0, 0.65, 0, this.a), h * w, h, h * 0.73, p.yaw);
    for (let side = -1; side <= 1; side += 2) {
      const j = side === -1 ? 0 : 1, swing = p.stride * side;
      this.pointAt(p, side * 0.069, 0.48, 0, this.a);
      this.pointAt(p, side * 0.079, 0.035 + Math.max(0, swing) * 0.035, swing * 0.125, this.b);
      this.segment(this.limbs, base + j, this.a, this.b, h * 0.047 * w);

      this.pointAt(p, side * 0.145, 0.79, 0, this.a);
      const partner = this.people[p.partner];
      const holdingSide = partner ? Math.sign((partner.position.x - p.position.x) * Math.cos(p.yaw)) : 0;
      if (side === holdingSide) {
        // Both hands terminate at exactly the same world point, even with different heights/gaits.
        this.b.copy(p.position).add(partner.position).multiplyScalar(0.5);
        this.b.y += Math.min(h, partner.height) * 0.64;
      } else if (p.umbrella && side === 1) this.pointAt(p, 0.18, 0.69, 0.10, this.b);
      else this.pointAt(p, side * 0.18, 0.46, -swing * 0.11, this.b);
      this.c.copy(this.a).lerp(this.b, 0.52);
      this.c.z += Math.cos(p.yaw) * h * 0.025;
      this.segment(this.limbs, base + 2 + j * 2, this.a, this.c, h * 0.036 * w);
      this.segment(this.limbs, base + 3 + j * 2, this.c, this.b, h * 0.029 * w);
    }
    if (p.umbrella) {
      this.pointAt(p, 0.18, 1.13, 0.10, this.a);
      this.part(this.canopies, p.umbrellaIndex, this.a, h * 0.37, h * 0.13, h * 0.37, p.yaw);
      this.pointAt(p, 0.18, 0.68, 0.10, this.b);
      this.segment(this.shafts, p.umbrellaIndex, this.a, this.b, 0.009);
    }
  },
  drawModel(p, index) {
    const h = p.height, rig = this.rigs[p.modelType];
    this.point.copy(p.position); this.point.y += p.bob * h;
    this.rotation.setFromAxisAngle(UP, p.yaw);
    this.scale.set(h * p.width, h, h);
    this.rootMatrix.compose(this.point, this.rotation, this.scale);
    this.inverseRoot.copy(this.rootMatrix).invert();
    const partner = this.people[p.partner];
    const holdingSide = partner ? Math.sign((partner.position.x - p.position.x) * Math.cos(p.yaw)) : 0;
    for (const part of rig.parts) {
      const side = part.joint.endsWith('_l') ? -1 : 1;
      const holding = part.joint.startsWith('arm') && side === holdingSide;
      if (holding && part.hideWhenHolding) {
        part.mesh.setMatrixAt(index, this.hidden);
        continue;
      }
      this.jointScale.set(1, 1, 1);
      this.jointRotation.identity();
      if (holding) {
        // Solve the authored hand centre onto the same world-space grip for both
        // people, including their different heights, body widths, bob and yaw.
        this.target.copy(p.position).add(partner.position).multiplyScalar(.5);
        this.target.y += Math.min(h, partner.height) * .64;
        this.target.applyMatrix4(this.inverseRoot).sub(part.pivot);
        const length = this.target.length();
        this.delta.copy(part.hand).normalize();
        this.jointRotation.setFromUnitVectors(this.delta, this.target.divideScalar(Math.max(length, 1e-6)));
        this.jointScale.setScalar(length / part.hand.length());
      } else if (part.joint !== 'body') {
        // Legs and opposite arms alternate; posed carrying/phone arms have zero swing.
        const direction = part.joint.startsWith('leg') ? -1 : 1;
        this.jointRotation.setFromAxisAngle(X_AXIS, p.stride * side * direction * part.swing);
      }
      this.localMatrix.compose(part.pivot, this.jointRotation, this.jointScale);
      part.mesh.setMatrixAt(index, this.matrix.multiplyMatrices(this.rootMatrix, this.localMatrix));
      part.mesh.count = Math.max(part.mesh.count, index + 1);
    }
  },
  hidePerson(p, i) {
    if (this.rigs) {
      for (const part of this.rigs[p.modelType].parts) part.mesh.setMatrixAt(i, this.hidden);
      return;
    }
    this.heads.setMatrixAt(i, this.hidden); this.bodies.setMatrixAt(i, this.hidden);
    for (let j = 0; j < 6; j++) this.limbs.setMatrixAt(i * 6 + j, this.hidden);
    if (p.umbrella) {
      this.canopies.setMatrixAt(p.umbrellaIndex, this.hidden);
      this.shafts.setMatrixAt(p.umbrellaIndex, this.hidden);
    }
  },
  update(dt, t, ctx) {
    const warmup = this._frames++ < 30;
    const enabled = syncLife(this.life, ctx, crowd.value);
    this.group.visible = warmup || enabled;
    for (const p of this.people) pose(p, t);
    let last = -1, lastUmbrella = -1, visibleCount = 0;
    for (const mesh of this.meshes) mesh.count = 0;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      const radius = this.rigs ? Math.max(1.65, (this.rigs[p.modelType].radius + .3) * p.height * Math.max(1, p.width)) : 1.65;
      this.center.copy(p.position); this.center.y += p.height * .58;
      const visible = warmup || (enabled && inMemory(this.center, radius, ctx, this.life, this.broad));
      if (visible) {
        this.drawPerson(p, i); last = i; visibleCount++;
        if (p.umbrella) lastUmbrella = Math.max(lastUmbrella, p.umbrellaIndex);
        streetTint(ctx, p.position, this.tint);
        if (this.rigs) {
          for (const mesh of this.meshes) mesh.geometry.attributes.lifeTint.setXYZ(i, this.tint.r, this.tint.g, this.tint.b);
        } else {
          for (const mesh of [this.heads, this.bodies]) mesh.geometry.attributes.lifeTint.setXYZ(i, this.tint.r, this.tint.g, this.tint.b);
          for (let j = 0; j < 6; j++) this.limbs.geometry.attributes.lifeTint.setXYZ(i*6+j, this.tint.r, this.tint.g, this.tint.b);
          if (p.umbrella) for (const mesh of [this.canopies, this.shafts]) mesh.geometry.attributes.lifeTint.setXYZ(p.umbrellaIndex, this.tint.r, this.tint.g, this.tint.b);
        }
      } else if (this.visible[i]) this.hidePerson(p, i);
      this.visible[i] = visible ? 1 : 0;
    }
    // Preserve slot identity for three's previous-instance matrices / TRAA velocity.
    // Shrink trailing slots; hidden interior slots stay collapsed, never compacted/reassigned.
    if (!this.rigs) {
      this.heads.count = this.bodies.count = last + 1;
      this.limbs.count = (last + 1) * 6;
      this.canopies.count = this.shafts.count = lastUmbrella + 1;
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.lifeTint.needsUpdate = true;
    }
    ctx.api.ghosts.visibleCount = visibleCount;
  },
  dispose(ctx) {
    this.group?.removeFromParent();
    for (const mesh of this.meshes || []) { mesh.dispose(); mesh.geometry.dispose(); }
    this.material?.dispose();
    if (ctx?.api) delete ctx.api.ghosts;
  },
};
