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
//   customer : a woman holding out a radio -- only her shadow, thrown across the shelf by the robot's light
//   child    : at the door frame, only a shadow: an invisible figure that casts in the eye's light alone, growing
//              from five to eleven while the pencil marks are drawn (the climax, driven by the story)
export const CHILD_LAYER = 6; // seen only by the eye's shadow camera

// ---- model-space helpers for hooks on LOD levels (each level's mesh is quantised: Q maps it to model space)
const modelPos = (mesh) => uniform(mesh.matrixWorld.clone()).mul(vec4(positionGeometry, 1)).xyz;

// ---- CRT picture. u in [0,1]^2 across the screen; ch = channel; on = 0..1 power (warming up / dying)
const TV = { w: 0.31, h: 0.236, cx: -0.037, cy: 0.173, apex: 0.1585, bulge: 0.021, corner: 0.035 };
function screenGeometry() {
  const g = new THREE.PlaneGeometry(TV.w, TV.h, 24, 18), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), nx = x / (TV.w / 2), ny = y / (TV.h / 2);
    p.setXYZ(i, TV.cx + x, TV.cy + y, TV.apex + 0.0025 - TV.bulge * (nx * nx + ny * ny) * 0.5 - TV.bulge * nx * nx * ny * ny * 0.5);
  }
  g.computeVertexNormals();
  return g;
}
function crtMaterial(chan, on, atlas) {
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
    if (atlas) { // programme stills: one row of N images
      const n = float(atlas.n), k = chan.sub(3).clamp(0, atlas.n - 1);
      const img = texture(atlas.tex, vec2(u.x.add(k).div(n), u.y)).rgb;
      pic = mix(pic, img.mul(1.05), step(2.5, chan));
    }
    // a weak signal: snow over the picture while the beam's edge is on the set, the picture rolling
    const weak = float(1).sub(on).clamp(0, 1);
    pic = mix(pic.mul(roll.mul(weak).add(float(1).sub(weak))), vec3(snow), weak.mul(0.55));
    // phosphor: scanlines, a faint shadow mask, soft vignette; warm-up: the picture blooms out from the centre line
    const scan = sin(u.y.mul(Math.PI * 2 * 150)).mul(0.5).add(0.5).mul(0.16).add(0.84); // ~150 soft lines: finer ones alias at room distance
    const maskRGB = vec3(sin(u.x.mul(900)).mul(0.06).add(0.97), sin(u.x.mul(900).add(2.1)).mul(0.06).add(0.97), sin(u.x.mul(900).add(4.2)).mul(0.06).add(0.97));
    const vig = float(1).sub(smoothstep(0.25, 0.75, length(c.mul(vec2(1.1, 1.3)))).mul(0.45));
    const warm = smoothstep(0.0, 0.12, on.mul(0.5).sub(abs(u.y.sub(0.5)).mul(on.lessThan(0.3).select(1, 0))));
    return pic.mul(scan).mul(maskRGB).mul(vig).mul(2.4).mul(on.clamp(0, 1)).mul(warm.max(on.greaterThan(0.3).select(1, 0)));
  })();
  m.opacityNode = Fn(() => { // glass-edge mask (the picture stops at the rounded corners of the tube)
    const c = uv().sub(0.5), rr = vec2(TV.w, TV.h), q = abs(c.mul(rr)).sub(rr.mul(0.5).sub(TV.corner));
    return float(1).sub(smoothstep(-0.004, 0.0, length(max(q, vec2(0))).sub(TV.corner))).mul(on.clamp(0, 1).mul(4).clamp(0, 1));
  })();
  m.blending = THREE.AdditiveBlending; // light from the tube, over the glass the model already has
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
      const cream = smoothstep(0.5, 0.62, c.r).mul(smoothstep(0.45, 0.58, c.g)).mul(smoothstep(0.3, 0.42, c.b));
      const strip = smoothstep(0.232, 0.24, P.y).mul(smoothstep(0.305, 0.297, P.y)).mul(smoothstep(0.085, 0.1, P.z));
      m.material.emissiveNode = c.mul(vec3(1.0, 0.62, 0.3)).mul(cream).mul(strip).mul(memoryMask(positionWorld)).mul(dialK).mul(2.2);
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
    const scr = screenGeometry();
    let k = 0;
    for (const [name, o] of Object.entries(placed)) {
      if (o.userData.layout?.glb !== 'crt_tv.glb') continue;
      const on = uniform(0), chan = uniform(k % 3);
      const mesh = new THREE.Mesh(scr, crtMaterial(chan, on, this.atlas));
      mesh.renderOrder = 3; mesh.frustumCulled = false;
      // the LodObject's frame is the model space (a yaw0 pivot is not used for TVs)
      o.add(mesh);
      const c = new THREE.Vector3(TV.cx, TV.cy, TV.apex).applyMatrix4(o.matrixWorld);
      this.tvs.push({ name, o, mesh, on, chan, c, presence: 0, phase: k * 1.7, nextZap: 3 + k * 2.3 });
      k++;
    }
    // the glow of the brightest set on the room in front of it (one light, moved to whichever set matters most)
    this.tvLight = new THREE.PointLight(0x9fb8ff, 0, 2.6, 1.6); ctx.scene.add(this.tvLight);

    // ---- the customer: like the child, only a shadow in the robot's light (CHILD_LAYER): a woman in a short coat with
    // permed hair, three-quarter on to the eye, holding a radio out in both hands -- cast across the shelf behind her
    {
      const parts = [], add = (g, x, y, z, rx = 0, rz = 0, ry = 0) => { g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z); parts.push(g); };
      add(new THREE.SphereGeometry(0.095, 20, 14).scale(1, 1.12, 1), 0, 1.53, 0);                         // head
      add(new THREE.SphereGeometry(0.115, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1.08, 1, 1.05), 0, 1.565, -0.01); // permed hair
      add(new THREE.SphereGeometry(0.045, 12, 8), 0, 1.5, -0.12);                                          // bun
      add(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 10), 0, 1.4, 0);                                     // neck
      add(new THREE.CylinderGeometry(0.19, 0.17, 0.44, 18).scale(1, 1, 0.62), 0, 1.15, 0);                 // coat
      add(new THREE.CylinderGeometry(0.2, 0.25, 0.4, 18).scale(1, 1, 0.66), 0, 0.73, 0);                   // skirt
      for (const sx of [-1, 1]) {
        add(new THREE.CapsuleGeometry(0.05, 0.24, 4, 10), sx * 0.2, 1.17, 0.05, -0.5, sx * 0.1);            // upper arms, down and forward
        add(new THREE.CapsuleGeometry(0.042, 0.22, 4, 10), sx * 0.16, 1.03, 0.2, -1.45, 0);                 // forearms, out in front
        add(new THREE.CapsuleGeometry(0.055, 0.42, 4, 10), sx * 0.09, 0.3, 0);                               // legs
        add(new THREE.BoxGeometry(0.08, 0.05, 0.2), sx * 0.09, 0.025, 0.04);                                  // shoes
      }
      add(new THREE.BoxGeometry(0.36, 0.22, 0.15), 0, 1.08, 0.36);                                          // the radio she brought in
      add(new THREE.TorusGeometry(0.075, 0.009, 6, 16, Math.PI), 0, 1.19, 0.36);                            // its handle
      const mat = new THREE.MeshBasicNodeMaterial(); mat.shadowSide = THREE.FrontSide;
      const dbg = ctx.params.get('childdebug') !== null, dm = dbg ? new THREE.MeshStandardNodeMaterial({ color: 0xff00ff }) : null;
      const fig = this.customer = new THREE.Group();
      for (const g of parts) { const m = new THREE.Mesh(g, dm || mat); m.castShadow = true; m.layers.set(CHILD_LAYER); if (dbg) m.layers.enable(0); fig.add(m); }
      fig.position.set(-1.72, 0, -1.62); fig.rotation.y = 0.95; // in front of the tool wall (a calm surface for a shadow), turned three-quarters to the eye
      root.add(fig);
    }
    // ---- the child at the door: only a shadow (CHILD_LAYER: drawn into the eye's shadow map, never on screen).
    // Built for its silhouette, since a shadow is all of it anyone sees: a small girl standing straight to be measured,
    // chin up, two short pigtails, a dress, thin arms held a little away from her sides, so the gaps read in the shadow.
    {
      const H0 = 1.25, parts = [];
      const add = (g, x, y, z, rx = 0, rz = 0) => { g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); parts.push(g); };
      add(new THREE.SphereGeometry(0.088, 20, 14), 0, 1.155, 0);                                 // head
      add(new THREE.SphereGeometry(0.093, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 1.17, -0.008); // hair cap
      for (const sx of [-1, 1]) {                                                                // pigtails
        add(new THREE.SphereGeometry(0.03, 12, 8), sx * 0.1, 1.13, -0.03);
        add(new THREE.CapsuleGeometry(0.022, 0.07, 4, 8), sx * 0.125, 1.07, -0.035, 0, sx * 0.5);
      }
      add(new THREE.CylinderGeometry(0.03, 0.034, 0.08, 10), 0, 1.05, 0);                        // neck
      add(new THREE.CapsuleGeometry(0.075, 0.1, 6, 12), 0, 0.95, 0, 0, Math.PI / 2);             // shoulders
      add(new THREE.CylinderGeometry(0.1, 0.17, 0.42, 16), 0, 0.72, 0);                          // dress
      for (const sx of [-1, 1]) {
        add(new THREE.CapsuleGeometry(0.024, 0.36, 4, 8), sx * 0.155, 0.75, 0, 0, sx * 0.12);   // arms, a little away from her sides
        add(new THREE.SphereGeometry(0.03, 10, 8), sx * 0.185, 0.54, 0.0);                       // hands
        add(new THREE.CapsuleGeometry(0.03, 0.4, 4, 8), sx * 0.055, 0.29, 0);                    // legs
        add(new THREE.BoxGeometry(0.06, 0.04, 0.12), sx * 0.055, 0.02, 0.025);                    // shoes
      }
      // front faces into the shadow map (the default back faces of a figure touching the wall would sit behind it).
      // One mesh per part: a merged copy of these parts cast only part of itself in r186's shadow pass.
      const dbg = ctx.params.get('childdebug') !== null;
      const shadowMat = new THREE.MeshBasicNodeMaterial(); shadowMat.shadowSide = THREE.FrontSide;
      const dbgMat = dbg ? new THREE.MeshStandardNodeMaterial({ color: 0xff00ff }) : null;
      const child = new THREE.Group();
      for (const g of parts) { const m = new THREE.Mesh(g, dbgMat || shadowMat); m.castShadow = true; m.layers.set(CHILD_LAYER); if (dbg) m.layers.enable(0); child.add(m); }
      this.childH = H0;
      this.childRoot = new THREE.Group(); this.childRoot.add(child);
      this.childRoot.position.set(2.44, 0, -2.08); this.childRoot.rotation.y = -0.5; // a finger's width off the wall; the shadow falls to her right, on the marks
      root.add(this.childRoot);
      ctx.api.eye?.spot.shadow.camera.layers.enable(CHILD_LAYER);
    }
    this.childAge = 0;
    // ---- the pencil marks on the wall right of the door frame (tools/marks-texture.mjs: 0.58 x 1.0 m, bottom 0.8 m).
    // A multiply decal: graphite darkens whatever light falls on the plaster. Outside the beam (now) every mark is there,
    // faded; inside it (then) only the years already measured are there, fresh -- the story raises marksY year by year.
    {
      const tx = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/shop/marks.png`);
      tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
      const marksY = this.marksY = uniform(0);
      const mm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true });
      const t = texture(tx, uv()), ink = t.a;
      const past = memoryMask(positionWorld);
      const k = mix(ink.mul(0.62), ink.mul(step(positionWorld.y, marksY.add(0.02))).mul(1.05), past).clamp(0, 1);
      mm.colorNode = vec4(mix(vec3(1), t.rgb.div(0.75).min(1).mul(vec3(0.95, 0.94, 0.96)), k), 1);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 1.0), mm); pm.renderOrder = 2;
      pm.position.set(2.40 + 0.29, 0.8 + 0.5, -ctx.api.shop.ROOM.d / 2 + 0.003); // clear of the jamb's shadow in the eye's light
      root.add(pm); this.marks = pm;
    }

    const sys = this;
    ctx.api.past = {
      // the child's height in metres (0 = gone); the story grows it mark by mark
      setChild(h) { if (!sys.childRoot) return; const s = h > 0 ? h / sys.childH : 0.0001; sys.childRoot.scale.set(s * 0.85, s, s * 0.85); sys.childRoot.visible = h > 0; },
      get tvs() { return sys.tvs; },
      setMarks(h) { if (sys.marksY) sys.marksY.value = h; },
    };
    ctx.api.past.setChild(0);
  },

  update(dt, t, ctx) {
    if (!this.tvs) return;
    const m = ctx.memory;
    // TVs: a set inside the beam switches on (a short warm-up), zaps channels now and then; outside it dies away
    let best = null, bestV = 0;
    for (const tv of this.tvs) {
      tv.c.set(TV.cx, TV.cy, TV.apex).applyMatrix4(tv.o.matrixWorld);
      const want = memoryMaskCPU(tv.c, m);
      tv.presence += (want - tv.presence) * Math.min(1, dt * (want > tv.presence ? 1.8 : 3));
      tv.on.value = tv.presence > 0.02 ? Math.min(1, tv.presence * 1.15) : 0;
      tv.nextZap -= dt * (tv.presence > 0.5 ? 1 : 0);
      if (tv.nextZap <= 0) { tv.chan.value = (tv.chan.value + 1 + Math.floor(Math.random() * 2)) % (3 + (this.atlas?.n || 0)); tv.nextZap = 5 + Math.random() * 7; if (tv.presence > 0.6) ctx.api.audio?.play('tvzap', { pos: tv.c }); }
      const v = tv.presence; if (v > bestV) { bestV = v; best = tv; }
    }
    if (best && bestV > 0.05) {
      this.tvLight.position.copy(best.c).add(new THREE.Vector3(0, 0, 0.3).applyQuaternion(best.o.getWorldQuaternion(new THREE.Quaternion())));
      this.tvLight.intensity = 1.6 * bestV * (0.85 + 0.15 * Math.sin(t * 13 + best.phase) * Math.sin(t * 5.1));
    } else this.tvLight.intensity = 0;
    // pendulum: swings while the beam is on the clock (and for a while after); ~1 s period, 4 degrees
    const clock = ctx.api.shop.placed.wall_clock;
    if (clock) {
      const cw = clock.localToWorld(new THREE.Vector3(0, 0.36, 0.02));
      const want = memoryMaskCPU(cw, m);
      this.pend = (this.pend ?? 0) + (want - (this.pend ?? 0)) * Math.min(1, dt * (want > (this.pend ?? 0) ? 1.2 : 0.25));
      pastU.swing.value = 0.07 * this.pend * Math.sin(t * Math.PI * 2 / 1.0);
      const tick = Math.floor(t * 2); if (this.pend > 0.3 && tick !== this.lastTick) { this.lastTick = tick; ctx.api.audio?.play('tick', { pos: cw, gain: this.pend }); }
    }
  },
};
