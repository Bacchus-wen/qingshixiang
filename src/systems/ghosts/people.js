import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const JOINTS = ['body', 'leg_l', 'leg_r', 'arm_l', 'arm_r'];
const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

function smoothNormals(g) {
  const m = mergeVertices((() => { const c = g.clone(); c.deleteAttribute('normal'); for (const k of Object.keys(c.attributes)) if (k !== 'position') c.deleteAttribute(k); return c; })(), 1e-4);
  m.computeVertexNormals();
  g.copy(m);
}

// Bake exporter transforms into Y-up / +Z-forward geometry once, keeping each
// shoulder/hip pivot separate. No cloning scenes or rebuilding vertices per frame.
export function preparePeople(scene) {
  const geometries = [];
  try {
    scene.updateMatrixWorld(true);
    return Array.from({ length: 8 }, (_, type) => {
      const root = scene.getObjectByName(`person_${type}`);
      const height = root?.userData.height;
      if (!root || !Number.isFinite(height) || height < .5 || height > 2.5) {
        throw new Error(`Invalid person_${type} height/root`);
      }
      const origin = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
      const parts = [];
      let triangles = 0, radius = 0;
      root.traverse(node => {
        if (!node.isMesh) return;
        const name = node.userData.part;
        const joint = node.userData.joint || name;
        if (!JOINTS.includes(joint) || node.isSkinnedMesh) throw new Error('Unsupported people part');
        const pivot = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).sub(origin).divideScalar(height);
        const geometry = node.geometry.clone();
        geometries.push(geometry);
        geometry.applyMatrix4(node.matrixWorld).translate(-origin.x, -origin.y, -origin.z);
        geometry.scale(1 / height, 1 / height, 1 / height);
        const position = geometry.getAttribute('position');
        if (!position || !Array.from(position.array).every(Number.isFinite)) throw new Error('Invalid people vertices');
        // Conservative radius about the CPU broad-phase centre, including props.
        const v = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i); v.y -= .58;
          radius = Math.max(radius, v.length());
        }
        geometry.translate(-pivot.x, -pivot.y, -pivot.z);
        // smooth normals so the amber rim rolls around bodies instead of lighting whole facets (Claude)
        smoothNormals(geometry);
        geometry.computeBoundingSphere();
        triangles += (geometry.index?.count ?? position.count) / 3;
        const hand = finite3(node.userData.hand) ? new THREE.Vector3(...node.userData.hand).divideScalar(height) : null;
        if (joint.startsWith('arm') && (!hand || hand.lengthSq() < .001)) throw new Error('Missing hand marker');
        const swing = node.userData.swing;
        if (!Number.isFinite(swing) || Math.abs(swing) > .5) throw new Error('Invalid limb swing');
        parts.push({ name, joint, pivot, hand, geometry, swing,
          hideWhenHolding: node.userData.hideWhenHolding === true });
      });
      if (!JOINTS.every(joint => parts.some(p => p.name === joint)) || triangles >= 3000) {
        throw new Error(`Incomplete or over-budget person_${type}`);
      }
      return { parts, radius };
    });
  } catch (error) {
    geometries.forEach(g => g.dispose());
    throw error;
  }
}

export async function loadPeople() {
  const base = import.meta.env?.BASE_URL || '/';
  const gltf = await new GLTFLoader().loadAsync(`${base}models/people.glb`);
  try {
    return preparePeople(gltf.scene);
  } finally {
    // Runtime owns baked copies and a shared silhouette material only.
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
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  }
}
