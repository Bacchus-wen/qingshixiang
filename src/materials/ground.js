// cybercity ground textures adapted for our lane and existing wet.js, not its puddle layout.
// Source/permission and packed RG normal + B height convention: see CREDITS.md.
import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, cameraViewMatrix, cos, dot, float, floor, fract, fwidth, hash, max, metalness, mix, mrt, mx_noise_float, normalWorldGeometry, normalize, positionWorld, reflector, roughness, select, sin, smoothstep, texture, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { wetLayer, wetUniforms, wetFbm, puddleMask, rippleNormal } from './wet.js';
import { groundLayout, DEFAULT_GROUND_LANE } from './ground-layout.js';
import { neonLightAt } from './neonlight.js';

export const GROUND_TEXTURE_NAMES = Object.freeze([
  'asphalt_a_c', 'asphalt_a_n', 'asphalt_b_c', 'asphalt_b_n',
  'sidewalk_tiles_c', 'sidewalk_tiles_n', 'paint_wear_c', 'paint_wear_n',
  'manhole_c', 'manhole_n', 'drain_grate_c', 'drain_grate_n',
  'litter_atlas_c', 'litter_atlas_n', 'litter_atlas_mask',
]);

export async function loadGroundTextures(loader = new THREE.TextureLoader()) {
  const loaded = {};
  // Wait for every request before releasing on failure (no late-loaded texture leak).
  const results = await Promise.allSettled(GROUND_TEXTURE_NAMES.map(async name => {
    const t = await loader.loadAsync(`/textures/cc/ground/${name}.jpg`);
    loaded[name] = t;
    t.name = `cc_ground_${name}`;
    t.colorSpace = name.endsWith('_c') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const atlas = /^(manhole|drain_grate|litter_atlas)/.test(name);
    t.wrapS = t.wrapT = atlas ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = atlas ? 4 : 8;
    return t;
  }));
  const failure = results.find(r => r.status === 'rejected');
  if (failure) {
    Object.values(loaded).forEach(t => t.dispose());
    throw new Error('Ground textures failed to load; original ground retained.', { cause: failure.reason });
  }
  return loaded;
}

const paramsOf = ctx => ctx?.params ?? new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const luminance = c => dot(c, vec3(0.2126, 0.7152, 0.0722));
const inside = distance => {
  const aa = max(fwidth(distance), 0.002);
  return float(1).sub(smoothstep(aa.negate(), aa, distance));
};
const rectangle = (p, x, z, w, d) => inside(max(abs(p.x.sub(x)).sub(w / 2), abs(p.y.sub(z)).sub(d / 2)));

function boxFrame() {
  const n = normalWorldGeometry, an = abs(n);
  const y = an.y.greaterThanEqual(an.x).and(an.y.greaterThanEqual(an.z));
  const x = an.x.greaterThan(an.z);
  return {
    p: select(y, positionWorld.xz, select(x, positionWorld.zy, positionWorld.xy)),
    T: select(y, vec3(1, 0, 0), select(x, vec3(0, 0, 1), vec3(1, 0, 0))),
    B: select(y, vec3(0, 0, 1), vec3(0, 1, 0)),
  };
}

function pair(T, name, st) {
  const packed = texture(T[`${name}_n`], st);
  return { a: luminance(texture(T[`${name}_c`], st).rgb), xy: packed.rg.mul(2).sub(1), h: packed.b };
}

function wetMaterial(name, ctx, { albedo, roughness, xy, T, B, coverage = 0, porosity = 0.6, metal = 0, ripple = 1, planar = null,
  wetness = wetUniforms.wetness, waterLevel = float(0), flow = float(0) }) {
  const dbg = paramsOf(ctx).get('surfdbg') || '';
  const up = smoothstep(0.6, 0.95, normalWorldGeometry.y);
  const pud = coverage && !dbg.includes('nopud') ? puddleMask(positionWorld.xz, coverage, { waterLevel, wetness }).mul(up) : float(0);
  const rip = ripple && !dbg.includes('norip') ? rippleNormal(positionWorld.xz, flow).mul(up).mul(ripple) : vec2(0);
  const w = wetLayer({ albedo, roughness, porosity, puddle: pud, ripple: rip,
    vertical: float(1).sub(up).mul(0.5), worldPos: positionWorld, wetness });
  const tilt = xy.mul(float(1).sub(w.puddle)).mul(up);
  // Texture tilt follows its UV basis; rain tilt always follows world XZ, even on rotated decals.
  // Keep vertical/bottom faces geometric and rough, so they cannot leak into PostFX's SSR mask.
  const worldNormal = normalize(normalWorldGeometry.add(T.mul(tilt.x)).add(B.mul(tilt.y)).add(vec3(w.nxy.x, 0, w.nxy.y)));
  const m = new THREE.MeshStandardNodeMaterial({ name });
  m.colorNode = vec3(w.albedo);
  m.emissiveNode = vec3(w.albedo).mul(neonLightAt()); // v3: coloured pools of sign light on the road
  // Already world-space: do not apply transformNormalToView's model normal matrix a second time.
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(worldNormal, 0)).xyz);
  m.roughnessNode = mix(max(w.roughness, 0.65), w.roughness, up).clamp(0.015, 1);
  m.metalnessNode = float(metal);
  if (planar) {
    // v3 (Grok r16, after Threejs-Punk): the road is a plane -- a half-resolution planar reflection, broken by the
    // surface normal and gated by gloss, instead of screen-space rays sliding along it (SSR confetti, missing signs)
    const refl = planar;
    refl.uvNode = refl.uvNode.add(worldNormal.xz.mul(0.035));
    const gloss = smoothstep(0.32, 0.03, m.roughnessNode).mul(up);
    const V = cameraPosition.sub(positionWorld).normalize();
    const fres = float(1).sub(V.y.abs()).pow(4).mul(0.85).add(0.15);
    m.emissiveNode = m.emissiveNode.add(refl.rgb.mul(gloss).mul(fres));
    // keep SSR off this surface: zero the up-facing gate PostFX reads from the metalrough MRT
    m.mrtNode = mrt({ metalrough: vec4(metalness, roughness, float(0), float(1)) });
  }
  // (PostFX otherwise writes b = smoothstep(0.55,0.9,normalWorld.y), uses g for roughness.)
  m.userData.ccGround = { coverage, packedNormal: 'RG slope, B height', name };
  return m;
}

// Lane-relative drainage: a 30 cm strip on the road side of either curb.
// The crown lowers the central water field by 0.08; the curb raises it by 0.25.
export function roadWaterProfile(x, halfRoad) {
  const distance = float(halfRoad).sub(abs(x));
  const gutter = select(distance.greaterThanEqual(0), float(1).sub(smoothstep(0, 0.3, distance)), float(0));
  const crown = float(1).sub(smoothstep(0, halfRoad, abs(x)));
  return { waterLevel: gutter.mul(0.25).sub(crown.mul(0.08)), flow: gutter.mul(0.35) };
}

export function roadSurfaceVariation(P) {
  return {
    roughnessScale: mix(0.75, 1.25, wetFbm(P.mul(1.9))),
    wetness: wetUniforms.wetness.mul(float(1).sub(smoothstep(0.35, 0.7, wetFbm(P.mul(0.06))).mul(0.3))),
  };
}

export function groundRoad(textures, ctx, lane = DEFAULT_GROUND_LANE) {
  const frame = boxFrame(), P = positionWorld.xz;
  const { lane: L, dashes } = groundLayout(lane);
  const A = pair(textures, 'asphalt_a', frame.p.div(3));
  const B = pair(textures, 'asphalt_b', frame.p.div(2.3).add(vec2(1.7, 3.1)));
  // Broad age variation and one repair per 13 m section, unrelated to the puddle field.
  const age = smoothstep(-0.3, 0.4, mx_noise_float(vec3(P.mul(0.085), 8.2)));
  const section = floor(P.y.div(13));
  const h = hash(section.add(71));
  const centerX = h.sub(0.5).mul(L.halfRoad * 1.1);
  const half = vec2(h.mul(0.45).add(0.5), hash(section.add(29)).mul(1.4).add(1.0));
  const q = abs(P.sub(vec2(centerX, section.mul(13).add(6.5)))).sub(half);
  const distance = max(q.x, q.y);
  const patch = inside(distance);
  const seam = inside(abs(distance).sub(0.025));
  const patched = mix(age.mul(0.45), float(1), patch);
  let albedo = mix(A.a, B.a.mul(0.74), patched).mul(0.82);
  albedo = mix(albedo, albedo.mul(0.44), seam.mul(0.75));
  let xy = mix(A.xy, B.xy, patched).mul(0.2);
  let roughness = mix(float(0.6), float(0.45), mix(A.h, B.h, patched)); // r14: smoother asphalt, longer reflections

  // Same surviving dash centres/crosswalk location as street's old geometry, now chipped into the road.
  let markings = float(0);
  for (const z of dashes) markings = max(markings, rectangle(P, 0, z, 0.12, 2.4));
  const stripeDistance = abs(fract(P.x.div(0.9).add(0.5)).sub(0.5)).mul(0.9).sub(0.225);
  const stripes = inside(stripeDistance).mul(rectangle(P, 0, L.crossZ + L.crossHalf + 2.2, 11.25, 3.2));
  markings = max(markings, stripes).mul(smoothstep(0.6, 0.95, normalWorldGeometry.y));
  const wear = pair(textures, 'paint_wear', frame.p.div(1.35));
  const paint = markings.mul(smoothstep(0.2, 0.7, wear.a)).mul(0.72);
  albedo = mix(albedo, float(0.39).mul(mix(0.65, 1, wear.a)), paint);
  xy = mix(xy, wear.xy.mul(0.18), paint);
  roughness = mix(roughness, float(0.66), paint);
  const { roughnessScale, wetness } = roadSurfaceVariation(P);
  roughness = roughness.mul(roughnessScale);
  let planar = null;
  // tried as default (Grok r16): sharper but dimmer than our SSR streaks and it re-renders the whole street (+15 ms); opt-in only
  if (paramsOf(ctx).has('planar') && ctx?.scene && ctx.backend !== 'webgl2') {
    planar = reflector({ resolutionScale: Number(paramsOf(ctx).get('planarScale') || 0.5), bounces: false });
    planar.target.rotateX(-Math.PI / 2); planar.target.position.y = 0.001;
    ctx.scene.add(planar.target);
  }
  return wetMaterial('cc_ground_road', ctx, { planar, albedo, roughness, xy, ...frame, coverage: 0.75, porosity: 0.7,
    wetness, ...roadWaterProfile(P.x, L.halfRoad) });
}

export function groundWalk(textures, ctx) {
  const frame = boxFrame();
  // Source contains eight 30 cm square tiles per repeat (running bond); preserve the photographed joints.
  const S = pair(textures, 'sidewalk_tiles', frame.p.div(2.4));
  const dirt = mx_noise_float(vec3(frame.p.mul(0.17), 5.4)).mul(0.08).add(0.92);
  return wetMaterial('cc_ground_walk', ctx, {
    albedo: S.a.mul(0.66).mul(dirt), roughness: mix(float(0.9), float(0.76), S.h),
    xy: S.xy.mul(0.48), ...frame, coverage: 0.25, porosity: 0.6,
  });
}

function decalMaterial(textures, ctx, kind) {
  const litter = kind === 'litter_atlas';
  const cell = attribute('ccGroundCell', 'vec2');
  // Inset cells to keep neighboring atlas items out of filtered edges.
  const st = litter ? uv().mul(0.96).add(0.02).add(cell).div(4) : uv();
  const S = pair(textures, kind, st);
  const angle = attribute('ccGroundAngle', 'float');
  const c = cos(angle), s = sin(angle);
  // PlaneGeometry rotated -PI/2: increasing U = +X, increasing V = -Z.
  const T = vec3(c, 0, s.negate()), B = vec3(s.negate(), 0, c.negate());
  const m = wetMaterial(`cc_ground_${kind}`, ctx, {
    albedo: S.a.mul(litter ? 0.65 : 0.72), roughness: float(litter ? 0.88 : 0.7),
    xy: S.xy.mul(litter ? 0.25 : 0.4), T, B,
    coverage: litter ? 0 : 0.55, porosity: litter ? 0.8 : 0.2, metal: litter ? 0 : 0.5,
    ripple: litter ? 0 : 1,
  });
  if (litter) {
    m.opacityNode = texture(textures.litter_atlas_mask, st).r;
    m.alphaTest = 0.6;
    // Damp fibrous litter should not become tiny planar mirrors in SSR.
    m.roughnessNode = max(m.roughnessNode, 0.58);
  } else if (kind === 'manhole') {
    m.opacityNode = inside(uv().sub(0.5).length().sub(0.485));
    m.alphaTest = 0.5;
  } else {
    // Dark slots have no reflecting metal/film; leave them opaque so they read as holes.
    const metalFace = smoothstep(0.01, 0.07, S.a);
    m.metalnessNode = metalFace.mul(0.5);
    m.roughnessNode = mix(float(0.95), m.roughnessNode, metalFace);
  }
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
  // Alpha-tested opaque draws must write depth + MRT normals/roughness (transparent would retain road data).
  m.transparent = false;
  m.depthWrite = true;
  return m;
}

function decalBatch(items, material) {
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(g, material, items.length);
  const cells = new Float32Array(items.length * 2), angles = new Float32Array(items.length);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    matrix.compose(p.set(it.x, it.y, it.z), q.setFromAxisAngle(axis, it.angle), scale.set(it.w, 1, it.d));
    mesh.setMatrixAt(i, matrix);
    cells[i * 2] = (it.cell ?? 0) % 4;
    cells[i * 2 + 1] = 3 - Math.floor((it.cell ?? 0) / 4);
    angles[i] = it.angle;
  });
  g.setAttribute('ccGroundCell', new THREE.InstancedBufferAttribute(cells, 2));
  g.setAttribute('ccGroundAngle', new THREE.InstancedBufferAttribute(angles, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = material.name;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}

export function createGroundDecals(textures, ctx, lane = DEFAULT_GROUND_LANE) {
  const layout = groundLayout(lane);
  const group = new THREE.Group(); group.name = 'cc_ground_decals';
  for (const [kind, key] of [['manhole', 'manholes'], ['drain_grate', 'drains'], ['litter_atlas', 'litter']]) {
    group.add(decalBatch(layout[key], decalMaterial(textures, ctx, kind)));
  }
  return group;
}

/** Call once AFTER old paint/grate boxes, BEFORE mergeStatic(root). Two-line street integration.
 * ?oldground is a true no-op: no CC texture loads, no removal, no change to original materials.
 * Failure loading any texture rejects before touching street; caller can catch to retain old ground.
 */
export async function installGround(ctx, root, M, lane, { paint, grate } = {}) {
  if (paramsOf(ctx).has('oldground')) return null;
  if (root.userData.ccGround) return root.userData.ccGround;
  const textures = await loadGroundTextures();
  const road = groundRoad(textures, ctx, lane), walk = groundWalk(textures, ctx);
  const decals = createGroundDecals(textures, ctx, lane);
  // (keep the neon light; the old procedural emissive was the memory tint only)
  if (M.road.emissiveNode) road.emissiveNode = road.emissiveNode.add(M.road.emissiveNode);
  if (M.walk.emissiveNode) walk.emissiveNode = walk.emissiveNode.add(M.walk.emissiveNode);
  const remove = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.material === M.road) o.material = road;
    else if (o.material === M.walk) o.material = walk;
    else if ((paint && o.material === paint) || (grate && o.material === grate)) remove.push(o);
  });
  const removedGeometry = new Set(remove.map(o => o.geometry));
  remove.forEach(o => o.removeFromParent());
  removedGeometry.forEach(g => g.dispose());
  // Old surface textures belong to makeSurface's shared cache: do not dispose those here.
  M.road.dispose(); M.walk.dispose(); paint?.dispose(); grate?.dispose();
  M.road = road; M.walk = walk;
  root.add(decals);
  const api = {
    materials: { road, walk }, decals,
    counts: Object.fromEntries(decals.children.map(m => [m.name, m.count])),
    dispose() {
      decals.removeFromParent();
      for (const mesh of decals.children) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
      road.dispose(); walk.dispose(); Object.values(textures).forEach(t => t.dispose());
      delete root.userData.ccGround;
      if (ctx.api?.ground === api) delete ctx.api.ground;
    },
  };
  root.userData.ccGround = api;
  if (ctx.api) ctx.api.ground = api;
  return api;
}
