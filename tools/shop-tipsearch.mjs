// node tools/shop-tipsearch.mjs [tip-xyz-json] -> /tmp/tipsearch.json. Search a pose for the spare torso (on a squat carton) so the robot's screwdriver tip T touches the torso
// surface without the torso or carton clipping the robot, bench or toolbox; rank by whether the touch is visible.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const T = JSON.parse(process.argv[2] || '[-0.686,0.294,1.456]');
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://127.0.0.1:5173/?shot=shop-robotfull');
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
const res = await page.evaluate((Tarr) => {
  const e = window.__engine, THREE = e.ctx.THREE, P = e.ctx.api.shop.placed;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  const T = new THREE.Vector3(...Tarr);
  function grab(root, rel, filter) {
    const P_ = [], N_ = []; root.updateMatrixWorld(true);
    root.traverse((m) => { if (!m.isMesh || m.isInstancedMesh) return; const pa = m.geometry.attributes.position, na = m.geometry.attributes.normal; if (!pa || !na) return;
      const M = rel ? rel.clone().multiply(m.matrixWorld) : m.matrixWorld; nm.getNormalMatrix(M);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); if (filter && !filter(v)) continue; n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); P_.push(v.x, v.y, v.z); N_.push(n.x, n.y, n.z); } });
    return { P: Float32Array.from(P_), N: Float32Array.from(N_) };
  }
  const C = 0.02, K = (a, b, c) => ((a + 512) * 1024 + (b + 512)) * 1024 + (c + 512);
  function hash(S) { const H = new Map(); for (let i = 0; i < S.P.length / 3; i++) { const k = K(Math.floor(S.P[3 * i] / C), Math.floor(S.P[3 * i + 1] / C), Math.floor(S.P[3 * i + 2] / C)); let a = H.get(k); if (!a) H.set(k, a = []); a.push(i); } S.H = H; return S; }
  let lastI = -1;
  function q(S, x, y, z) {
    const ix = Math.floor(x / C), iy = Math.floor(y / C), iz = Math.floor(z / C); let best = 1e9, bi = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const L = S.H.get(K(ix + a, iy + b, iz + c)); if (!L) continue;
      for (const i of L) { const dx = x - S.P[3 * i], dy = y - S.P[3 * i + 1], dz = z - S.P[3 * i + 2], d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bi = i; } } }
    lastI = bi; if (bi < 0) return Infinity; const d = Math.sqrt(best);
    const s = (x - S.P[3 * bi]) * S.N[3 * bi] + (y - S.P[3 * bi + 1]) * S.N[3 * bi + 1] + (z - S.P[3 * bi + 2]) * S.N[3 * bi + 2];
    return s < 0 ? -d : d;
  }
  const torsoRoot = P.spare_torso, ts = torsoRoot.scale.x;
  const inv = torsoRoot.matrixWorld.clone().invert();
  const tor = hash(grab(torsoRoot, new THREE.Matrix4().makeScale(ts, ts, ts).multiply(inv)));
  let tminY = 1e9; for (let i = 1; i < tor.P.length; i += 3) tminY = Math.min(tminY, tor.P[i]);
  // bottom-band footprint in the torso frame -> carton size and centre
  let lx0 = 1e9, lx1 = -1e9, lz0 = 1e9, lz1 = -1e9;
  for (let i = 0; i < tor.P.length / 3; i++) if (tor.P[3 * i + 1] < tminY + 0.03) { lx0 = Math.min(lx0, tor.P[3 * i]); lx1 = Math.max(lx1, tor.P[3 * i]); lz0 = Math.min(lz0, tor.P[3 * i + 2]); lz1 = Math.max(lz1, tor.P[3 * i + 2]); }
  const CW = Math.min(0.42, lx1 - lx0 + 0.04), CD = Math.min(0.38, lz1 - lz0 + 0.04), lcx = (lx0 + lx1) / 2, lcz = (lz0 + lz1) / 2;
  const rob = hash(grab(P.robot, null, (p) => p.y < 0.8 && p.z > 1.0 && p.x < -0.3));
  const ben = hash(grab(P.workbench, null, (p) => p.z > 1.0 && p.x > -1.6));
  const tb = new THREE.Box3().setFromObject(P.toolbox, true), bb = new THREE.Box3().setFromObject(P.workbench, true);
  const robBox = new THREE.Box3().setFromObject(P.robot, true);
  const nt = tor.P.length / 3, nr = rob.P.length / 3;
  const out = [];
  for (const ch of [0.01, 0.1, 0.14, 0.18, 0.22]) for (let ry = 0; ry < 360; ry += 10) {
    const r = ry * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const W = new Float32Array(nt * 3);
    for (let i = 0; i < nt; i++) { const x = tor.P[3 * i], y = tor.P[3 * i + 1], z = tor.P[3 * i + 2]; W[3 * i] = x * cs + z * sn; W[3 * i + 1] = y - tminY + ch; W[3 * i + 2] = -x * sn + z * cs; }
    for (let tx = -1.25; tx <= -0.45; tx += 0.01) for (let tz = 1.2; tz <= 2.0; tz += 0.01) {
      const dx = T.x - tx, dy = T.y - (ch - tminY), dz = T.z - tz;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const sd = q(tor, lx, dy, lz);
      if (!(sd > -0.004 && sd < 0.01)) continue;
      const ci = lastI; const cn = [tor.N[3 * ci], tor.N[3 * ci + 1], tor.N[3 * ci + 2]];
      // world normal at the contact
      const wn = [cn[0] * cs + cn[2] * sn, cn[1], -cn[0] * sn + cn[2] * cs];
      let bad = 0;
      for (let i = 0; i < nt && bad < 2; i += 2) { const x = W[3 * i] + tx, y = W[3 * i + 1], z = W[3 * i + 2] + tz;
        if ((x - T.x) ** 2 + (y - T.y) ** 2 + (z - T.z) ** 2 < 0.0016) continue;
        if (tb.containsPoint(v.set(x, y, z))) { bad++; continue; }
        if (robBox.containsPoint(v) && q(rob, x, y, z) < -0.002) bad++;
        else if (z < 1.36 && q(ben, x, y, z) < -0.002) bad++; }
      if (bad >= 2) continue;
      let bad2 = 0;
      for (let i = 0; i < nr && bad2 < 2; i++) { const x = rob.P[3 * i], y = rob.P[3 * i + 1], z = rob.P[3 * i + 2];
        if ((x - T.x) ** 2 + (y - T.y) ** 2 + (z - T.z) ** 2 < 0.0016) continue;
        const ex = x - tx, ey = y - (ch - tminY), ez = z - tz; const ax = ex * cs - ez * sn, az = ex * sn + ez * cs;
        if (q(tor, ax, ey, az) < -0.002) bad2++; }
      if (bad2 >= 2) continue;
      // carton (aligned with the torso): robot vertices inside it, its corners in the bench / toolbox boxes
      const ccx = tx + lcx * cs + lcz * sn, ccz = tz - lcx * sn + lcz * cs;
      let bad3 = 0;
      for (let i = 0; i < nr; i++) { const y = rob.P[3 * i + 1]; if (y > ch + 0.005) continue; const ex = rob.P[3 * i] - ccx, ez = rob.P[3 * i + 2] - ccz;
        const ax = ex * cs - ez * sn, az = ex * sn + ez * cs; if (Math.abs(ax) < CW / 2 + 0.005 && Math.abs(az) < CD / 2 + 0.005) bad3++; }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const ax = sx * CW / 2, az = sz * CD / 2; const wx = ccx + ax * cs + az * sn, wz = ccz - ax * sn + az * cs;
        if (tb.containsPoint(v.set(wx, 0.05, wz)) || (wz < bb.max.z + 0.005 && wx < bb.max.x + 0.005)) bad3 += 10; }
      if (bad3 > 0) continue;
      out.push({ ch, ry, tx: +tx.toFixed(3), tz: +tz.toFixed(3), sd: +sd.toFixed(4), bad, bad2, wn: wn.map((x) => +x.toFixed(2)), ccx: +ccx.toFixed(3), ccz: +ccz.toFixed(3) });
    }
  }
  // visibility of the tip from the review cameras with the torso at each candidate pose (real raycast)
  const cams = { full: [0.65, 0.95, 2.75], robot: [0.7, 1.1, 2.3], est: [-0.25, 1.42, 4.5] };
  const rc = new THREE.Raycaster(); const save = [torsoRoot.position.clone(), torsoRoot.rotation.y];
  const keep = [];
  for (const c of out) {
    torsoRoot.position.set(c.tx, c.ch - tminY, c.tz); torsoRoot.rotation.y = c.ry * Math.PI / 180; torsoRoot.updateMatrixWorld(true);
    c.vis = {};
    for (const [k, p] of Object.entries(cams)) { const o = new THREE.Vector3(...p), d = T.clone().sub(o); const L = d.length(); rc.set(o, d.normalize()); rc.far = L - 0.012;
      c.vis[k] = rc.intersectObject(torsoRoot, true).length === 0 ? 1 : 0;
      // contact face toward that camera
      c.vis[k + 'F'] = +((c.wn[0] * (p[0] - T.x) + c.wn[1] * (p[1] - T.y) + c.wn[2] * (p[2] - T.z)) / Math.hypot(p[0] - T.x, p[1] - T.y, p[2] - T.z)).toFixed(2); }
    keep.push(c);
  }
  torsoRoot.position.copy(save[0]); torsoRoot.rotation.y = save[1]; torsoRoot.updateMatrixWorld(true);
  return { n: keep.length, tminY, ts, CW, CD, lcx, lcz, out: keep };
}, T);
console.log('candidates', res.n, 'tminY', res.tminY.toFixed(3), 'scale', res.ts, 'carton', res.CW.toFixed(3), res.CD.toFixed(3));
writeFileSync('/tmp/tipsearch.json', JSON.stringify(res));
await browser.close(); process.exit(0);
