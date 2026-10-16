import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  floor, positionWorld, lights, vec3, pow, float, abs, dot,
  normalView, positionViewDirection, smoothstep, distance, cameraPosition,
} from 'three/tsl';
import { memoryMask, memoryMaskCPU, amberNode } from '../../materials/memory.js';
import { crowd } from '../ghosts/index.js';

const MIN_Z = -66, MAX_Z = 12, LENGTH = MAX_Z - MIN_Z, COUNT = 6;
const UP = new THREE.Vector3(0, 1, 0);
const wrap = (n, span) => ((n % span) + span) % span;

// Equal speeds within a lane guarantee a 26 m headway indefinitely, including
// across the wrap. Absolute time makes skipped updates and shot seeks identical.
export function poseCar(car, t) {
  car.travel = car.offset + t * car.speed;
  const along = wrap(car.travel, LENGTH);
  car.position.set(car.direction > 0 ? 1.6 : -1.6, 0,
    car.direction > 0 ? MIN_Z + along : MAX_Z - along);
}

function material(glow = 0) {
  const m = new THREE.MeshStandardNodeMaterial({
    roughness: 1, metalness: 0, transparent: false, depthWrite: true,
    depthTest: true, blending: THREE.NoBlending, side: THREE.DoubleSide,
  });
  // Same world-locked 4x4 ordered coverage as the crowd: no blending or
  // frame-dependent noise, and a nonzero threshold so a closed eye draws nothing.
  const cell = floor(positionWorld.mul(64));
  const x = cell.x.add(cell.z.mul(3)), y = cell.y.add(cell.z.mul(2));
  const parity = v => v.sub(floor(v.div(2)).mul(2));
  const bayer2 = (a, b) => parity(a.add(b)).mul(2).add(parity(b));
  const threshold = bayer2(x, y).mul(4)
    .add(bayer2(floor(x.div(2)), floor(y.div(2)))).add(0.5).div(16);
  const nearFade = smoothstep(0.8, 4, distance(positionWorld, cameraPosition));
  const endFade = smoothstep(MIN_Z, MIN_Z + 4, positionWorld.z)
    .mul(float(1).sub(smoothstep(MAX_Z - 4, MAX_Z, positionWorld.z)));
  const mask = memoryMask(positionWorld).mul(crowd).mul(nearFade).mul(endFade);
  m.maskNode = mask.greaterThan(threshold);
  m.lightsNode = lights([]);
  m.colorNode = vec3(0);
  const rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 5);
  m.emissiveNode = amberNode().mul(glow || rim.mul(0.18)).mul(mask);
  return m;
}

// Exported for headless geometry checks. The GLB is centred around its OPEN door,
// and its body has a baked 2.3-degree lean (props.py). Recover author coordinates
// from the intact right tyre before applying the specified door hinge transform.
export function prepareCar(scene) {
  scene.updateMatrixWorld(true);
  const root = scene.getObjectByName('car');
  if (!root) throw new Error('car.glb: missing car root');
  const right = root.getObjectByName('wheel_fr');
  if (!right) throw new Error('car.glb: missing front right wheel');
  const box = new THREE.Box3().setFromObject(right);
  const offset = new THREE.Vector3(box.min.x - (0.84 - 0.095),
    (box.min.y + box.max.y) / 2 - 0.325, (box.min.z + box.max.z) / 2 - 1.30);
  const unlean = new THREE.Matrix4().makeTranslation(0, 0.42, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(-2.3)))
    .multiply(new THREE.Matrix4().makeTranslation(0, -0.42, 0));
  const closeDoor = new THREE.Matrix4().makeTranslation(-0.825, 0.72, 0.79)
    .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(-50)))
    .multiply(new THREE.Matrix4().makeTranslation(0.825, -0.72, -0.79));
  const parts = [], owned = new Set();
  try {
    for (const node of root.children) {
      const name = node.userData.part || node.name;
      const wheel = name.startsWith('wheel_');
      const pivot = wheel ? new THREE.Vector3(name.endsWith('l') ? -0.84 : 0.84,
        name.endsWith('l') ? 0.225 : 0.325, name.startsWith('wheel_f') ? 1.30 : -1.31)
        : new THREE.Vector3();
      const pieces = [];
      node.traverse(mesh => {
        if (!mesh.isMesh) return;
        // GLTFLoader makes material primitives into child meshes. Merge them
        // after baking so each semantic part costs just one instanced draw.
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        owned.add(g);
        g.applyMatrix4(mesh.matrixWorld).translate(-offset.x, -offset.y, -offset.z);
        if (!wheel) g.applyMatrix4(unlean);
        if (name === 'door_fl') g.applyMatrix4(closeDoor);
        for (const key of Object.keys(g.attributes)) {
          if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
        }
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        g.translate(-pivot.x, -pivot.y, -pivot.z);
        pieces.push(g);
      });
      if (!pieces.length) continue;
      const geometry = mergeGeometries(pieces, false);
      if (!geometry) throw new Error(`car.glb: cannot merge ${name}`);
      owned.add(geometry);
      for (const g of pieces) { g.dispose(); owned.delete(g); }
      parts.push({ name, geometry, pivot, wheel });
    }
    for (const name of ['body', 'door_fl', 'glass', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
      if (!parts.some(p => p.name === name)) throw new Error(`car.glb: missing ${name}`);
    }
    // Past traffic has inflated tyres. Reuse the intact right wheels, turning
    // their outward hub to the left, rather than spinning the prop's flat tyres.
    for (const axle of ['f', 'r']) {
      const left = parts.find(p => p.name === `wheel_${axle}l`);
      const rightPart = parts.find(p => p.name === `wheel_${axle}r`);
      left.geometry.dispose(); owned.delete(left.geometry);
      left.geometry = rightPart.geometry.clone().rotateY(Math.PI);
      owned.add(left.geometry);
      left.pivot.y = rightPart.pivot.y;
    }
    return parts;
  } catch (error) {
    for (const g of owned) g.dispose();
    throw error;
  }
}

async function loadCar() {
  const base = import.meta.env?.BASE_URL || '/';
  const gltf = await new GLTFLoader().loadAsync(`${base}models/props/car.glb`);
  try { return prepareCar(gltf.scene); }
  finally {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      geometries.add(node.geometry);
      for (const m of (Array.isArray(node.material) ? node.material : [node.material])) {
        if (!m) continue;
        materials.add(m);
        for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  }
}

function lampPair(z, y, width, height) {
  const left = new THREE.PlaneGeometry(width, height).translate(-0.60, y, z);
  const right = new THREE.PlaneGeometry(width, height).translate(0.60, y, z);
  const geometry = mergeGeometries([left, right], false);
  left.dispose(); right.dispose();
  return geometry;
}

export default {
  name: 'traffic',
  async init(ctx) {
    this.parts = await loadCar();
    this.materials = [material(), material(0.24), material(0.045)];
    // Small emissive surfaces only. No new lights or shadow casters.
    this.parts.push(
      { name: 'headlights', geometry: lampPair(2.077, 0.75, 0.24, 0.10), pivot: new THREE.Vector3(), material: 1 },
      { name: 'taillights', geometry: lampPair(-2.072, 0.73, 0.20, 0.07), pivot: new THREE.Vector3(), material: 2 },
    );
    this.group = new THREE.Group(); this.group.name = 'traffic';
    this.hidden = new THREE.Matrix4().makeScale(1e-6, 1e-6, 1e-6).setPosition(0, -10000, 0);
    this.cars = Array.from({ length: COUNT }, (_, i) => ({
      direction: i < 3 ? -1 : 1, speed: i < 3 ? 5.2 : 6.4,
      offset: (i % 3) * 26 + (i < 3 ? 5 : 14), position: new THREE.Vector3(), travel: 0,
    }));
    this.visible = new Uint8Array(COUNT);
    this.frames = 0;
    this.rootMatrix = new THREE.Matrix4(); this.localMatrix = new THREE.Matrix4();
    this.matrix = new THREE.Matrix4(); this.rotation = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1); this.center = new THREE.Vector3();
    this.broad = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), strength: 1, angle: 0, range: 0 };
    for (const part of this.parts) {
      part.mesh = new THREE.InstancedMesh(part.geometry, this.materials[part.material || 0], COUNT);
      part.mesh.name = `traffic-${part.name}`;
      part.mesh.castShadow = part.mesh.receiveShadow = false;
      part.mesh.frustumCulled = false; // CPU cone broad phase owns moving-instance culling.
      part.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < COUNT; i++) part.mesh.setMatrixAt(i, this.hidden);
      this.group.add(part.mesh);
    }
    ctx.scene.add(this.group);
    ctx.api.traffic = { count: COUNT, visibleCount: 0, source: 'glb' };
    // Seed actual nonzero instance counts before the first render. Keeping only
    // Group.visible=true with count=0 would skip the intended shader warm-up.
    this.update(0, 0, ctx);
    this.frames = 0;
  },
  update(dt, t, ctx) {
    const warmup = this.frames++ < 30;
    const m = ctx.memory;
    const enabled = !!m && m.strength > 0 && m.range > 0 && crowd.value > 0;
    this.group.visible = warmup || enabled;
    if (enabled) {
      this.broad.origin.copy(m.origin); this.broad.dir.copy(m.dir);
    }
    let last = -1, visibleCount = 0, dirty = false;
    for (let i = 0; i < COUNT; i++) {
      const car = this.cars[i];
      poseCar(car, t);
      let visible = warmup;
      if (!visible && enabled) {
        this.center.copy(car.position); this.center.y += 0.75;
        const d = this.center.distanceTo(m.origin), radius = 2.6;
        // Include the whole car, wheel rotation and memoryMask's noisy edge.
        this.broad.angle = Math.min(Math.PI,
          Math.acos(Math.max(-1, Math.cos(m.angle) - 0.10))
          + Math.asin(Math.min(1, radius / Math.max(d, 0.001))));
        this.broad.range = m.range + radius + 0.5;
        visible = d <= radius || memoryMaskCPU(this.center, this.broad) > 0;
      }
      if (visible) {
        this.rotation.setFromAxisAngle(UP, car.direction > 0 ? 0 : Math.PI);
        this.rootMatrix.compose(car.position, this.rotation, this.scale);
        for (const part of this.parts) {
          if (part.wheel) this.localMatrix.makeRotationX(wrap(car.travel / 0.33, Math.PI * 2));
          else this.localMatrix.identity();
          this.localMatrix.setPosition(part.pivot);
          part.mesh.setMatrixAt(i, this.matrix.multiplyMatrices(this.rootMatrix, this.localMatrix));
        }
        last = i; visibleCount++; dirty = true;
      } else if (this.visible[i]) {
        // One invalidation on exit, then no matrix writes while outside the cone.
        for (const part of this.parts) part.mesh.setMatrixAt(i, this.hidden);
        dirty = true;
      }
      this.visible[i] = visible ? 1 : 0;
    }
    for (const part of this.parts) {
      part.mesh.count = last + 1; // Stable slot identity for temporal history.
      if (dirty) part.mesh.instanceMatrix.needsUpdate = true;
    }
    ctx.api.traffic.visibleCount = visibleCount;
  },
  dispose(ctx) {
    this.group?.removeFromParent();
    for (const part of this.parts || []) { part.mesh?.dispose(); part.geometry.dispose(); }
    for (const m of this.materials || []) m.dispose();
    if (ctx?.api) delete ctx.api.traffic;
  },
};
