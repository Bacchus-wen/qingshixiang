import * as THREE from 'three/webgpu';
import { vec3, float, uv, uniform, smoothstep, length, vec2, max } from 'three/tsl';
import { LANE } from './index.js';
import { loadProp } from './props.js';

// The present still moves somewhere else: once every minute or so a real car crosses the far junction.
// Nobody turns into the lane. What reaches the robot is a light pool sliding over the wet crossing, two
// headlight glares in the rain and a dark body; the street stays as empty as it was.
// No real light is added (a new light would recompile every lit material), only additive quads.
// Writes ctx.world.passingCar = { x, z, k } (k = 0..1 presence) for the audio.
export async function setupPassingCar(ctx, root) {
  const L = LANE;
  const glow = uniform(0);
  const group = new THREE.Group(); group.name = 'passing-car';
  root.add(group);

  // light pool thrown ahead of the car on the wet crossing (long soft ellipse, brightest near the bumper)
  // flat on the ground, uv.x running along local +Z (ahead of the car) from 0 at the bumper to 1
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(0, 0, 0.5);
  const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  }));
  {
    const p = uv().sub(vec2(0.0, 0.5)).mul(vec2(1, 2.2)); // u = 0 at the bumper, runs ahead
    const d = length(p);
    const fall = float(1).sub(smoothstep(0.0, 1.0, d)).mul(smoothstep(0.0, 0.08, uv().x));
    pool.material.colorNode = vec3(0.95, 0.96, 1.0).mul(fall.mul(fall)).mul(glow).mul(2.4);
  }
  pool.scale.set(4.2, 1, 11); pool.position.set(0, 0.02, 2.1); pool.renderOrder = 3;
  group.add(pool);

  // headlight glares (camera-facing): a hot core and a wide wet halo
  const glareMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const d = length(uv().sub(0.5)).mul(2);
    const core = float(1).sub(smoothstep(0.0, 0.18, d)).mul(6);
    const halo = max(float(0), float(1).sub(d)).pow(3).mul(1.4);
    glareMat.colorNode = vec3(1).mul(core.add(halo)).mul(glow);
  }
  const glares = [0, 1].map(() => { const s = new THREE.Sprite(glareMat); s.scale.setScalar(2.2); group.add(s); return s; });

  // the body: the same model as the abandoned car, but painted black and whole
  let body = null;
  try {
    body = await loadProp('car');
    const dark = new THREE.MeshStandardNodeMaterial({ color: 0x050505, roughness: 0.25, metalness: 0.3 });
    body.traverse((o) => { if (o.isMesh) { o.material = dark; o.castShadow = false; o.userData.dynamic = true; } });
    group.add(body);
  } catch (e) { console.warn('[passing-car] no body', e); }
  group.traverse((o) => { o.userData.dynamic = true; });

  const dbg = ctx.params.has('passcar');
  const state = { t: dbg ? 2 : 80 + Math.random() * 30, active: false, x: 0, dir: 1, z: 0, frames: 0 };
  const speed = 9.5, X0 = 58;

  const place = (x, dir, z, k) => {
    group.position.set(x, 0, z);
    group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; // car model faces +Z
    glares[0].position.set(-0.62, 0.68, 2.15); glares[1].position.set(0.62, 0.68, 2.15);
    glow.value = k;
  };

  return function update(dt) {
    state.frames++;
    if (ctx.isShot) {
      // deterministic: parked mid-junction only when asked, otherwise out of sight
      const on = dbg;
      place(on ? -3 : -X0, 1, L.crossZ + 1.8, on ? 1 : 0);
      group.visible = on || state.frames < 30;
      ctx.world.passingCar = { x: group.position.x, z: group.position.z, k: on ? 1 : 0 };
      return;
    }
    state.t -= dt;
    if (!state.active && state.t <= 0) {
      state.active = true; state.dir = Math.random() < 0.5 ? 1 : -1;
      state.x = -X0 * state.dir; state.z = L.crossZ + (state.dir > 0 ? 1.8 : -1.8);
    }
    if (state.active) {
      state.x += state.dir * speed * dt;
      if (Math.abs(state.x) > X0) { state.active = false; state.t = dbg ? 6 : 70 + Math.random() * 45; }
    }
    // fade in/out at the ends of the road so nothing pops (fog does most of it)
    const k = state.active ? Math.min(1, (X0 - Math.abs(state.x)) / 12) : 0;
    place(state.active ? state.x : -X0, state.dir, state.active ? state.z : L.crossZ + 1.8, k);
    group.visible = state.active || state.frames < 30; // first frames: compile while hidden by the title
    ctx.world.passingCar = { x: group.position.x, z: group.position.z, k };
  };
}
