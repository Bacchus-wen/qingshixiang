// node tools/shop-lodlevels.mjs <placed name> <out prefix> [query]: the same close-up with the object pinned to each LOD level
// pin one placed LOD object to each level in turn (camera fixed) and screenshot: node tools/_levels.mjs name out_prefix [query]
import { chromium } from 'playwright';
const [name, pre, q = ''] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`http://127.0.0.1:5173/?shot=shop-iso&frames=30${q}`);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 240000 });
const n = await page.evaluate(async (name) => {
  const e = window.__engine, THREE = e.ctx.THREE, o = e.ctx.api.shop.placed[name], cam = e.camera, L = e.ctx.api.shop.lod;
  e.shot = null; L.update = () => {}; // freeze level selection
  const b = new THREE.Box3().setFromObject(o, true), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
  const d = new THREE.Vector3(0.55, 0.35, 1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y);
  cam.fov = 35; cam.updateProjectionMatrix(); cam.position.copy(c).addScaledVector(d, Math.max(0.4, r / Math.tan(0.305) * 1.2)); cam.lookAt(c);
  await Promise.all(o.set.levels.map((_, i) => L.load(o.set, i)));
  return o.set.levels.length;
}, name);
for (let i = 0; i < n; i++) {
  await page.evaluate(({ name, i }) => { const e = window.__engine, o = e.ctx.api.shop.placed[name]; o.show(i); for (let k = 0; k < 6; k++) e.postfx.render(1 / 60); }, { name, i });
  await page.waitForTimeout(400); await page.screenshot({ path: `${pre}_L${i}.png` });
}
await browser.close(); process.exit(0);
