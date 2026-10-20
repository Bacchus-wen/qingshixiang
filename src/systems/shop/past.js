import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, uv, color, time, hash, floor, fract, sin, cos, mix, smoothstep, step, abs, max, min, length, dot, pow, clamp,
  positionGeometry, positionWorld, normalView, positionViewDirection, lights, texture, mx_noise_float,
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
      pic = mix(pic, clamp(mix(vec3(lum), img, 0.9).sub(0.06).mul(1.55), 0, 1.2), step(2.5, chan));
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
    const vig = float(1).sub(smoothstep(0.25, 0.75, length(c.mul(vec2(1.1, 1.3)))).mul(0.45));
    const warm = smoothstep(0.0, 0.12, on.mul(0.5).sub(abs(u.y.sub(0.5)).mul(on.lessThan(0.3).select(1, 0))));
    return pic.mul(scan).mul(maskRGB).mul(vig).mul(1.35).mul(on.clamp(0, 1)).mul(warm.max(on.greaterThan(0.3).select(1, 0)));
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
    for (const [name, o] of Object.entries(placed)) {
      const T = TVS[o.userData.layout?.glb]; if (!T) continue;
      const on = uniform(0), chan = uniform(k % 3);
      const mesh = new THREE.Mesh(scr[o.userData.layout.glb] ??= screenGeometry(T), crtMaterial(chan, on, this.atlas, this.prog, T));
      mesh.renderOrder = 3; mesh.frustumCulled = false;
      // the LodObject's frame is the model space (a yaw0 pivot is not used for TVs)
      o.add(mesh);
      const c = new THREE.Vector3(T.cx, T.cy, T.apex).applyMatrix4(o.matrixWorld);
      this.tvs.push({ name, o, mesh, on, chan, c, T, presence: 0, phase: k * 1.7, nextZap: 3 + k * 2.3 });
      k++;
    }
    // the glow of the brightest set on the room in front of it (one light, moved to whichever set matters most)
    this.tvLight = new THREE.PointLight(0x9fb8ff, 0, 3.4, 1.4); ctx.scene.add(this.tvLight);

    const sys = this;
    ctx.api.past = {
      get tvs() { return sys.tvs; },
    };
    // (story v5 looks out at the street: the customer, the child at the door and her height marks are gone; past.js v4 has them)
  },

  update(dt, t, ctx) {
    if (!this.tvs) return;
    const m = ctx.memory;
    // TVs: a set inside the beam switches on (a short warm-up), zaps channels now and then; outside it dies away
    let best = null, bestV = 0;
    for (const tv of this.tvs) {
      tv.c.set(tv.T.cx, tv.T.cy, tv.T.apex).applyMatrix4(tv.o.matrixWorld);
      const want = memoryMaskCPU(tv.c, m);
      tv.presence += (want - tv.presence) * Math.min(1, dt * (want > tv.presence ? 1.8 : 3));
      if (tv.presence > 0.05 && !tv.wasOn && this.prog) tv.chan.value = 3 + (this.tvs.indexOf(tv) % this.prog.rects.length); // switched on by the beam: a programme first
      tv.wasOn = tv.presence > 0.05;
      tv.on.value = tv.presence > 0.02 ? Math.min(1, tv.presence * 1.15) : 0;
      tv.nextZap -= dt * (tv.presence > 0.5 ? 1 : 0);
      if (tv.nextZap <= 0) { const np = this.prog?.rects.length || this.atlas?.n || 0; tv.chan.value = np && Math.random() < 0.8 ? 3 + Math.floor(Math.random() * np) : Math.floor(Math.random() * 3); /* mostly programmes, now and then snow or bars */ tv.nextZap = 5 + Math.random() * 7; if (tv.presence > 0.6) ctx.api.audio?.play('tvzap', { pos: tv.c }); }
      const v = tv.presence; if (v > bestV) { bestV = v; best = tv; }
    }
    if (best && bestV > 0.05) {
      this.tvLight.position.copy(best.c).add(new THREE.Vector3(0, 0, 0.3).applyQuaternion(best.o.getWorldQuaternion(new THREE.Quaternion())));
      this.tvLight.intensity = 3.2 * bestV * (0.85 + 0.15 * Math.sin(t * 13 + best.phase) * Math.sin(t * 5.1));
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
