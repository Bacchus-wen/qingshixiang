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
    // v2 (kestrel shells): once-white ceramic, years in the rain. Yellowed, rust tears running down from every seam
    // and fastener, the lower body caked with road grime, chips through to the dark primer.
    const P = positionWorld;
    const tears = smoothstep(0.56, 0.72, mx_noise_float(vec3(P.x.mul(45), P.y.mul(2.5), P.z.mul(45)).add(4.1)).mul(0.5).add(0.5)); // mx noise is ~[-1,1]
    const low = smoothstep(0.9, 0.2, P.y);                                         // road grime from the ground up
    const chips = smoothstep(0.78, 0.86, mx_fractal_noise_float(P.mul(26).add(9.3), 2, 2.0, 0.5).mul(0.5).add(0.5));
    let c = grime(vec3(0.34, 0.32, 0.28)).mul(mix(float(1), float(0.62), oil()));
    // rust tears run down vertical faces only (on the helmet top they read as camouflage blotches)
    c = mix(c, vec3(0.12, 0.065, 0.03), tears.mul(0.75).mul(float(1).sub(smoothstep(0.35, 0.8, normalWorldGeometry.y.abs()))));
    c = mix(c, vec3(0.06, 0.055, 0.045), low.mul(0.6));
    c = mix(c, vec3(0.035), chips);
    m.colorNode = c.add(scratches().mul(0.12));
    m.roughnessNode = mix(wetRough(0.42), float(0.2), oil().mul(0.6));
    m.metalnessNode = float(0);
  } else if (n.includes('shell_dark')) {
    m.colorNode = vec3(grime(float(0.07)));
    m.roughnessNode = wetRough(0.5);
    m.metalnessNode = float(0.1);
  } else if (n.includes('frame_dark')) {
    // the inner skeleton seen through lost panels: dark oily steel
    m.colorNode = vec3(grime(float(0.06))); m.roughnessNode = wetRough(0.4); m.metalnessNode = float(0.9);
  } else if (n.includes('hose')) {
    // coolant hoses: faded teal rubber, the only cold colour on the body
    m.colorNode = grime(vec3(0.03, 0.12, 0.12)); m.roughnessNode = wetRough(0.55); m.metalnessNode = float(0);
  } else if (n.includes('cable_live')) {
    // two of the cut cables at the elbow still carry a little current
    m.colorNode = vec3(0.02);
    m.emissiveNode = color(eyeColor).mul(mx_noise_float(vec3(time.mul(3.1), 5, 0)).mul(0.5).add(0.5).pow(3).mul(2.2).add(0.05));
  } else if (n.includes('brass')) {
    // aged brass rings at the joints: the one warm metal on the body, dulled by years of rain
    m.colorNode = grime(vec3(0.36, 0.25, 0.12));
    m.roughnessNode = wetRough(0.42);
    m.metalnessNode = float(0.9);
  } else if (n.includes('accent')) {
    // worn signal-orange paint (survey livery), chipped through to dark primer
    m.colorNode = mix(grime(vec3(0.34, 0.1, 0.035)), vec3(0.05), scratches().mul(0.8));
    m.roughnessNode = wetRough(0.5);
    m.metalnessNode = float(0);
  } else if (n.includes('frame') || n.includes('iris')) {
    m.colorNode = vec3(grime(float(0.3)));
    m.roughnessNode = wetRough(0.48);
    m.metalnessNode = float(0.85);
  } else if (n.includes('joint')) {
    m.colorNode = vec3(grime(float(0.5)));
    m.roughnessNode = wetRough(0.32);
    m.metalnessNode = float(1);
  } else if (n.includes('lens')) {
    // smoked glass: mostly see-through so the iris and the core behind it read; a faint glow of its own
    m.transparent = true; m.depthWrite = false;
    m.opacityNode = float(0.35);
    m.colorNode = vec3(0.01);
    m.roughnessNode = float(0.05);
    m.metalnessNode = float(0);
    m.emissiveNode = color(eyeColor).mul(eyeGlow.mul(eyeGlow).mul(0.6).add(0.01));
  } else if (n.includes('eye_core')) {
    m.colorNode = vec3(0.02);
    // dim ember when closed, bright when open; slow breathing so it reads as "not quite dead"
    const breathe = mx_noise_float(vec3(time.mul(0.35), 0, 0)).mul(0.5).add(0.5);
    m.emissiveNode = color(eyeColor).mul(float(0.04).add(breathe.mul(0.03)).add(eyeGlow.mul(eyeGlow).mul(7))); // v2 review: a pupil of light, the metal rings around it stay readable
  } else if (n.includes('chest_core')) {
    // status light: a very slow, faint breath. Never coloured, never bright.
    m.colorNode = vec3(0.02);
    m.emissiveNode = vec3(mx_noise_float(vec3(time.mul(0.12), 3, 0)).mul(0.5).add(0.5).mul(0.1).add(0.012));
  } else if (n.includes('eye_dead')) {
    m.colorNode = vec3(0.01); m.roughnessNode = float(0.1);
  } else if (n.includes('rubber') || n.includes('cable')) {
    m.colorNode = vec3(0.03); m.roughnessNode = wetRough(0.6);
  } else {
    m.colorNode = vec3(0.3); m.roughnessNode = float(0.5);
  }
  return m;
}
