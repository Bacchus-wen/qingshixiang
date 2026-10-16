import * as THREE from 'three/webgpu';

const wrap = (n, span) => ((n % span) + span) % span;
export const routeLength = r => 2 * (r.near - r.far + Math.PI * r.radius);

// Three small, staggered groups per pavement plus eight at the zebra crossing.
// Slots and offsets are deterministic; each circuit shares a speed so its gaps
// survive a full experience rather than faster walkers catching slower ones.
export function population() {
  const people = [];
  const segments = [[-7.5, -14.7], [-17, -24.4], [-26.6, -32.3]];
  for (const side of [-1, 1]) for (let segment = 0; segment < segments.length; segment++) {
    const [near, far] = segments[segment];
    const route = { axis: 'z', center: side * (4.2 + (segment - 1) * .06), near, far, radius: .46, y: .14 };
    for (let i = 0; i < 6; i++) {
      const fraction = (i + [.12, .29, -.16, .21, -.09, .04][i] + (side > 0 ? .37 : 0)) / 6;
      people.push({ side, route, speed: .57 + segment * .065 + (side > 0 ? .035 : 0), offset: fraction * routeLength(route) });
    }
  }
  const crossing = { axis: 'x', center: -35.5, near: 4.15, far: -4.15, radius: .5, y: 0 };
  for (let i = 0; i < 8; i++) people.push({
    side: i < 4 ? -1 : 1, route: crossing, speed: .64,
    offset: (i + [.1, .31, .06, -.17, .23, -.1, .14, -.04][i]) * routeLength(crossing) / 8,
  });
  return people.map((p, i) => ({ ...p, position: new THREE.Vector3(), yaw: 0,
    height: 1.60 + ((i * 7 + (p.side > 0 ? 3 : 0)) % 9) * .025,
    phase: (i * .371 + (p.side > 0 ? .19 : 0)) % 1,
  }));
}

// Smooth capsule circuits, absolute time for reproducible shots and seeks.
export function pose(person, t) {
  const r = person.route, straight = r.near - r.far, arc = Math.PI * r.radius;
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
    const curb = .14 * THREE.MathUtils.smoothstep(Math.abs(along), 3.4, 3.64);
    person.position.set(along, curb, r.center + lateral);
    person.yaw = Math.atan2(da, dl);
  }
}
