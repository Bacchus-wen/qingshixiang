import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LANE } from './index.js';

// v2 street props: Seedream reference images -> Tripo image-to-3D (company tools, internal showcase), normalized to
// real size with origin at the bottom centre (tools/blender/normalize_prop.py). Their own PBR textures are kept;
// only a wet roughness on top so they belong to the rain.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

function wetten(m) {
  if (!m || m.userData.wet) return m;
  m.userData.wet = true;
  m.roughness = Math.min(m.roughness ?? 1, 0.85) * 0.8;
  m.envMapIntensity = 0.8;
  return m;
}

export async function placeV2Props(ctx, root) {
  const W = LANE.halfRoad + LANE.walk, c = LANE.curb;
  // [name, x, y, z, ry]  (the home door at x≈4.95, z≈-14.7 and the robot's corner stay clear)
  const list = [
    ['tricycle', -(W - 1.0), c, -20.0, Math.PI / 2 + 0.06],
    ['freezer', W - 0.55, c, -22.6, 0],
    ['scooter', LANE.halfRoad - 0.7, 0, -28.5, 0.25],
    ['lpg', W - 0.45, c, -9.2, 0.6],
    ['stools', -(W - 0.5), c, -24.4, 0.3],
    ['bins', W - 0.65, c, -31.5, -Math.PI / 2],
    ['stove', W - 0.5, c, -18.2, 1.1],
    ['meterbox', -(W - 0.18), 1.5, -12.6, 0],
    ['bins', -(W - 0.6), c, -35.0, Math.PI / 2 + 0.2],
    ['stools', W - 0.5, c, -24.0, -0.4],
  ];
  const cache = new Map();
  const out = [];
  await Promise.all(list.map(async ([name, x, y, z, ry]) => {
    try {
      if (!cache.has(name)) cache.set(name, loader.loadAsync(`/models/v2/${name}.glb`));
      const g = await cache.get(name);
      const o = g.scene.clone(true);
      o.traverse((m) => { m.userData.dynamic = true; if (m.isMesh) { m.material = wetten(m.material); m.castShadow = true; m.receiveShadow = true; } }); // textured: keep out of the untextured static merge
      o.position.set(x, y, z); o.rotation.y = ry; o.userData.prop = `v2/${name}`;
      root.add(o); out.push(o);
    } catch (e) { console.warn('[v2props] failed', name, e); }
  }));
  return out;
}
