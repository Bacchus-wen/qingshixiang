// Adapted from xikhar/cybercity buildings/materials.js: atlas sampling and ray/box rooms.
// No license supplied upstream; internal company demonstration only (see CREDITS.md).
import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, cross, dot, float, floor, fract, max, min, mix, mod, mx_fractal_noise_float, mx_noise_float, normalWorldGeometry, normalize, positionWorld, select, sin, smoothstep, step, texture, time, transformNormalToView, uv, vec2, vec3,
} from 'three/tsl';
import { mains, memoryMask } from '../../materials/memory.js';
import { neonLightAt } from '../../materials/neonlight.js';
import { verticalWetLayer, wetUniforms } from '../../materials/wet.js';

export async function loadBuildingTextures() {
  const loader = new THREE.TextureLoader();
  const names = ['atlas_albedo', 'atlas_normal', 'interior_atlas', 'shutter', 'shelves', 'shop_ramen'];
  const entries = await Promise.all(names.map(async name => {
    const t = await loader.loadAsync(`/textures/cc/${name}.jpg`);
    t.colorSpace = name === 'atlas_normal' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.name = `cc_${name}`;
    return [name, t];
  }));
  return Object.fromEntries(entries);
}

// Parameters affect ONLY this building layer, including its CPU shutter counterpart.
export function buildingMemory(params) {
  const mode = params.get('ccmemory');
  return mode === 'past' ? float(1) : mode === 'present' ? float(0) : memoryMask(positionWorld);
}
export function buildingMemoryCPU(params, realMask) {
  const mode = params.get('ccmemory');
  return mode === 'past' ? 1 : mode === 'present' ? 0 : realMask;
}

function atlasUV(tile, p, cols, rows, inset = 0.012) {
  return vec2(mod(tile, cols).add(p.x.mul(1 - 2 * inset).add(inset)).div(cols),
    float(1).sub(floor(tile.div(cols)).add(1).div(rows)).add(p.y.mul(1 - 2 * inset).add(inset).div(rows)));
}

export function createWallMaterial(tex, params) {
  const m = new THREE.MeshStandardNodeMaterial(); m.name = 'cc_facade';
  m.userData.ccWall = true;
  const a = attribute('ccWall', 'vec4'); // tile, metres/tile, tint, seed
  const tile = floor(a.x.add(0.5));
  const n = normalWorldGeometry, an = abs(n);
  const useY = an.y.greaterThanEqual(an.x).and(an.y.greaterThanEqual(an.z));
  const useX = an.x.greaterThan(an.z);
  const p = positionWorld.div(max(a.y, 0.1));
  const st = select(useY, p.xz, select(useX, p.zy, p.xy)).add(vec2(a.w.mul(0.137), a.w.mul(0.071)));
  const at = atlasUV(tile, fract(st), 4, 2);
  // Explicit derivatives before fract prevent blurred seams and cross-tile mip selection.
  const dx = st.dFdx().mul(vec2(0.244, 0.488)), dy = st.dFdy().mul(vec2(0.244, 0.488));
  const albedo = texture(tex.atlas_albedo, at).grad(dx, dy).rgb;
  const nt = texture(tex.atlas_normal, at).grad(dx, dy).xyz.mul(2).sub(1);
  const dirt = sin(positionWorld.y.mul(0.45).add(a.w)).mul(sin(positionWorld.x.add(positionWorld.z).mul(0.63))).mul(0.055).add(0.945);
  // r19: decades of rain on the walls -- dark streaks running down under sills and ledges (stretched noise, only on
  // some stretches of wall), a darker splash band at the foot, broad stained patches. Vertical faces only.
  const P = positionWorld, along = select(useX, P.z, P.x);
  const streakN = mx_noise_float(vec3(along.mul(5.5), P.y.mul(0.22), a.w)).mul(0.5).add(0.5);
  const streakZone = smoothstep(0.35, 0.75, mx_noise_float(vec3(along.mul(0.5), P.y.mul(0.35), a.w.add(3.7))).mul(0.5).add(0.5));
  const streaks = smoothstep(0.56, 0.84, streakN).mul(streakZone);
  const splash = float(1).sub(smoothstep(0.15, 0.95, P.y));
  const patch = mx_fractal_noise_float(P.mul(0.32).add(a.w), 3, 2.0, 0.5).mul(0.5).add(0.5);
  const weather = select(useY, float(1), float(1).sub(streaks.mul(0.34)).sub(splash.mul(0.24)).mul(mix(float(0.8), float(1.06), patch)));
  const wet = verticalWetLayer({ albedo: albedo.mul(a.z).mul(dirt).mul(weather), roughness: float(0.88), worldPos: positionWorld });
  m.colorNode = wet.albedo;
  m.emissiveNode = wet.albedo.mul(neonLightAt()); // v3: the signs light the walls
  m.roughnessNode = mix(wet.roughness, float(0.42), smoothstep(0.65, 0.95, n.y).mul(wetUniforms.wetness));
  m.metalnessNode = tile.equal(2).or(tile.equal(4)).select(0.25, 0);
  const T = select(useY, vec3(1, 0, 0), select(useX, vec3(0, 0, 1), vec3(1, 0, 0)));
  const B = select(useY, vec3(0, 0, 1), vec3(0, 1, 0));
  m.normalNode = params.has('ccflat') ? transformNormalToView(n) : transformNormalToView(normalize(T.mul(nt.x.mul(0.55)).add(B.mul(nt.y.mul(0.55))).add(n.mul(max(nt.z, 0.25)))));
  if (params.has('memdbg')) m.emissiveNode = vec3(1, 0.58, 0.28).mul(buildingMemory(params)).mul(3);
  return m;
}

// Room entry is the quad's UV, ray is transformed to its world-space facade basis.
// Keep world-space normal/tangent computation: merging transforms all geometry to root space.
export function interiorRoom(tex, tiled = true) {
  const a = attribute('ccRoom', 'vec4'); // room index, occupied now, depth, lit in memory
  const size = attribute('ccSize', 'vec2');
  const N = normalWorldGeometry;
  const T = normalize(cross(vec3(0, 1, 0), N));
  const V = positionWorld.sub(cameraPosition);
  const d = vec3(dot(V, T).div(size.x), V.y.div(size.y), max(dot(V, N).negate(), 0.001).div(a.z));
  const o = uv().clamp(0.001, 0.999);
  const sx = d.x.greaterThan(0).select(1, 0), sy = d.y.greaterThan(0).select(1, 0);
  const tx = sx.sub(o.x).div(abs(d.x).max(0.0001).mul(sx.mul(2).sub(1)));
  const ty = sy.sub(o.y).div(abs(d.y).max(0.0001).mul(sy.mul(2).sub(1)));
  const tz = float(1).div(d.z);
  const travel = min(min(tx, ty), tz);
  const hit = vec3(o.x.add(d.x.mul(travel)), o.y.add(d.y.mul(travel)), d.z.mul(travel));
  const back = step(tz, min(tx, ty));
  const side = float(1).sub(back).mul(step(tx, ty));
  const horizontal = float(1).sub(back).sub(side).max(0);
  const sampleUV = tiled ? atlasUV(floor(a.x.add(0.5)), hit.xy.clamp(0, 1), 4, 4, 0.022) : hit.xy.clamp(0.01, 0.99);
  const gradScale = tiled ? 0.239 : 0.98;
  const image = texture(tex, sampleUV).grad(uv().dFdx().mul(gradScale), uv().dFdy().mul(gradScale)).rgb;
  const walls = vec3(0.39, 0.32, 0.23).mul(side);
  const floorCeiling = mix(vec3(0.12, 0.085, 0.05), vec3(0.36, 0.32, 0.25), sy).mul(horizontal);
  const shade = float(1).sub(hit.z.mul(0.22));
  return image.mul(back).add(walls).add(floorCeiling).mul(shade);
}

export function createWindowMaterial(tex, params) {
  const m = new THREE.MeshStandardNodeMaterial(); m.name = 'cc_windows';
  const a = attribute('ccRoom', 'vec4'), mask = buildingMemory(params);
  const p = uv();
  const edge = min(min(p.x, float(1).sub(p.x)), min(p.y, float(1).sub(p.y)));
  const aa = max(p.fwidth().x, p.fwidth().y).max(0.0001);
  const opening = smoothstep(float(0.045).sub(aa), float(0.045).add(aa), edge);
  const mullion = smoothstep(float(0.018).sub(aa), float(0.018).add(aa), abs(p.x.sub(0.5)));
  const glass = opening.mul(mullion);
  const room = interiorRoom(tex.interior_atlas);
  // present: holdout windows -- warm 2700K lamps (y = 1) or a cold flickering TV (y = 2); trip with the mains
  const tv = a.y.greaterThan(1.5);
  const flick = sin(time.mul(7.3).add(positionWorld.z.mul(3.1))).mul(sin(time.mul(2.1).add(positionWorld.x))).mul(0.25).add(0.75);
  const now = mix(vec3(1.0, 0.68, 0.38).mul(0.9), vec3(0.45, 0.62, 1.0).mul(flick).mul(0.7), tv.select(float(1), float(0)))
    .mul(a.y.min(1)).mul(mains);
  const past = vec3(1.0, 0.73, 0.44).mul(a.w).mul(1.8);
  const illumination = mix(now, past, mask);
  // Reflective cold glass remains dark in the present; no material clone per window.
  m.colorNode = mix(vec3(0.17, 0.18, 0.17), vec3(0.012, 0.022, 0.032).add(room.mul(0.016)), glass);
  m.emissiveNode = room.mul(illumination).mul(glass);
  m.roughnessNode = mix(float(0.66), mix(float(0.13), float(0.31), mask), glass);
  m.metalnessNode = mix(float(0.45), float(0.18), glass);
  return m;
}

export function createShopMaterial(tex, params, name) {
  const m = new THREE.MeshStandardNodeMaterial(); m.name = `cc_shop_${name}`;
  const room = interiorRoom(tex, false), mask = buildingMemory(params);
  m.colorNode = room.mul(mix(float(0.018), float(0.14), mask));
  m.emissiveNode = room.mul(vec3(1.0, 0.79, 0.52)).mul(mask).mul(2.2);
  m.roughness = 0.85;
  return m;
}

export function createShutterMaterial(tex) {
  const m = new THREE.MeshStandardNodeMaterial(); m.name = 'cc_shutter';
  const wet = verticalWetLayer({ albedo: texture(tex.shutter, uv()).rgb.mul(0.72), roughness: float(0.73), worldPos: positionWorld });
  m.colorNode = wet.albedo; m.roughnessNode = wet.roughness; m.metalness = 0.38;
  m.emissiveNode = wet.albedo.mul(neonLightAt());
  return m;
}
