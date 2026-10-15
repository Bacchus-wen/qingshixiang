import * as THREE from 'three/webgpu';
import { floor, positionWorld, sin, lights, vec3, pow, float, abs, dot, normalView, positionViewDirection, smoothstep, distance, cameraPosition } from 'three/tsl';
import { memoryMask, memoryMaskCPU, amberNode } from '../../materials/memory.js';

// Metres, matching street/LANE. Keep this system independent of street's init/assets.
const WALK_X = 4.2, CURB = 0.14, CROSS_Z = -42, CROSS_HALF = 4.5;
const COUNT = 48, TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const wrap = (n, span) => ((n % span) + span) % span;

function makePeople() {
  let seed = 0x1937fade;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const people = [];
  const add = (route, extra = {}) => {
    const p = {
      route, height: 1.53 + random() * 0.36, width: 0.86 + random() * 0.3,
      speed: 0.42 + random() * 0.43, offset: random() * 160,
      phase: random() * TAU, umbrella: false, waiting: false, partner: -1,
      position: new THREE.Vector3(), yaw: 0, bob: 0, stride: 0,
      ...extra,
    };
    people.push(p);
    return p;
  };
  // Stratified starts keep both pavements inhabited without making a parade.
  for (let i = 0; i < 32; i++) {
    const x = (i % 2 ? 1 : -1) * WALK_X + (random() - 0.5) * 0.34;
    // concentrated on the stretch the robot can see (z 4 .. -36): this street was busy
    const offset = Math.floor(i / 2) * 2.4 + random() * 1.2;
    add({ axis: 'z', fixed: x, min: -36, max: 4 }, {
      offset: i % 4 < 2 ? offset : 80 - offset, umbrella: i % 5 === 0,
    });
  }
  // Crossing stays inside the open junction, away from shop facades.
  for (let i = 0; i < 6; i++) add({
    axis: 'x', fixed: CROSS_Z - 2.8 + i * 1.05, min: -WALK_X, max: WALK_X,
  });
  for (let i = 0; i < 6; i++) add({
    axis: 'z', fixed: (i % 2 ? 1 : -1) * WALK_X, min: -67, max: 11,
  }, {
    waiting: true, waitZ: [-9.5, -16.3, -22.4, -27.5, -19.2, -24.6][i],
    waitYaw: i % 2 ? -Math.PI / 2 : Math.PI / 2, umbrella: i === 2,
  });
  // a few people crossing the lane mid-block, as people did
  for (let i = 0; i < 4; i++) add({ axis: 'x', fixed: -18.5 - i * 2.7, min: -WALK_X, max: WALK_X });
  // Two adult/child pairs share travel time; lateral separation never reverses.
  for (const [x, z] of [[WALK_X, -18], [-WALK_X, -26]]) {
    const adultIndex = people.length;
    const route = { axis: 'z', fixed: x, min: -66, max: 10 };
    const adult = add(route, { offset: z - route.min, speed: 0.46, lateral: -0.25, partner: adultIndex + 1 });
    add(route, {
      offset: adult.offset, speed: adult.speed, height: 1.03 + random() * 0.11,
      width: 0.86, lateral: 0.25, partner: adultIndex, child: true,
    });
  }
  return people;
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

function material() {
  const m = new THREE.MeshStandardNodeMaterial({
    roughness: 1, metalness: 0, transparent: false, depthWrite: true,
    depthTest: true, blending: THREE.NoBlending, side: THREE.DoubleSide,
  });
  // A 4x4 ordered threshold, projected on a 3D world grid, never frame/screen noise.
  // The nonzero minimum threshold also guarantees a zero memory mask discards.
  const cell = floor(positionWorld.mul(64));
  const x = cell.x.add(cell.z.mul(3)), y = cell.y.add(cell.z.mul(2));
  const parity = (v) => v.sub(floor(v.div(2)).mul(2));
  const bayer2 = (a, b) => parity(a.add(b)).mul(2).add(parity(b));
  const threshold = bayer2(x, y).mul(4)
    .add(bayer2(floor(x.div(2)), floor(y.div(2)))).add(0.5).div(16);
  const scan = sin(positionWorld.y.mul(115)).mul(0.055).add(0.945);
  // memories keep their distance: figures dissolve within a few metres of the camera (crude up close)
  const mask = memoryMask(positionWorld).mul(smoothstep(3.5, 6.5, distance(positionWorld, cameraPosition)));
  m.maskNode = mask.mul(scan).greaterThan(threshold);
  // silhouettes: unlit, near-black body with a thin amber rim, so they stand *in* the light rather than glow
  m.lightsNode = lights([]);
  m.colorNode = vec3(0);
  const rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3.0);
  m.emissiveNode = amberNode().mul(rim.mul(1.6).add(0.06)).mul(mask).mul(scan);
  return m;
}

export default {
  name: 'ghosts',
  async init(ctx) {
    this.people = makePeople();
    this.group = new THREE.Group(); this.group.name = 'ghosts';
    this.material = material();
    this.meshes = [];
    const batch = (name, geometry, count) => {
      const mesh = new THREE.InstancedMesh(geometry, this.material, count);
      mesh.name = `ghosts-${name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = mesh.receiveShadow = false;
      // CPU cone broad phase owns culling; a cached instanced bounding sphere is stale as people move.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.push(mesh); this.group.add(mesh);
      return mesh;
    };
    this.heads = batch('heads', new THREE.SphereGeometry(1, 8, 6), COUNT);
    this.bodies = batch('bodies', new THREE.CylinderGeometry(0.14, 0.11, 0.36, 7), COUNT);
    this.limbs = batch('limbs', new THREE.CylinderGeometry(0.85, 1, 1, 5), COUNT * 6);
    const umbrellas = this.people.filter(p => p.umbrella);
    umbrellas.forEach((p, i) => { p.umbrellaIndex = i; });
    // Shallow faceted dome: recognisable umbrella silhouette, no ribs or textures.
    this.canopies = batch('umbrellas', new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, Math.PI / 2), umbrellas.length);
    this.shafts = batch('shafts', new THREE.CylinderGeometry(1, 1, 1, 5), umbrellas.length);
    this.matrix = new THREE.Matrix4(); this.rotation = new THREE.Quaternion();
    this.scale = new THREE.Vector3(); this.point = new THREE.Vector3(); this.delta = new THREE.Vector3();
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Vector3();
    this.center = new THREE.Vector3();
    // Nonsingular near-zero transform, below the street, avoids undefined normal transforms.
    this.hidden = new THREE.Matrix4().makeScale(1e-6, 1e-6, 1e-6).setPosition(0, -10000, 0);
    this.broad = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), strength: 1, angle: 0, range: 0 };
    this.visible = new Uint8Array(COUNT);
    for (let i = 0; i < COUNT; i++) this.hidePerson(this.people[i], i);
    ctx.scene.add(this.group);
    ctx.api.ghosts = {
      count: COUNT, visibleCount: 0, umbrellaCount: umbrellas.length,
      waitingCount: this.people.filter(p => p.waiting).length, childCount: 2,
    };
    this.update(0, 0, ctx);
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
  hidePerson(p, i) {
    this.heads.setMatrixAt(i, this.hidden); this.bodies.setMatrixAt(i, this.hidden);
    for (let j = 0; j < 6; j++) this.limbs.setMatrixAt(i * 6 + j, this.hidden);
    if (p.umbrella) {
      this.canopies.setMatrixAt(p.umbrellaIndex, this.hidden);
      this.shafts.setMatrixAt(p.umbrellaIndex, this.hidden);
    }
  },
  update(dt, t, ctx) {
    const m = ctx.memory;
    const enabled = !!m && m.strength > 0 && m.range > 0;
    this.group.visible = enabled;
    if (!enabled) {
      // Invalidate old visible slots so reopening cannot expose stale matrices.
      this.visible.fill(0);
      for (let i = 0; i < COUNT; i++) this.hidePerson(this.people[i], i);
      for (const mesh of this.meshes) { mesh.count = 0; mesh.instanceMatrix.needsUpdate = true; }
      ctx.api.ghosts.visibleCount = 0;
      return;
    }
    // Absolute time makes shots, skipped frames and eye reopenings deterministic.
    for (const p of this.people) pose(p, t);
    this.broad.origin.copy(m.origin); this.broad.dir.copy(m.dir);
    let last = -1, lastUmbrella = -1, visibleCount = 0;
    for (let i = 0; i < COUNT; i++) {
      const p = this.people[i];
      const radius = p.umbrella ? 1.65 : 1.35;
      this.center.copy(p.position); this.center.y += p.height * 0.58;
      const distance = this.center.distanceTo(m.origin);
      // Expand for the whole silhouette AND noisy shader edges. Never test only the feet.
      // Extra cosine margin covers CPU's own smoothstep and memoryMask's grain displacement.
      this.broad.angle = Math.min(Math.PI, Math.acos(Math.max(-1, Math.cos(m.angle) - 0.10))
        + Math.asin(Math.min(1, radius / Math.max(distance, 0.001))));
      this.broad.range = m.range + radius + 0.5;
      const visible = distance <= radius || memoryMaskCPU(this.center, this.broad) > 0;
      if (visible) {
        this.drawPerson(p, i); last = i; visibleCount++;
        if (p.umbrella) lastUmbrella = Math.max(lastUmbrella, p.umbrellaIndex);
      } else if (this.visible[i]) this.hidePerson(p, i);
      this.visible[i] = visible ? 1 : 0;
    }
    // Preserve slot identity for three's previous-instance matrices / TRAA velocity.
    // Shrink trailing slots; hidden interior slots stay collapsed, never compacted/reassigned.
    this.heads.count = this.bodies.count = last + 1;
    this.limbs.count = (last + 1) * 6;
    this.canopies.count = this.shafts.count = lastUmbrella + 1;
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    ctx.api.ghosts.visibleCount = visibleCount;
  },
  dispose(ctx) {
    this.group?.removeFromParent();
    for (const mesh of this.meshes || []) { mesh.dispose(); mesh.geometry.dispose(); }
    this.material?.dispose();
    if (ctx?.api) delete ctx.api.ghosts;
  },
};
