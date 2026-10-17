import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { color, float, mix, mx_fractal_noise_float, mx_noise_float, positionWorld, smoothstep, vec3, mx_worley_noise_float } from 'three/tsl';

// v4: the closed-down home-appliance repair shop (docs/scene-shop.md). This phase is models + layout only:
// a simple room shell, the Tripo models placed from /models/shop/layout.json (every item is grounded on its
// support surface automatically), plain review lighting (desk lamp warm key, blue dusk from the street).
// Room: x in [-3, 3], z in [-2.25, 2.25] (front/shutter at +z), floor y = 0, ceiling 3.0.
export const ROOM = { w: 6.0, d: 4.5, h: 3.0 };

function terrazzo() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const P = positionWorld;
  const chips = smoothstep(0.08, 0.02, mx_worley_noise_float(P.xz.mul(38)));
  const chips2 = smoothstep(0.06, 0.015, mx_worley_noise_float(P.xz.mul(61).add(3.1)));
  const base = vec3(0.56, 0.54, 0.5).mul(mx_fractal_noise_float(vec3(P.x.mul(1.5), 0, P.z.mul(1.5)), 3, 2, 0.5).mul(0.12).add(0.92));
  let c = mix(base, vec3(0.22, 0.21, 0.2), chips.mul(0.8));
  c = mix(c, vec3(0.72, 0.68, 0.6), chips2.mul(0.7));
  const grime = smoothstep(0.3, 0.8, mx_noise_float(vec3(P.x.mul(0.8), 0, P.z.mul(0.8)).add(2.0)).mul(0.5).add(0.5));
  m.colorNode = c.mul(mix(float(1), float(0.72), grime));
  m.roughnessNode = mix(float(0.35), float(0.7), grime);
  return m;
}

function wallMat() {
  // green gloss paint dado to 1.2 m, yellowed lime above; worn, stained, scuffed near the floor
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld;
  const dado = smoothstep(1.21, 1.19, P.y);
  const n = mx_fractal_noise_float(P.mul(2.2), 4, 2, 0.5).mul(0.5).add(0.5);
  const stain = smoothstep(0.55, 0.85, mx_noise_float(vec3(P.x.mul(0.9).add(P.z.mul(0.9)), P.y.mul(0.35), 4.0)).mul(0.5).add(0.5));
  const chip = smoothstep(0.78, 0.84, mx_fractal_noise_float(P.mul(9), 3, 2, 0.5).mul(0.5).add(0.5)).mul(dado);
  const green = vec3(0.17, 0.27, 0.2).mul(n.mul(0.25).add(0.85));
  const lime = vec3(0.72, 0.68, 0.56).mul(n.mul(0.2).add(0.85));
  let c = mix(lime, green, dado);
  c = mix(c, vec3(0.5, 0.47, 0.4), chip);
  c = c.mul(mix(float(1), float(0.78), stain));
  c = c.mul(mix(float(1), float(0.7), smoothstep(0.25, 0.0, P.y)));
  m.colorNode = c;
  m.roughnessNode = mix(float(0.85), float(0.45), dado);
  return m;
}

const _box = new THREE.Box3();

// slotted angle-iron shelving (thin repeated steel: procedural, not generated): uprights, boards, worn grey-green paint
function shelfUnit(it) {
  const g = new THREE.Group();
  const W = it.w || 1.8, D = it.d || 0.45, H = it.h || 2.4, n = it.levels || 5;
  const steel = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.5 });
  const P = positionWorld;
  const wear = smoothstep(0.55, 0.8, mx_fractal_noise_float(P.mul(7), 3, 2, 0.5).mul(0.5).add(0.5));
  steel.colorNode = mix(vec3(0.27, 0.31, 0.28), vec3(0.32, 0.22, 0.14), wear.mul(0.7));
  const board = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.35 });
  board.colorNode = mix(vec3(0.3, 0.33, 0.3), vec3(0.24, 0.17, 0.11), smoothstep(0.5, 0.85, mx_noise_float(P.mul(3.3)).mul(0.5).add(0.5)).mul(0.6));
  const angle = (x, z) => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.035, H, 0.004), steel); a.position.set(x, H / 2, z + (z < 0 ? 0.0155 : -0.0155));
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.004, H, 0.035), steel); b.position.set(x + (x < 0 ? 0.0155 : -0.0155), H / 2, z);
    g.add(a, b);
  };
  for (const x of [-W / 2 + 0.018, W / 2 - 0.018]) for (const z of [-D / 2 + 0.018, D / 2 - 0.018]) angle(x, z);
  for (let i = 0; i < n; i++) {
    const y = 0.08 + i * (H - 0.12) / (n - 1);
    const b = new THREE.Mesh(new THREE.BoxGeometry(W - 0.01, 0.012, D - 0.01), board); b.position.set(0, y, 0); g.add(b);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.035, 0.004), steel); lip.position.set(0, y - 0.012, D / 2 - 0.002); g.add(lip);
  }
  g.name = it.name;
  return g;
}

export default {
  name: 'shop',
  async init(ctx) {
    const { scene } = ctx;
    const root = this.root = new THREE.Group(); root.name = 'shop';
    scene.add(root);
    const { w, d, h } = ROOM;
    // shell: floor, ceiling, back/left/right walls, front wall pieces around the shutter opening (2.8 m wide)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d + 3).rotateX(-Math.PI / 2), terrazzo());
    floor.position.z = 1.5; floor.receiveShadow = true; root.add(floor);
    const wm = wallMat();
    const wall = (W, H, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wm); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; root.add(m); return m; };
    wall(w, h, 0, h / 2, -d / 2, 0);
    wall(d, h, -w / 2, h / 2, 0, Math.PI / 2);
    wall(d, h, w / 2, h / 2, 0, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), new THREE.MeshStandardNodeMaterial({ color: 0x8c877c, roughness: 0.9 }));
    ceil.position.y = h; root.add(ceil);
    // front wall with the shutter opening, seen from inside as dark masonry
    const front = new THREE.MeshStandardNodeMaterial({ color: 0x6f6a60, roughness: 0.9 });
    const fw = (W, H, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.25), front); m.position.set(x, y, d / 2 + 0.125); root.add(m); };
    fw((w - 3.6) / 2, h, -w / 2 + (w - 3.6) / 4, h / 2); fw((w - 3.6) / 2, h, w / 2 - (w - 3.6) / 4, h / 2); fw(3.6, h - 2.6, 0, 2.6 + (h - 2.6) / 2);
    // rolling shutter, half open: corrugated slats from the lintel down to 1.25 m
    {
      const slats = new THREE.Group(); const sm = new THREE.MeshStandardNodeMaterial({ color: 0x5e6266, roughness: 0.55, metalness: 0.6 });
      for (let y = 2.55; y > 2.05; y -= 0.075) { const s = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.02), sm); s.position.set(0, y, d / 2 + 0.05); s.castShadow = true; slats.add(s); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.05), sm); bar.position.set(0, 2.03, d / 2 + 0.05); slats.add(bar);
      root.add(slats);
    }
    // review lighting: warm desk lamp key, cold dusk from the street, a weak bounce so models read
    scene.add(new THREE.HemisphereLight(0x8090a8, 0x3a3228, 0.55));
    const dusk = new THREE.DirectionalLight(0x9db4d6, 1.4); dusk.position.set(1.5, 2.2, 8); dusk.target.position.set(-0.5, 0, -1);
    dusk.castShadow = true; dusk.shadow.mapSize.setScalar(2048); dusk.shadow.camera.left = -5; dusk.shadow.camera.right = 5; dusk.shadow.camera.top = 5; dusk.shadow.camera.bottom = -5; dusk.shadow.bias = -0.0004;
    scene.add(dusk, dusk.target);
    this.lamp = new THREE.SpotLight(0xffc489, 18, 6, 0.9, 0.6, 1.5); this.lamp.castShadow = true; this.lamp.shadow.mapSize.setScalar(1024); this.lamp.shadow.bias = -0.0005;
    scene.add(this.lamp, this.lamp.target);
    const fill = new THREE.PointLight(0xffd9a8, 3, 7, 1.5); fill.position.set(0, 2.7, 0); scene.add(fill);

    // models from the layout manifest; each is grounded on its support (floor, or a named surface)
    // KTX2 (Basis) textures: ETC1S colour/ORM, UASTC normals -- transcoded to the GPU's native compressed format
    const ktx2 = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(ctx.renderer);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
    let layout = [];
    try { layout = await (await fetch(`${import.meta.env.BASE_URL}models/shop/layout.json`, { cache: 'no-store' })).json(); } catch { layout = []; }
    const placed = this.placed = {};
    const ray = new THREE.Raycaster(); const down = new THREE.Vector3(0, -1, 0); const v = new THREE.Vector3();
    const supportsOf = (name) => (name && placed[name] ? [placed[name]] : [floor, ...Object.values(placed)]);
    // highest surface under the item's footprint (centre + four corners shrunk to 70%): the item rests on it
    const surfaceUnder = (box, targets) => {
      let best = -Infinity;
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, hx = (box.max.x - box.min.x) * 0.35, hz = (box.max.z - box.min.z) * 0.35;
      for (const [dx, dz] of [[0, 0], [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
        ray.set(v.set(cx + dx, box.max.y + 3, cz + dz), down); ray.far = 10;
        const hit = ray.intersectObjects(targets, true)[0];
        if (hit) best = Math.max(best, hit.point.y);
      }
      return best === -Infinity ? 0 : best;
    };
    for (const it of layout) {
      try {
        let o;
        if (it.type === 'shelf') o = shelfUnit(it);
        else { const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/shop/${it.glb}`); o = g.scene; }
        o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        if (it.scale) o.scale.setScalar(it.scale);
        o.rotation.y = (it.ry || 0) * Math.PI / 180;
        o.position.set(it.pos[0], 0, it.pos[2]);
        root.add(o); o.updateMatrixWorld(true);
        _box.setFromObject(o);
        if (it.wall) {
          // wall-mounted: back face flush with the wall plane, bottom at the given height
          const { w: W, d: D } = ROOM;
          if (it.wall === 'back') o.position.z += -D / 2 - _box.min.z;
          if (it.wall === 'left') o.position.x += -W / 2 - _box.min.x;
          if (it.wall === 'right') o.position.x += W / 2 - _box.max.x;
          o.position.y += (it.pos[1] ?? 1.5) - _box.min.y;
        } else {
          // grounded: lowest point onto the highest surface under its footprint (floor, bench top, shelf board...)
          const sup = it.on && placed[it.on];
          const sl = sup?.userData.layout;
          let y;
          if (it.type === 'shelf') y = 0;
          else if (sl?.type === 'shelf' && it.level != null) { // a given shelf board (0 = bottom)
            const n = sl.levels || 5, H = sl.h || 2.4; y = 0.08 + it.level * (H - 0.12) / (n - 1) + 0.006;
          } else y = surfaceUnder(_box, supportsOf(it.on));
          o.position.y += y - _box.min.y + (it.lift || 0);
        }
        o.updateMatrixWorld(true);
        o.name = it.name; o.userData.layout = it; placed[it.name] = o;
      } catch (e) { console.warn('[shop] model failed', it.glb || it.name, e.message); }
    }
    // the robot's head droops forward and to one side while it is asleep (rest pose; the beam phases animate it later)
    const head = placed.robot?.getObjectByName('robot_head');
    if (head) { this.head = head; head.rotation.set(0.32, 0, -0.12); }
    // the desk lamp, if placed, drives the warm key light
    const lampObj = placed.desk_lamp;
    if (lampObj) { _box.setFromObject(lampObj); this.lamp.position.set((_box.min.x + _box.max.x) / 2 + 0.1, _box.max.y - 0.05, (_box.min.z + _box.max.z) / 2); this.lamp.target.position.set(this.lamp.position.x + 0.3, 0.8, this.lamp.position.z + 0.2); }
    else { this.lamp.position.set(-1.6, 1.45, 0.1); this.lamp.target.position.set(-1.2, 0.8, 0.2); }
    ctx.api.shop = { root, placed, ROOM };
  },
  update() {},
};
