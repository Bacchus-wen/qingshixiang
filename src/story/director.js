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

export default {
  name: 'director',
  async init(ctx) {
    this.film = new Film(document.getElementById('ui'));
    this.phase = ctx.params.get('phase') || 'arrive';
    this.t = 0; this.power = parseFloat(ctx.params.get('power') || '1'); this.endT = 0;
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this.curPos = ARRIVE.getPoint(0); this.curLook = new THREE.Vector3(0, 1.4, -20);
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
    ctx.api.director = this;
  },

  set(phase) { this.phase = phase; this.t = 0; this.film.phase(phase); },

  update(dt, time, ctx) {
    if (ctx.isShot) return;
    this.t += dt;
    const m = ctx.memory, robot = ctx.api.robot, input = ctx.input;
    const eyePos = m.origin.lengthSq() > 0 ? m.origin : this._w.set(-4.4, 0.95, -13.5);

    switch (this.phase) {
      case 'arrive': {
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
        if (this.t > 4) this.film.hint('按住');
        if (robot && robot.open > 0.08 && robot.attempts > 1) { this.film.hint(''); this.set('waking'); }
        break;
      }
      case 'waking': {
        // close on the eye while it opens: camera slightly in front and to the side of the lens
        this._v.copy(m.dir).multiplyScalar(0.55).add(eyePos);
        this.cam.pos.copy(this._v).add(this._w.set(0.12, 0.08, 0.38));
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
        m.powerOverride = this.power;
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

    // smooth camera with a little handheld drift
    const k = this.phase === 'waking' ? 3 : 1.6;
    this.curPos.lerp(this.cam.pos, Math.min(1, dt * k));
    this.curLook.lerp(this.cam.look, Math.min(1, dt * k * 1.2));
    const cam = ctx.camera;
    cam.position.copy(this.curPos);
    cam.position.x += Math.sin(time * 0.37) * 0.012; cam.position.y += Math.sin(time * 0.53) * 0.008;
    cam.lookAt(this.curLook);
    if (Math.abs(cam.fov - this.cam.fov) > 0.01) { cam.fov += (this.cam.fov - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
  },
};
