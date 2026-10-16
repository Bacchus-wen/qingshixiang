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
// arrival: from puddle height (the lamp in the water) rising to eye height, drifting down the lane
const ARRIVE = new THREE.CatmullRomCurve3([
  // v3 (review, after targets/present.jpg): low along the left kerb, past a parked tricycle, the lane vanishing right
  new THREE.Vector3(-2.3, 0.5, 13.5), new THREE.Vector3(-1.6, 0.95, 7), new THREE.Vector3(-0.6, 1.4, 0),
  new THREE.Vector3(0.0, 1.55, -5.5), new THREE.Vector3(-1.2, 1.05, -8.6), new THREE.Vector3(-2.6, 0.55, -10.6),
]);
// v3 (review, after targets/robot.jpg): low, close, three-quarter from the street side; the robot on the left third,
// the wet lane receding down the right two thirds
const WAIT_LOOK = new THREE.Vector3(-6.1, 0.95, -21.6);
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
    else { this.film.phase(this.phase); this.film.title(false); } // (?phase=... skips the title: hide the cursor too)
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
        // wasPressed('Pointer') latches the click: on a slow first frame (shader compile) press+release can fall between frames
        if (input.pointer.held || input.wasPressed('Pointer') || input.wasPressed('Space') || input.wasPressed('Enter')) { this.film.title(false); this.set('arrive'); }
        break;
      }
      case 'arrive': {
        this.film.fade(Math.max(0, 1 - this.t / 6));
        m.forceOpen = false;
        const u = ease(Math.min(1, this.t / 42));
        ARRIVE.getPoint(u, this.cam.pos);
        // first look is down at the wet road (the lamp's reflection), then up the lane, then onto the robot
        const lookUp = ease(Math.min(1, this.t / 9));
        this._v.set(0.8 + lookUp * 0.8, 0.1 + lookUp * 2.1, 6 - lookUp * 44);
        this.cam.look.lerpVectors(this._v, WAIT_LOOK, ease(Math.min(1, Math.max(0, (u - 0.6) / 0.4))));
        this.cam.fov = 44 - 4 * ease(Math.min(1, Math.max(0, (u - 0.6) / 0.4)));
        // the one moment the whole street is seen: a scripted first strike mid-way down the lane
        if (!this.struck && this.t > 21) { this.struck = true; ctx.api.atmo?.strike(); }
        if (this.t > 42 || input.wasPressed('Enter')) this.set('wait');
        break;
      }
      case 'wait': {
        m.forceOpen = undefined;
        this.film.fade(0); // also clears a fade left by skipping the arrival
        ARRIVE.getPoint(1, this.cam.pos);
        this.cam.look.copy(WAIT_LOOK);
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
        // over the shoulder, close: the helmet's dark silhouette in the near foreground (soft, out of focus), the
        // beam leaving the lens across the frame. The camera rides the gaze direction, so it drifts with the head.
        this._w.set(m.dir.z, 0, -m.dir.x).normalize(); // screen-left of the gaze, on the street side
        // high over the shoulder: the lamp-lit helmet top stays just under the frame, the beam rises out of it
        // v3 (review, after targets/memory.jpg): almost at eye height, just behind and beside the helmet, which stays
        // in the left foreground as a dark wet silhouette; the beam leaves the frame towards the lower right
        this.cam.pos.copy(eyePos).addScaledVector(m.dir, -0.62).addScaledVector(this._w, -0.36);
        this.cam.pos.y = eyePos.y + 0.12;
        this.cam.look.copy(eyePos).addScaledVector(m.dir, 9).addScaledVector(this._w, 0.9);
        this.cam.fov = 50;
        // the door memory gets its own slow push-in toward the doorway, then eases back
        const fr = ctx.api.fragment;
        if (fr && fr.state === 'playing') {
          const push = ease(Math.min(1, fr.t / 6));
          this.cam.pos.lerp(this._v.set(1.2, 1.3, -14.0), push * 0.7);
          this.cam.look.lerp(this._w.set(5.0, 1.15, -14.6), push);
          this.cam.fov = 50 - push * 12;
          // the empty beat: come close enough to read the last mark ('十一岁') on the jamb
          const beat = ease(Math.min(1, Math.max(0, (fr.t - fr.endT) / 3)));
          if (beat > 0) { this.cam.pos.lerp(this._v.set(3.3, 1.55, -14.45), beat); this.cam.look.lerp(this._w.set(4.95, 1.6, -14.75), beat); this.cam.fov -= beat * 8; }
        }
        const frag = ctx.api.fragment;
        this.lookTime = (this.lookTime ?? 0) + dt; // gates the door memory (fragment.js) so it is not the first thing seen
        // nudge: one faint line until the pointer moves
        if (this.t > 4 && !this.moved) this.film.hint('移动鼠标 · 慢慢看');
        if (!this.moved && (Math.abs(input.pointer.x) > 0.15 || Math.abs(input.pointer.y) > 0.15)) { this.moved = true; this.film.hint(''); }
        // however it was used, the eye goes back to the door before it runs out (its resting gaze is the door)
        if (frag?.state === 'idle' && this.power < 0.35) { this.returning = Math.min(1, (this.returning ?? 0) + dt * 0.25); m.lookOverride = { x: 0, y: 0 }; }
        // once the marks have been read the eye never leaves the door again: no second shop after the climax
        if (frag?.state === 'done') m.lookOverride = { x: 0, y: 0 };
        // after the door memory the eye has nothing left: power runs out within ~14 s
        if (frag?.state === 'done') this.power = Math.max(0, this.power - dt / 14);
        else if (robot && robot.open > 0.2 && frag?.state !== 'playing') this.power = Math.max(0, this.power - dt / 150);
        m.power = this.power;
        if (this.power <= 0.0) this.set('fade');
        break;
      }
      case 'fade': {
        // the last breath: the whole street comes back once more, then the eye stutters and dies
        const lb = this.t < 0.4 ? this.t / 0.4 : this.t < 1.6 ? 1 : Math.max(0, 1 - (this.t - 1.6) / 1.2);
        m.flood = lb;
        m.forceOpen = this.t < 2.8 ? true : this.t < 5.5 ? Math.random() > Math.min(0.9, (this.t - 2.8) * 0.3) : false;
        if (this.t > 7) { m.flood = 0; this.set('end'); }
        break;
      }
      case 'end': {
        m.forceOpen = false;
        // no crane up: stay at eye height and back away along the street, the robot and the cat still in frame
        const u = ease(Math.min(1, this.t / 18));
        this.cam.pos.set(ROBOT.x + 2.4 + u * 2.2, 1.5, ROBOT.z + 3 + u * 5.5);
        this.cam.look.set(ROBOT.x + 0.3, 0.75, ROBOT.z - 0.4);
        this.cam.fov = 44 - u * 6;
        // fully black first, a held beat, then the two lines; replay only on a fresh press once offered
        this.film.fade(Math.min(1, Math.max(0, (this.t - 10) / 6)));
        if (this.t > 17.5) this.film.endCard();
        if (this.t > 50) this.film.replayHint(); // the card is left alone for a long while
        if (this.t > 24 && (input.wasPressed('Pointer') || input.wasPressed('Space'))) location.reload();
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
