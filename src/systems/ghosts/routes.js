import * as THREE from 'three/webgpu';

const wrap = (n, span) => ((n % span) + span) % span;
export const routeLength = r => 2 * (r.near - r.far + Math.PI * r.radius);

// 24 pavement walkers, eight crossing, four on the junction arms, and eight
// waiting at shop doors. Fixed slots retain the four existing VAT batches.
export function population(facades = []) {
  const people = [];
  const segments = [[-7.5, -14.7, 4], [-17, -24.4, 2], [-26.6, -32.3, 2], [-51, -57, 2], [-60, -69.4, 2]];
  const addCircuit = (route, count, side, speed) => {
    for (let i = 0; i < count; i++) people.push({
      side, route, speed, waiting: false,
      offset: (i + .12 + (side > 0 ? .37 : 0)) * routeLength(route) / count,
    });
  };
  for (const side of [-1, 1]) {
    for (const [near, far, count] of segments) {
      addCircuit({ axis: 'z', center: side * 4.2, near, far, radius: .46, y: .14 }, count, side, .62);
    }
    // The cross street has no raised pavement outside the main lane: walk on
    // its edges, clear of the two car lanes at z=-40/-44.
    addCircuit({ axis: 'x', center: side < 0 ? -38.1 : -45.9,
      near: side < 0 ? -7 : 22, far: side < 0 ? -22 : 7, radius: .4, y: 0,
      crossing: false }, 2, side, .60);
    const used = new Set();
    for (const z of [-11, -27, -54, -67]) {
      const shop = facades.filter(f => f.side === side && f.shop && !used.has(f)
        && f.z >= -69.4 && f.z <= -7.5 && Math.abs(f.z - z) < 6 && (f.z < -46.5) === (z < -46.5))
        .sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))[0];
      if (shop) used.add(shop);
      people.push({ side, waiting: true, speed: 0, offset: 0,
        route: { axis: 'stand', x: shop ? shop.frontX + side * .48 : side * 5.48,
          z: shop?.z ?? z, y: .14, yaw: side * Math.PI / 2 },
      });
    }
  }
  // Cross the main lane on both sides of the z=-42 junction. These circuits
  // stay clear of moving traffic and of the pavement turnarounds.
  for (const center of [-35.5, -48.5]) {
    addCircuit({ axis: 'x', center, near: 4.15, far: -4.15, radius: .5, y: 0,
      crossing: true }, 4, -1, .64);
  }
  return people.map((p, i) => ({ ...p, position: new THREE.Vector3(), yaw: 0,
    height: 1.60 + ((i * 7 + (p.side > 0 ? 3 : 0)) % 9) * .025,
    phase: p.waiting ? 0 : (i * .371 + (p.side > 0 ? .19 : 0)) % 1,
  }));
}

// Smooth capsule circuits, absolute time for reproducible shots and seeks.
export function pose(person, t) {
  const r = person.route;
  if (person.waiting) {
    person.position.set(r.x, r.y, r.z);
    person.yaw = r.yaw;
    return;
  }
  const straight = r.near - r.far, arc = Math.PI * r.radius;
  let d = wrap(person.offset + t * person.speed, routeLength(r));
  let lateral, along, dl, da;
  if (d < straight) {
    lateral = -r.radius; along = r.near - d; dl = 0; da = -1;
  } else if ((d -= straight) < arc) {
    const a = Math.PI + d / r.radius;
    lateral = Math.cos(a) * r.radius; along = r.far + Math.sin(a) * r.radius;
    dl = -Math.sin(a); da = Math.cos(a);
  } else if ((d -= arc) < straight) {
    lateral = r.radius; along = r.far + d; dl = 0; da = 1;
  } else {
    d -= straight;
    const a = d / r.radius;
    lateral = Math.cos(a) * r.radius; along = r.near + Math.sin(a) * r.radius;
    dl = -Math.sin(a); da = Math.cos(a);
  }
  if (r.axis === 'z') {
    person.position.set(r.center + lateral, r.y, along);
    person.yaw = Math.atan2(dl, da);
  } else {
    // The zebra spans the main road; step smoothly onto its two 14 cm kerbs.
    const curb = r.crossing ? .14 * THREE.MathUtils.smoothstep(Math.abs(along), 3.4, 3.64) : r.y;
    person.position.set(along, curb, r.center + lateral);
    person.yaw = Math.atan2(da, dl);
  }
}
