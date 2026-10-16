import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  vec2, vec3, float, mix, smoothstep, positionWorld, normalWorldGeometry, mx_fractal_noise_float, mx_noise_float,
  attribute, length, abs, fract, atan, max,
} from 'three/tsl';
import { wetUniforms } from '../../materials/wet.js';

// Blender-built street props (tools/blender/props.py). Glb materials carry only names + grey values; here they
// become node materials with grime pockets, rain runs and a wet film on up-facing faces.
const loader = new GLTFLoader();
const cache = new Map();

function weathered(src, ccAC = false) {
  const base = src.color ? (src.color.r + src.color.g + src.color.b) / 3 : 0.4;
  const n = (src.name || '').toLowerCase();
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld;
  const pocket = smoothstep(0.15, 0.7, mx_fractal_noise_float(P.mul(4.0), 3, 2.0, 0.5).mul(0.5).add(0.5));
  const runs = smoothstep(0.55, 0.85, mx_noise_float(vec3(P.x.mul(22), P.y.mul(1.8), P.z.mul(22))));
  const up = smoothstep(0.4, 0.9, normalWorldGeometry.y).mul(wetUniforms.wetness);
  m.colorNode = vec3(float(base).mul(mix(float(1), float(0.5), pocket.mul(0.7))).mul(mix(float(1), float(0.65), runs)));
  const rough = n.includes('glass') ? 0.05 : n.includes('rubber') ? 0.8 : n.includes('paper') ? 0.9 : src.roughness ?? 0.5;
  m.roughnessNode = mix(float(rough), float(0.1), up.mul(n.includes('paper') ? 0.2 : 0.75));
  m.metalnessNode = float(n.includes('metal') || n.includes('paint') ? Math.min(src.metalness ?? 0.4, 0.6) : 0);
  if (n.includes('glass')) { m.transparent = false; m.colorNode = vec3(0.02); }
  if (ccAC && src.name === 'ac_dark') {
    // Fan coordinate is baked before static merging, so rings stay centered on each unit.
    const q = attribute('ccFan', 'vec2').sub(vec2(-0.12, 0.34));
    const radius = length(q);
    const phase = radius.div(0.034);
    const aa = phase.fwidth().max(0.02);
    const ring = float(1).sub(smoothstep(float(0.12).sub(aa), float(0.12).add(aa), abs(fract(phase).sub(0.5))));
    const angle = atan(q.y, q.x);
    const spoke = float(1).sub(smoothstep(0.01, 0.025, abs(fract(angle.div(1.5708).add(0.5)).sub(0.5)).mul(radius)));
    const grille = max(ring, spoke).mul(float(1).sub(smoothstep(0.222, 0.236, radius)));
    m.colorNode = mix(vec3(0.018), vec3(0.37, 0.38, 0.34), grille);
    m.roughnessNode = mix(float(0.8), float(0.48), grille);
    m.metalnessNode = grille.mul(0.65);
  }
  m.name = src.name;
  return m;
}

export async function loadProp(name) {
  if (!cache.has(name)) {
    const url = `/models/${name.includes('/') ? name : `props/${name}`}.glb`; // 'props2/shoe' etc.
    cache.set(name, loader.loadAsync(url).then((g) => {
      const mats = new Map();
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const key = o.material.name || o.material.uuid;
        if (!mats.has(key)) mats.set(key, weathered(o.material, name === 'cc/ac_unit'));
        if (name === 'cc/ac_unit' && key === 'ac_dark') {
          o.geometry = o.geometry.clone();
          const pos = o.geometry.attributes.position;
          const fan = new Float32Array(pos.count * 2);
          for (let i = 0; i < pos.count; i++) { fan[i * 2] = pos.getX(i); fan[i * 2 + 1] = pos.getY(i); }
          o.geometry.setAttribute('ccFan', new THREE.BufferAttribute(fan, 2));
        }
        o.material = mats.get(key);
        o.castShadow = true; o.receiveShadow = true;
      });
      return g.scene;
    }));
  }
  return (await cache.get(name)).clone(true);
}

// place(name, x, y, z, ry, extra) -> Object3D; extra: { scale, rx, rz }
export async function placeProps(root, list) {
  const out = [];
  await Promise.all(list.map(async ([name, x, y, z, ry = 0, extra = {}]) => {
    try {
      const o = await loadProp(name);
      o.position.set(x, y, z);
      o.rotation.set(extra.rx ?? 0, ry, extra.rz ?? 0);
      if (extra.scale) o.scale.setScalar(extra.scale);
      o.userData.prop = name;
      root.add(o);
      out.push(o);
    } catch (e) { console.warn('[props] failed', name, e); }
  }));
  return out;
}
