import * as THREE from 'three/webgpu';
import { attribute, texture, uv, positionWorld, vec3, float, mix, smoothstep, length, hash, floor } from 'three/tsl';
import { memoryMask } from '../../materials/memory.js';

export function createMaterials(atlas, mode) {
  const past = mode === 'past' ? float(1) : memoryMask(positionWorld);
  const tint = attribute('neonTint', 'vec3');
  const power = attribute('neonPower', 'float');
  const faded = mix(vec3(0.24, 0.28, 0.3), tint, 0.38);
  const masks = texture(atlas);
  const local = attribute('neonUV', 'vec2');
  const dirt = hash(floor(positionWorld.mul(35)).dot(vec3(7, 31, 53))).mul(0.32).add(0.68);
  const edge = smoothstep(0.0, 0.035, local.x).mul(smoothstep(0.0, 0.035, float(1).sub(local.x)))
    .mul(smoothstep(0.0, 0.035, local.y)).mul(smoothstep(0.0, 0.035, float(1).sub(local.y)));
  const face = new THREE.MeshStandardNodeMaterial({ roughness: 0.67, metalness: 0.12 });
  face.name = 'neon-faces';
  face.colorNode = vec3(0.025, 0.03, 0.032).mul(dirt).mul(edge.mul(0.6).add(0.4)).add(vec3(0.085).mul(masks.r));
  const now = faded.mul(masks.g.mul(1.05).add(masks.a.mul(0.24))).mul(power);
  const then = tint.mul(masks.r.mul(5.4).add(masks.b.mul(1.4))).add(vec3(0.3).mul(masks.r));
  // A tiny cold floor keeps dead glass lettering legible even when no direct lamp reaches it.
  face.emissiveNode = mix(now, then, past).add(vec3(0.008, 0.01, 0.012).mul(masks.r).mul(dirt));

  const housing = new THREE.MeshStandardNodeMaterial({ color: 0x252c2d, roughness: 0.78, metalness: 0.4 });
  housing.name = 'neon-cabinets-and-brackets';

  const ground = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  ground.name = 'neon-ground-spill';
  const center = attribute('neonAnchor', 'vec3');
  // Source AND receiving point must remember: a dead sign cannot cast a memory-coloured pool.
  const sourcePast = mode === 'past' ? float(1) : memoryMask(center);
  const groundPast = past.mul(sourcePast);
  const radius = length(uv().sub(0.5).mul(2));
  const falloff = float(1).sub(smoothstep(0.05, 1, radius)).pow(2);
  ground.colorNode = mix(faded.mul(power).mul(0.075), tint.mul(0.55), groundPast);
  ground.opacityNode = falloff;
  ground.forceSinglePass = true;
  return { face, housing, ground };
}
