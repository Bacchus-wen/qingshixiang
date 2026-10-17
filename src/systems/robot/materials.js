import * as THREE from 'three/webgpu';
import {
  abs, bumpMap, cameraPosition, color, dot, float, fwidth, mix, normalWorld, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float, normalWorldGeometry, positionLocal, positionWorld, smoothstep, time, uniform, vec3,
} from 'three/tsl';
import { wetUniforms } from '../../materials/wet.js';

// Robot materials, rebuilt from the glb material names. Achromatic: grime in noise pockets, dark runs streaking
// down from seams (years of rain), a water film on up-facing plates. Only the eye core carries colour.
export const eyeGlow = uniform(0);
export const shellDim = uniform(1); // < 1 over the shoulder: the helmet reads as a dark wet foreground silhouette                       // 0..1, driven by the eye state machine
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
    // v3 (reviews): once-white ceramic, years in the rain -- grey-white base, rust only running down vertical faces from
    // seams, road grime from the ground up, chips through to dark metal, and a wet clearcoat on everything facing up
    const P = positionWorld;
    const vertical = float(1).sub(smoothstep(0.25, 0.6, normalWorldGeometry.y.abs()));
    // review5: chips were a uniform dalmatian pattern and the rust runs evenly spaced bars. Wear now lives where
    // it would: on the rounded panel edges (screen-space curvature of the smooth normal) and in a few worn zones;
    // runs only come down some panels, with jittered spacing and lengths.
    const curv = fwidth(normalWorldGeometry).length().div(fwidth(P).length().add(1e-4)).mul(0.03).clamp(0, 1);
    const zone = smoothstep(0.45, 0.75, mx_noise_float(P.mul(2.3).add(1.7)).mul(0.5).add(0.5));
    const jitter = mx_noise_float(P.mul(3.1).add(7.7)).mul(5.0);
    const runs = mx_noise_float(vec3(P.x.mul(31).add(jitter), P.y.mul(1.6), P.z.mul(31).add(jitter))).mul(0.5).add(0.5);
    const tears = smoothstep(0.52, 0.76, runs).mul(vertical.mul(0.7).add(0.3)).mul(zone.mul(0.85).add(0.15)).mul(float(1).sub(smoothstep(0.1, 0.3, curv))); // not on thin curved limbs (they made rings)
    const low = smoothstep(0.75, 0.15, P.y);
    const chipN = mx_fractal_noise_float(P.mul(55).add(9.3), 3, 2.0, 0.5).mul(0.5).add(0.5);
    const chips = smoothstep(0.86, 0.9, chipN.add(curv.mul(0.22)).add(zone.mul(0.06)));
    let c = grime(vec3(0.63, 0.6, 0.55)).mul(mix(float(1), float(0.75), oil()));
    c = mix(c, vec3(0.2, 0.11, 0.05), tears.mul(0.7));
    c = mix(c, vec3(0.07, 0.065, 0.055), low.mul(0.5));
    c = mix(c, vec3(0.3, 0.14, 0.06), chips); // chipped through to rust (review6)
    const pm = new THREE.MeshPhysicalNodeMaterial();
    pm.colorNode = c.add(scratches().mul(0.1)).mul(shellDim);
    pm.roughnessNode = mix(mix(wetRough(0.45), float(0.3), chips), float(0.6), tears.mul(0.5));
    pm.metalnessNode = chips.mul(0.85);
    // rain on the shell: beads on everything facing up, thin rivulets running down the sides (a bump, so the
    // clearcoat catches every light in them)
    const up = smoothstep(0.25, 0.8, normalWorldGeometry.y);
    const beads = smoothstep(0.22, 0.02, mx_worley_noise_float(P.mul(40))).mul(up);
    const rivulet = smoothstep(0.1, 0.0, mx_worley_noise_float(vec3(P.x.mul(70), P.y.mul(4).add(time.mul(0.25)), P.z.mul(70)))).mul(vertical).mul(0.6);
    pm.normalNode = bumpMap(beads.add(rivulet), float(2.5));
    pm.roughnessNode = pm.roughnessNode.mul(float(1).sub(beads.add(rivulet).clamp(0, 1).mul(0.85)));
    pm.clearcoatNode = smoothstep(0.3, 0.8, normalWorldGeometry.y).mul(0.6).add(0.15);
    pm.clearcoatRoughnessNode = float(0.12);
    return pm;
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
    m.opacityNode = float(0.6);
    m.colorNode = vec3(0.01);
    m.roughnessNode = float(0.05);
    m.metalnessNode = float(0);
    // glass catches the core: a soft ring of light toward the rim of the lens (grazing view), dim in the middle
    const Vl = cameraPosition.sub(positionWorld).normalize();
    const graze = float(1).sub(abs(dot(normalWorld, Vl))).pow(2);
    m.emissiveNode = color(eyeColor).mul(eyeGlow.mul(eyeGlow).mul(graze.mul(1.4).add(0.25)).add(0.01));
  } else if (n.includes('eye_core')) {
    m.colorNode = vec3(0.02);
    // dim ember when closed, bright when open; slow breathing so it reads as "not quite dead"
    const breathe = mx_noise_float(vec3(time.mul(0.35), 0, 0)).mul(0.5).add(0.5);
    // review5: not a flat peach disc. A white-hot amber centre (facing term over the domed core) falling to deep
    // amber at the rim; the hot centre is far over the bloom threshold, so it throws its own halo.
    const V = cameraPosition.sub(positionWorld).normalize();
    const centre = abs(dot(normalWorld, V)).pow(7);
    const hue = mix(color(eyeColor).mul(0.8), vec3(1.0, 0.86, 0.62), centre);
    m.emissiveNode = hue.mul(float(0.04).add(breathe.mul(0.03)).add(eyeGlow.mul(eyeGlow).mul(float(1.2).add(centre.mul(9)))));
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

// review5: the core is a flat disc, so a facing term cannot shade it. Grade it radially in its own geometry space:
// white-hot amber at the centre (far over the bloom threshold, so it throws its own halo), deep amber at the rim.
export function eyeCoreRadial(node) {
  node?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingSphere();
    const bs = o.geometry.boundingSphere;
    const r = positionLocal.sub(vec3(bs.center.x, bs.center.y, bs.center.z)).length().div(bs.radius);
    const centre = smoothstep(0.75, 0.0, r).pow(2);
    const breathe = mx_noise_float(vec3(time.mul(0.35), 0, 0)).mul(0.5).add(0.5);
    const m = o.material.clone();
    m.colorNode = vec3(0.02);
    m.emissiveNode = mix(color(eyeColor).mul(0.55), vec3(1.0, 0.85, 0.6), centre)
      .mul(float(0.03).add(breathe.mul(0.03)).add(centre.mul(0.05)).add(eyeGlow.mul(eyeGlow).mul(float(0.9).add(centre.mul(12)))));
    o.material = m;
  });
}

