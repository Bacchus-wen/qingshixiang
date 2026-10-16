import * as THREE from 'three/webgpu';
import { attribute, texture, uv, positionWorld, vec3, float, mix, smoothstep, length, hash, floor } from 'three/tsl';
import { mains, memoryMask } from '../../materials/memory.js';
import { TUBE_INTENSITY, LIGHTBOX_RATIO } from './layout.js';

export function createMaterials(atlas, mode) {
  const past = mode === 'past' ? float(1) : memoryMask(positionWorld);
  const tint = attribute('neonTint', 'vec3');
  const power = attribute('neonPower', 'float');
  const style = attribute('neonStyle', 'vec3'); // diffuser / selected broken circuit / accent
  const paper = attribute('neonPaper', 'vec3');
  const accent = style.z; // 0 = artwork, otherwise LED/downlight intensity
  const isAccent = smoothstep(0, 0.01, accent);
  const faded = mix(vec3(0.24, 0.28, 0.3), tint, 0.8); // v2 review: the survivors keep their colour
  const masks = texture(atlas);
  const local = attribute('neonUV', 'vec2');
  const dirt = hash(floor(positionWorld.mul(35)).dot(vec3(7, 31, 53))).mul(0.32).add(0.68);
  const edge = smoothstep(0.0, 0.035, local.x).mul(smoothstep(0.0, 0.035, float(1).sub(local.x)))
    .mul(smoothstep(0.0, 0.035, local.y)).mul(smoothstep(0.0, 0.035, float(1).sub(local.y)));
  const face = new THREE.MeshStandardNodeMaterial({ roughness: 0.67, metalness: 0.12 });
  face.name = 'neon-faces';
  const tubeSurface = vec3(0.025, 0.03, 0.032).mul(dirt).mul(edge.mul(0.6).add(0.4)).add(vec3(0.085).mul(masks.r));
  const diffuser = mix(paper, tint.mul(0.72), masks.r);
  face.colorNode = mix(mix(tubeSurface, diffuser.mul(0.22).mul(dirt), style.x), vec3(0.12), isAccent);
  const now = faded.mul(masks.g.mul(2.6).add(masks.a.mul(0.3))).mul(power).mul(mains); // the surviving tubes trip with the street
  const tube = mix(masks.r, masks.g, style.y);
  const halo = mix(masks.b, masks.a, style.y);
  // Small halo keeps the hollow glyph centre dark. The same broken mask cuts tube AND halo.
  const core = smoothstep(0.82, 0.98, tube); // Middle stroke composites to 0.805; only the inner stroke goes white.
  const tubeThen = tint.mul(tube.mul(TUBE_INTENSITY).add(halo.mul(0.22)))
    .add(vec3(1, 0.95, 0.92).mul(core).mul(TUBE_INTENSITY * 0.55));
  const then = mix(tubeThen, diffuser.mul(TUBE_INTENSITY * LIGHTBOX_RATIO), style.x);
  // A tiny cold floor keeps dead glass lettering legible even when no direct lamp reaches it.
  const signEmission = mix(now, then, past).add(vec3(0.008, 0.01, 0.012).mul(masks.r).mul(dirt).mul(float(1).sub(style.x)));
  face.emissiveNode = mix(signEmission, tint.mul(accent).mul(past), isAccent);

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
  const spill = mix(tint, paper.mul(LIGHTBOX_RATIO), style.x);
  ground.colorNode = mix(faded.mul(power).mul(0.04).mul(mains), spill.mul(0.16), groundPast); // v3: real lights make the pools now
  ground.opacityNode = falloff;
  ground.forceSinglePass = true;
  return { face, housing, ground };
}
