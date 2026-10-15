import * as THREE from 'three/webgpu';
import {
  positionWorld, normalWorldGeometry, vec3, float, mix, smoothstep, mx_fractal_noise_float, mx_noise_float, time,
  uniform, color,
} from 'three/tsl';
import { wetUniforms } from '../../materials/wet.js';

// Robot materials, rebuilt from the glb material names. Achromatic: grime in noise pockets, dark runs streaking
// down from seams (years of rain), a water film on up-facing plates. Only the eye core carries colour.
export const eyeGlow = uniform(0);                       // 0..1, driven by the eye state machine
export const eyeColor = uniform(new THREE.Color(1.0, 0.56, 0.26));

function grime(base) {
  const P = positionWorld;
  const pocket = smoothstep(0.1, 0.65, mx_fractal_noise_float(P.mul(9.0), 3, 2.0, 0.5).mul(0.5).add(0.5));
  const runs = smoothstep(0.5, 0.85, mx_noise_float(vec3(P.x.mul(38), P.y.mul(2.2), P.z.mul(38))));
  return base.mul(mix(float(1), float(0.45), pocket.mul(0.8))).mul(mix(float(1), float(0.6), runs));
}

// long thin scratches (stretched noise) and an oily darker sheen: years of use, not a showroom shell
function scratches() {
  const P = positionWorld;
  const s1 = smoothstep(0.92, 0.97, mx_noise_float(vec3(P.x.mul(4), P.y.mul(160), P.z.mul(4))));
  const s2 = smoothstep(0.93, 0.98, mx_noise_float(vec3(P.x.mul(140), P.y.mul(5), P.z.mul(140)).add(7.3)));
  return s1.max(s2);
}
function oil() {
  return smoothstep(0.35, 0.8, mx_fractal_noise_float(positionWorld.mul(5.5).add(2.1), 2, 2.0, 0.5).mul(0.5).add(0.5));
}

function wetRough(r) {
  const up = smoothstep(0.3, 0.9, normalWorldGeometry.y);
  return mix(float(r), float(0.12), up.mul(wetUniforms.wetness).mul(0.8));
}

export function robotMaterial(name) {
  const n = name.toLowerCase();
  const m = new THREE.MeshStandardNodeMaterial();
  if (n.includes('shell_ceramic')) {
    m.colorNode = vec3(grime(float(0.55)).mul(mix(float(1), float(0.62), oil())).add(scratches().mul(0.18)));
    m.roughnessNode = mix(wetRough(0.42), float(0.2), oil().mul(0.6));
    m.metalnessNode = float(0);
  } else if (n.includes('shell_dark')) {
    m.colorNode = vec3(grime(float(0.07)));
    m.roughnessNode = wetRough(0.5);
    m.metalnessNode = float(0.1);
  } else if (n.includes('frame') || n.includes('iris')) {
    m.colorNode = vec3(grime(float(0.3)));
    m.roughnessNode = wetRough(0.48);
    m.metalnessNode = float(0.85);
  } else if (n.includes('joint')) {
    m.colorNode = vec3(grime(float(0.5)));
    m.roughnessNode = wetRough(0.32);
    m.metalnessNode = float(1);
  } else if (n.includes('lens')) {
    // the lens itself is a light source when awake: amber glow behind cracked glass
    m.colorNode = vec3(0.01);
    m.roughnessNode = float(0.05);
    m.metalnessNode = float(0);
    m.emissiveNode = color(eyeColor).mul(eyeGlow.mul(eyeGlow).mul(3.5).add(0.015));
  } else if (n.includes('eye_core')) {
    m.colorNode = vec3(0.02);
    // dim ember when closed, bright when open; slow breathing so it reads as "not quite dead"
    const breathe = mx_noise_float(vec3(time.mul(0.35), 0, 0)).mul(0.5).add(0.5);
    m.emissiveNode = color(eyeColor).mul(float(0.04).add(breathe.mul(0.03)).add(eyeGlow.mul(eyeGlow).mul(14)));
  } else if (n.includes('chest_core')) {
    // status light: a very slow, faint breath. Never coloured, never bright.
    m.colorNode = vec3(0.02);
    m.emissiveNode = vec3(mx_noise_float(vec3(time.mul(0.12), 3, 0)).mul(0.5).add(0.5).mul(0.35).add(0.05));
  } else if (n.includes('eye_dead')) {
    m.colorNode = vec3(0.01); m.roughnessNode = float(0.1);
  } else if (n.includes('rubber') || n.includes('cable')) {
    m.colorNode = vec3(0.03); m.roughnessNode = wetRough(0.6);
  } else {
    m.colorNode = vec3(0.3); m.roughnessNode = float(0.5);
  }
  return m;
}
