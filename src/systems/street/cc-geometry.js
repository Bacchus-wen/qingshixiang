import * as THREE from 'three/webgpu';

export function constantAttribute(geometry, name, values) {
  const data = new Float32Array(geometry.attributes.position.count * values.length);
  for (let i = 0; i < geometry.attributes.position.count; i++) data.set(values, i * values.length);
  geometry.setAttribute(name, new THREE.BufferAttribute(data, values.length));
  return geometry;
}
export function wallData(mesh, values = [1, 3.2, 0.87, 1]) {
  constantAttribute(mesh.geometry, 'ccWall', values);
  return mesh;
}

export function roomQuad(root, material, f, y, z, width, height, inward, data) {
  const g = new THREE.PlaneGeometry(width, height);
  constantAttribute(g, 'ccRoom', data);
  constantAttribute(g, 'ccSize', [width, height]);
  const m = new THREE.Mesh(g, material);
  m.rotation.y = -f.side * Math.PI / 2;
  m.position.set(f.frontX + f.side * inward, y, z);
  m.receiveShadow = true;
  root.add(m);
  return m;
}

// Choose exactly three occupied windows along the entire lane (not three per building).
// Positions are picked from the existing seeded layout, with one on each side and one farther down.
export function occupyWindows(windows) {
  const chosen = new Set();
  for (const [side, targetZ] of [[-1, -7], [1, -22], [-1, -57]]) {
    const candidate = windows.filter(w => w.side === side && !chosen.has(w))
      .sort((a, b) => (Math.abs(a.z - targetZ) + a.y * 0.3) - (Math.abs(b.z - targetZ) + b.y * 0.3))[0];
    if (candidate) {
      chosen.add(candidate);
      const attr = candidate.mesh.geometry.getAttribute('ccRoom');
      for (let i = 0; i < attr.count; i++) attr.setY(i, 1);
      attr.needsUpdate = true;
    }
  }
  return [...chosen].map(w => ({ side: w.side, z: w.z, y: w.y }));
}

// Added details use their own seed/hash and never consume the lane's RNG stream.
export function addWindowIronwork(root, f, y, z, index, M, box) {
  const x = f.frontX - f.side * 0.21;
  // Metal frame, crosspiece, projecting cage and brackets typical of southern Chinese apartments.
  box(0.08, 0.035, 1.12, M.rust, x, y + 0.23, z, root);
  if (index % 4 !== 1) {
    for (let k = 0; k < 7; k++) box(0.025, 1.42, 0.022, M.rust, x, y, z - 0.58 + k * 0.193, root);
    for (const dy of [-0.68, 0.68]) {
      box(0.035, 0.028, 1.25, M.rust, x, y + dy, z, root);
      for (const dz of [-0.59, 0.59]) box(0.22, 0.028, 0.028, M.rust, f.frontX - f.side * 0.11, y + dy, z + dz, root);
    }
  }
  // Thin metal eyebrow awning, with edge lip (slopes away from wall).
  if (index % 3 !== 1) {
    const awning = box(0.55, 0.045, 1.45, M.rust, f.frontX - f.side * 0.25, y + 0.83, z, root);
    awning.rotation.z = f.side * 0.12;
    box(0.045, 0.09, 1.45, M.rust, f.frontX - f.side * 0.5, y + 0.78, z, root);
  }
}

export function addShopInteriors(root, facades, materials, box, M) {
  let count = 0;
  for (const f of facades) {
    if (!f.shop) continue;
    const width = f.w - 0.96;
    const kitchen = /面馆|饭店/.test(f.signName || '');
    // Ground mass begins at inward=1.2; the opaque room quad is just in front of it.
    // Shutter at 1.06 occludes this plane at 1.145, so lifting actually reveals the room.
    roomQuad(root, kitchen ? materials.kitchen : materials.shelves, f, 1.46, f.z,
      width, 2.65, 1.145, [0, 0, kitchen ? 2.4 : 3.2, 1]);
    // Real recessed jambs/threshold add parallax in front of the mapped room.
    for (const e of [-1, 1]) box(1.12, 2.8, 0.12, M.rust, f.frontX + f.side * 0.59, 1.4, f.z + e * (width / 2 + 0.06), root);
    box(1.15, 0.1, width, M.wallC, f.frontX + f.side * 0.58, 0.18, f.z, root);
    box(1.15, 0.07, width, M.rust, f.frontX + f.side * 0.58, 2.86, f.z, root);
    count++;
  }
  return count;
}
