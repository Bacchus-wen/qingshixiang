// 新興電器, the electronics shop across the road, in three dimensions where the photograph cannot be (2026-10-22; the
// user chose "对街关键店铺做成三维" on 10-21: every judge said the far side read as one huge photograph, livelier than the
// 3D cast). The photograph stays for the facade -- the same building now and then, index.js -- but its shop window is
// cut out of it. Behind the cut a real room: shelves of this shop's Tripo-generated sets, recorders, radios and fans,
// the big set on the counter in the window, every screen coming on in the beam (past.js); in front of the cut, while
// the beam is elsewhere, the shutter as the photograph shows it now. The sign is a real lightbox and the threshold a
// real step. (The family the then-photograph shows at the window had no matte to lift them out with: not in this room.)
// Light: like the photograph these carry their own -- the eye's light ends at 10 m and the far side faces away from
// the sky light -- unlit or lit by an emissive copy of their colour, warm from the tubes inside, brightest where the
// beam's core falls, exactly the photograph's rule.
import * as THREE from 'three/webgpu';
import { float, vec2, vec3, color, texture, positionWorld, mix, smoothstep, step, normalWorld, mx_noise_float, mod, uv } from 'three/tsl';
import { memoryMask, mem } from '../../materials/memory.js';
import { ditherNoise } from './lod.js';

// the photograph's pixels (3840 x 1920) -> metres on its plane (16 m wide, foot at y -0.19, at z 11, facing the shop)
const PX = (px) => (2016 - px) / 240, PY = (py) => 7.81 - py / 240, ZF = 11.0;
// the window inside its painted frame; the sign (then's lightbox and now's board together); the room behind
const WIN = { x0: PX(3122), x1: PX(2648), y0: PY(1822), y1: PY(1338) };      // x -4.61..-2.63, y 0.22..2.24
const SIGN = { x0: PX(3190), x1: PX(2620), y0: PY(1320), y1: PY(1175) };     // x -4.89..-2.52, y 2.31..2.91
const WALL = 0.2, ROOM = { x0: -5.75, x1: -1.85, z1: 13.0, y1: 2.6 };          // seen from our side the back wall shows
// left of the window (we look in from its right): the room runs on well past the window's left edge
const WARM = new THREE.Color(1.0, 0.86, 0.66);

const photoUV = (P) => vec2(float(8.4).sub(P.x).div(16), P.y.add(0.19).div(8)); // straight on, as the plane maps it
const inRect = (P, R) => step(R.x0, P.x).mul(step(P.x, R.x1)).mul(step(R.y0, P.y)).mul(step(P.y, R.y1));
// the photograph's brightness in the past: full where the beam itself falls, 0.36 where only the memory reaches
const coreK = (P) => mix(float(0.36), float(0.98), smoothstep(mem.coreCos.sub(0.012), mem.coreCos.add(0.02), P.sub(mem.origin).normalize().dot(mem.dir)));
// the family at the window, traced by hand round the then-photograph (2026-10-22: there was no segmentation tool on
// this machine; a 3x crop from (2805, 1515) with a 10 px grid, outlines checked over it; coordinates in that crop)
const FAMILY = {
  left_man: [[195,45],[240,55],[255,90],[250,140],[245,165],[300,185],[335,230],[355,300],[357,340],[352,420],[347,480],[340,515],[322,525],[305,522],[300,650],[300,800],[295,950],[290,990],[295,1020],[225,1025],[220,985],[200,820],[190,650],[180,820],[165,985],[160,1025],[60,1020],[65,990],[85,985],[90,800],[95,600],[85,520],[70,525],[55,470],[50,400],[48,340],[55,300],[70,230],[100,185],[150,165],[150,140],[143,95],[165,55]],
  right_man: [[545,55],[590,75],[605,110],[600,160],[650,185],[690,230],[720,290],[738,340],[731,370],[726,430],[713,476],[690,486],[682,490],[675,650],[690,990],[715,1005],[640,1010],[640,990],[615,900],[590,990],[590,1000],[510,1000],[505,985],[515,900],[505,700],[495,560],[495,450],[460,470],[455,380],[440,345],[437,300],[460,230],[500,185],[510,165],[505,120],[515,75]],
  child: [[410,360],[455,375],[465,420],[455,470],[490,500],[525,520],[545,580],[550,620],[535,690],[520,720],[505,700],[505,760],[520,800],[480,810],[510,1010],[520,1040],[465,1045],[465,1010],[440,830],[420,810],[400,830],[415,1010],[415,1045],[340,1040],[345,1010],[375,810],[340,800],[345,720],[310,680],[295,640],[295,560],[320,510],[360,495],[365,460],[360,405],[380,365]],
};
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// the room's light: its two tubes just inside the window, near the top (lambert, falling off with distance), a little
// bounce, and lower down a little less (each shelf shades what stands under it). N: the surface normal, world space
const TUBES = [[-3.18, 2.13, 11.36], [-4.08, 2.13, 11.36]];
const tubeLit = (P, N) => {
  let s = float(0.09);
  for (const [x, y, z] of TUBES) { const L = vec3(x, y, z).sub(P), d2 = L.dot(L); s = s.add(N.dot(L.normalize()).max(0).mul(2.6).div(d2.mul(1.4).add(1))); }
  return s.mul(smoothstep(0.2, 1.8, P.y).mul(0.45).add(0.55));
};

export default {
  name: 'farshop',
  async init(ctx) {
    const shop = ctx.api.shop, past = ctx.api.past;
    if (!shop?.backdrop || !shop.streetNow || !shop.lod || ctx.params.get('nofarshop') !== null) return;
    const now = shop.streetNow, then = shop.streetThen, far = shop.farK, P = positionWorld;
    const g = this.group = new THREE.Group(); g.name = 'farshop'; ctx.scene.add(g);
    const photoNow = texture(now, photoUV(P)).rgb.mul(far.mul(0.62)), photoThen = texture(then, photoUV(P)).rgb.mul(coreK(P));
    const photo = mix(photoNow, photoThen, memoryMask(P)); // the backdrop's own rule (index.js)
    // outdoors, a plain surface: the dusk's cold in the present, the shop's warm spill in the past
    const outdoor = (hex) => { const c = color(hex); return mix(c.mul(vec3(0.6, 0.66, 0.78)).mul(far.mul(0.42)), c.mul(color(WARM)).mul(coreK(P)), memoryMask(P)); };
    const indoor = (hex, k = 1, N = normalWorld) => color(hex).mul(color(WARM)).mul(coreK(P)).mul(tubeLit(P, N)).mul(k).mul(mx_noise_float(P.mul(5.0)).mul(0.07).add(1));
    const basic = (node) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = node; return m; };
    const box = (x0, x1, y0, y1, z0, z1, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.add(m); return m; };

    // ---- the photograph: the window cut out; behind the lightbox a dark gap (its edge, seen at an angle)
    const bd = shop.backdrop.material;
    bd.maskNode = inRect(P, WIN).lessThan(0.5);
    bd.colorNode = bd.colorNode.mul(mix(float(1), float(0.22), inRect(P, SIGN)));

    // ---- now: the shutter, as the photograph has it, wherever the beam is not (dithered by the memory's own soft
    // edge: TRAA averages it into the photograph's blend)
    { const m = basic(photoNow); m.maskNode = memoryMask(P).lessThan(ditherNoise);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), m); s.rotation.y = Math.PI;
      s.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, ZF - 0.002); g.add(s); this.shutter = s; }

    // ---- then: the room. The wall's thickness round the window, then a room larger than the window on every side
    { const plaster = basic(indoor(0x9a9384, 0.75)), t = 0.06;
      const z0 = ZF + 0.003; // (just behind the photograph: its face there is the photograph's)
      box(WIN.x0 - t, WIN.x0, WIN.y0, WIN.y1, z0, ZF + WALL, plaster); box(WIN.x1, WIN.x1 + t, WIN.y0, WIN.y1, z0, ZF + WALL, plaster);
      box(WIN.x0 - t, WIN.x1 + t, WIN.y1, WIN.y1 + t, z0, ZF + WALL, plaster); box(WIN.x0 - t, WIN.x1 + t, WIN.y0 - t, WIN.y0, z0, ZF + WALL, plaster);
      const W = (nx, ny, nz, hex = 0xcfc2a6, k = 1) => basic(indoor(hex, k, vec3(nx, ny, nz))); // (inward normals: seen from inside)
      const room = new THREE.Mesh(new THREE.BoxGeometry(ROOM.x1 - ROOM.x0, ROOM.y1 - WIN.y0, ROOM.z1 - ZF - WALL),
        [W(-1, 0, 0), W(1, 0, 0), W(0, -1, 0, 0xe0d6c0, 0.9), W(0, 1, 0, 0x7d766a, 0.85), W(0, 0, -1), W(0, 0, 1)]);
      room.material.forEach((m) => { m.side = THREE.BackSide; });
      room.position.set((ROOM.x0 + ROOM.x1) / 2, (WIN.y0 + ROOM.y1) / 2, (ZF + WALL + ROOM.z1) / 2); g.add(room); }
    // two fluorescent tubes just inside, below the lintel (the photograph shows them through the top of the window)
    { const tube = basic(vec3(3.2, 3.1, 2.8)), body = basic(indoor(0xb8b2a2, 0.8));
      for (const cx of [-3.18, -4.08]) { box(cx - 0.42, cx + 0.42, 2.115, 2.14, ZF + WALL + 0.14, ZF + WALL + 0.17, tube); box(cx - 0.45, cx + 0.45, 2.14, 2.17, ZF + WALL + 0.12, ZF + WALL + 0.19, body); } }

    // ---- shelves along the back wall, the counter in the window, and on them this shop's sets (the Tripo models of
    // the robot's own shop, as they would sell them)
    const metal = basic(indoor(0xbdbcac, 0.85)), wood = basic(indoor(0x5c4636, 0.9));
    const SZ0 = ROOM.z1 - 0.46, SZ1 = ROOM.z1 - 0.02, SX0 = ROOM.x0 + 0.05, SX1 = -2.5;
    // (every camera that sees this shop looks in from its right, so through the window the back wall shows only left of
    // x -3.2: the sets stop at -3.05; the boards run on)
    const FILL1 = -3.05, FILL0 = -5.45;
    const boards = [0.05, 0.47, 0.89, 1.31, 1.73].map((h) => WIN.y0 + h);
    for (const y of boards) box(SX0, SX1, y - 0.02, y, SZ0, SZ1, metal);
    for (let x = SX0; x <= SX1 + 1e-3; x += (SX1 - SX0) / 4) box(x - 0.02, x + 0.02, WIN.y0, boards[4] + 0.02, SZ0, SZ0 + 0.03, metal);
    const counter = { x0: -4.5, x1: -2.72, y1: 0.92, z0: ZF + WALL + 0.06, z1: ZF + WALL + 0.42 };
    { const xr = float(-2.93).sub(mod(float(-2.93).sub(P.x), 0.42)); // (the strip x -3.35..-2.93: tapes, nobody in front)
      const tapes = basic(texture(then, photoUV(vec3(xr, P.y, 0))).rgb.mul(coreK(P)).mul(0.92));
      const c = new THREE.Mesh(new THREE.BoxGeometry(counter.x1 - counter.x0, counter.y1 - WIN.y0, counter.z1 - counter.z0), [wood, wood, wood, wood, wood, tapes]);
      c.position.set((counter.x0 + counter.x1) / 2, (WIN.y0 + counter.y1) / 2, (counter.z0 + counter.z1) / 2); g.add(c); }
    // the vertical 錄影帶 lightbox inside the window, right (its face from the photograph)
    { const m = basic(texture(then, photoUV(P)).rgb.mul(1.1)); box(PX(3120), PX(3070), PY(1580), PY(1390), ZF + WALL + 0.08, ZF + WALL + 0.11, m); }

    // the sets' own light: the window's front as lit as the photograph, the back shelves lower (Codex farshop-1: the back
    // shelf as bright as the front flattened the room)
    const looks = Object.fromEntries([['front', 1.1], ['back', 0.85]].map(([k, gain]) => [k, { key: `farshop-${k}`, fn: (t, src) => {
      const alb = (src.map ? texture(src.map).rgb : vec3(1)).mul(color(src.color));
      t.emissiveNode = alb.mul(color(WARM)).mul(coreK(positionWorld)).mul(tubeLit(positionWorld, normalWorld)).mul(gain);
      t.envMapIntensity = 0.1; return t;
    } }]));
    const DIMS = { crt_tv: [0.5, 0.5, 0.33], cassette_recorder: [0.5, 0.357, 0.176], tube_radio_closed: [0.5, 0.322, 0.281], desk_fan: [0.361, 0.46, 0.337], alarm_clock: [0.126, 0.16, 0.079], crt_tv_hero: [0.5, 0.5, 0.282] };
    const SCALE = { crt_tv: 0.7, cassette_recorder: 0.82, tube_radio_closed: 0.86, desk_fan: 0.72, alarm_clock: 1, crt_tv_hero: 1.05 };
    let n = 0;
    const put = (name, x, y, z, s = SCALE[name], ry = Math.PI, where = 'back') => {
      const o = shop.lod.instance(name, { look: looks[where] }); o.scale.setScalar(s); o.rotation.y = ry; o.position.set(x, y, z);
      o.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = false; });
      g.add(o); o.updateMatrixWorld(true);
      if (name.startsWith('crt_tv')) { // the set in the window shows what the photograph's shows (its own screen, x 2687-2795, y 1543-1625)
        const hero = name === 'crt_tv_hero', tv = past?.addTV?.(`far_${name}_${n}`, o, `${name}.glb`, hero ? { prog: { tex: then, rects: [[0.7005, 0.1545, 0.0273, 0.0412]] }, pin: 3, far: true } : { far: true });
        if (tv) tv.quiet = true; // (no zapping sounds from across the road: the shop's own sound plays there, story.js SPOTS)
      }
      n++; return o;
    };
    // the window: the big set on the counter where the photograph has it, a recorder beside it
    put('crt_tv_hero', PX(2742) - 0.02, counter.y1, (counter.z0 + counter.z1) / 2, 1.3, Math.PI + 0.12, 'front'); // (the photograph's set is 0.65 m across)
    put('cassette_recorder', -3.86, counter.y1, (counter.z0 + counter.z1) / 2 + 0.05, 0.9, Math.PI - 0.32, 'front'); // (turned: its side shows -- Codex farshop-1)
    // the shelves, left to right as we see them (decreasing x), packed like the photograph's
    const KINDS = ['crt_tv', 'cassette_recorder', 'crt_tv', 'tube_radio_closed', 'crt_tv', 'cassette_recorder', 'crt_tv', 'cassette_recorder']; // (a radio is 14k triangles at its coarsest, a set or a recorder 3-4k)
    const TURNED = new Set(['1:1', '2:3', '3:0']); // board:index -- a few turned 15-20 degrees, their sides showing (Codex farshop-1)
    boards.forEach((y, b) => {
      let x = FILL1, i = 0, last = null, run = 0;
      while (true) {
        let kind = b === 4 && rnd(b * 31 + i) < 0.3 ? 'desk_fan' : KINDS[Math.floor(rnd(b * 17 + i * 3) * KINDS.length)];
        if (kind === last && run >= 2) kind = KINDS.find((k) => k !== last); // (never three of a kind side by side)
        const s = SCALE[kind] * (0.92 + rnd(b * 5 + i) * 0.12), w = DIMS[kind][0] * s * (TURNED.has(`${b}:${i}`) ? 1.08 : 1);
        if (x - w < FILL0) break;
        const turn = TURNED.has(`${b}:${i}`) ? (rnd(b + i) < 0.5 ? -1 : 1) * 0.3 : (rnd(b * 7 + i * 11) - 0.5) * 0.18;
        put(kind, x - w / 2, y, (SZ0 + SZ1) / 2 + 0.03, s, Math.PI + turn);
        run = kind === last ? run + 1 : 1; last = kind;
        x -= w + 0.03 + rnd(b * 13 + i) * 0.06; i++;
      }
    });

    // ---- the lightbox over the window, standing off the wall; the step at the threshold
    { const side = basic(outdoor(0x34302a)), face = basic(photo);
      const sg = new THREE.Mesh(new THREE.BoxGeometry(SIGN.x1 - SIGN.x0, SIGN.y1 - SIGN.y0, 0.07), [side, side, side, side, side, face]);
      sg.position.set((SIGN.x0 + SIGN.x1) / 2, (SIGN.y0 + SIGN.y1) / 2, ZF - 0.035); g.add(sg);
      const dirt = mx_noise_float(P.mul(vec3(9, 9, 9))).mul(0.18).add(mx_noise_float(P.mul(40)).mul(0.08)).add(0.86); // worn, stained concrete
      const conc = basic(outdoor(0x5f5b54).mul(dirt)), front = basic(outdoor(0x4d4943).mul(dirt)); // (plain: the photograph's foot of the window had the family's feet)
      const st = new THREE.Mesh(new THREE.BoxGeometry(WIN.x1 - WIN.x0 + 0.12, 0.26, 0.13), [conc, conc, conc, conc, conc, front]);
      st.position.set((WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.13, ZF - 0.065); g.add(st); }
    // the family watching the set in the window: the then-photograph's own pixels on their outlines, a little in front
    // of the step (they stand on the pavement); only in the past, switched with the same dither as the shutter
    // (lowered 5.5 cm onto our kerb (its top at y 0.01 under them), the photograph's pavement being that much above it, the picture moved with them; a
    // soft shadow under each where they stand -- Codex farshop-1: paper figures, weakly grounded)
    { const KERB = 0.012, inThen = memoryMask(P).greaterThan(ditherNoise); // (each set down by itself: its lowest point on the kerb top, y 0.01 -- Codex farshop-2)
      const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false }); sm.colorNode = vec3(0);
      const r = uv().sub(0.5).mul(2).length(); sm.opacityNode = smoothstep(1.0, 0.25, r).mul(0.55); sm.maskNode = inThen;
      for (const pts of Object.values(FAMILY)) {
        const v0 = pts.map(([dx, dy]) => new THREE.Vector2(PX(2805 + dx / 3), PY(1515 + dy / 3)));
        const DY = Math.min(...v0.map((p) => p.y)) - KERB, v = v0.map((p) => new THREE.Vector2(p.x, p.y - DY));
        const m = basic(texture(then, photoUV(P.add(vec3(0, DY, 0)))).rgb.mul(coreK(P))); m.side = THREE.DoubleSide; m.maskNode = inThen;
        const f = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(v)), m); f.position.z = ZF - 0.16; f.renderOrder = 2; g.add(f);
        const xs = v.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * 0.95, 0.28).rotateX(-Math.PI / 2), sm);
        sh.position.set((x0 + x1) / 2, 0.016, ZF - 0.17); sh.renderOrder = 1; g.add(sh);
      } }
    g.traverse((m) => { if (m.isMesh && !m.isLodObject) { m.castShadow = false; m.receiveShadow = false; } });
    console.log(`[farshop] ${n} sets on the shelves and in the window`);
  },
  update() {},
};
