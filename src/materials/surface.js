import * as THREE from 'three/webgpu';
import {
  texture, positionWorld, normalWorldGeometry, vec2, vec3, float, abs, select, normalize, mix, clamp, uniform,
  transformNormalToView, max, smoothstep,
} from 'three/tsl';
import { wetLayer, wetUniforms, puddleMask, rippleNormal } from './wet.js';

// Achromatic PBR surfaces with world-space box mapping (procedural boxes need no UVs) and the shared wet layer.
// Albedo textures are authored greyscale (see CREDITS.md); a per-surface `tone` scales value only.
const loader = new THREE.TextureLoader();
const cache = new Map();
function tex(path, srgb) {
  const key = path + srgb;
  if (!cache.has(key)) {
    const t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache.set(key, t);
  }
  return cache.get(key);
}

// opts: { scale (metres per tile), tone, roughMul, metal, porosity, puddles (0..1, up faces only), ripples }
const SURF_DBG = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('surfdbg') || '' : '';

export function makeSurface(id, opts = {}) {
  let { scale = 2, tone = 1, roughMul = 1, metal = null, porosity = 0.6, puddles = 0, ripples = 1, streaks = 0.5 } = opts;
  if (SURF_DBG.includes('nopud')) puddles = 0;
  if (SURF_DBG.includes('norip')) ripples = 0;
  const base = `/textures/${id}/`;
  const tAlb = tex(base + 'albedo.jpg', true), tNor = tex(base + 'normal.jpg', false), tArm = tex(base + 'arm.jpg', false);

  const n = normalWorldGeometry;
  const an = abs(n);
  const useX = an.x.greaterThan(an.y).and(an.x.greaterThan(an.z));
  const useY = an.y.greaterThanEqual(an.x).and(an.y.greaterThanEqual(an.z));
  const P = positionWorld.div(scale);
  const uv = select(useY, P.xz, select(useX, P.zy, P.xy));
  // tangent frame per dominant axis (world space)
  // tangent frame = the directions the box-mapped UV actually increases along (no per-face mirroring)
  const T = select(useY, vec3(1, 0, 0), select(useX, vec3(0, 0, 1), vec3(1, 0, 0)));
  const B = select(useY, vec3(0, 0, 1), vec3(0, 1, 0));

  // compress texture contrast toward its mid-grey: CC0 albedos read blotchy once desaturated and wet-darkened
  const alb = mix(float(0.42), texture(tAlb, uv).r, 0.4).mul(tone);
  const arm = texture(tArm, uv);
  const nt = texture(tNor, uv).xyz.mul(2).sub(1);

  // wetness: up-facing surfaces collect film/puddles; vertical ones get darker streaks
  const up = smoothstep(0.6, 0.95, n.y);
  const pud = puddles > 0 ? puddleMask(positionWorld.xz, puddles).mul(up) : float(0);
  const rip = ripples > 0 ? rippleNormal(positionWorld.xz).mul(up).mul(ripples) : vec2(0);
  const w = wetLayer({ albedo: alb, roughness: arm.g.mul(roughMul), porosity, puddle: pud, ripple: rip, vertical: float(1).sub(up).mul(streaks), worldPos: positionWorld });

  // perturbed world normal: texture normal flattened inside puddles, plus ripples
  const flat = float(1).sub(w.puddle.mul(0.9));
  const nWorld = normalize(T.mul(nt.x.mul(flat).add(w.nxy.x)).add(B.mul(nt.y.mul(flat).add(w.nxy.y))).add(n.mul(max(nt.z, 0.2))));

  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = vec3(w.albedo);
  m.roughnessNode = w.roughness;
  m.metalnessNode = metal === null ? arm.b : float(metal);
  m.aoNode = arm.r;
  m.normalNode = transformNormalToView(nWorld);
  return m;
}
