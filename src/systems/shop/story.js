import * as THREE from 'three/webgpu';
import { Film } from '../../ui/film.js';

// The shop story (v5: two acts), start to end. Owns the camera (except ?shot= and ?review) and the pacing.
//   title   : black, the title card; a click starts the sound and the arrival
//   arrive  : on the street at dusk: the far side first (shuttered, 拆 on the walls, a house half torn down); then the one
//             shop still half open; in, past the bench, round the robot sitting at its work to its face
//   wait    : "hold"; the first hold fails (a flicker, a click), the second opens the eye
//   waking  : close on the lens while it opens
//   look    : act one, the shop: over its shoulder, the pointer turns its head; where the beam falls the shop is as it was
//             (the TVs show programmes, the radios' dials glow and play, the clock swings) -- the generated things up close
//   turn    : the radios' song, faint, from across the road; it swivels round on its stool to face the street
//   street  : act two: behind its head, out through the opening; where the beam falls the far side of the street is the
//             mid-1990s again -- lit shops, laundry, neighbours on stools, their sounds. The power drains while it looks
//   last    : its last look: back to the electronics shop the song comes from; the whole street lights up for a moment
//   fade    : the power runs out: the beam stutters and dies, the song stops mid-phrase, the street is what it is now again
//   end     : from inside, behind the robot: it still faces the dark street; the lamp across the road comes on; black;
//             end card
// act one (the layout: facing into the shop, ry 165)
const EYE_IN = new THREE.Vector3(-0.61, 0.83, 0.94);
const FACING_IN = new THREE.Vector3(0.2588, 0, -0.9659), LEFT_IN = new THREE.Vector3(-0.9659, 0, -0.2588);
// act two (swivelled half a turn: ry -15, facing the street)
const EYE0 = new THREE.Vector3(-0.493, 0.831, 1.376);
const FACING = new THREE.Vector3(-0.2588, 0, 0.9659), LEFT = new THREE.Vector3(0.9659, 0, 0.2588);
const TV_IN = new THREE.Vector3(0.71, 0.86, -1.42);        // the set on the cartons in the middle of the shop (a demo target)
// its close-up: past the robot's head along the beam, the set and the valve radio above it filling the frame
const TV_SHOT = { pos: new THREE.Vector3(0.355, 1.095, -0.068), look: new THREE.Vector3(0.42, 1.12, -1.65), fov: 32 };
// the shops across the road, in the "then" photograph (world points on the backdrop plane, z 11): each has a sound
// that plays when the beam first rests on it
export const SPOTS = [
  { key: 'noodles', pos: new THREE.Vector3(6.9, 1.3, 10.95), sound: 'bowls' },     // 百货面店: steam, diners
  { key: 'hardware', pos: new THREE.Vector3(3.6, 1.3, 10.95), sound: 'tinks' },    // 金福五金
  { key: 'barber', pos: new THREE.Vector3(0.45, 1.3, 10.95), sound: 'snips' },     // 新华理发: where the house is gone now
  { key: 'tv', pos: new THREE.Vector3(-3.0, 1.25, 10.95), sound: 'tvshow' },        // 新兴电器: a family watching the TV in the window
  { key: 'tailor', pos: new THREE.Vector3(-6.45, 1.3, 10.95), sound: 'sewing' },   // 日月缝纫店
];
const STREET_C = new THREE.Vector3(0.3, 1.85, 11.0);          // the middle of the far side, a little above the shops
// act two from further inside, over the dark shop (judges r1-r3: from just behind its head the robot is a rusty box):
// the robot whole on its stool in the doorway -- head, arms, sprung legs, a robot from behind -- the far side framed
// by the opening, its beam reaching across the road
const ACT2_POS = new THREE.Vector3(0.12, 0.95, -1.25), ACT2_LOOK = new THREE.Vector3(-0.45, 1.05, 11.0), ACT2_FOV = 46;
const ACT2_BEAM = { beamK: 1.0, beamReach: 0.35, spotK: 0.6, duskK: 0.45 }; // a shaft in the dusty air toward the far side; the dusk under the shutter lower (from in here its patch on the floor burns out)
const K = (t, p, l, fov, cut = false) => ({ t, p: new THREE.Vector3(...p), l: new THREE.Vector3(...l), fov, cut });
const WAIT_POS = new THREE.Vector3(-0.98, 0.88, 0.12), WAIT_LOOK = new THREE.Vector3(-0.6, 0.8, 0.98); // its face, lens side
const ARRIVE_K = [
  K(0, [0.9, 1.55, 5.6], [1.6, 2.6, 11.0], 50),           // the far side: what is left of the street (a slow drift)
  K(5.2, [0.2, 1.55, 6.0], [0.3, 2.4, 11.0], 48),
  K(5.25, [0.6, 1.55, 6.6], [-0.4, 1.1, 0.8], 46, true),   // (cut) behind us, the one shop still half open, a light inside
  K(8.5, [0.25, 1.28, 3.1], [-0.4, 1.05, 0.6], 46),        // at the shutter: someone sits inside at a bench
  K(11.0, [-0.55, 1.5, 2.2], [-1.55, 0.9, 0.7], 44),       // in: the bench in the lamp's light
  K(13.8, [0.99, 0.9, -0.38], [-0.55, 0.52, 1.16], 40),    // the robot whole, three-quarter (the model shown whole)
  K(16.0, [0.84, 0.88, -0.5], [-0.55, 0.52, 1.16], 40),
  K(18.8, WAIT_POS.toArray(), WAIT_LOOK.toArray(), 38),    // its face
];
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // a phone or tablet: hints speak of fingers
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const LOOK_POWER_S = 105; // seconds of open eye before the power is gone (both acts)

export default {
  name: 'story',
  async init(ctx) {
    if (ctx.isShot || ctx.api.shop?.review) { this.off = true; return; }
    this.film = new Film(document.getElementById('ui'), {
      title: '青 石 巷', sub: '请戴上耳机', start: '点击画面开始',
      credit: '店里的每一件旧物都由 Tripo 生成 · 素材出处与许可见 credits.html',
      card: ['它记得这条街亮着灯的样子。'],
    });
    this.phase = ctx.params.get('phase') || 'title';
    this.t = 0; this.power = 1; this.lookTime = 0; this.streetTime = 0; this.seen = new Set(); this.dwell = {}; this.sinceSeen = 0;
    this.cam = { pos: ARRIVE_K[0].p.clone(), look: ARRIVE_K[0].l.clone(), fov: ARRIVE_K[0].fov };
    this.curPos = this.cam.pos.clone(); this.curLook = this.cam.look.clone();
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.radioPos = SPOTS.find((s) => s.key === 'tv').pos; // (sound.js: the TV show's music comes from the shop window)
    ctx.api.story = this;
    if (this.phase === 'title') this.film.title(true); else { this.film.title(false); this.set(this.phase, true); }
    if (['turn', 'street', 'last', 'fade', 'end'].includes(this.phase)) ctx.api.shop?.robotTurn?.(1); // (?phase= straight into act two)
    ctx.postfx.params.presentK.value = 1; // the dusty present outside the beam
  },
  set(phase, cut = false) { this.phase = phase; this.t = 0; this.cut = cut; },

  update(dt, time, ctx) {
    if (this.off) return;
    this.t += dt;
    const m = ctx.memory, input = ctx.input, eye = ctx.api.eye, atmo = ctx.api.atmo, film = this.film, audio = ctx.api.audio;
    const eyePos = m.strength > 0.01 ? m.origin : EYE0;
    switch (this.phase) {
      case 'title': {
        m.forceOpen = false; film.fade(1);
        this.cam.pos.copy(ARRIVE_K[0].p); this.cam.look.copy(ARRIVE_K[0].l); this.cam.fov = ARRIVE_K[0].fov; this.cut = true;
        if (input.pointer.held || input.wasPressed('Pointer') || input.wasPressed('Space') || input.wasPressed('Enter')) { film.title(false); this.set('arrive'); }
        break;
      }
      case 'arrive': {
        m.forceOpen = false;
        let i = 0; while (i < ARRIVE_K.length - 2 && this.t > ARRIVE_K[i + 1].t) i++;
        const A0 = ARRIVE_K[i], A1 = ARRIVE_K[i + 1], f = A1.cut ? 0 : ease(clamp01((this.t - A0.t) / (A1.t - A0.t)));
        if (A0.cut && this.cutAt !== A0.t) { this.cutAt = A0.t; this.cut = true; }
        const cutK = ARRIVE_K.filter((x) => x.cut).reduce((v, x) => Math.max(v, 1 - Math.abs(this.t - x.t) / 0.35), 0); // a dip to black across a cut
        film.fade(Math.max(0, 1 - this.t / 4, cutK));
        this.cam.pos.lerpVectors(A0.p, A1.p, f); this.cam.look.lerpVectors(A0.l, A1.l, f); this.cam.fov = A0.fov + (A1.fov - A0.fov) * f;
        if (this.t > ARRIVE_K[ARRIVE_K.length - 1].t || input.wasPressed('Enter')) this.set('wait');
        break;
      }
      case 'wait': {
        // chest-up, three-quarter from its lens side, at its work in the shop; a slow drift shows the volumes
        m.forceOpen = undefined; film.fade(0); ctx.api.shop?.robotTurn?.(0);
        this.cam.pos.copy(WAIT_POS).addScaledVector(LEFT_IN, Math.sin(this.t * 0.15) * 0.06).addScaledVector(FACING_IN, -(1 - Math.cos(this.t * 0.15)) * 0.05);
        this.cam.look.copy(WAIT_LOOK); this.cam.fov = 40 - Math.min(3, this.t * 0.15);
        if (this.t > 3) film.hint(eye?.failed ? (input.hold ? '松开，再按住' : '再按住一次') : TOUCH ? '按住屏幕' : '按住鼠标左键');
        if (eye?.failed && !this.shook) { this.shook = true; this.shake = 0.45; } // the first try: a clunk, the head jolts
        if (eye && eye.open > 0.08 && eye.attempts > 1) { film.hint(''); this.set('waking', true); }
        break;
      }
      case 'waking': {
        // three-quarter on the lens while it grinds open
        this.cam.pos.copy(EYE_IN).addScaledVector(FACING_IN, 0.8).add(this._w.set(-0.26, 0.12, 0.06));
        this.cam.look.copy(eyePos).add(this._w.set(0, 0.07, 0)); this.cam.fov = 36;
        if (eye && eye.open > 0.85) { this.set('look'); atmo?.flicker(1); } // the shop's dead tube stutters as the eye opens
        if (!input.hold && eye && eye.open < 0.02 && this.t > 1) this.set('wait');
        break;
      }
      case 'look': {
        // act one, the shop: over its right shoulder (the bench stays out of the near frame), the view following the beam
        // round the shelves -- the TVs, the radios, the clock come back where it falls
        this._d.copy(m.dir); this._d.y = 0; this._d.normalize();
        this._w.set(this._d.z, 0, -this._d.x); // the robot's left, across the gaze
        this.cam.pos.copy(eyePos).addScaledVector(this._d, -1.15).addScaledVector(this._w, -0.38); this.cam.pos.y = eyePos.y + 0.5;
        this.cam.look.copy(eyePos).addScaledVector(m.dir, 3.2).addScaledVector(this._w, 0.12);
        // when the beam rests on something, the view leans in to it: a slow, oblique close-up of the thing coming back
        const px = input.pointer.x, py = input.pointer.y, mv = Math.abs(px - (this.px ?? px)) + Math.abs(py - (this.py ?? py)); this.px = px; this.py = py;
        this.still = mv > 0.004 ? 0 : (this.still ?? 0) + dt;
        const zk = ease(clamp01((this.still - 1.0) / 1.6)); this.zoom = (this.zoom ?? 0) + (zk - (this.zoom ?? 0)) * Math.min(1, dt * (zk > (this.zoom ?? 0) ? 1.2 : 3));
        // (judge r3: from behind its head the rusty box filled the lower third -- the close-up goes on past it, along the
        // beam to a metre or so from the thing, a little right of and above the shaft: a product shot in its light)
        this.cam.pos.lerp(this._v.copy(eyePos).addScaledVector(m.dir, 1.35).addScaledVector(this._w, -0.33).setY(eyePos.y + 0.27), 0.85 * this.zoom);
        this.cam.fov = 50 - 18 * this.zoom;
        if (this.t > 19.6 && this.t < 27.5) { // its own radio: from in front of the open set, the robot's eye turned to it beyond
          this.zoom = 0; this.cam.pos.set(-1.85, 1.15, 1.5); this.cam.look.set(-0.95, 0.88, 0.85); this.cam.fov = 54; m.spotK = 0.3;
        } else m.spotK = undefined;
        // a photographer's lens on the close-ups: the thing in the beam sharp, the shelf behind it soft (as if f/2)
        const P = ctx.postfx.params, bench = this.t > 19.6 && this.t < 27.5 && this.benchPos;
        const fd = bench ? this.curPos.distanceTo(this.benchPos) : this.tvShot ? this.curPos.distanceTo(TV_IN) : this.curPos.distanceTo(this._v.copy(eyePos).addScaledVector(m.dir, 2.4));
        P.focus.value += (fd - P.focus.value) * Math.min(1, dt * 3); P.focalRange.value = this.tvShot ? 1.2 : 0.9; P.bokeh.value += ((bench ? 1.4 : this.tvShot ? 2.0 : 2.4 * this.zoom) - P.bokeh.value) * Math.min(1, dt * 2);
        this.lookTime += dt;
        if (this.t > 4 && !this.moved) film.hint(TOUCH ? '保持按住，滑动手指' : '保持按住，移动鼠标');
        if (!this.moved && (Math.abs(input.pointer.x) > 0.2 || Math.abs(input.pointer.y) > 0.2)) { this.moved = true; film.hint(''); eye?.aim(null); }
        if (!this.moved && this.t > 9) { // left alone, it looks at the set in the middle of the shop itself: over its head, the set beyond in focus
          eye?.aim(TV_IN); this.cam.pos.copy(TV_SHOT.pos); this.cam.look.copy(TV_SHOT.look); this.cam.fov = TV_SHOT.fov; this.zoom = 0; this.tvShot = true;
        } else this.tvShot = false;
        if (eye && eye.open > 0.2) this.power = Math.max(0, this.power - dt / LOOK_POWER_S);
        // its own radio: after a while it looks at the half-repaired set on its bench; a crackle, and a song comes out of it.
        // Then the song leaves the radio and answers, faint, from across the road behind it (the TV in the electronics
        // shop window); it turns round to it
        if (!this.benchPos) { const r = ctx.api.shop?.placed?.tube_radio_open; this.benchPos = r ? r.getWorldPosition(new THREE.Vector3()).add(this._w.set(0, 0.16, 0)) : new THREE.Vector3(-1.26, 1.0, 0.74); }
        if (this.t > 19 && this.t < 27) eye?.aim(this.benchPos);
        if (this.t > 20.6 && !this.crackled) { this.crackled = true; audio?.play('tvzap', { pos: this.benchPos }); }
        this.benchTune = this.t < 21.2 ? 0 : this.t < 26 ? Math.min(1, (this.t - 21.2) / 1.2) : Math.max(0, 1 - (this.t - 26) / 2.5);
        if (this.t > 26) this.tuneCall = Math.min(0.55, (this.tuneCall ?? 0) + dt * 0.3);
        if (this.t > 27) eye?.aim(null);
        if ((this.t > 30 && this.zoom < 0.2) || this.t > 34 || input.wasPressed('KeyT')) { film.hint(''); this.benchTune = 0; this.set('turn'); }
        m.power = this.power;
        break;
      }
      case 'turn': {
        // it swivels round on its stool, half a turn, to face the street; the head comes back to straight ahead.
        // Seen from the doorway: its back first, then it comes round to us, the street's dusk on its face
        m.forceOpen = true; eye?.aim(null); m.lookOverride = { x: 0, y: 0.15 };
        const k = ease(clamp01((this.t - 0.4) / 3.0));
        ctx.api.shop?.robotTurn?.(k);
        if (this.t < 0.05) { this.cut = true; audio?.play('servo'); }
        if (this.t > 1.2 && !this.creak) { this.creak = true; audio?.play('servo'); }
        this.cam.pos.set(0.95, 0.8, 2.9); this.cam.look.set(-0.5, 0.55, 1.2); this.cam.fov = 40; m.coreK = 0.25; m.spotK = 0.5; m.lampK = 0.45; m.beamK = 0.12; // the whole robot, stool and shadow; the lamp behind it secondary
        if (eye && eye.open > 0.2) this.power = Math.max(0, this.power - dt / LOOK_POWER_S);
        if (this.t > 4.2) { m.lookOverride = undefined; m.coreK = undefined; m.lampK = undefined; this.set('street', true); }
        this.tuneCall = 0.55;
        m.power = this.power;
        break;
      }
      case 'street': {
        // act two: behind its head on the lens side, held still: the whole far side fills the opening (the photographs'
        // edges just outside the frame), the head in the near corner, and the beam moves across the street -- the view
        // only leans a little after it
        this.cam.pos.copy(ACT2_POS);
        this.cam.look.copy(ACT2_LOOK).lerp(this._v.copy(eyePos).addScaledVector(m.dir, 10), 0.05);
        this.cam.fov = ACT2_FOV;
        this.streetTime += dt; this.tuneCall = Math.max(0, (this.tuneCall ?? 0) - dt * 0.25);
        Object.assign(m, ACT2_BEAM);
        if (this.t > 2.5 && !this.moved2) film.hint(TOUCH ? '滑动手指，让它看看街对面' : '移动鼠标，让它看看街对面');
        if (!this.moved2 && this.t > 1 && (Math.abs(input.pointer.x) > 0.25 || Math.abs(input.pointer.y) > 0.25)) { this.moved2 = true; film.hint(''); }
        // the power failing: now and then the past drops out for a moment
        if (this.power < 0.35 && (this.dipT = (this.dipT ?? 2) - dt) < 0) { this.dipT = 2.5 + Math.random() * 3.5; this.dip = 0.14; audio?.play('click'); }
        if (eye && eye.open > 0.2) this.power = Math.max(0, this.power - dt / LOOK_POWER_S);
        // the shops across the road: a beam that rests on one brings its sound back (once each)
        let on = null;
        for (const s of SPOTS) {
          const c = this._v.copy(s.pos).sub(m.origin).normalize().dot(m.dir), hit = m.strength > 0.5 && c > Math.cos(0.17);
          this.dwell[s.key] = hit ? (this.dwell[s.key] ?? 0) + dt : 0;
          if (hit) on = s;
          if (this.dwell[s.key] > 0.5 && !this.seen.has(s.key)) { this.seen.add(s.key); this.sinceSeen = 0; audio?.play(s.sound, { pos: s.pos }); }
        }
        this.sinceSeen += dt;
        // nothing found for a while: one of the shops not yet seen calls from its side of the street (a bell)
        if (!on && this.sinceSeen > 8 && (this.callT = (this.callT ?? 5) - dt) < 0) {
          const s = SPOTS.find((x) => !this.seen.has(x.key)); this.callT = 7;
          if (s) audio?.play(s.sound, { pos: s.pos }); // the shop itself calls, from its side of the street
        }
        // enough: three shops (and a moment with the last), or the power nearly gone -- then one last look
        if ((this.seen.size >= 3 && this.sinceSeen > 5) || this.power < 0.14 || this.streetTime > 62 || input.wasPressed('KeyD')) { film.hint(''); this.set('last'); }
        this.dip = Math.max(0, (this.dip ?? 0) - dt);
        m.power = this.dip > 0 ? 0.05 : this.power;
        m.pastK = on ? 0.4 : 0.12; // a shop come back throws its evening light in at the door (atmo.js: x the beam's strength)
        break;
      }
      case 'last': {
        // its last look: it turns back to the electronics shop where the song comes from; with what is left, the whole
        // street lights up as it was, for a moment; then it cannot hold it any more
        this.cam.pos.copy(ACT2_POS);
        this.cam.look.copy(ACT2_LOOK); this.cam.fov = ACT2_FOV + 2 * ease(clamp01((this.t - 3.2) / 2));
        m.forceOpen = true; Object.assign(m, ACT2_BEAM);
        eye?.aim(SPOTS.find((x) => x.key === 'tv').pos);
        m.memWide = 1 + 3.2 * ease(clamp01((this.t - 3.2) / 2.2)); // the shop alone a moment (the song), then the whole street
        this.power = Math.max(0.03, this.power - dt * 0.03);
        m.power = this.t > 7.4 && Math.random() < 0.25 ? 0.04 : Math.max(0.2, this.power);
        m.pastK = 0.4 + 0.6 * ease(clamp01((this.t - 3.2) / 2.2)); // the whole street's evening floods in over it
        if (this.t > 8.4) this.set('fade');
        break;
      }
      case 'fade': {
        // the last of the power: the beam stutters and dies, the street goes back to what it is now. Its face as the
        // iris closes for the last time, the dusk from the street on it
        m.holdGaze = true;
        this.power = Math.max(0, this.power - dt / 3);
        m.power = Math.max(0.02, this.power);
        m.forceOpen = this.t < 2.2 ? true : this.t < 5 ? Math.random() > Math.min(0.92, (this.t - 2.2) * 0.33) : false;
        if (this.t > 4.5) atmo?.set('out');
        // first from where we were: the whole street flickers out and the song stops mid-phrase; then its face as the iris
        // closes for the last time
        m.memWide = this.t < 3.4 ? 4.2 : 1;
        m.pastK = this.t < 3.4 ? 1 : 0; // (with the power: atmo.js)
        if (this.t < 3.4) {
          this.cam.pos.copy(ACT2_POS); this.cam.look.copy(ACT2_LOOK); this.cam.fov = ACT2_FOV + 2;
        } else {
          if (!this.faced) { this.faced = true; this.cut = true; }
          this.cam.pos.copy(EYE0).addScaledVector(FACING, 0.78).addScaledVector(LEFT, 0.18).add(this._w.set(0, 0.03, 0));
          this.cam.look.copy(EYE0).add(this._w.set(0, 0.02, 0)); this.cam.fov = 34;
        }
        if (this.t > 9) this.set('end');
        break;
      }
      case 'end': {
        // from inside, behind it: it still faces the street, dark against it; the lamp across the road comes on over the
        // rubble; a digger somewhere; black; the card
        m.forceOpen = false; m.holdGaze = true; m.headLift = 1; m.pastK = 0; m.duskK = undefined;
        const u = ease(clamp01(this.t / 12));
        this.cam.pos.set(-0.25 - 0.04 * u, 0.82, -1.05 + 0.2 * u); // its whole seated back on the right, the lamp across the road in frame
        this.cam.look.set(-0.9, 1.7, 11.0); this.cam.fov = 52 - 3 * u;
        if (this.t < 0.05) this.cut = true;
        film.fade(Math.min(1, Math.max(0, (this.t - 7) / 3)));
        if (this.t > 12.5) film.endCard(); // (two seconds of silence first: sound.js)
        if (this.t > 30) film.replayHint();
        if (this.t > 14 && (input.wasPressed('Pointer') || input.wasPressed('Space'))) location.reload();
        break;
      }
    }
    film.power(this.power, this.phase === 'look' || this.phase === 'turn' || this.phase === 'street' || this.phase === 'last');
    if (this.phase !== 'look' && ctx.postfx.params.bokeh.value > 0) ctx.postfx.params.bokeh.value = Math.max(0, ctx.postfx.params.bokeh.value - dt * 3); // depth of field only on act one's close-ups
    // a soft key on its face while we are in front of it: in the shop from the bench side (from the camera's side while
    // we come in: the chest and legs read too); facing the street, from the street
    const fl = ctx.api.shop?.faceLight; if (fl) {
      const inShop = this.phase === 'arrive' || this.phase === 'wait' || this.phase === 'waking' || this.phase === 'title';
      if (inShop) { fl.position.set(...(this.phase === 'arrive' ? [0.45, 1.25, 0.25] : [-1.35, 1.05, 0.62])); fl.target.position.set(-0.6, this.phase === 'arrive' ? 0.6 : 0.8, 0.98); }
      else { fl.position.set(0.35, 1.25, 2.45); fl.target.position.copy(EYE0).add(this._w.set(0, -0.12, 0)); }
      fl.target.updateMatrixWorld(); fl.angle = this.phase === 'arrive' ? 0.7 : this.phase === 'turn' ? 0.9 : this.phase === 'street' || this.phase === 'last' ? 0.28 : 0.6;
      const want = this.phase === 'wait' ? 2.6 : this.phase === 'waking' ? 2.0 : this.phase === 'fade' ? 1.4 : this.phase === 'arrive' ? 3.2 * clamp01((this.t - 11) / 3) : this.phase === 'turn' ? 5.0 : this.phase === 'street' || this.phase === 'last' ? 1.6 : 0;
      fl.intensity += (want - fl.intensity) * Math.min(1, dt * 1.5);
    }

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
    // portrait screens (phones held upright) see a narrow slice: widen the vertical angle so the same things stay in frame
    const want = Math.min(78, this.cam.fov * (cam.aspect < 1 ? Math.min(1.6, 1 / Math.sqrt(cam.aspect)) : 1));
    if (Math.abs(cam.fov - want) > 0.01) { cam.fov += (want - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
  },
};
