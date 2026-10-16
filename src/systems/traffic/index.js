import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attribute, uv, float, smoothstep } from 'three/tsl';
import { crowd } from '../ghosts/index.js';
import { lifeState, syncLife, lifeMask, inMemory, silhouette, coverage, streetTint } from '../ghosts/life.js';

const MIN_Z = -40, MAX_Z = -6, COUNT = 4;
const UP = new THREE.Vector3(0, 1, 0);
const wrap = (n, span) => ((n % span) + span) % span;
export function poseCar(car, t) {
  car.travel = car.offset + t * car.speed;
  car.position.set(car.direction > 0 ? 1.65 : -1.65, 0,
    car.speed === 0 ? car.offset : MAX_Z - wrap(car.travel, MAX_Z - MIN_Z));
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

function lampsGeometry() {
  const pieces = [];
  for (const [z, tint, w, h] of [[2.077, [1, .82, .5], .28, .12], [-2.072, [1, .12, .05], .25, .10]]) {
    for (const x of [-.60, .60]) {
      const g = new THREE.PlaneGeometry(w, h).translate(x, .75, z);
      g.setAttribute('lampTint', new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => tint).flat(), 3));
      g.setAttribute('lampPower', new THREE.Float32BufferAttribute(new Float32Array(4).fill(z > 0 ? 6 : 3), 1));
      pieces.push(g);
    }
  }
  const geometry = mergeGeometries(pieces, false); pieces.forEach(g => g.dispose()); return geometry;
}
function mergeBody(parts) {
  const pieces = parts.filter(p => !p.wheel).map(p => p.geometry.clone().translate(p.pivot.x, p.pivot.y, p.pivot.z));
  const geometry = mergeGeometries(pieces, false); pieces.forEach(g => g.dispose()); return geometry;
}

export default {
  name: 'traffic',
  loadCar,
  async init(ctx) {
    const source = await this.loadCar();
    this.life = lifeState();
    const presence = attribute('lifePresence');
    const bodyMaterial = silhouette(this.life, attribute('lifeTint', 'vec3'), .3); // dark bodies, neon on the edges
    bodyMaterial.maskNode = coverage(lifeMask(this.life).mul(presence));
    const lampMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    lampMaterial.colorNode = attribute('lampTint', 'vec3').mul(attribute('lampPower'));
    lampMaterial.maskNode = coverage(lifeMask(this.life).mul(presence));
    const poolMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
    poolMaterial.forceSinglePass = true;
    const falloff = float(1).sub(smoothstep(.05, 1, uv().sub(.5).mul(2).length())).pow(2);
    poolMaterial.colorNode = attribute('poolTint', 'vec3').mul(.35);
    // Both source and receiver must be remembered, or an off-cone car could
    // illuminate the present. Flood/debug are shared by both tests.
    poolMaterial.opacityNode = falloff.mul(lifeMask(this.life)).mul(lifeMask(this.life, attribute('lampAnchor', 'vec3'))).mul(presence);
    this.materials = [bodyMaterial, lampMaterial, poolMaterial];
    const wheel = source.find(p => p.name === 'wheel_fr');
    this.wheelPivots = source.filter(p => p.wheel).map(p => p.pivot.clone());
    this.parts = [
      { name: 'body', geometry: mergeBody(source), multiplier: 1, material: 0 },
      { name: 'wheels', geometry: wheel.geometry.clone(), multiplier: 4, material: 0 },
      { name: 'lamps', geometry: lampsGeometry(), multiplier: 1, material: 1 },
      { name: 'wet-road-pools', geometry: new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2), multiplier: 2, material: 2 },
    ];
    source.forEach(p => p.geometry.dispose());
    this.cars = Array.from({ length: COUNT }, (_, i) => ({
      // Parked on the right, away from the present-day wreck at z=-18;
      // two departing cars move down the clear opposite lane, 17 m apart.
      direction: i < 2 ? 1 : -1, speed: i < 2 ? 0 : 1.35,
      offset: i < 2 ? [-9.5, -31][i] : (i-2)*17 + 6,
      position: new THREE.Vector3(), travel: 0,
    }));
    this.group = new THREE.Group(); this.group.name = 'traffic';
    this.hidden = new THREE.Matrix4().makeScale(1e-6,1e-6,1e-6).setPosition(0,-10000,0);
    this.matrix = new THREE.Matrix4(); this.rootMatrix = new THREE.Matrix4(); this.localMatrix = new THREE.Matrix4();
    this.wheelFlip = new THREE.Matrix4().makeRotationY(Math.PI);
    this.rotation = new THREE.Quaternion(); this.scale = new THREE.Vector3(1,1,1);
    this.center = new THREE.Vector3(); this.anchor = new THREE.Vector3(); this.tint = new THREE.Color();
    this.broad = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), strength: 1, angle: 0, range: 0 };
    this.visible = new Uint8Array(COUNT);
    for (const part of this.parts) {
      const capacity = COUNT * part.multiplier;
      part.geometry.setAttribute('lifePresence', new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
      if (part.material === 0) part.geometry.setAttribute('lifeTint', new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3));
      if (part.material === 2) {
        part.geometry.setAttribute('poolTint', new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3));
        part.geometry.setAttribute('lampAnchor', new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3));
      }
      part.mesh = new THREE.InstancedMesh(part.geometry, this.materials[part.material], capacity);
      part.mesh.name = `traffic-${part.name}`;
      part.mesh.frustumCulled = false;
      part.mesh.castShadow = part.mesh.receiveShadow = false;
      part.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i=0; i<capacity; i++) part.mesh.setMatrixAt(i,this.hidden);
      this.group.add(part.mesh);
    }
    ctx.scene.add(this.group);
    ctx.api.traffic = { count: COUNT, visibleCount: 0, source: 'glb', sceneDraws: 4 };
    this.frames = 0; this.update(0,0,ctx); this.frames = 0;
  },
  update(dt,t,ctx) {
    const warmup = this.frames++ < 30;
    const enabled = syncLife(this.life,ctx,crowd.value);
    this.group.visible = warmup || enabled;
    let last = -1, visibleCount = 0;
    for (let i=0; i<COUNT; i++) {
      const car = this.cars[i]; poseCar(car,t);
      this.center.copy(car.position); this.center.y = .75;
      // Bounds cover the body AND the 6 m headlight reflection in front.
      const visible = warmup || (enabled && inMemory(this.center,9,ctx,this.life,this.broad));
      this.rotation.setFromAxisAngle(UP,car.direction > 0 ? 0 : Math.PI);
      this.rootMatrix.compose(car.position,this.rotation,this.scale);
      streetTint(ctx,car.position,this.tint);
      // Dissolve at the route boundaries before wrapping; never teleport a lit
      // car/reflection across the remembered street. Debug shows every slot.
      const presence = this.life.debug.value || !car.speed ? 1
        : THREE.MathUtils.smoothstep(car.position.z, MIN_Z, MIN_Z+2)
          * (1-THREE.MathUtils.smoothstep(car.position.z, MAX_Z-2, MAX_Z));
      for (const part of this.parts) for (let j=0; j<part.multiplier; j++) {
        const slot=i*part.multiplier+j;
        part.geometry.attributes.lifePresence.setX(slot,presence);
        if (!visible) { part.mesh.setMatrixAt(slot,this.hidden); continue; }
        this.localMatrix.identity();
        if (part.name === 'wheels') {
          this.localMatrix.makeRotationX(car.speed ? car.travel/.33 : 0);
          if (this.wheelPivots[j].x < 0) this.localMatrix.multiply(this.wheelFlip);
          this.localMatrix.setPosition(this.wheelPivots[j]);
        } else if (part.material === 2) {
          const front = j === 0;
          this.localMatrix.makeScale(front ? 2.1 : 1.5,1,front ? 6 : 2.2).setPosition(0,.025,front ? 4.8 : -2.9);
          part.geometry.attributes.poolTint.setXYZ(slot,1,front ? .82 : .12,front ? .5 : .05);
          this.anchor.set(0,.75,front ? 2.077 : -2.072).applyMatrix4(this.rootMatrix);
          part.geometry.attributes.lampAnchor.setXYZ(slot,this.anchor.x,this.anchor.y,this.anchor.z);
        }
        part.mesh.setMatrixAt(slot,this.matrix.multiplyMatrices(this.rootMatrix,this.localMatrix));
        if (part.material === 0) part.geometry.attributes.lifeTint.setXYZ(slot,this.tint.r,this.tint.g,this.tint.b);
      }
      this.visible[i] = visible ? 1 : 0;
      if (visible) { last=i; visibleCount++; }
    }
    for (const part of this.parts) {
      part.mesh.count = (last+1)*part.multiplier;
      part.mesh.instanceMatrix.needsUpdate = true;
      for (const name of ['lifeTint','poolTint','lampAnchor','lifePresence']) if (part.geometry.attributes[name]) part.geometry.attributes[name].needsUpdate = true;
    }
    ctx.api.traffic.visibleCount=visibleCount;
  },
  dispose(ctx) {
    this.group?.removeFromParent();
    for (const part of this.parts || []) { part.mesh.dispose(); part.geometry.dispose(); }
    for (const material of this.materials || []) material.dispose();
    if (ctx?.api) delete ctx.api.traffic;
  },
};
