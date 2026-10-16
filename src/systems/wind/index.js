import {
  attribute, float, fract, mix, normalWorldGeometry, positionGeometry,
  positionWorld, sin, smoothstep, uniform, uv, vec3,
} from 'three/tsl';

// Authored lane dimensions (street publishes lights, but no layout API yet).
const ROAD = 3.4, Z_MIN = -70, Z_MAX = 14, CROSS_Z = -42, CROSS_HALF = 4.5;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const random = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

function belongsToLaundry(mesh) {
  for (let p = mesh; p; p = p.parent) if (p.userData.prop === 'props2/laundry') return true;
  return false;
}

// Only surviving, individual meshes. Never deform a material-batched street mesh.
function sway(system, mesh, kind, THREE) {
  const originalGeometry = mesh.geometry, originalMaterial = mesh.material;
  if (!originalMaterial.isNodeMaterial || originalMaterial.positionNode) return;
  const g = kind === 'notice' && originalGeometry.type === 'PlaneGeometry'
    ? new THREE.PlaneGeometry(originalGeometry.parameters.width, originalGeometry.parameters.height, 4, 6)
    : originalGeometry.clone();
  g.computeBoundingBox();
  const p = g.attributes.position, tex = g.attributes.uv, weights = new Float32Array(p.count);
  const box = g.boundingBox, span = Math.max(0.001, box.max.y - box.min.y);
  let top = 0;
  for (let i = 1; i < p.count; i++) if (p.getY(i) > p.getY(top)) top = i;
  // glTF flips Blender V: infer the pinned UV edge from the highest vertex.
  // UV weighting keeps all clips fixed, including the sagging shirt neckline.
  const flipped = kind === 'cloth' && tex && tex.getY(top) < 0.5;
  for (let i = 0; i < p.count; i++) {
    const raw = tex ? tex.getY(i) : (p.getY(i) - box.min.y) / span;
    const v = flipped ? 1 - raw : raw;
    weights[i] = kind === 'cable' ? Math.sin(Math.PI * clamp(tex?.getX(i) ?? 0)) ** 2 : (1 - clamp(v)) ** 2;
  }
  g.setAttribute('windWeight', new THREE.BufferAttribute(weights, 1));
  const direction = uniform(new THREE.Vector3());
  const inverse = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).invert();
  const phase = mesh.getWorldPosition(new THREE.Vector3()).dot(new THREE.Vector3(0.7, 0.23, 0.41));
  const w = attribute('windWeight', 'float'), t = system.u.time;
  const amplitude = kind === 'cloth' ? 0.13 : kind === 'cable' ? 0.065 : 0.025;
  const wave = sin(t.mul(kind === 'cable' ? 1.3 : 2.1).add(phase).sub(w.mul(2.2)))
    .mul(0.45).add(0.55).add(sin(t.mul(5.1).add(positionGeometry.x.mul(12))).mul(0.1));
  const m = originalMaterial.clone();
  m.positionNode = positionGeometry.add(direction.mul(w).mul(wave).mul(amplitude)
    .mul(system.u.gust.mul(1.8).add(0.18)));
  if (kind !== 'cable') m.side = THREE.DoubleSide;
  mesh.geometry = g; mesh.material = m;
  // The small vertex displacement must not get culled at the original bounds.
  g.computeBoundingSphere(); g.boundingSphere.radius += 0.6;
  system.swaying.push({ mesh, originalGeometry, originalMaterial, geometry: g, material: m, direction, inverse, kind });
}

function glassMaterial(material, inStreet) {
  return material?.isMeshStandardNodeMaterial && (
    /glass|window/i.test(material.name) ||
    // street's anonymous M.glass: distinct from its rough walls, signs and voids.
    (inStreet && material.roughness === 0.08 && material.emissiveNode && material.color.getHex() === 0x0b0c0d)
  );
}

function rainGlass(system, source) {
  const m = source.clone(), p = positionWorld;
  // Vertical world-space streaks on either wall orientation; time increases -> heads descend.
  const across = p.x.add(p.z).mul(29), column = across.floor();
  const hash = fract(sin(column.mul(127.1)).mul(43758.5453));
  const line = float(1).sub(smoothstep(0.025, 0.13, fract(across.add(hash.mul(0.3))).sub(0.5).abs()));
  const trail = smoothstep(0.5, 0.96, fract(p.y.mul(1.4).add(system.u.time.mul(hash.mul(0.35).add(0.45))).add(hash)));
  const wet = line.mul(trail).mul(float(1).sub(normalWorldGeometry.y.abs())).mul(system.u.rain);
  m.roughnessNode = mix(source.roughnessNode ?? float(source.roughness), float(0.018), wet.mul(0.9));
  return m;
}

function collectScene(system, ctx) {
  const { THREE, scene } = ctx;
  const candidates = [], point = new THREE.Vector3(), normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material)) return;
    let inStreet = false;
    for (let p = mesh.parent; p; p = p.parent) if (p.name === 'street') inStreet = true;
    if (glassMaterial(mesh.material, inStreet)) {
      const source = mesh.material;
      if (!system.glassMaterials.has(source)) system.glassMaterials.set(source, rainGlass(system, source));
      mesh.material = system.glassMaterials.get(source);
      system.glassMeshes.push({ mesh, source });
    }
    if (!mesh.name.startsWith('merged_')) {
      const g = mesh.geometry;
      if (belongsToLaundry(mesh) && /^garment_(shirt|trousers|towel)/i.test(mesh.name)) sway(system, mesh, 'cloth', THREE);
      else if (g.type === 'TubeGeometry') sway(system, mesh, 'cable', THREE);
      else if (g.type === 'PlaneGeometry' && Math.abs(g.parameters.height - 0.59) < 0.025 &&
        (mesh.renderOrder === 4 || /notice|paper/i.test(mesh.material.name))) sway(system, mesh, 'notice', THREE);
    }
    // Find actual balcony undersides, even after merging. Read positions only;
    // runoff begins just below the outer lip, never at an arbitrary point in air.
    const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal;
    if (!inStreet || !n) return;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      if (normal.y > -0.99) continue;
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      const ax = Math.abs(point.x);
      if (ax < 4.05 || ax > 4.48 || point.y < 3.15 || point.y > 10 || point.z > 5 || point.z < -39) continue;
      if (candidates.some(c => Math.abs(c.z - point.z) < 1.2)) continue;
      candidates.push({ x: point.x - Math.sign(point.x) * 0.012, y: point.y - 0.025, z: point.z,
        score: Math.min(Math.abs(point.z + 3), Math.abs(point.z + 34)) + point.y * 0.6 });
    }
  });
  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, 8);
}

function litter(system, ctx) {
  const { THREE } = ctx, rng = random(0x71a5);
  const count = ctx.params.get('q') === 'low' ? 24 : 32;
  system.bits = [];
  for (let kind = 0; kind < 2; kind++) {
    const g = new THREE.PlaneGeometry(1, 1, 4, 5), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i);
      a.setXYZ(i, x * (kind ? 0.82 + 0.18 * Math.cos(y * 5) : 1), y,
        kind ? 0.19 * Math.cos(x * Math.PI) * Math.cos(y * Math.PI) : 0.035 * Math.sin(x * 12 + y * 9));
    }
    g.computeVertexNormals(); g.computeBoundingBox();
    const m = new THREE.MeshStandardNodeMaterial({ color: kind ? 0x666666 : 0x777570,
      roughness: kind ? 0.3 : 0.82, side: THREE.DoubleSide,
      transparent: !!kind, opacity: kind ? 0.48 : 1, depthWrite: !kind, forceSinglePass: true });
    if (kind) {
      // Two handle holes make the rounded, thin bags distinct from paper scraps.
      const hole = uv().sub(0.5).x.abs().sub(0.24).div(0.11).pow(2)
        .add(uv().y.sub(0.84).div(0.12).pow(2));
      m.maskNode = hole.greaterThan(1);
    }
    const n = kind ? count / 4 : count * 3 / 4;
    const mesh = new THREE.InstancedMesh(g, m, n);
    mesh.name = kind ? 'wind-plastic-bags' : 'wind-paper-scraps';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    system.group.add(mesh); system.owned.push(mesh);
    for (let i = 0; i < n; i++) {
      const sx = (kind ? 0.32 : 0.16) + rng() * 0.16, sy = sx * (0.8 + rng() * 0.5);
      system.bits.push({ mesh, i, x: (rng() * 2 - 1) * (ROAD - 0.5), z: -2 - rng() * 35,
        vx: 0, vz: 0, angle: rng() * 6.28, yaw: rng() * 6.28, phase: rng() * 6.28,
        sx, sy, kind, radius: Math.hypot(sx, sy) * 0.5, stopped: false });
    }
  }
}

function runoff(system, ctx, anchors) {
  const { THREE } = ctx, u = system.u;
  system.lights = ['lamp', 'far'].map(name => ({ name, position: uniform(new THREE.Vector3()),
    direction: uniform(new THREE.Vector3(0, -1, 0)), outer: uniform(0), inner: uniform(1),
    range: uniform(1), intensity: uniform(0), color: uniform(new THREE.Color()) }));
  let lightNode = vec3(0);
  for (const light of system.lights) {
    const delta = positionWorld.sub(light.position), d2 = delta.dot(delta).max(0.000001);
    const angular = smoothstep(light.outer, light.inner, delta.div(d2.sqrt()).dot(light.direction));
    const cutoff = float(1).sub(d2.div(light.range.mul(light.range)).pow(2)).clamp().pow(2);
    lightNode = lightNode.add(light.color.mul(angular.mul(cutoff).mul(light.intensity).div(d2.max(0.25)).mul(0.08).clamp()));
  }
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, forceSinglePass: true });
  m.colorNode = lightNode.min(vec3(1)); // no ambient/self-emission: dark outside street-lamp cones
  const edge = float(1).sub(smoothstep(0.08, 0.5, uv().x.sub(0.5).abs()));
  const pulse = sin(uv().y.mul(48).add(u.time.mul(19))).mul(0.25).add(0.75);
  m.opacityNode = edge.mul(pulse).mul(smoothstep(0, 0.15, uv().y)).mul(u.rain).mul(0.38);
  const weight = float(0.5).sub(positionGeometry.y).max(0).pow(2);
  m.positionNode = positionGeometry.add(vec3(u.wind.x, 0, u.wind.y).mul(weight).mul(0.08).mul(u.gust.add(0.2)));
  const g = new THREE.PlaneGeometry(1, 1, 1, 8);
  // Standalone ?only=wind has no eaves: still submit this material from frame 1,
  // with zero light intensity. No lamps are created and no visibility is toggled.
  const sites = anchors.length ? anchors : [{ x: 4.2, y: 3.24, z: -4 }];
  for (let i = 0; i < sites.length; i++) {
    const a = sites[i], height = Math.min(2.9, a.y - 0.2);
    const mesh = new THREE.Mesh(g, m); mesh.name = 'wind-eave-runoff';
    mesh.position.set(a.x, a.y - height / 2, a.z); mesh.scale.set(0.018 + i % 3 * 0.007, height, 1);
    mesh.frustumCulled = false; mesh.renderOrder = 9;
    system.group.add(mesh); system.owned.push(mesh);
  }
}

export default {
  name: 'wind',
  init(ctx) {
    const { THREE } = ctx;
    this.u = { time: uniform(0), gust: uniform(0), rain: uniform(1), wind: uniform(new THREE.Vector2()) };
    this.swaying = []; this.glassMaterials = new Map(); this.glassMeshes = []; this.owned = [];
    this.rng = random(0x679bed); this.nextGust = 20 + this.rng() * 20;
    this.gustStart = -10; this.gustDuration = 3; this.lastTime = 0;
    this.dummy = new THREE.Object3D(); this.lightTarget = new THREE.Vector3();
    this.group = new THREE.Group(); this.group.name = 'wind';
    const anchors = collectScene(this, ctx);
    litter(this, ctx); runoff(this, ctx, anchors);
    ctx.scene.add(this.group);
    this.debugGust = ctx.params.has('windGust') ? clamp(Number(ctx.params.get('windGust')) || 0) : null;
    this.api = ctx.api.wind = { group: this.group, counts: { cloth: 0, notice: 0, cable: 0,
      debris: this.bits.length, runoff: anchors.length, glass: this.glassMeshes.length } };
    for (const item of this.swaying) this.api.counts[item.kind]++;
    this.update(0, 0, ctx);
  },
  update(dt, t, ctx) {
    const u = this.u;
    // Seeded schedule, separate from litter RNG. Start-to-start interval 20–40 s,
    // raised-cosine pulse 2–4 s. Rewinding the debug clock reproduces the schedule.
    if (t < this.lastTime) {
      this.rng = random(0x679bed); this.nextGust = 20 + this.rng() * 20; this.gustStart = -10;
    }
    this.lastTime = t;
    while (t >= this.nextGust) {
      this.gustStart = this.nextGust; this.gustDuration = 2 + this.rng() * 2;
      this.nextGust += 20 + this.rng() * 20;
    }
    const phase = clamp((t - this.gustStart) / this.gustDuration);
    const pulse = Math.sin(Math.PI * phase) ** 2;
    const base = 0.16 + Math.sin(t * 0.19) * 0.065 + Math.sin(t * 0.071 + 1.2) * 0.045;
    const gust = this.debugGust ?? clamp(base + pulse * 0.76 + clamp(ctx.world.lightning ?? 0) * 0.1);
    ctx.world.windGust = u.gust.value = gust;
    u.time.value = t; u.rain.value = clamp(ctx.world.rain ?? 1);
    u.wind.value.copy(ctx.world.wind);
    for (const item of this.swaying) {
      // Inverse linear transform preserves world wind direction for rotated props.
      const direction = item.direction.value;
      direction.set(u.wind.value.x, 0, u.wind.value.y).applyMatrix3(item.inverse);
      if (item.kind === 'notice') {
        // Pasted sheets can lift away from the wall, never flap inside masonry.
        direction.z = Math.abs(direction.z) + direction.length() * 0.2;
        direction.x *= 0.3; direction.y = 0;
      }
    }
    for (const light of this.lights) {
      const source = ctx.api.street?.[light.name];
      light.intensity.value = source?.visible ? Math.max(0, source.intensity) : 0;
      if (!source) continue;
      source.getWorldPosition(light.position.value); source.target.getWorldPosition(this.lightTarget);
      light.direction.value.copy(this.lightTarget).sub(light.position.value).normalize();
      light.outer.value = Math.cos(source.angle);
      light.inner.value = Math.max(light.outer.value + 0.00001, Math.cos(source.angle * (1 - source.penumbra)));
      light.range.value = source.distance > 0 ? source.distance : 1e6;
      light.color.value.copy(source.color);
    }
    const step = clamp(dt, 0, 0.1), drag = 1 - Math.exp(-step * 2.2), dummy = this.dummy;
    for (const b of this.bits) {
      if (!b.stopped) {
        const speed = (0.3 + gust * 2.8) * (b.kind ? 1.3 : 1);
        b.vx += (u.wind.value.x * speed - b.vx) * drag;
        b.vz += (u.wind.value.y * speed - b.vz) * drag;
        b.x += b.vx * step; b.z += b.vz * step;
        const limit = ROAD - b.radius;
        // No kerb across the junction mouth. Catch the north/south sidewalk edge
        // too, if a scrap has drifted sideways into the crossing.
        const inCrossing = Math.abs(b.z - CROSS_Z) < CROSS_HALF - b.radius;
        if (Math.abs(b.x) >= limit && !inCrossing) {
          if (Math.abs(b.z - CROSS_Z) < CROSS_HALF + b.radius) b.z = CROSS_Z + Math.sign(b.z - CROSS_Z) * (CROSS_HALF - b.radius);
          else b.x = Math.sign(b.x) * limit;
          b.stopped = true; b.vx = b.vz = 0;
        }
        const travel = Math.hypot(b.vx, b.vz) * step;
        b.angle += travel / Math.max(0.12, b.radius) * 0.8;
        b.yaw += travel * Math.sin(b.phase + t * 0.7);
        // Far ends are outside the authored lane: settle, never visibly teleport.
        if (b.z < Z_MIN + b.radius || b.z > Z_MAX - b.radius || Math.abs(b.x) > 45) {
          b.z = clamp(b.z, Z_MIN + b.radius, Z_MAX - b.radius); b.stopped = true; b.vx = b.vz = 0;
        }
      }
      const lift = b.stopped ? 0 : Math.max(0, gust - 0.35) * (b.kind ? 0.55 : 0.22)
        * (0.5 + 0.5 * Math.sin(t * 3 + b.phase)) * Math.min(1, u.wind.value.length());
      dummy.position.set(b.x, 0, b.z);
      dummy.rotation.set(-Math.PI / 2 + Math.sin(b.angle) * (b.stopped ? 0.08 : 0.7), b.yaw, Math.cos(b.angle) * 0.22);
      dummy.scale.set(b.sx, b.sy, b.sx); dummy.updateMatrix();
      // Lowest actual vertex touches the road at every tumble angle (no hovering).
      const a = b.mesh.geometry.attributes.position, e = dummy.matrix.elements;
      let minY = Infinity;
      for (let i = 0; i < a.count; i++) minY = Math.min(minY, e[1] * a.getX(i) + e[5] * a.getY(i) + e[9] * a.getZ(i));
      dummy.position.y = 0.012 - minY + lift; dummy.updateMatrix();
      b.mesh.setMatrixAt(b.i, dummy.matrix);
    }
    for (const mesh of this.owned) if (mesh.isInstancedMesh) mesh.instanceMatrix.needsUpdate = true;
    // All owned meshes stay visible / uncullable from frame 1 (including warm-up).
  },
  dispose(ctx) {
    for (const item of this.swaying) {
      item.mesh.geometry = item.originalGeometry; item.mesh.material = item.originalMaterial;
      item.geometry.dispose(); item.material.dispose();
    }
    for (const item of this.glassMeshes) item.mesh.material = item.source;
    for (const material of this.glassMaterials.values()) material.dispose();
    const geometries = new Set(), materials = new Set();
    for (const mesh of this.owned) { geometries.add(mesh.geometry); materials.add(mesh.material); mesh.dispose?.(); }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.group.removeFromParent();
    if (ctx?.api.wind === this.api) { delete ctx.api.wind; ctx.world.windGust = 0; }
  },
};
