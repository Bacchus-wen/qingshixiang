import * as THREE from 'three/webgpu';
import { LANE } from './index.js';

// Street clutter that says "people were here": AC units, pipes, dead signs, sagging cables, poles,
// a traffic light still cycling, a vending machine, an abandoned car, and the few light sources.
function add(parent, geo, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Sagging cable between two points as a thin tube along a catenary-ish curve.
function cable(parent, a, b, sag, mat, r = 0.012) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 4), mat);
  m.castShadow = true;
  parent.add(m);
}

export function buildDetails(ctx, root, facades, M, r) {
  const { scene } = ctx;
  const L = LANE;
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x0d0d0d, roughness: 0.55, metalness: 0.4 });
  const pale = new THREE.MeshStandardNodeMaterial({ color: 0x8a8a88, roughness: 0.45 });
  const acGeo = new THREE.BoxGeometry(0.35, 0.55, 0.8);
  const signGeo = new THREE.BoxGeometry(0.18, 1.8, 0.55);
  const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);

  for (const f of facades) {
    const s = f.side;
    // AC units on upper floors
    for (let fl = 1; 3.2 + fl * 3.1 < f.h - 1; fl++) {
      if (r() < 0.45) add(root, acGeo, pale, f.frontX - s * 0.2, 3.2 + fl * 3.1 - 1.6, f.z + (r() - 0.5) * (f.w - 1));
    }
    // a downpipe at one edge
    if (r() < 0.6) {
      const p = add(root, pipeGeo, M.rust, f.frontX - s * 0.1, f.h / 2, f.z + f.w / 2 - 0.2);
      p.scale.y = f.h;
    }
    // dead vertical sign sticking out over the walkway
    if (r() < 0.45) {
      const y = 4.5 + r() * 3;
      add(root, signGeo, r() < 0.5 ? dark : pale, f.frontX - s * 0.45, y, f.z + (r() - 0.5) * (f.w - 1.5));
      add(root, new THREE.BoxGeometry(0.5, 0.04, 0.04), dark, f.frontX - s * 0.2, y + 0.8, f.z);
    }
  }

  // utility poles on the right walk with cables to the facades and across the lane
  const wire = new THREE.MeshStandardNodeMaterial({ color: 0x050505, roughness: 0.6 });
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.15, 9, 8);
  const poles = [];
  for (let z = 8; z > L.zEnd + 5; z -= 15) {
    if (Math.abs(z - L.crossZ) < L.crossHalf + 2) continue;
    const x = L.halfRoad + 0.35;
    add(root, poleGeo, M.rust, x, 4.5, z);
    add(root, new THREE.BoxGeometry(1.4, 0.08, 0.08), dark, x, 8.4, z);
    poles.push(new THREE.Vector3(x, 8.3, z));
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    for (const dy of [0, -0.25, -0.5]) cable(root, poles[i].clone().setY(8.3 + dy), poles[i + 1].clone().setY(8.3 + dy), 0.6 + r() * 0.4, wire);
    const fl = facades.filter((f) => f.side < 0 && Math.abs(f.z - poles[i].z) < 5)[0];
    if (fl) cable(root, poles[i], new THREE.Vector3(fl.frontX, Math.min(fl.h - 0.5, 7.5), fl.z), 1.2, wire);
  }

  // abandoned car: door open, sitting at an angle mid-lane (placeholder massing until the Blender model)
  const car = new THREE.Group();
  add(car, new THREE.BoxGeometry(1.75, 0.7, 4.3), pale, 0, 0.55, 0);
  add(car, new THREE.BoxGeometry(1.55, 0.55, 2.2), M.glass, 0, 1.15, 0.2);
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
    const w = add(car, new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14), dark, x, 0.3, z);
    w.rotation.z = Math.PI / 2;
  }
  const door = add(car, new THREE.BoxGeometry(0.06, 0.6, 1.1), pale, -1.2, 0.75, 0.75, -0.9);
  door.position.x = -1.25;
  car.position.set(0.9, 0, -18); car.rotation.y = 0.18;
  root.add(car);

  // vending machine: the only thing in the street still powered
  const vmZ = -8.5, vmX = -(L.halfRoad + L.walk) + 0.5;
  add(root, new THREE.BoxGeometry(0.75, 1.85, 1.05), pale, vmX, L.curb + 0.92, vmZ);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1.6, 1.62, 1.66) }));
  panel.position.set(vmX + 0.38, L.curb + 1.1, vmZ); panel.rotation.y = Math.PI / 2;
  root.add(panel);
  const vmLight = new THREE.PointLight(0xeef2f6, 14, 9, 2);
  vmLight.position.set(vmX + 0.9, L.curb + 1.2, vmZ);
  root.add(vmLight);

  // traffic light at the crossing, still cycling for nobody (its colour is the one exception, kept tiny)
  const tlx = L.halfRoad + 0.6, tlz = L.crossZ + L.crossHalf + 0.6;
  add(root, new THREE.CylinderGeometry(0.07, 0.07, 4.2, 8), dark, tlx, 2.1, tlz);
  add(root, new THREE.BoxGeometry(0.3, 0.9, 0.3), dark, tlx, 4.4, tlz);

  // the cold failing street lamp: main present-day key light
  const lamp = new THREE.SpotLight(0xe4ebf2, 900, 32, 0.9, 0.55, 2);
  lamp.position.set(L.halfRoad - 0.3, 6.8, -3); lamp.target.position.set(-0.5, 0, -5);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0004;
  root.add(lamp, lamp.target);
  add(root, new THREE.BoxGeometry(0.7, 0.12, 0.28), dark, L.halfRoad - 0.3, 6.9, -3);
  // glowing lamp heads: bright enough to bloom and to show up in the wet-road reflections
  const bulb = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(9, 9.4, 10) });
  add(root, new THREE.BoxGeometry(0.5, 0.03, 0.16), bulb, L.halfRoad - 0.3, 6.83, -3).castShadow = false;
  add(root, new THREE.BoxGeometry(0.5, 0.03, 0.16), bulb, -L.halfRoad + 0.4, 6.43, -34).castShadow = false;
  ctx.api.streetBulb = bulb;
  add(root, poleGeo, M.rust, L.halfRoad + 0.35, 4.5, -3);
  // a far lamp down the lane, dimmer, so depth reads in silhouettes
  const far = new THREE.SpotLight(0xd6dde6, 600, 34, 0.95, 0.6, 2);
  far.position.set(-L.halfRoad + 0.4, 6.5, -34); far.target.position.set(0.5, 0, -36);
  far.castShadow = true; far.shadow.mapSize.set(512, 512);
  root.add(far, far.target);
  // one lit window, high up, that never goes out
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.2), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.9, 0.88, 0.84) }));
  const wf = facades.find((f) => f.side > 0 && f.z < -45 && f.h > 12) || facades[facades.length - 1];
  win.position.set(wf.frontX - 0.04, wf.h - 2.4, wf.z); win.rotation.y = -Math.PI / 2 * wf.side;
  root.add(win);

  scene.add(new THREE.HemisphereLight(0x2a2e34, 0x060606, 0.6));
  ctx.api.street = { lamp, far, vmLight, car };
}
