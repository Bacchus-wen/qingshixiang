import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, uv, color, time, hash, floor, fract, sin, cos, mix, smoothstep, step, abs, max, min, length, dot, pow, clamp,
  positionGeometry, positionWorld, normalView, positionViewDirection, lights, texture, mx_noise_float, atan, normalLocal, positionLocal, normalize,
} from 'three/tsl';
import { memoryMask, memoryMaskCPU } from '../../materials/memory.js';
import { BEAM_COLOR } from './eye.js';

// What comes back inside the robot's beam (v4 shop). Everything here is driven by the memory cone (ctx.memory): per
// pixel where a material can do it (radio dials glow where the beam falls), per object where it needs state (a TV
// switches on and picks a programme when the beam finds it; the wall clock's pendulum starts swinging).
//   TVs      : every CRT gets a picture on its curved screen (test card, snow, colour bars; programme stills when
//              available), with scanlines and a glow that lights the room in front of it
//   radios   : the dial window of every closed tube radio glows warm, the way a dial lamp does
//   clock    : the pendulum swings (vertex rotation of the pendulum only, measured with tools/model-probe.mjs)
// (v5, looking out: the street across the road is the past that matters -- index.js, the now/then photographs. These
// stay for the moments the beam crosses the shop. The v4 shadows -- the customer, the child, her height marks -- are gone)
export const CHILD_LAYER = 6; // seen only by the eye's shadow camera (no figures use it now)

// ---- model-space helpers for hooks on LOD levels (each level's mesh is quantised: Q maps it to model space)
const modelPos = (mesh) => uniform(mesh.matrixWorld.clone()).mul(vec4(positionGeometry, 1)).xyz;

// ---- CRT picture. u in [0,1]^2 across the screen; ch = channel; on = 0..1 power (warming up / dying)
// per model (tools/probe.sh: the glass measured in model space); the hero set on the cartons is the 2026-10-21 Tripo
// single-image regeneration (blind review: the best wear on its front; its back, never seen there, is a plain board)
const TVS = {
  'crt_tv.glb': { w: 0.345, h: 0.236, cx: -0.0545, cy: 0.173, apex: 0.1585, bulge: 0.021, corner: 0.035 },
  'crt_tv_hero.glb': { w: 0.336, h: 0.232, cx: -0.052, cy: 0.174, apex: 0.1386, bulge: 0.021, corner: 0.035 },
};
const TV = TVS['crt_tv.glb']; // (w, cx: once the picture covered the glass, 1/10 of the glass showed bare on the left)
function screenGeometry(TV) {
  const g = new THREE.PlaneGeometry(TV.w, TV.h, 24, 18), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), nx = x / (TV.w / 2), ny = y / (TV.h / 2);
    p.setXYZ(i, TV.cx + x, TV.cy + y, TV.apex + 0.0025 - TV.bulge * (nx * nx + ny * ny) * 0.5 - TV.bulge * nx * nx * ny * ny * 0.5);
  }
  g.computeVertexNormals();
  return g;
}
function crtMaterial(chan, on, atlas, prog, TV) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.colorNode = Fn(() => {
    const u0 = uv();
    // the glass curves: the picture bows a little toward the corners
    const c = u0.sub(0.5), r2 = dot(c, c);
    const u = c.mul(float(1).add(r2.mul(0.18))).add(0.5);
    const rr = vec2(TV.w, TV.h), q = abs(c.mul(rr)).sub(rr.mul(0.5).sub(TV.corner));
    const corner = length(max(q, vec2(0))).sub(TV.corner);
    const mask = float(1).sub(smoothstep(-0.004, 0.0, corner));
    const t = time;
    // channels: 0 test card, 1 snow, 2 colour bars, 3.. programme stills (atlas)
    const snow = hash(floor(u.x.mul(240)).add(floor(u.y.mul(180)).mul(241)).add(floor(t.mul(30)).mul(57331))).mul(0.85).add(0.05);
    const roll = smoothstep(0.0, 0.04, fract(u.y.add(t.mul(0.31)))).mul(0.25).add(0.75);
    const bars = Fn(() => {
      const i = floor(u.x.mul(7));
      const col = vec3(
        step(i, 1.5).add(step(3.5, i).mul(step(i, 4.5))).clamp(0, 1),
        step(i, 3.5),
        step(0.5, i).mul(step(i, 1.5)).add(step(2.5, i).mul(step(i, 3.5))).add(step(4.5, i).mul(step(i, 5.5))).clamp(0, 1),
      ).mul(0.75);
      return mix(col, vec3(0.08), step(u.y, 0.22));
    })();
    const card = Fn(() => { // a broadcast test card: grey grid, centre circle, colour band, black/white blocks
      const g = abs(fract(u.mul(vec2(14, 10))).sub(0.5));
      const grid = step(0.44, max(g.x, g.y));
      const pc = u.sub(0.5).mul(vec2(1.31, 1));
      const ring = smoothstep(0.012, 0.0, abs(length(pc).sub(0.36)));
      const inCircle = step(length(pc), 0.36);
      const band = step(0.42, u.y).mul(step(u.y, 0.58)).mul(inCircle);
      const bc = vec3(fract(u.x.mul(4)).greaterThan(0.5).select(1, 0.2), fract(u.x.mul(2)).greaterThan(0.5).select(0.9, 0.3), fract(u.x.mul(8)).greaterThan(0.5).select(0.85, 0.25));
      let col = mix(vec3(0.45), vec3(0.95), grid);
      col = mix(col, bc, band);
      col = mix(col, vec3(0.95), ring);
      const blocks = step(0.62, u.y).mul(step(u.y, 0.7)).mul(inCircle);
      col = mix(col, vec3(fract(u.x.mul(6)).greaterThan(0.5).select(0.95, 0.05)), blocks);
      return col;
    })();
    let pic = mix(card, vec3(snow), step(0.5, chan).mul(step(chan, 1.5)));
    pic = mix(pic, bars, step(1.5, chan).mul(step(chan, 2.5)));
    if (prog) { // programmes: the 1990s street across the road, as the local station showed it (crops of the "then" photograph)
      const R = prog.rects, k = chan.sub(3);
      let rect = vec4(...R[0]);
      for (let i = 1; i < R.length; i++) rect = mix(rect, vec4(...R[i]), step(i - 0.5, k));
      const img = texture(prog.tex, rect.xy.add(u.mul(rect.zw))).rgb;
      const lum = dot(img, vec3(0.299, 0.587, 0.114));
      // (r8: soft and dim it read as the shop reflected in the glass, not a set playing) sharp, brighter, more contrast
      pic = mix(pic, clamp(mix(vec3(lum), img, 0.72).sub(0.05).mul(1.18), 0, 1.0), step(2.5, chan)); // (r14: "oversaturated, a photo sticker": less colour and light)
    }
    if (atlas) { // programme stills: one row of N images
      const n = float(atlas.n), k = chan.sub(3).clamp(0, atlas.n - 1);
      const img = texture(atlas.tex, vec2(u.x.add(k).div(n), u.y)).rgb;
      pic = mix(pic, img.mul(1.05), step(2.5, chan));
    }
    // a weak signal: snow over the picture while the beam's edge is on the set, the picture rolling
    const weak = float(1).sub(on).clamp(0, 1);
    pic = mix(pic.mul(roll.mul(weak).add(float(1).sub(weak))), vec3(snow), weak.mul(0.55));
    // phosphor: scanlines, a faint shadow mask, soft vignette; warm-up: the picture blooms out from the centre line
    const scan = sin(u.y.mul(Math.PI * 2 * 150)).mul(0.5).add(0.5).mul(0.1).add(0.9); // ~150 soft lines: finer ones alias at room distance
    const maskRGB = vec3(sin(u.x.mul(900)).mul(0.06).add(0.97), sin(u.x.mul(900).add(2.1)).mul(0.06).add(0.97), sin(u.x.mul(900).add(4.2)).mul(0.06).add(0.97));
    const vig = float(1).sub(smoothstep(0.2, 0.72, length(c.mul(vec2(1.1, 1.3)))).mul(0.62)); // the tube's darker rim: the picture sits behind curved glass
    const warm = smoothstep(0.0, 0.12, on.mul(0.5).sub(abs(u.y.sub(0.5)).mul(on.lessThan(0.3).select(1, 0))));
    const sheen = smoothstep(0.1, 0.0, abs(u0.x.add(u0.y.mul(0.6)).sub(0.42))).mul(smoothstep(0.75, 0.35, u0.y)).mul(0.07); // a soft reflection across the glass
    return pic.mul(scan).mul(maskRGB).mul(vig).mul(1.35).mul(on.clamp(0, 1)).mul(warm.max(on.greaterThan(0.3).select(1, 0))).add(sheen);
  })();
  m.opacityNode = Fn(() => { // glass-edge mask (the picture stops at the rounded corners of the tube)
    const c = uv().sub(0.5), rr = vec2(TV.w, TV.h), q = abs(c.mul(rr)).sub(rr.mul(0.5).sub(TV.corner));
    return float(1).sub(smoothstep(-0.004, 0.0, length(max(q, vec2(0))).sub(TV.corner))).mul(on.clamp(0, 1).mul(4).clamp(0, 1));
  })();
  // (normal, not additive: added over the model's pale glass the picture never got darker than the glass -- a milky
  // veil; the tube's picture covers the glass while it is on, and fades back to it as the set dies)
  return m;
}

// ---- silhouette material: black, rimmed in the beam's colour, visible only inside the beam (same language as the
// v3 ghosts): the past as an outline of light
function silhouetteMaterial(extra = float(1)) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.lightsNode = lights([]);
  m.colorNode = vec3(0);
  const rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 4.0);
  const mask = memoryMask(positionWorld).mul(extra);
  m.emissiveNode = color(BEAM_COLOR).mul(rim.mul(1.4).add(0.012)).mul(mask);
  m.maskNode = mask.greaterThan(0.12);
  return m;
}

// hooks on the generated models' levels, registered by the shop before any level loads (./index.js)
export const pastU = { dialK: uniform(1), swing: uniform(0) };
export function pastHooks(lod) {
  const { dialK, swing } = pastU;
  // ---- radios: the dial window glows where the beam is (fragment stage, per pixel: no per-copy state)
  lod.hook('tube_radio_closed', (scene) => {
    scene.updateMatrixWorld(true);
    scene.traverse((m) => {
      if (!m.isMesh || !m.material.map) return;
      const P = modelPos(m), c = texture(m.material.map).rgb;
      // the dial window (tools/probe.sh tube_radio_closed: x -0.195..0.192, y 0.105..0.152, the front) lit from behind: the
      // glass a dim amber, its scale lines and figures brighter. (It was y 0.236-0.30 and "cream" -- that is the speaker
      // cloth: the judges saw "a dial still dark" and "a cream speaker like dirty cardboard", r4-r13)
      const win = smoothstep(-0.2, -0.19, P.x).mul(smoothstep(0.197, 0.187, P.x)).mul(smoothstep(0.103, 0.11, P.y)).mul(smoothstep(0.154, 0.147, P.y)).mul(smoothstep(0.07, 0.09, P.z));
      const lum = dot(c, vec3(0.299, 0.587, 0.114));
      m.material.emissiveNode = vec3(1.0, 0.58, 0.24).mul(float(0.1).add(smoothstep(0.4, 0.75, lum).mul(1.1))).mul(win).mul(memoryMask(positionWorld)).mul(dialK).mul(1.5);
      // the speaker cloth (x -0.24..0.24, y 0.16..0.297): a woven grille cloth, not a printed board -- a fine 2.5 mm weave
      const cloth = smoothstep(0.155, 0.165, P.y).mul(smoothstep(0.3, 0.292, P.y)).mul(smoothstep(0.07, 0.09, P.z));
      const weave = sin(P.x.mul(Math.PI * 2 / 0.0025)).mul(sin(P.y.mul(Math.PI * 2 / 0.0025))).mul(0.5).add(0.5);
      m.material.colorNode = c.mul(mix(float(1), weave.mul(0.16).add(0.86), cloth));
    });
  });
  // ---- the wall clock's pendulum: rod and bob only (|x| < 6 cm, y 0.15-0.40, z -0.03..0.045 in model space), swinging
  // about a pivot behind the dial
  lod.hook('wall_clock', (scene) => {
    scene.updateMatrixWorld(true);
    scene.traverse((m) => {
      if (!m.isMesh) return;
      const Q = m.matrixWorld.clone(), q = uniform(Q), qi = uniform(Q.clone().invert());
      m.material.positionNode = Fn(() => {
        const p = q.mul(vec4(positionGeometry, 1)).xyz;
        const w = smoothstep(0.065, 0.055, abs(p.x)).mul(smoothstep(0.145, 0.155, p.y)).mul(smoothstep(0.405, 0.395, p.y))
          .mul(smoothstep(-0.032, -0.026, p.z)).mul(smoothstep(0.046, 0.04, p.z));
        const a = swing.mul(w), piv = vec2(0.0, 0.47);
        const d = vec2(p.x, p.y).sub(piv);
        const r = vec2(d.x.mul(cos(a)).sub(d.y.mul(sin(a))), d.x.mul(sin(a)).add(d.y.mul(cos(a)))).add(piv);
        return qi.mul(vec4(r.x, r.y, p.z, 1)).xyz;
      })();
    });
  });
}

// ---- clean knobs over the generated ones (judges r4-r14: "knobs not round, buttons fused -- the generated mesh melts
// exactly where a close-up looks"): a chrome bezel, a knurled bakelite body, a domed cap with a cream pointer line, in
// the model's own space (tools/probe.sh), a little larger than the soft originals so they cover them
const KNOBS = {
  'tube_radio_closed.glb': { face: 0.1185, front: 0.1405, r: 0.0245, ring: 0.0272, at: [[0.0026, 0.0625, 0.4], [-0.0882, 0.0623, -0.6], [-0.1722, 0.0628, 1.2]] },
  // the hero set's channel selector (with a ring of channel numbers -- the generated one is garbled) and its second knob
  // the bench radio (the act-one close-up of its own half-repaired set): brass knobs, the middle one larger
  'tube_radio_open.glb': { face: 0.121, front: 0.147, r: 0.0145, ring: 0.0165, brass: true, at: [[0.2093, 0.0757, 0.3, 0.0145], [0.1505, 0.0803, -0.5, 0.0188], [0.0919, 0.0808, 0.9, 0.0135]] },
  'crt_tv_hero.glb': { face: 0.1195, front: 0.1411, r: 0.0185, ring: 0.0205, fin: true, at: [[0.1879, 0.2633, 0.5], [0.1868, 0.2025, -0.4]], dial: [0.1879, 0.2633, 0.0215, 0.0315] },
};
// the bench radio's valves (tools/probe.sh slabs: front row at z ~0.065, one behind at z 0.015): a glass shell a
// little over each generated one -- a rim of reflection when cold; warming orange through the glass, brightest round
// the plate, when the robot's own radio comes alive (story: memory.benchGlow)
const VALVES = { 'tube_radio_open.glb': [[-0.028, 0.066, 0.205, 0.272, 0.0135], [-0.057, 0.065, 0.205, 0.25, 0.0125], [-0.087, 0.063, 0.2, 0.255, 0.0145], [-0.087, 0.015, 0.2, 0.255, 0.017]] };
const valveGlow = uniform(0);
function valve([x, z, y0, y1, r0]) {
  const r = r0 * 1.25, h = (y1 - y0) * 0.85, g = new THREE.CylinderGeometry(r, r, h, 32, 1, true).translate(0, h / 2, 0); // (just over the generated glass; no outline, so a shell a few mm off shows no ghost)
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const t = positionLocal.y.div(h); // 0 at the socket, 1 at the top
    const face = abs(dot(normalize(positionViewDirection), normalView)).pow(1.5); // light inside the glass: strongest straight through, none at the outline
    const plate = smoothstep(0.08, 0.35, t).mul(smoothstep(0.95, 0.6, t)); // the glowing middle
    return vec3(1.0, 0.36, 0.07).mul(plate.mul(1.5).add(0.08)).mul(face).mul(valveGlow);
  })();
  if (globalThis.location?.search.includes('valvedbg')) m.depthTest = false; // (where are they? drawn over everything)
  const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y0, z); mesh.renderOrder = 5;
  // a dome of glass on top
  return mesh;
}
let dialTex = null;
function channelDial(D) { // white channel numbers 2-13 on a black ring, as on the sets of the time
  dialTex ??= (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#0d0c0b'; g.beginPath(); g.arc(256, 256, 256, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ece6d6'; g.font = 'bold 50px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI * 2; g.fillText(String(i + 2), 256 + Math.cos(a) * 205, 256 + Math.sin(a) * 205); }
    g.strokeStyle = '#ece6d6'; g.lineWidth = 4; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  const m = new THREE.Mesh(new THREE.RingGeometry(D[2], D[3], 64), new THREE.MeshStandardNodeMaterial({ map: dialTex, roughness: 0.45 }));
  m.position.set(D[0], D[1], 0); m.receiveShadow = true; return m;
}
let knobMats = null;
function knob(K0, turn, r) {
  const K = r ? { ...K0, r, ring: r * 1.12 } : K0;
  knobMats ??= (() => {
    const bake = new THREE.MeshStandardNodeMaterial({ roughness: 0.38, metalness: 0 });
    const a = atan(positionLocal.x, positionLocal.y); // around the axis: knurling on the side, worn brown on the cap
    bake.colorNode = mix(vec3(0.028, 0.02, 0.016), vec3(0.07, 0.045, 0.03), mx_noise_float(positionLocal.mul(400)).mul(0.5).add(0.5));
    bake.normalNode = normalize(normalView.add(vec3(sin(a.mul(36)).mul(0.25), 0, 0).mul(smoothstep(0.85, 0.95, abs(normalLocal.z)).oneMinus())));
    const chrome = new THREE.MeshStandardNodeMaterial({ color: 0xc8c4bb, roughness: 0.22, metalness: 1 });
    const cream = new THREE.MeshStandardNodeMaterial({ color: 0xe8dcc0, roughness: 0.5 });
    const brass = new THREE.MeshStandardNodeMaterial({ roughness: 0.42, metalness: 1 });
    brass.colorNode = mix(vec3(0.5, 0.36, 0.17), vec3(0.3, 0.2, 0.09), mx_noise_float(positionLocal.mul(300)).mul(0.5).add(0.5)); // tarnished
    brass.normalNode = bake.normalNode;
    return { bake, chrome, cream, brass };
  })();
  const g = new THREE.Group(), d = K.front - K.face;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(K.ring, K.ring, 0.004, 48, 1).rotateX(Math.PI / 2), knobMats.chrome); ring.position.z = K.face + 0.002; g.add(ring);
  const bodyMat = K.brass ? knobMats.brass : knobMats.bake;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(K.r * 0.92, K.r, d - 0.003, 48, 1).rotateX(Math.PI / 2), bodyMat); body.position.z = K.face + (d - 0.003) / 2 + 0.001; g.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(K.r * 0.92, 40, 8, 0, Math.PI * 2, 0, 0.32).rotateX(Math.PI / 2), bodyMat); cap.scale.z = 0.35; cap.position.z = K.front - 0.0045; g.add(cap);
  const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.0022, K.r * 0.75, 0.0008), knobMats.cream); ptr.position.set(0, K.r * 0.42, K.front - 0.0004); g.add(ptr);
  if (K.fin) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.006, K.r * 1.7, 0.009), knobMats.chrome); fin.position.z = K.front - 0.003; g.add(fin); } // the TV's grip bar across the cap
  g.rotation.z = turn; g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

export default {
  name: 'past',
  async init(ctx) {
    const shop = ctx.api.shop; if (!shop) return;
    const { lod, placed, root } = shop;
    this.ctx = ctx;
    // ---- TVs: a picture on every CRT's screen
    this.tvs = [];
    // (judges r1-r4: test card and colour bars read as a set switched on in a store room, not as the past coming back)
    // the shop's TVs show the street outside as it was: the electronics shop's window, the barber's, the noodle shop
    if (shop.streetThen) this.prog = { tex: shop.streetThen, rects: [[0.6525, 0.07, 0.12, 0.18], [0.437, 0.07, 0.12, 0.18], [0.034, 0.07, 0.12, 0.18]] };
    const scr = {};
    let k = 0;
    // opts.prog: its own programmes ({ tex, rects }); opts.pin: the channel it stays on (no zapping)
    const addTV = (name, o, glb, opts = {}) => {
      const T = TVS[glb]; if (!T) return null;
      const on = uniform(0), chan = uniform(opts.pin ?? k % 3);
      const mesh = new THREE.Mesh(scr[glb] ??= screenGeometry(T), crtMaterial(chan, on, this.atlas, opts.prog ?? this.prog, T));
      mesh.renderOrder = 3; mesh.frustumCulled = false;
      // the LodObject's frame is the model space (a yaw0 pivot is not used for TVs)
      o.add(mesh); o.updateMatrixWorld(true);
      const c = new THREE.Vector3(T.cx, T.cy, T.apex).applyMatrix4(o.matrixWorld);
      const tv = { name, o, mesh, on, chan, c, T, presence: 0, phase: k * 1.7, nextZap: 3 + k * 2.3, pin: opts.pin, far: !!opts.far };
      this.tvs.push(tv); k++; return tv;
    };
    for (const [name, o] of Object.entries(placed)) addTV(name, o, o.userData.layout?.glb);
    // clean knobs on the generated sets that show them in close-ups
    for (const o of Object.values(placed)) {
      const K = KNOBS[o.userData.layout?.glb]; if (!K) continue;
      for (const [x, y, turn, r] of K.at) { const kb = knob(K, turn, r); kb.position.set(x, y, 0); o.add(kb); }
      if (K.dial) { const dm = channelDial(K.dial); dm.position.z = K.face + 0.0012; o.add(dm); }
    }
    for (const o of Object.values(placed)) {
      const V = VALVES[o.userData.layout?.glb]; if (!V) continue;
      for (const v of V) o.add(valve(v));
      o.updateMatrixWorld(true);
      this.valveLight = new THREE.PointLight(0xff8a3a, 0, 0.55, 2); o.localToWorld(this.valveLight.position.set(-0.06, 0.24, 0.05)); ctx.scene.add(this.valveLight); // warm on the chassis inside (made now, at 0: adding a light later recompiles every material)
    }
    // the glow of the brightest set on the room in front of it (one light, moved to whichever set matters most)
    this.tvLight = new THREE.PointLight(0x9fb8ff, 0, 3.4, 1.4); ctx.scene.add(this.tvLight);

    const sys = this;
    ctx.api.past = {
      get tvs() { return sys.tvs; },
      // a set placed by another system (the electronics shop across the road, ./farshop.js): a screen on it that comes on
      // in the beam like these. glb: its model file name ('crt_tv.glb', 'crt_tv_hero.glb')
      addTV: (name, o, glb, opts) => addTV(name, o, glb, opts),
    };
    // (story v5 looks out at the street: the customer, the child at the door and her height marks are gone; past.js v4 has them)
  },

  update(dt, t, ctx) {
    if (!this.tvs) return;
    { // the bench radio's valves: warming with the song, a slight unsteadiness while they come up
      const want = (ctx.memory.benchGlow ?? 0) * (0.93 + 0.07 * Math.sin(t * 17) * Math.sin(t * 5.3));
      valveGlow.value += (want - valveGlow.value) * Math.min(1, dt * (ctx.isShot ? 60 : 1.6));
      if (this.valveLight) this.valveLight.intensity = 0.35 * valveGlow.value;
    }
    const m = ctx.memory;
    // TVs: a set inside the beam switches on (a short warm-up), zaps channels now and then; outside it dies away
    let best = null, bestV = 0;
    for (const tv of this.tvs) {
      tv.c.set(tv.T.cx, tv.T.cy, tv.T.apex).applyMatrix4(tv.o.matrixWorld);
      const want = memoryMaskCPU(tv.c, m);
      tv.presence += (want - tv.presence) * Math.min(1, dt * (want > tv.presence ? 1.8 : 3));
      if (tv.presence > 0.05 && !tv.wasOn && this.prog) tv.chan.value = 3 + (this.tvs.indexOf(tv) % this.prog.rects.length); // switched on by the beam: a programme first
      tv.wasOn = tv.presence > 0.05;
      tv.on.value = tv.presence > 0.02 ? Math.min(1, tv.presence * 1.15) * (m.tvK ?? 1) : 0; // (tvK: the eye's power sagging -- the picture collapses toward its centre line and snows)
      tv.nextZap -= dt * (tv.presence > 0.5 ? 1 : 0);
      if (tv.pin != null) { tv.chan.value = tv.pin; tv.nextZap = 1e9; }
      if (tv.nextZap <= 0) { const np = this.prog?.rects.length || this.atlas?.n || 0; tv.chan.value = np && Math.random() < 0.8 ? 3 + Math.floor(Math.random() * np) : Math.floor(Math.random() * 3); /* mostly programmes, now and then snow or bars */ tv.nextZap = 5 + Math.random() * 7; if (tv.presence > 0.6 && !tv.quiet) ctx.api.audio?.play('tvzap', { pos: tv.c }); }
      const v = tv.presence; if (v > bestV && !tv.far) { bestV = v; best = tv; } // (a set across the road lights nothing in here: Codex farshop-1)
    }
    if (best && bestV > 0.05) {
      this.tvLight.position.copy(best.c).add(new THREE.Vector3(0, 0, 0.3).applyQuaternion(best.o.getWorldQuaternion(new THREE.Quaternion())));
      this.tvLight.intensity = 3.2 * bestV * (0.85 + 0.15 * Math.sin(t * 13 + best.phase) * Math.sin(t * 5.1)) * (m.tvK ?? 1);
    } else this.tvLight.intensity = 0;
    // pendulum: swings while the beam is on the clock (and for a while after); ~1 s period, 4 degrees
    const clock = ctx.api.shop.placed.wall_clock;
    if (clock) {
      const cw = clock.localToWorld(new THREE.Vector3(0, 0.36, 0.02));
      const want = memoryMaskCPU(cw, m);
      this.pend = (this.pend ?? 0) + (want - (this.pend ?? 0)) * Math.min(1, dt * (want > (this.pend ?? 0) ? 1.2 : 0.25));
      pastU.swing.value = 0.12 * this.pend * Math.sin(t * Math.PI * 2 / 1.0); // ~7 degrees each way
      const tick = Math.floor(t * 2); if (this.pend > 0.3 && tick !== this.lastTick) { this.lastTick = tick; ctx.api.audio?.play('tick', { pos: cw, gain: this.pend }); }
    }
  },
};
