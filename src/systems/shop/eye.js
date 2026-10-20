import * as THREE from 'three/webgpu';
import {
  Fn, Loop, float, vec3, vec4, uniform, color, positionWorld, cameraPosition, cameraViewMatrix, cameraNear, cameraFar, normalize, dot, cross, min, max,
  smoothstep, atan, mx_noise_float, time, viewportDepthTexture, perspectiveDepthToViewZ, uv, vec2, length, sin, cos, mix, fract, abs, step,
} from 'three/tsl';
import { EYE_LOCAL, EYE_DIR_LOCAL } from './rig.js';
import { syncMemory, mem } from '../../materials/memory.js';
import { SHADOW_LAYER } from './lod.js';

// The robot's eye (v4 shop): hold to open it; it projects a beam, and where the beam falls the shop's past shows.
// Owns the eye's state (closed -> opening -> open; the first deliberate attempt fails), the head (./rig.js: the pointer
// steers the gaze, the story can aim it), the light the lens throws (a spot light with the lens's own dirt and cracks
// as its projected mask, casting real shadows -- the child's shadow at the door is cast by it) and the visible shaft.
// Publishes ctx.memory (origin, dir, angle, range, strength) every frame; ../../materials/memory.js turns it into the
// per-pixel "past" mask used by the post grade and by everything that comes alive inside the beam.
export const BEAM_COLOR = new THREE.Color(1.0, 0.8, 0.58);

// projected mask of this lens: an 8-blade aperture (one bent blade), a faint double image from the cracked element,
// soft out-of-focus dirt. Low frequency, so it reads as a lens and not as a picture.
function makeGobo() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const specks = Array.from({ length: 60 }, () => [rnd() * 220 - 110, rnd() * 220 - 110, 0.6 + rnd() * 3.2, rnd()]);
  const wob = Array.from({ length: 48 }, () => 0.93 + rnd() * 0.1);
  const aperture = (g, r, open) => {
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2, blade = 0.95 + 0.05 * Math.cos(a * 8 + open * 0.7);
      const bent = Math.abs((((a / (Math.PI * 2)) * 8) % 8) - 5.5) < 0.55 ? 0.82 : 1;
      const rr = r * blade * bent * wob[i % 48]; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  };
  const draw = (open, mode) => {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.translate(128, 128);
    if (mode === 'level') { // the surveyor's level: a dimmer round field (enough to throw a shadow) and one bright line
      const fg = g.createRadialGradient(0, 0, 0, 0, 0, 118); fg.addColorStop(0, 'rgba(255,255,255,0.5)'); fg.addColorStop(0.75, 'rgba(255,255,255,0.42)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = fg; g.beginPath(); g.arc(0, 0, 118, 0, 7); g.fill();
      const glow = g.createLinearGradient(0, -9, 0, 9); glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(0.5, 'rgba(255,255,255,0.35)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow; g.fillRect(-118, -9, 236, 18); // a soft halo round it (a bare line read as a scan line)
      const lg = g.createLinearGradient(0, -1.6, 0, 1.6); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, '#fff'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(-118, -1.6, 236, 3.2); // and a fine core: a level
      tex.needsUpdate = true; return;
    }
    const r = 20 + 104 * open;
    g.save(); g.translate(8, -5); aperture(g, r * 0.96, open); g.clip(); g.fillStyle = 'rgba(160,160,160,0.16)'; g.fillRect(-128, -128, 256, 256); g.restore();
    g.save(); aperture(g, r, open); g.clip();
    const grd = g.createRadialGradient(-6, 5, 0, 0, 0, r);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.75, '#f4f4f4'); grd.addColorStop(0.92, '#bdbdbd'); grd.addColorStop(1, '#404040'); // even: a window onto the past, not a torch
    g.fillStyle = grd; g.fillRect(-128, -128, 256, 256);
    // dirt on the glass is far out of focus at the wall: only a faint, soft mottling (sharp specks and the cracks read
    // as stains and wires on whatever the eye looks at)
    g.filter = 'blur(6px)';
    for (const [x, y, s, k] of specks) { g.fillStyle = `rgba(0,0,0,${0.05 + k * 0.07})`; g.beginPath(); g.arc(x, y, s * 3, 0, 7); g.fill(); }
    g.filter = 'none';
    g.restore();
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

// the visible shaft: a cone mesh as a proxy; each fragment of its far side marches the camera ray through the exact cone,
// stopping at the scene's depth (an object inside the beam is not fogged over from behind), dense near the lens and
// along the rim, streaked by the aperture blades, with slow dust
function beamMaterial(u, noDepth = false) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
  m.colorNode = Fn(() => {
    const rd = normalize(positionWorld.sub(cameraPosition));
    const CO = cameraPosition.sub(u.apex);
    const c2 = float(1).div(u.tanA.mul(u.tanA).add(1));
    const rdD = dot(rd, u.axis), coD = dot(CO, u.axis);
    const qa = rdD.mul(rdD).sub(c2), qb = rdD.mul(coD).sub(c2.mul(dot(rd, CO))).mul(2), qc = coD.mul(coD).sub(c2.mul(dot(CO, CO)));
    const disc = qb.mul(qb).sub(qa.mul(qc).mul(4)), sq = disc.max(0).sqrt();
    const ta = qb.negate().sub(sq).div(qa.mul(2)), tb = qb.negate().add(sq).div(qa.mul(2));
    const tn = min(ta, tb), tf = max(ta, tb), FAR = float(16);
    const along0 = qa.greaterThan(0);
    const tEnter = along0.select(rdD.greaterThan(0).select(disc.lessThan(0).select(float(0), tf), float(0)), tn);
    const tExit = along0.select(rdD.greaterThan(0).select(FAR, disc.lessThan(0).select(FAR, tn)), disc.lessThan(0).select(float(-1), tf));
    // the scene's depth along this ray (opaque surfaces end the march)
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
    const rdv = cameraViewMatrix.mul(vec4(rd, 0)).z;
    const tScene = sceneZ.div(rdv.min(-1e-4));
    const t0 = tEnter.max(0.03), t1 = min(tExit, noDepth ? FAR : min(tScene, FAR));
    const span = t1.sub(t0).max(0), dt = span.div(14);
    const bu = normalize(cross(u.axis, vec3(0, 1, 0.001))), bv = cross(u.axis, bu);
    const acc = float(0).toVar();
    Loop(14, ({ i }) => {
      const p = cameraPosition.add(rd.mul(t0.add(dt.mul(float(i).add(0.5)))));
      const q = p.sub(u.apex), along = dot(q, u.axis), rad = q.sub(u.axis.mul(along)).length(), edgeR = along.max(0.001).mul(u.tanA);
      // light in dusty air, not a solid cone: a soft edge (no hard rim), uneven dust, fading with distance
      const inside = float(1).sub(smoothstep(edgeR.mul(0.45), edgeR, rad)).mul(smoothstep(0.0, u.near, along)); // near: how far from the lens the shaft fades in (act two, seen from behind: no fog ball round the head)
      const fall = float(1).div(along.mul(along).mul(u.reach.mul(0.7)).add(0.3)); // reach < 1: the shaft carries further (act two: across the road)
      const camNear = smoothstep(0.12, 0.5, p.sub(cameraPosition).length());
      const ang = atan(dot(q, bv), dot(q, bu));
      const streak = mx_noise_float(vec3(ang.mul(2.6), along.mul(0.15), 1.7)).mul(0.6).add(0.7);
      const dust = mx_noise_float(p.mul(2.3).add(vec3(0.02, -0.05, 0.015).mul(time))).mul(0.5).add(0.6).mul(mx_noise_float(p.mul(7.0).add(vec3(0.0, -0.03, 0.0).mul(time))).mul(0.3).add(0.8));
      acc.addAssign(inside.mul(fall).mul(camNear).mul(streak).mul(dust));
    });
    return color(BEAM_COLOR).mul(acc.mul(dt)).mul(u.k).add(u.dbg); // dbg: a flat tint over the proxy (?beamdbg)
  })();
  return m;
}

// The lens, made properly (measured down the generated lens's axis with tools/lens-probe.mjs: glass to ~38 mm radius,
// barrel rim 40 mm proud of it): a glowing core behind an eight-blade iris that opens with the eye, under a clear
// glass element. The generated texture's own orange spot is only a dim ember underneath. All three are discs in the
// lens plane, carried by the head (they follow the vertex-shader neck through rig.mat).
function lensParts(u) {
  const grp = new THREE.Group();
  // core: hot white centre, amber, dark rim; a faint inner reflection ring of the element in front of it
  const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const r = uv().sub(0.5).length().mul(2);
  const core = mix(vec3(1.0, 0.97, 0.9), color(BEAM_COLOR), smoothstep(0.0, 0.45, r)).mul(float(1).sub(smoothstep(0.55, 1.0, r)).pow(1.5));
  const ring = smoothstep(0.03, 0.0, abs(r.sub(0.72))).mul(0.25);
  cm.colorNode = core.add(color(BEAM_COLOR).mul(ring)).mul(u.coreK);
  cm.opacityNode = float(1).sub(smoothstep(0.86, 1.0, r));
  const coreM = new THREE.Mesh(new THREE.CircleGeometry(0.019, 40), cm); coreM.position.z = 0.0138; grp.add(coreM); // just in front of the generated core (it bulges to 12 mm)
  // iris: eight curved blades; aperture radius u.aperture (0..1 of the blade disc); each blade its own shade of blued
  // steel, a dark seam where one leaf passes under the next and a bright lip along its leading edge
  const im = new THREE.MeshStandardNodeMaterial({ roughness: 0.48, metalness: 0.55 });
  const p = uv().sub(0.5).mul(2), rr = length(p), th = atan(p.y, p.x);
  const bt = th.div(Math.PI * 2).mul(8).add(rr.mul(1.6)), blade = fract(bt), bi = bt.floor();
  const shade = fract(sin(bi.mul(12.9898)).mul(43758.5)).mul(0.035).add(0.03);
  const seam = smoothstep(0.0, 0.05, blade).mul(smoothstep(1.0, 0.94, blade));
  const lip = smoothstep(0.86, 0.97, blade).mul(0.06);
  const poly = cos(fract(th.div(Math.PI * 2).mul(8).add(u.twist)).sub(0.5).mul(Math.PI * 2 / 8)); // 8-sided aperture
  const hole = rr.mul(poly).lessThan(u.aperture);
  im.colorNode = vec3(shade.mul(0.9), shade, shade.mul(1.12)).mul(seam.mul(0.85).add(0.15)).add(lip)
    .add(color(BEAM_COLOR).mul(smoothstep(u.aperture.add(0.1), u.aperture, rr.mul(poly)).mul(u.coreK).mul(0.1)));
  im.maskNode = hole.not().and(rr.lessThan(1.0));
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.038, 64), im); iris.position.z = 0.0168; grp.add(iris);
  // glass: only its reflection (a clear element in front of the iris)
  const gm = new THREE.MeshStandardNodeMaterial({ roughness: 0.04, metalness: 0, transparent: true, depthWrite: false });
  gm.colorNode = vec3(0); gm.opacityNode = float(0.22);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.037, 48), gm); glass.position.z = 0.021; glass.renderOrder = 4; grp.add(glass);
  grp.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  return grp;
}
// the lens frame in model space: origin at the lens centre, +z along its axis
const LENS_FRAME = (() => {
  const z = EYE_DIR_LOCAL.clone(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(EYE_LOCAL);
})();

export default {
  name: 'eye',
  async init(ctx) {
    const shop = ctx.api.shop, robot = shop?.placed.robot, rig = shop?.rig;
    if (!robot || !rig) throw new Error('eye: no robot in the shop');
    this.robot = robot; this.rig = rig;
    this.open = 0; this.target = 0; this.attempts = 0; this.holdT = 0; this.failT = -1; this.failed = false;
    this.look = new THREE.Vector2(); this.lookCur = new THREE.Vector2(); this.lift = 0;
    this._p = new THREE.Vector3(); this._d = new THREE.Vector3(); this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
    // the lens throws a projector-like light: soft-edged, its dirt and cracks projected, shadows cast (the shadow
    // proxies of the raw models included: SHADOW_LAYER). Constant presence: intensity 0 when shut (adding or removing a
    // light at runtime recompiles every lit material).
    this.gobo = makeGobo(); this.gobo.draw(0.2); this.goboOpen = 0.2;
    const spot = this.spot = new THREE.SpotLight(BEAM_COLOR.clone(), 0, 10, 0.3, 0.45, 1.5);
    spot.map = this.gobo.tex;
    spot.castShadow = ctx.params.get('noeyeshadow') === null;
    spot.shadow.mapSize.setScalar(ctx.quality === 'low' ? 512 : 1024);
    // perspective depth: with the near plane at 4 cm a bias of -0.0008 was ~37 cm at 4 m (a child standing 20 cm from the
    // wall cast nothing); near 0.25 m (nothing that close to the lens should shadow anyway) + a small bias = ~1 cm
    spot.shadow.bias = -0.00012; spot.shadow.normalBias = 0.006; spot.shadow.camera.near = 0.25; spot.shadow.camera.far = 10; spot.shadow.camera.layers.enable(SHADOW_LAYER);
    ctx.scene.add(spot, spot.target);
    // the shaft
    // (closed at the far end: seen from behind the lens, along the beam, a camera ray leaves an open cone through its
    // mouth without meeting a back face -- the whole shaft went undrawn from act two's camera; 14 m reaches past the
    // far side's photograph)
    const L = 14, u = this.beamU = { apex: uniform(new THREE.Vector3()), axis: uniform(new THREE.Vector3(0, 0, -1)), tanA: uniform(0.3), k: uniform(0), reach: uniform(1), near: uniform(0.12), dbg: uniform(ctx.params.get('beamdbg') !== null ? 0.25 : 0) };
    const cone = this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.002, L * Math.tan(0.55), L, 40, 1, false).translate(0, -L / 2, 0), beamMaterial(u, ctx.params.get('beamnodepth') !== null));
    cone.frustumCulled = false; cone.renderOrder = 8; ctx.scene.add(cone);
    // the lens itself glows when the eye opens: a small soft halo on it (the shaft starts at a point of light)
    { const hm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const r = uv().sub(0.5).length().mul(2);
      this.haloK = uniform(0);
      hm.colorNode = color(BEAM_COLOR).mul(float(1).sub(smoothstep(0, 1, r)).pow(3).mul(0.4).add(float(1).sub(smoothstep(0, 0.16, r)).mul(1.6))).mul(this.haloK);
      this.halo = new THREE.Sprite(hm); this.halo.scale.setScalar(0.07); this.halo.renderOrder = 9; ctx.scene.add(this.halo);
      // a wide soft glow round the lens (memory.glowK): seen from behind, it shows round the head's outline -- the light
      // comes from its face (act two looks over its back; the shaft itself is lost against the lit far side)
      const gm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.glowK = uniform(0);
      gm.colorNode = color(BEAM_COLOR).mul(float(1).sub(smoothstep(0, 1, r)).pow(2.2)).mul(this.glowK);
      this.glow = new THREE.Sprite(gm); this.glow.scale.setScalar(0.55); this.glow.renderOrder = 9; ctx.scene.add(this.glow); }
    // the lens parts, carried by the head
    this.lensU = { coreK: uniform(0), aperture: uniform(0.0), twist: uniform(0) };
    this.lens = lensParts(this.lensU); this.lens.matrixAutoUpdate = false; this.lens.layers.set(7); this.lens.traverse((m) => m.layers.set(7)); // ROBOT_LAYER: not in the eye's own shadow map
    ctx.scene.add(this.lens); this._lm = new THREE.Matrix4();
    const sys = this;
    ctx.api.eye = {
      get open() { return sys.open; }, get attempts() { return sys.attempts; }, get failed() { return sys.failed; },
      spot, rig, robot,
      // the story aims the gaze at a world point (null = back to the pointer)
      aim(p) { sys.aimAt = p ? (sys.aimAt ?? new THREE.Vector3()).copy(p) : null; },
    };
    ctx.memory.range = 22; // v5: the far side of the street is ~10 m away (memoryMask is full to 0.55 x range)
    mem.soft.value = 0.09; // the past fades in at the beam's edge (the street version keeps a sharper edge)
  },

  update(dt, t, ctx) {
    const m = ctx.memory, input = ctx.input;
    // ---- eye state: a deliberate hold counts as an attempt; the first one fails (a flicker, then shut again)
    const forced = m.forceOpen; // the story or a shot can force it
    const holding = forced ?? input.hold;
    const prev = this.holdT;
    this.holdT = holding ? this.holdT + dt : 0;
    if (prev < 0.25 && this.holdT >= 0.25 && forced === undefined) { this.attempts++; if (this.attempts > 1) { ctx.api.audio?.play('servo'); ctx.api.audio?.play('whine'); } }
    if (forced !== undefined) this.target = forced ? 1 : 0;
    else if (this.attempts <= 1 && holding && this.holdT >= 0.25) {
      this.target = this.holdT < 1.2 ? 0.22 : 0;
      if (this.holdT > 1.2 && this.failT < 0) { this.failT = t; ctx.api.audio?.play('click'); }
    } else this.target = holding && this.attempts > 1 ? 1 : 0;
    this.failed = this.failT > 0;
    // opening is slow and stutters (a servo slipping), shutting is quicker
    const speed = this.target > this.open ? 0.38 : 1.1, slip = this.target > this.open && Math.sin(t * 9.3) > 0.82 ? 0.12 : 1;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), speed * slip * dt);
    if (ctx.isShot && m.shotOpen !== undefined) this.open = m.shotOpen;
    const pw = m.power ?? 1;
    const flick = this.open > 0 && this.open < 0.3 && this.target < 0.5 ? 0.6 + 0.4 * Math.sin(t * 37) * Math.sin(t * 13) : 1; // the failing attempt sputters
    const o = Math.min(m.openCap ?? 1, this.open * flick * Math.min(1, 0.35 + pw * 2.5));
    this.o = o;

    // ---- the head: lifts as the eye opens, the gaze follows the pointer (or the story's aim point)
    if (this.aimAt) { // yaw/pitch that put the eye's axis on the point
      this.rig.eye(this.robot, this._p, this._d); // current
      const want = this._v.copy(this.aimAt).sub(this._p).normalize();
      // error in the robot's frame -> look offsets
      const inv = this._q.copy(this.robot.getWorldQuaternion(this._q)).invert();
      const w = want.clone().applyQuaternion(inv), c = this._d.clone().applyQuaternion(inv);
      const dyaw = Math.atan2(w.x, w.z) - Math.atan2(c.x, c.z), dpit = Math.asin(THREE.MathUtils.clamp(w.y, -1, 1)) - Math.asin(THREE.MathUtils.clamp(c.y, -1, 1));
      // (directed looks may turn further than the pointer can: up to ~66 deg, e.g. to the radio on its bench)
      this.look.x = THREE.MathUtils.clamp(this.lookCur.x + dyaw / 0.85, -1.35, 1.35); this.look.y = THREE.MathUtils.clamp(this.lookCur.y + dpit / 0.32, -1, 1);
    } else if (m.lookOverride) this.look.set(m.lookOverride.x, m.lookOverride.y);
    else this.look.set(-input.pointer.x, input.pointer.y); // screen right = the robot's right (the camera rides behind it)
    const k = Math.min(1, dt * (m.headK ?? (0.5 + o * 1.6))), reach = m.holdGaze ? 1 : Math.min(1, 0.2 + o); // holdGaze: it keeps looking even with the eye shut
    this.lookCur.x += (this.look.x * reach - this.lookCur.x) * k;
    this.lookCur.y += (this.look.y * reach - this.lookCur.y) * k;
    this.lift += ((m.headLift ?? Math.min(1, this.open * 1.4)) - this.lift) * Math.min(1, dt * 1.5);
    const rig = this.rig, jitter = o > 0.05 ? Math.sin(t * 29) * 0.004 * o : 0;
    // yaw +-0.85 rad (49 deg) about the neck; pitch: asleep the head hangs as generated (bowed over its work), awake
    // it lifts ~13 deg and can look up/down another ~18 deg
    rig.yaw = this.lookCur.x * 0.85 + jitter;
    rig.pitch = this.lift * 0.23 + this.lookCur.y * 0.32 - (1 - this.lift) * 0.04 * (0.5 + 0.5 * Math.sin(t * 0.7)) - 0.14 * Math.sin(Math.PI * Math.min(1, Math.max(0, m.nod ?? 0))); // nod: 0 -> 1 = one small nod
    this.tilt = (this.tilt ?? 0) + ((m.tilt ?? 0) - (this.tilt ?? 0)) * Math.min(1, dt * 1.6); // a listening tilt
    rig.roll = this.lift * 0.05 + this.tilt;
    if (!(ctx.isShot && ctx.params.get('head'))) rig.update();

    // ---- the lens parts follow the head; the iris opens with the eye (a little ahead of the light: it lets it out)
    this.lens.matrix.multiplyMatrices(this.robot.matrixWorld, this._lm.multiplyMatrices(rig.mat.value, LENS_FRAME)); this.lens.matrixWorldNeedsUpdate = true;
    const lu = this.lensU; lu.aperture.value = 0.06 + 0.4 * Math.min(1, o * 1.15); lu.twist.value = o * 0.18; lu.coreK.value = ((m.eyeRest ?? 0.35) * (1 - o) + 3.2 * o * Math.min(1, pw * 2)) * (m.coreK ?? 1);
    // ---- the light and the shaft follow the lens
    rig.eye(this.robot, this._p, this._d);
    const origin = this._v.copy(this._p).addScaledVector(this._d, 0.045); // just in front of the lens barrel
    const angle = 0.07 + 0.15 * o; // v5: a searching beam -- across the road its circle holds a shop and a half, not the street
    m.origin.copy(origin); m.dir.copy(this._d); m.angle = Math.min(1.2, angle * 1.12 * (m.memWide ?? 1)); m.strength = Math.min(1, o * 1.3) * Math.min(1, pw * 3);
    syncMemory(m); mem.soft.value = (1 - Math.cos(m.angle)) * 0.35; mem.coreCos.value = Math.cos(angle * 1.12); // the soft edge scales with the cone (a fixed width would swallow a narrow one)
    const sp = this.spot;
    sp.position.copy(origin); sp.target.position.copy(origin).addScaledVector(this._d, 4); sp.target.updateMatrixWorld();
    sp.angle = angle; sp.penumbra = 0.7;
    sp.intensity = (+ctx.params.get('eyecd') || 80) * o * o * Math.min(1, pw * 2) * (m.spotK ?? 1);
    const gm = m.goboMode || 'lens';
    if (Math.abs(o - this.goboOpen) > 0.03 || gm !== this.goboMode) { this.gobo.draw(o, gm); this.goboOpen = o; this.goboMode = gm; }
    const u = this.beamU;
    u.apex.value.copy(origin); u.axis.value.copy(this._d); u.reach.value = +ctx.params.get('beamreach') || (m.beamReach ?? 1); u.near.value = m.beamNear ?? 0.12; u.tanA.value = Math.tan(angle) * (m.shaftW ?? 1); /* shaftW: the visible shaft narrower than the circle it brings back (act two looks along it: a full-width cone read as fog) */ u.k.value = 0.55 * o * o * Math.min(1, pw * 2) * (m.beamK ?? 1) * (+ctx.params.get('beamk') || 1);
    this.cone.position.copy(origin); this.cone.quaternion.setFromUnitVectors(_DOWN, this._d);
    this.halo.position.copy(this._p).addScaledVector(this._d, 0.03);
    this.haloK.value = (0.6 * o + 0.06) * Math.min(1, m.coreK ?? 1);
    this.glow.position.copy(this._p).addScaledVector(this._d, 0.09); this.glowK.value = 0.5 * o * Math.min(1, pw * 2) * (m.glowK ?? 0);
    const shop = ctx.api.shop; if (shop?.eyeGlow) shop.eyeGlow.value = 0.25 + 0.5 * o; // the texture's own orange spot: an ember under the new core
  },
};
const _DOWN = new THREE.Vector3(0, -1, 0);
