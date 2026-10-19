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
// in from the street under the shutter; a moment over the bench in the lamp's light (the open radio, the tools), then
// behind the robot and round its right side to its face (the lens side)
const ARRIVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.95, 1.62, 8.2), new THREE.Vector3(0.55, 1.52, 5.4), new THREE.Vector3(0.1, 1.3, 3.0),
  new THREE.Vector3(-0.55, 1.5, 2.2), new THREE.Vector3(-0.62, 1.48, 2.15), new THREE.Vector3(0.1, 1.25, 2.0),
  new THREE.Vector3(0.75, 1.12, 0.95), new THREE.Vector3(0.2, 1.06, 0.12), new THREE.Vector3(-0.84, 1.0, 0.36),
]);
const ARRIVE_LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.0, 1.75, 2.3), new THREE.Vector3(-0.8, 1.0, 0.6), new THREE.Vector3(-1.55, 0.9, 0.7),
  new THREE.Vector3(-1.55, 0.9, 0.7), new THREE.Vector3(-1.05, 0.88, 0.9), new THREE.Vector3(-0.55, 0.88, 1.1),
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
      credit: '屋里的每一件旧物都由 Tripo 生成 · 声音出处见 CREDITS.md',
      card: ['刻度停在十一岁。'],
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
        const u = ease(clamp01(this.t / 36));
        ARRIVE.getPoint(u, this.cam.pos); ARRIVE_LOOK.getPoint(Math.min(1, u * 1.02), this.cam.look);
        this.cam.fov = 46 - 8 * u;
        if (this.t > 36 || input.wasPressed('Enter')) this.set('wait');
        break;
      }
      case 'wait': {
        m.forceOpen = undefined; film.fade(0);
        ARRIVE.getPoint(1, this.cam.pos); this.cam.look.copy(EYE0); this.cam.fov = 38 - Math.min(4, this.t * 0.2);
        if (this.t > 3) film.hint(eye?.failed && !input.hold ? '再按住一次' : eye?.failed ? '' : '按住');
        if (eye?.failed && !this.shook) { this.shook = true; this.shake = 0.45; } // the first try: a clunk, the head jolts
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
        past?.setSitting(true); // the girl on the stool by the door, in the past
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
        // the robot takes over: its eye narrows to a level -- a bright line across the wall -- and measures her, year
        // by year, as it did then: the line rises to her height, the pencil draws the mark there, she grows
        m.forceOpen = true; m.spotK = 1 - 0.2 * ease(clamp01(this.t / 4));
        // first wide, from beside the robot: its lens in the near left, the line of light reaching the wall; then in close
        const wide = 1 - ease(clamp01((this.t - 5.5) / 4)), slow = clamp01((this.t - 9.5) / 22);
        this._v.set(1.75, 1.33, -0.75).lerp(this._d.set(2.05, 1.3, -1.15), slow * 0.7).lerp(this._w.set(0.3, 1.36, 1.5), wide);
        this.cam.pos.copy(this._v);
        this.cam.look.set(2.66, 1.25, -2.25).lerp(this._w.set(1.5, 1.05, -1.25), wide); this.cam.fov = 44 - 6 * slow + 6 * wide;
        const T0 = 5.5, STEP = 3.4, k = Math.floor((this.t - T0) / STEP), n = AGES.length;
        m.goboMode = this.t > 3 && k < n + 1 ? 'level' : undefined;
        const yr = Math.min(n - 1, Math.max(0, k)), within = clamp01((this.t - T0 - yr * STEP) / 0.9);
        // the level line: settles on this year's height (it rises from last year's)
        const lineY = k < 0 ? AGES[0] : AGES[Math.max(0, yr - 1)] + (AGES[yr] - AGES[Math.max(0, yr - 1)]) * ease(within);
        eye?.aim(this._d.set(MARKS.x, lineY, MARKS.z));
        past?.setSitting(this.t < T0); // she gets up to be measured
        if (this.t > T0 && k < n) {
          if (k !== this.year) { this.year = k; this.drawn = false; }
          // she grows with the line; when it has settled on her crown a hand comes in and draws the mark along it
          past?.setChild(k === 0 ? AGES[0] * (0.35 + 0.65 * ease(within)) : lineY);
          const ty = this.t - T0 - k * STEP, prev = k > 0 ? AGES[k - 1] : 0;
          const handIn = ease(clamp01((ty - 1.0) / 0.4)) * (1 - ease(clamp01((ty - 2.6) / 0.4))), stroke = ease(clamp01((ty - 1.45) / 0.9));
          const x = 2.41 + stroke * (0.3 + (k === n - 1 ? 0.03 : 0));
          past?.setHand(handIn, AGES[k], x);
          past?.setMarks(stroke > 0 ? AGES[k] : prev, prev, stroke > 0 ? x : 9);
          if (!this.drawn && stroke > 0) { this.drawn = true; ctx.api.audio?.play('pencil', { pos: this._w.set(2.6, AGES[k], -2.2) }); }
        } else past?.setHand(0, 1, 2.4);
        // after eleven: nothing more is measured. Her shadow goes, the line goes, the wall stays empty for a while
        const END = T0 + n * STEP + 1.5;
        if (this.t > END) { past?.setChild(0); }
        if (this.t > END + 1.2) m.goboMode = undefined;
        if (this.t > END) past?.setMarks(AGES[n - 1], AGES[n - 1], 9); // all of them, clear, on the empty wall
        if (this.t > END + 6.5) { this.set('fade'); }
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
        // the robot dark against the street, face to us; behind it the lamp across the road throws its pool
        const u = ease(clamp01(this.t / 20));
        this.cam.pos.set(0.12 + 0.05 * u, 0.98, -0.42 - 0.4 * u);
        this.cam.look.set(-0.5, 1.0, 5.0); this.cam.fov = 46 - 3 * u;
        if (this.t < 0.05) this.cut = true;
        film.fade(Math.min(1, Math.max(0, (this.t - 13) / 5)));
        if (this.t > 18.5) film.endCard();
        if (this.t > 45) film.replayHint();
        if (this.t > 22 && (input.wasPressed('Pointer') || input.wasPressed('Space'))) location.reload();
        break;
      }
    }
    film.power(this.power, this.phase === 'look');
    const fl = ctx.api.shop?.faceLight; if (fl) { const want = this.phase === 'wait' ? 3.2 : this.phase === 'waking' ? 2.2 : this.phase === 'arrive' ? 3.2 * clamp01((this.t - 24) / 8) : 0; fl.intensity += (want - fl.intensity) * Math.min(1, dt * 1.5); }

    // the camera eases toward its target, a little handheld drift on top
    const k = this.phase === 'waking' ? 3 : this.phase === 'look' ? 2.2 : 1.4;
    if (this.cut) { this.curPos.copy(this.cam.pos); this.curLook.copy(this.cam.look); this.cut = false; }
    this.curPos.lerp(this.cam.pos, Math.min(1, dt * k));
    this.curLook.lerp(this.cam.look, Math.min(1, dt * k * 1.2));
    const cam = ctx.camera;
    cam.position.copy(this.curPos);
    cam.position.x += Math.sin(time * 0.37) * 0.006; cam.position.y += Math.sin(time * 0.53) * 0.004;
    if (this.shake > 0) { this.shake -= dt; const a = Math.max(0, this.shake) * 0.012; cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; }
    cam.lookAt(this.curLook);
    if (Math.abs(cam.fov - this.cam.fov) > 0.01) { cam.fov += (this.cam.fov - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
  },
};
