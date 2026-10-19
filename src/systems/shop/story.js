import * as THREE from 'three/webgpu';
import { Film } from '../../ui/film.js';

// The shop story (v4), start to end. Owns the camera (except ?shot= and ?review) and the pacing.
//   title   : black, the title card; a click starts the sound and the arrival
//   arrive  : from the street, under the half-open shutter, round the robot to its face (it sits with its back to the
//             street, facing into the dim shop)
//   wait    : "hold"; the first hold fails (a flicker, a click), the second opens the eye
//   waking  : close on the lens while it opens
//   look    : over the robot's shoulder; the pointer turns its head, the beam brings the shop's past back where it
//             falls; the power drains while the eye is open
//   door    : the gaze settles on the wall beside the back door: a child's shadow, measured year by year, five to
//             eleven, the pencil mark drawn each time; then the shadow is gone and the marks stay
//   fade    : the power runs out: the beam stutters and dies, the shop goes dark
//   end     : from inside, looking out under the shutter: the street lamp across the road comes on; black; end card
const EYE0 = new THREE.Vector3(-0.61, 0.83, 0.94);          // the lens at rest (world), for framing before it moves
const MARKS = new THREE.Vector3(2.62, 1.27, -2.24);         // centre of the pencil marks right of the back door
const AGES = [1.10, 1.165, 1.225, 1.29, 1.345, 1.405, 1.47]; // the child's height at five .. eleven (= the marks)
// in from the street under the shutter, past the robot's right shoulder, round in front of it to its lens side
const ARRIVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.95, 1.62, 8.2), new THREE.Vector3(0.55, 1.52, 5.4), new THREE.Vector3(0.22, 1.24, 3.0),
  new THREE.Vector3(0.6, 1.15, 1.55), new THREE.Vector3(0.15, 1.08, 0.1), new THREE.Vector3(-0.84, 1.0, 0.36),
]);
const ARRIVE_LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.0, 1.75, 2.3), new THREE.Vector3(-0.25, 1.15, 0.4), new THREE.Vector3(-0.5, 0.92, 1.0),
  new THREE.Vector3(-0.58, 0.88, 1.0), new THREE.Vector3(-0.6, 0.85, 0.96), EYE0.clone(),
]);
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export default {
  name: 'story',
  async init(ctx) {
    if (ctx.isShot || ctx.api.shop?.review) { this.off = true; return; }
    this.film = new Film(document.getElementById('ui'), {
      title: '青 石 巷', sub: '请戴上耳机', start: '点击画面开始',
      credit: '屋里的每一件旧物都由 Tripo 生成。声音出处见 CREDITS.md',
      card: ['刻度停在十一岁。', '灯灭了，门还是那么高。'],
    });
    this.phase = ctx.params.get('phase') || 'title';
    this.t = 0; this.power = 1; this.lookTime = 0; this.dwell = 0;
    this.cam = { pos: ARRIVE.getPoint(0), look: ARRIVE_LOOK.getPoint(0), fov: 46 };
    this.curPos = this.cam.pos.clone(); this.curLook = this.cam.look.clone();
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._d = new THREE.Vector3();
    ctx.api.story = this;
    if (this.phase === 'title') this.film.title(true); else { this.film.title(false); this.set(this.phase, true); }
    ctx.postfx.params.presentK.value = 1; // the dusty present outside the beam
  },
  set(phase, cut = false) { this.phase = phase; this.t = 0; this.cut = cut; },

  update(dt, time, ctx) {
    if (this.off) return;
    this.t += dt;
    const m = ctx.memory, input = ctx.input, eye = ctx.api.eye, past = ctx.api.past, atmo = ctx.api.atmo, film = this.film;
    const eyePos = m.strength > 0.01 ? m.origin : EYE0;
    switch (this.phase) {
      case 'title': {
        m.forceOpen = false; film.fade(1);
        this.cam.pos.copy(ARRIVE.getPoint(0)); this.cam.look.copy(ARRIVE_LOOK.getPoint(0)); this.cut = true;
        if (input.pointer.held || input.wasPressed('Pointer') || input.wasPressed('Space') || input.wasPressed('Enter')) { film.title(false); this.set('arrive'); }
        break;
      }
      case 'arrive': {
        m.forceOpen = false;
        film.fade(Math.max(0, 1 - this.t / 4));
        const u = ease(clamp01(this.t / 30));
        ARRIVE.getPoint(u, this.cam.pos); ARRIVE_LOOK.getPoint(Math.min(1, u * 1.03), this.cam.look);
        this.cam.fov = 46 - 8 * u;
        if (this.t > 30 || input.wasPressed('Enter')) this.set('wait');
        break;
      }
      case 'wait': {
        m.forceOpen = undefined; film.fade(0);
        ARRIVE.getPoint(1, this.cam.pos); this.cam.look.copy(EYE0); this.cam.fov = 38 - Math.min(4, this.t * 0.2);
        if (this.t > 3) film.hint(eye?.failed && !input.hold ? '再按住' : eye?.failed ? '' : '按住');
        if (eye && eye.open > 0.08 && eye.attempts > 1) { film.hint(''); this.set('waking', true); }
        break;
      }
      case 'waking': {
        // three-quarter on the lens while it grinds open
        this._d.set(0.259, 0, -0.966); // the robot's facing; its left (the lens side) is world -x
        this.cam.pos.copy(EYE0).addScaledVector(this._d, 0.4).add(this._w.set(-0.15, 0.05, 0.04));
        this.cam.look.copy(eyePos); this.cam.fov = 27;
        if (eye && eye.open > 0.85) { this.set('look'); atmo?.flicker(1); } // the shop's dead tube stutters as the eye opens
        if (!input.hold && eye && eye.open < 0.02 && this.t > 1) this.set('wait');
        break;
      }
      case 'look': {
        // over the robot's left shoulder (the lens side): the head's edge in the near foreground, the beam leaving the lens
        this._d.copy(m.dir); this._d.y = 0; this._d.normalize();
        this._w.set(this._d.z, 0, -this._d.x); // the robot's left, across the gaze
        this.cam.pos.copy(eyePos).addScaledVector(this._d, -1.0).addScaledVector(this._w, 0.42); this.cam.pos.y = eyePos.y + 0.42;
        this.cam.look.copy(eyePos).addScaledVector(m.dir, 3.2).addScaledVector(this._w, -0.15);
        this.cam.fov = 50;
        this.lookTime += dt;
        if (this.t > 4 && !this.moved) film.hint('移动鼠标 · 慢慢看');
        if (!this.moved && (Math.abs(input.pointer.x) > 0.2 || Math.abs(input.pointer.y) > 0.2)) { this.moved = true; film.hint(''); }
        // the eye's power drains while it is held open; low on power it goes back to the door by itself
        if (eye && eye.open > 0.2) this.power = Math.max(0, this.power - dt / 140);
        if (this.power < 0.32) eye?.aim(MARKS);
        // a gaze that rests on the marks (after the shop has been seen for a while) starts the memory
        const toM = this._v.copy(MARKS).sub(m.origin).normalize();
        const on = m.strength > 0.5 && toM.dot(m.dir) > Math.cos(0.12);
        this.dwell = on ? this.dwell + dt : Math.max(0, this.dwell - dt * 2);
        if ((this.dwell > 1.4 && this.lookTime > 18) || (this.power < 0.32 && on) || input.wasPressed('KeyD')) { film.hint(''); this.set('door'); eye?.aim(MARKS); }
        m.power = this.power;
        break;
      }
      case 'door': {
        // the robot takes over: the eye holds, the camera goes to the wall; the child is measured, year by year
        m.forceOpen = true; eye?.aim(MARKS); m.spotK = 1 - 0.35 * ease(clamp01(this.t / 4)); // a softer light on the wall: the pencil must read
        const push = ease(clamp01(this.t / 5)), slow = clamp01((this.t - 5) / 20);
        this._v.set(-0.25, 1.28, 1.7).lerp(this._w.set(1.75, 1.33, -0.75), push).lerp(this._d.set(2.05, 1.3, -1.15), slow * 0.7);
        this.cam.pos.copy(this._v);
        this.cam.look.set(2.66, 1.25, -2.25); this.cam.fov = 44 - 6 * slow;
        const T0 = 4, STEP = 2.5, k = Math.floor((this.t - T0) / STEP);
        if (this.t > T0 && k < AGES.length) {
          if (k !== this.year) { this.year = k; past?.setMarks(AGES[k]); ctx.api.audio?.play('pencil'); }
          const grow = clamp01((this.t - T0 - k * STEP) / 0.6);
          past?.setChild(k === 0 ? AGES[0] * (0.35 + 0.65 * grow) : AGES[k - 1] + (AGES[k] - AGES[k - 1]) * ease(grow));
        }
        const END = T0 + AGES.length * STEP + 3.5;
        if (this.t > END) past?.setChild(0); // gone; the marks stay
        if (this.t > END + 3) { this.set('fade'); }
        m.power = this.power;
        break;
      }
      case 'fade': {
        // the last of the power: the beam stutters and dies, then everything inside goes out
        this.power = Math.max(0, this.power - dt / 3);
        m.power = Math.max(0.02, this.power);
        m.forceOpen = this.t < 2.2 ? true : this.t < 5 ? Math.random() > Math.min(0.92, (this.t - 2.2) * 0.33) : false;
        if (this.t > 4.5) atmo?.set('out');
        // pull back from the wall a little
        this.cam.look.set(2.2, 1.2, -2.25);
        if (this.t > 7.5) this.set('end');
        break;
      }
      case 'end': {
        m.forceOpen = false;
        // from inside, low, looking out under the shutter: the dead robot dark against the street; the lamp comes on
        // the robot dark on the right, the street through the opening; the lamp across the road throws its pool
        const u = ease(clamp01(this.t / 20));
        this.cam.pos.set(0.62 + 0.1 * u, 1.0 + 0.04 * u, -0.8 - 0.45 * u);
        this.cam.look.set(-0.15, 1.05, 6.0); this.cam.fov = 50 - 4 * u;
        if (this.t < 0.05) this.cut = true;
        film.fade(Math.min(1, Math.max(0, (this.t - 13) / 5)));
        if (this.t > 18.5) film.endCard();
        if (this.t > 45) film.replayHint();
        if (this.t > 22 && (input.wasPressed('Pointer') || input.wasPressed('Space'))) location.reload();
        break;
      }
    }
    film.power(this.power, this.phase === 'look');

    // the camera eases toward its target, a little handheld drift on top
    const k = this.phase === 'waking' ? 3 : this.phase === 'look' ? 2.2 : 1.4;
    if (this.cut) { this.curPos.copy(this.cam.pos); this.curLook.copy(this.cam.look); this.cut = false; }
    this.curPos.lerp(this.cam.pos, Math.min(1, dt * k));
    this.curLook.lerp(this.cam.look, Math.min(1, dt * k * 1.2));
    const cam = ctx.camera;
    cam.position.copy(this.curPos);
    cam.position.x += Math.sin(time * 0.37) * 0.006; cam.position.y += Math.sin(time * 0.53) * 0.004;
    cam.lookAt(this.curLook);
    if (Math.abs(cam.fov - this.cam.fov) > 0.01) { cam.fov += (this.cam.fov - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
  },
};
