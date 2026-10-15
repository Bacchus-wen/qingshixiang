import * as THREE from 'three/webgpu';
import { Film } from '../ui/film.js';

// The experience, start to end. Owns the camera (except in ?shot= mode) and the pacing.
//   arrive  : slow dolly down the lane, eye forced shut, ends in the dark in front of the robot
//   wait    : a faint "hold" hint on the film edge
//   waking  : first hold fails; next hold -> camera cuts to the eye while it grinds open
//   look    : over-the-shoulder; the pointer steers the head and the beam; power drains while the eye is open
//   fade    : power gone, beam stutters and dies, shutters fall back late
//   end     : camera cranes up and away, black, end card
const ROBOT = new THREE.Vector3(-4.58, 0.14, -13.5);
const ARRIVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.4, 1.62, 13), new THREE.Vector3(0.9, 1.6, 4), new THREE.Vector3(0.2, 1.55, -4),
  new THREE.Vector3(-0.6, 1.45, -9), new THREE.Vector3(-1.4, 1.32, -11.6),
]);
const ease = (x) => x * x * (3 - 2 * x);
// where the beam lands: ground, or one of the two facades (x = +-5.05), within 40 m
function beamHit(o, d, out) {
  let t = 40;
  if (d.y < -1e-3) t = Math.min(t, -o.y / d.y);
  if (d.x > 1e-3) t = Math.min(t, (5.05 - o.x) / d.x);
  if (d.x < -1e-3) t = Math.min(t, (-5.05 - o.x) / d.x);
  return out.copy(o).addScaledVector(d, Math.max(0.5, t));
}

export default {
  name: 'director',
  async init(ctx) {
    this.film = new Film(document.getElementById('ui'));
    this.phase = ctx.params.get('phase') || (ctx.params.get('speed') ? 'arrive' : 'title');
    this.t = 0; this.power = parseFloat(ctx.params.get('power') || '1'); this.endT = 0;
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this.curPos = ARRIVE.getPoint(0); this.curLook = new THREE.Vector3(0, 1.4, -20);
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._hit = new THREE.Vector3(); this._f = new THREE.Vector3();
    this.focus = 10; this.bokeh = 0;
    ctx.api.director = this;
    if (this.phase === 'title') this.film.title(true);
    else this.film.phase(this.phase);
  },

  // cut = jump the camera instead of easing (a hard cut to the eye reads stronger than a slide)
  set(phase, cut = false) { this.phase = phase; this.t = 0; this.cut = cut; this.film.phase(phase); },

  update(dt, time, ctx) {
    if (ctx.isShot) return;
    this.t += dt;
    const m = ctx.memory, robot = ctx.api.robot, input = ctx.input;
    const eyePos = m.origin.lengthSq() > 0 ? m.origin : this._w.set(-4.4, 0.95, -13.5);

    switch (this.phase) {
      case 'title': {
        // black, rain only (audio starts on this first gesture)
        m.forceOpen = false; this.power = 1; m.power = 1; this.film.endCardOff?.();
        ARRIVE.getPoint(0, this.cam.pos); this.cam.look.set(0, 1.4, -24);
        this.film.fade(1);
        if (input.pointer.held || input.wasPressed('Space') || input.wasPressed('Enter')) { this.film.title(false); this.set('arrive'); }
        break;
      }
      case 'arrive': {
        this.film.fade(Math.max(0, 1 - this.t / 6));
        m.forceOpen = false;
        const u = ease(Math.min(1, this.t / 40));
        ARRIVE.getPoint(u, this.cam.pos);
        this.cam.look.lerpVectors(this._v.set(0, 1.4, -24), this._w.set(ROBOT.x, 0.75, ROBOT.z), ease(Math.min(1, Math.max(0, (u - 0.55) / 0.45))));
        this.cam.fov = 44;
        if (this.t > 40 || input.wasPressed('Enter')) this.set('wait');
        break;
      }
      case 'wait': {
        m.forceOpen = undefined;
        ARRIVE.getPoint(1, this.cam.pos);
        this.cam.look.set(ROBOT.x, 0.75, ROBOT.z);
        this.cam.fov = 40 - Math.min(4, this.t * 0.15);
        if (this.t > 4) this.film.hint(robot?.failed && !input.hold ? '再按住' : robot?.failed ? '' : '按住');
        if (robot && robot.open > 0.08 && robot.attempts > 1) { this.film.hint(''); this.set('waking', true); }
        break;
      }
      case 'waking': {
        // close on the eye while it opens: camera slightly in front and to the side of the lens
        // three-quarter front view of the lens: in front of the eye, a little to the side and above
        this._v.copy(m.dir).multiplyScalar(0.5).add(eyePos);
        this.cam.pos.copy(this._v).add(this._w.set(0, 0.06, 0.22));
        this.cam.look.copy(eyePos);
        this.cam.fov = 28;
        if (robot && robot.open > 0.85) this.set('look');
        if (!input.hold && robot && robot.open < 0.02 && this.t > 1) this.set('wait');
        break;
      }
      case 'look': {
        // over the shoulder: behind and above the head, looking along the beam
        this.cam.pos.set(ROBOT.x - 0.55, 1.45, ROBOT.z + 0.45).addScaledVector(m.dir, -0.15);
        this.cam.look.copy(eyePos).addScaledVector(m.dir, 8);
        this.cam.fov = 50;
        if (robot && robot.open > 0.2) this.power = Math.max(0, this.power - dt / 150);
        m.power = this.power;
        if (this.power <= 0.0) this.set('fade');
        break;
      }
      case 'fade': {
        // the eye tries to stay open, stutters, and dies
        m.forceOpen = this.t < 5 ? Math.random() > Math.min(0.9, this.t * 0.18) : false;
        if (this.t > 6.5) this.set('end');
        break;
      }
      case 'end': {
        m.forceOpen = false;
        const u = ease(Math.min(1, this.t / 18));
        this.cam.pos.set(ROBOT.x + 2.2 + u * 3, 1.4 + u * 7, ROBOT.z + 3 + u * 6);
        this.cam.look.set(ROBOT.x, 0.6 + u * 0.4, ROBOT.z - u * 2);
        this.cam.fov = 44;
        this.film.fade(Math.min(1, Math.max(0, (this.t - 12) / 6)));
        if (this.t > 19) this.film.endCard();
        break;
      }
    }
    this.film.power(this.power, this.phase === 'look' || this.phase === 'fade');

    // focus: on the eye while it opens, then pulled slowly to whatever the beam touches first
    let focusT = 12, bokehT = 0;
    if (this.phase === 'waking') { focusT = this.curPos.distanceTo(eyePos); bokehT = 2.2; }
    else if (this.phase === 'look' || this.phase === 'fade') {
      beamHit(m.origin, m.dir, this._hit);
      ctx.camera.getWorldDirection(this._f);
      focusT = Math.max(0.5, this._hit.sub(ctx.camera.position).dot(this._f)); bokehT = 1.6;
    } else if (this.phase === 'wait') { focusT = this.curPos.distanceTo(this._w.set(ROBOT.x, 0.75, ROBOT.z)); bokehT = 1.0; }
    this.focus += (focusT - this.focus) * Math.min(1, dt * 0.9);
    this.bokeh += (bokehT - this.bokeh) * Math.min(1, dt * 0.8);
    const pp = ctx.postfx.params;
    pp.focus.value = this.focus; pp.bokeh.value = this.bokeh; pp.focalRange.value = Math.max(1.5, this.focus * 0.35);

    // smooth camera with a little handheld drift
    const k = this.phase === 'waking' ? 3 : 1.6;
    if (this.cut) { this.curPos.copy(this.cam.pos); this.curLook.copy(this.cam.look); this.cut = false; }
    this.curPos.lerp(this.cam.pos, Math.min(1, dt * k));
    this.curLook.lerp(this.cam.look, Math.min(1, dt * k * 1.2));
    const cam = ctx.camera;
    cam.position.copy(this.curPos);
    cam.position.x += Math.sin(time * 0.37) * 0.012; cam.position.y += Math.sin(time * 0.53) * 0.008;
    cam.lookAt(this.curLook);
    if (Math.abs(cam.fov - this.cam.fov) > 0.01) { cam.fov += (this.cam.fov - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
  },
};
