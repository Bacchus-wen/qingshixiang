// Distance from the robot's screwdriver tip (extreme vertex along the shaft near T) to the spare torso surface.
import { chromium } from 'playwright';
const T = JSON.parse(process.argv[2] || '[-0.5915,0.2859,1.4666]'), S = JSON.parse(process.argv[3] || '[0.18,-0.25,0.95]'); // tip and blade direction
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://127.0.0.1:5173/?shot=shop-robotfull');
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
const r = await page.evaluate(({ T, S }) => {
  const e = window.__engine, THREE = e.ctx.THREE, P = e.ctx.api.shop.placed, v = new THREE.Vector3();
  const t0 = new THREE.Vector3(...T), s = new THREE.Vector3(...S).normalize();
  let tip = null, best = -1e9;
  P.robot.updateMatrixWorld(true);
  P.robot.traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v.distanceTo(t0) < 0.05) { const d = v.clone().sub(t0).dot(s); if (d > best) { best = d; tip = v.clone(); } } } });
  let dmin = 9, near = null; P.spare_torso.updateMatrixWorld(true);
  P.spare_torso.traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); const d = v.distanceTo(tip); if (d < dmin) { dmin = d; near = v.clone(); } } });
  const rc = new THREE.Raycaster(tip.clone().addScaledVector(s, -0.03), s, 0, 0.08); const h = rc.intersectObject(P.spare_torso, true)[0];
  const bt = new THREE.Box3().setFromObject(P.spare_torso, true);
  return { tip: tip.toArray().map((x) => +x.toFixed(3)), dmin: +dmin.toFixed(4), along: h ? +(h.distance - 0.03).toFixed(4) : null, torsoMinY: +bt.min.y.toFixed(3), pos: P.spare_torso.position.toArray().map((x) => +x.toFixed(3)) };
}, { T, S });
console.log(JSON.stringify(r));
await browser.close(); process.exit(0);
