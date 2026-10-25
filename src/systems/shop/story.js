import * as THREE from 'three/webgpu';
import { Film } from '../../ui/film.js';
import { tr } from '../../ui/i18n.js';
import { memoryMaskCPU } from '../../materials/memory.js';

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
const EYE0 = new THREE.Vector3(-0.371, 0.831, 1.676); // (+0.12, 0, +0.30 since 2026-10-21: it turns round the stool's axis now, not its own middle)
const FACING = new THREE.Vector3(-0.2588, 0, 0.9659), LEFT = new THREE.Vector3(0.9659, 0, 0.2588);
const TV_IN = new THREE.Vector3(0.71, 0.86, -1.42);        // the set on the cartons in the middle of the shop (a demo target)
// its close-up: past the robot's head along the beam, the set and the valve radio above it filling the frame
const TV_SHOT = { pos: new THREE.Vector3(0.42, 1.12, -0.12), look: new THREE.Vector3(0.62, 1.16, -1.7), fov: 31, aim: new THREE.Vector3(0.66, 1.2, -1.66) }; // the set and, above it, the valve radio // aim between the set and the valve radio: both come back (r4: the dial stayed dark)
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
// the last look, its fading and the end from inside to its left: its side against the doorway, the shaft crossing the
// road to the electronics shop seen side-on (judges r4-r9: from behind, act two's climax was "a dark back of a head")
const SIDE = { pos: new THREE.Vector3(0.972, 0.92, -0.55), look: new THREE.Vector3(-0.878, 0.95, 3.3), fov: 42, beam: { beamNear: 0.05, glowK: 0, beamK: 0.8 } }; // (r10: further in -- the robot whole, the photograph's edge behind the door jamb; the shaft starts at the lens, hidden by the head, not in a glow beside it)
// the shot after the cut matches the one before it: the robot's head on the same spot of the frame (within 1% of its
// width), the same size, but now it faces the street -- from 35 degrees behind its left, the lens's side edge in view;
// its gaze a little to the left (look -0.5, ~24 degrees), on the electronics shop the song comes from, which lands in
// the left 13% of the frame (Codex, round 2: the far side's lit target whole on the left; solved with
// /tmp/rigwork/matchcut.mjs, 2026-10-22). Held while you find your bearings, then on to ACT2 (the gaze is yours again).
// (round 3: 43 degrees of lens, panned 0.75 degrees left -- the shop whole with 3.6% to spare at the left edge; the head
// within 1% of its place and 8% smaller)
const MATCH = { pos: new THREE.Vector3(1.101, 0.82, 0.153), look: new THREE.Vector3(-6.642, -0.731, 6.573), fov: 43, hold: 1.3, move: 2.0, gaze: -0.5 }; // (hold 1.04 -> 1.3, move 1.6 -> 2.0: the user, "转场太突兀了")
// the pacing (2026-10-22 evening, the user: "转场太突兀了" -- act one cut straight to the doorway 4 s after the song began,
// 1.3 s there, the tear: nothing on screen said why). Now no cut out of act one: it hears the song and turns its head to
// it while the view draws back out to the doorway (PULL_S); it listens; from LISTEN_S its light falters, the song fills
// with static, the picture loses lock more and more often; the tear builds for TEAR_S and the cut falls on its peak,
// the picture dipping instead of flashing dark; after it the picture settles over GLITCH_OUT2_S
const PULL_S = 2.6, LISTEN_S = 3.3, TEAR_S = 0.45, CUT_S = 4.9, GLITCH_OUT2_S = 0.5;
const DOOR_A = new THREE.Vector3(0.95, 0.8, 2.9), DOOR_B = new THREE.Vector3(0.82, 0.82, 2.62), DOOR_LOOK = new THREE.Vector3(-0.5, 0.55, 1.2);
const LISTEN = { x: -0.55, y: 0.15, tilt: 0.09 }; // its head turned to the song (to its right, toward the door: within the pointer's own range), a little tilted
const ACT2_POS = new THREE.Vector3(0.072, 1, -1.4), ACT2_LOOK = new THREE.Vector3(-0.278, 0.92, 11.3), ACT2_FOV = 48; // (r4: feet and stool in frame, clear of the bench)
const ACT2_BEAM = { beamK: 0.65, beamReach: 0.25, beamNear: 0.5, beamFar: 9, spotK: 0.6, duskK: 0.2, shaftW: 0.7, doorK: 1, glowK: 1, robotFillK: 0.25, lampK: 0.25, softK: 1.8 }; // (lamp 0.4 -> 0.25: the dolly brings its white shade toward the middle of the frame, Codex player-1) // softK: a wider then/now edge (r7: a hard one read as a burnt stripe) // (lamp: from in here the bench lamp was the brightest thing in the frame) // (dusk 0.2: from in here its hard patch on the floor burnt out) // a shaft in the dusty air toward the far side; the dusk under the shutter lower (from in here its patch on the floor burns out)
const K = (t, p, l, fov, cut = false) => ({ t, p: new THREE.Vector3(...p), l: new THREE.Vector3(...l), fov, cut });
const WAIT_POS = new THREE.Vector3(-0.98, 0.88, 0.12), WAIT_LOOK = new THREE.Vector3(-0.6, 0.8, 0.98); // its face, lens side
const ARRIVE_K = [
  // (2026-10-26, Codex player-1: half a minute before you can do anything -- 18.8 s -> 16 s here, the prompt sooner)
  K(0, [0.9, 1.55, 5.6], [1.6, 2.6, 11.0], 50),           // the far side: what is left of the street (a slow drift)
  K(4.4, [0.2, 1.55, 6.0], [0.3, 2.4, 11.0], 48),
  K(4.45, [0.6, 1.55, 6.6], [-0.4, 1.1, 0.8], 46, true),   // (cut) behind us, the one shop still half open, a light inside
  K(7.2, [0.25, 1.28, 3.1], [-0.4, 1.05, 0.6], 46),        // at the shutter: someone sits inside at a bench
  K(9.4, [-0.55, 1.5, 2.2], [-1.55, 0.9, 0.7], 44),        // in: the bench in the lamp's light
  K(11.8, [0.99, 0.9, -0.38], [-0.55, 0.52, 1.16], 40),    // the robot whole, three-quarter (the model shown whole)
  K(13.6, [0.84, 0.88, -0.5], [-0.55, 0.52, 1.16], 40),
  K(16.0, WAIT_POS.toArray(), WAIT_LOOK.toArray(), 38),    // its face
];
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // a phone or tablet: hints speak of fingers
// the film's words (main.js puts the title up while the page loads, with "loading" where "click to begin" will be)
export const TITLE_TEXT = () => ({
  title: tr('青 石 巷', 'Bluestone Lane'), sub: tr('请戴上耳机', 'Best with headphones'), start: tr('点击画面开始', TOUCH ? 'Tap to begin' : 'Click to begin'),
  credit: tr('店里的每一件旧物都由 Tripo 生成 · 素材出处与许可见 credits.html', 'Every old object in the shop was generated with Tripo · sources and licences: credits\u2011en.html'),
  card: [tr('它记得这条街亮着灯的样子。', 'It remembers the street with its lights on.')],
  replay: tr('点击画面重看', TOUCH ? 'Tap to watch again' : 'Click to watch again'),
});
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const LOOK_POWER_S = 105; // seconds of open eye before the power is gone (both acts)
// (2026-10-26, played through as a newcomer: act two lasted 11 s -- three shops found in a sweep and it was over. The
// shop takes act one down to 0.68 at most; the street then has ~46 s of light, the last of it failing)
const ACT1_FLOOR = 0.68, STREET_POWER_S = 85;
// what comes back to life in the beam in act one (the twins, the sets with pictures, the radios with their dials, the
// clock): five of them seen and its own radio on the bench calls it (the beat below), or at 34 s at the latest
const ALIVE = new Set(['tube_radio_closed.glb', 'desk_fan.glb', 'crt_tv.glb', 'crt_tv_hero.glb', 'wall_clock.glb', 'cassette_recorder.glb', 'alarm_clock.glb']);
const BENCH = { cue: 0, aim: 0.5, cut: 1.3, tune: 1.8, fade: 6.0, release: 6.8, back: 7.2, end: 9.6 }; // the bench beat, s after it starts (Codex player-1: the close-up held still too long -- 5.9 s now, pushing in)
// the order the shops it remembered go out in when the light dies: from the far ends in, the electronics shop last
const OUT_ORDER = { noodles: 0, tailor: 1, hardware: 2, barber: 3, tv: 4 };

export default {
  name: 'story',
  async init(ctx) {
    if (ctx.isShot || ctx.api.shop?.review) { this.off = true; return; }
    this.film = Film.shared(document.getElementById('ui'), TITLE_TEXT()); // (main.js shows it while the page loads)
    this.phase = ctx.params.get('phase') || 'title';
    this.t = 0; this.power = 1; this.lookTime = 0; this.streetTime = 0; this.seen = new Set(); this.dwell = {}; this.sinceSeen = 0;
    this.cam = { pos: ARRIVE_K[0].p.clone(), look: ARRIVE_K[0].l.clone(), fov: ARRIVE_K[0].fov };
    this.curPos = this.cam.pos.clone(); this.curLook = this.cam.look.clone();
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.radioPos = SPOTS.find((s) => s.key === 'tv').pos; // (sound.js: the TV show's music comes from the shop window)
    ctx.api.story = this;
    if (this.phase === 'title') this.film.title(true); else { this.film.title(false); this.set(this.phase, true); }
    if (['turn', 'street', 'last', 'fade', 'end'].includes(this.phase)) ctx.api.shop?.robotTurn?.(1); // (?phase= straight into act two)
    if (['street', 'last', 'fade'].includes(this.phase)) ctx.memory.forceOpen = true; // (as after the turn: its eye open without holding)
    if (this.phase === 'end') ctx.api.atmo?.set('out');
    ctx.postfx.params.presentK.value = 1; // the dusty present outside the beam
  },
  set(phase, cut = false) { this.phase = phase; this.t = 0; this.cut = cut; },
  // the things in the shop that have come back in its light (act one): each counted once, after a third of a second in
  // the beam's full light
  countRevived(ctx, m, dt) {
    if (!this.alive) {
      const box = new THREE.Box3();
      this.alive = Object.values(ctx.api.shop?.placed ?? {}).filter((o) => ALIVE.has(o.userData.layout?.glb)).map((o) => ({ o, c: box.setFromObject(o).getCenter(new THREE.Vector3()), d: 0 }));
      this.revived = new Set();
    }
    if (!(m.strength > 0.3)) return;
    for (const a of this.alive) { if (this.revived.has(a.o)) continue; a.d = memoryMaskCPU(a.c, m) > 0.5 ? a.d + dt : 0; if (a.d > 0.35) this.revived.add(a.o); }
  },

  update(dt, time, ctx) {
    if (this.off) return;
    this.t += dt;
    const m = ctx.memory, input = ctx.input, eye = ctx.api.eye, atmo = ctx.api.atmo, film = this.film, audio = ctx.api.audio;
    const eyePos = m.strength > 0.01 ? m.origin : EYE0;
    switch (this.phase) {
      case 'title': {
        m.forceOpen = false; film.fade(1);
        this.cam.pos.copy(ARRIVE_K[0].p); this.cam.look.copy(ARRIVE_K[0].l); this.cam.fov = ARRIVE_K[0].fov; this.cut = true;
        if (input.wasPressed('Pointer') || input.wasPressed('Space') || input.wasPressed('Enter')) { film.title(false); this.set('arrive'); } // (a press, not a button still held from the loading screen: the sound unlocks on the press)
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
        // ("let go" only while the hold that failed is still held: a new press read it for a quarter second before it counted)
        if (eye?.failed && this.failHold === undefined) this.failHold = !!input.hold;
        if (!input.hold) this.failHold = false;
        if (this.t > 2.2) film.hint(eye?.failed ? (this.failHold ? tr('松开，再按住', 'Let go, then hold again') : tr('再按住一次', 'Press and hold again')) : TOUCH ? tr('按住屏幕', 'Press and hold the screen') : tr('按住鼠标左键', 'Hold the left mouse button'));
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
        // its own radio on the bench (the beat below): when five things have come back in its light and it has looked
        // round for 22 s, or at 34 s; bt is the beat's own clock. Act one is over a few seconds after it (a newcomer's
        // sweep brought four back in 16 s: too soon to have looked at any of them)
        this.countRevived(ctx, m, dt);
        if (this.benchAt === undefined && ((this.revived.size >= 5 && this.t > 22) || this.t > 34)) this.benchAt = this.t;
        const bt = this.benchAt === undefined ? -1 : this.t - this.benchAt, benchShot = bt > BENCH.cut && bt < BENCH.back;
        if (benchShot !== !!this.benchShotOn) { this.benchShotOn = benchShot; this.cut = true; } // (cuts, in and out: the view swept through the bench and its lamp to get there)
        if (bt > BENCH.end || input.wasPressed('KeyT')) this.ending = true; // (act one is over: no close-up any more, the view comes back over its shoulder before it draws back to the doorway)
        if (this.ending) this.still = 0;
        const zk = ease(clamp01((this.still - 1.0) / 1.6)); this.zoom = (this.zoom ?? 0) + (zk - (this.zoom ?? 0)) * Math.min(1, dt * (zk > (this.zoom ?? 0) ? 1.2 : 3));
        // (judge r3: from behind its head the rusty box filled the lower third -- the close-up goes on past it, along the
        // beam to a metre or so from the thing, a little right of and above the shaft: a product shot in its light)
        // (2026-10-26: a close-up to the left, toward the shelves past the bench, went 20 cm over the bench top -- its lamp's
        // pool filled the frame, burnt white. It stops short of the bench, its lamp and what stands on them)
        { const zt = this._v.copy(eyePos).addScaledVector(m.dir, 1.35).addScaledVector(this._w, -0.33).setY(eyePos.y + 0.27), base = (this._b ??= new THREE.Vector3()).copy(this.cam.pos), p = this._p2 ??= new THREE.Vector3();
          let f = 0.85 * this.zoom;
          while (f > 0 && (p.copy(base).lerp(zt, f), p.x > -2.5 && p.x < -0.62 && p.z > 0.3 && p.z < 1.5 && p.y < 1.7)) f -= 0.05;
          this.cam.pos.lerp(zt, Math.max(0, f));
          // and on its way in it keeps 55 cm from its head, a little above it (a close-up to the left passed 20 cm over the
          // box of its head, the lamp-lit top filling the lower frame)
          (this.headKeep ??= new THREE.Vector3()).set(eyePos.x - m.dir.x * 0.15, eyePos.y, eyePos.z - m.dir.z * 0.15); } // (applied to the eased view itself, below: the target went round, the easing cut the corner)
        this.cam.fov = 50 - 18 * this.zoom;
        if (benchShot) { // its own radio: from in front of the open set, the robot's eye turned to it beyond
          this.zoom = 0; this.cam.pos.set(-1.95, 1.0, 1.4).lerp(this._v.set(-1.62, 0.98, 1.14), ease(clamp01((bt - BENCH.cut) / (BENCH.back - BENCH.cut)))); this.cam.look.set(-1.0, 0.93, 0.78); this.cam.fov = 46; m.spotK = 0.3; m.lampK = 0.5; // (r16: lower and tighter -- the lens and the set, the sign whole, less empty bench; the desk lamp's haze halved) (a slow push in on the set as its song starts)
        } else { m.spotK = 0.42; m.lampK = 0.65 - 0.4 * THREE.MathUtils.smoothstep(-m.dir.x, 0.3, 0.75); } // (at 2-3 m on pale plaster the full lamp burnt its circle white; 0.65 still did) (and the bench lamp, half a metre over the opened radio, burnt its top white whenever the view looked left past it: 0.65, down to 0.25 looking that way, as a camera's exposure would -- 2026-10-26)
        m.beamK = 0.55; // act one's shaft: a trace in the air, not a fog over the shelves
        // a photographer's lens on the close-ups: the thing in the beam sharp, the shelf behind it soft (as if f/2)
        const P = ctx.postfx.params, bench = benchShot && this.benchPos;
        const fd = bench ? this.curPos.distanceTo(this.benchPos) : this.tvShot ? this.curPos.distanceTo(TV_IN) : this.curPos.distanceTo(this._v.copy(eyePos).addScaledVector(m.dir, 2.4));
        P.focus.value += (fd - P.focus.value) * Math.min(1, dt * 3); P.focalRange.value = this.tvShot ? 1.2 : 0.9; P.bokeh.value += ((bench ? 1.4 : this.tvShot ? 2.0 : 2.4 * this.zoom) - P.bokeh.value) * Math.min(1, dt * 2);
        this.lookTime += dt;
        if (this.t > 4 && !this.moved) film.hint(TOUCH ? tr('保持按住，滑动手指', 'Keep holding and slide your finger') : tr('保持按住，移动鼠标', 'Keep holding and move the mouse'));
        // let go in act one and its eye shuts, the shop goes back to now -- with nothing to say why (2026-10-26)
        this.letGo = !input.hold && !(bt > 0 && bt < BENCH.release) ? (this.letGo ?? 0) + dt : 0;
        if (this.moved && this.letGo > 1.5) { film.hint(TOUCH ? tr('按住屏幕，让它睁着眼', 'Hold the screen to keep its eye open') : tr('按住，让它睁着眼', 'Hold to keep its eye open')); this.letGoHint = true; }
        else if (this.letGoHint && input.hold) { film.hint(''); this.letGoHint = false; }
        if (!this.moved && (Math.abs(input.pointer.x) > 0.2 || Math.abs(input.pointer.y) > 0.2)) { this.moved = true; film.hint(''); eye?.aim(null); }
        if (!this.moved && this.t > 9 && bt < 0) { // left alone, it looks at the set in the middle of the shop itself: over its head, the set beyond in focus
          eye?.aim(TV_SHOT.aim); this.cam.pos.copy(TV_SHOT.pos); this.cam.look.copy(TV_SHOT.look); this.cam.fov = TV_SHOT.fov; this.zoom = 0; this.tvShot = true;
        } else this.tvShot = false;
        if (eye && eye.open > 0.2) this.power = Math.max(ACT1_FLOOR, this.power - dt / LOOK_POWER_S);
        // its own radio: after a while it looks at the half-repaired set on its bench; a crackle, and a song comes out of it.
        // Then the song leaves the radio and answers, faint, from across the road behind it (the TV in the electronics
        // shop window); it turns round to it
        if (!this.benchPos) { const r = ctx.api.shop?.placed?.tube_radio_open; this.benchPos = r ? r.getWorldPosition(new THREE.Vector3()).add(this._w.set(0, 0.16, 0)) : new THREE.Vector3(-1.26, 1.0, 0.74); }
        // (2026-10-26, played as a newcomer: its head turned by itself and the view swept away mid-look, and only then
        // the crackle -- now the set crackles first, behind it on the bench, its valves glowing; it turns to the sound)
        if (bt >= BENCH.cue && !this.crackled) { this.crackled = true; audio?.play('tvzap', { pos: this.benchPos }); }
        if (bt > BENCH.aim && bt < BENCH.release) eye?.aim(this.benchPos);
        if (bt > BENCH.release && !this.released) { this.released = true; eye?.aim(null); }
        this.benchTune = bt < BENCH.tune ? 0 : bt < BENCH.fade ? Math.min(1, (bt - BENCH.tune) / 1.2) : Math.max(0, 1 - (bt - BENCH.fade) / 2.5);
        m.benchGlow = bt < 0 ? 0 : bt < BENCH.fade ? Math.min(1, bt / 2.2) : Math.max(0.35, 1 - (bt - BENCH.fade) / 6); // its valves warm up with the crackle and stay warm (past.js)
        if (bt > BENCH.fade) this.tuneCall = Math.min(0.55, (this.tuneCall ?? 0) + dt * 0.3);
        if (this.ending && this.zoom < 0.12) {
          film.hint(''); this.benchTune = 0; this.ending = false;
          // the view it draws back from, and a bend in the path round the robot's right if the view was in front of it
          const S = this.curPos.clone(), ahead = this._v.copy(S).sub(eyePos).dot(m.dir) > -0.2;
          const right = this._d.copy(m.dir).setY(0).normalize().cross(this._w.set(0, 1, 0));
          const ctl = ahead ? eyePos.clone().addScaledVector(right, 1.0).add(this._w.set(0, 0.45, 0)) : S.clone().lerp(DOOR_A, 0.5);
          this.pull0 = { pos: S, ctl, look: this.curLook.clone(), fov: this.cam.fov, spotK: m.spotK ?? 1, beamK: m.beamK ?? 1, lampK: m.lampK ?? 1 };
          this.set('turn');
        }
        m.power = this.power;
        break;
      }
      case 'turn': {
        // the song from across the road (see PULL_S above): it hears it and turns its head to it while the view draws back
        // out of the shop to the doorway; it listens; its light falters, the picture loses lock more and more often and
        // tears; on the tear's peak act two cuts in, the robot already facing the street (the turn itself is not shown:
        // a steel body does not bend -- the user, 2026-10-22: "直接故障特效转场"); the picture settles (street, below)
        m.forceOpen = true; eye?.aim(null);
        m.lookOverride = { x: LISTEN.x, y: LISTEN.y }; m.headK = 1.2; m.tilt = LISTEN.tilt * ease(clamp01((this.t - 2.2) / 0.5)); m.tiltK = 6; // (the head turns during the draw-back; the tilt once the view has settled, done by 2.9 s, then 0.4 s of stillness before its light falters -- Codex transition-7)
        if (!this.pull0 && this.t < 0.05) this.cut = true; // (?phase=turn: straight into the doorway)
        if (this.t >= CUT_S) { // the cut, on the tear's peak: pose, gaze and camera together, this frame
          m.coreK = undefined; m.lampK = undefined; m.tvK = undefined; m.headK = undefined; m.tilt = undefined; m.tiltK = undefined; this.glitchOut = 0; this.glitch = 1; this.pull0 = null;
          ctx.api.shop?.robotTurn?.(1); eye?.snapLook(MATCH.gaze, 0.15); m.lookOverride = { x: MATCH.gaze, y: 0.15 }; Object.assign(m, ACT2_BEAM); eye?.sync?.(time);
          this.gazeHeld = { x: input.pointer.x, y: input.pointer.y }; // (kept on the electronics shop until you move: no swing away from the song)
          this.ptr0 = { ...this.gazeHeld };
          this.glitchBlock = 1; this.glitchDark = 1;
          this.set('street', true); this.cam.pos.copy(MATCH.pos); this.cam.look.copy(MATCH.look); this.cam.fov = MATCH.fov;
          break;
        }
        // the view: drawn back along a curve to the doorway, then a slow creep in while it listens
        const u = this.pull0 ? ease(clamp01(this.t / PULL_S)) : 1, P0 = this.pull0;
        if (P0 && u < 1) {
          const k1 = 1 - u;
          this.cam.pos.copy(P0.pos).multiplyScalar(k1 * k1).addScaledVector(P0.ctl, 2 * u * k1).addScaledVector(DOOR_A, u * u);
          this.cam.look.copy(P0.look).lerp(DOOR_LOOK, u); this.cam.fov = P0.fov + (40 - P0.fov) * u;
        } else {
          this.cam.pos.copy(DOOR_A).lerp(DOOR_B, ease(clamp01((this.t - PULL_S) / (CUT_S - PULL_S)))); this.cam.look.copy(DOOR_LOOK); this.cam.fov = 40;
        }
        // its light: act one's levels eased to the doorway's while the view draws back; from LISTEN_S it sags before each
        // loss of lock -- the first to a tenth for 0.24 s, two short ones -- and dims with the tear
        const L = LISTEN_S, win = (t0, d) => this.t > L + t0 && this.t < L + t0 + d, T0 = CUT_S - TEAR_S;
        const tear = clamp01((this.t - T0) / TEAR_S) ** 1.6;
        const sag = (win(0, 0.24) ? 0.1 : win(0.5, 0.06) || win(0.8, 0.06) ? 0.25 : 1) * (1 - 0.6 * tear);
        const mixK = (a, b) => a + (b - a) * u;
        m.coreK = mixK(1, 0.25) * sag; m.spotK = mixK(P0?.spotK ?? 0.18, 0.18) * sag; m.lampK = mixK(P0?.lampK ?? 0.45, 0.45); m.beamK = mixK(P0?.beamK ?? 0.3, 0.3) * sag; m.tvK = sag; m.robotFillK = mixK(1, 0.15);
        this.glitch = Math.max(win(0.12, 0.04) ? 0.18 : 0, win(0.52, 0.05) ? 0.25 : 0, win(0.82, 0.06) ? 0.3 : 0, tear);
        this.glitchBlock = clamp01((this.t - (CUT_S - 0.06)) / 0.05);
        this.glitchDark = ease(clamp01((this.t - (CUT_S - 0.18)) / 0.18)); // (a dip into the cut, not a flash of black)
        this.interference = clamp01((this.t - L) / (CUT_S - L)) ** 1.5; // the song across the road fills with static (sound.js)
        if (this.t < 0.05) this.glitchSounded = false;
        if (!this.glitchSounded && this.t >= T0) { this.glitchSounded = true; audio?.play('glitch'); } // one sound, as the tear begins (the warnings are silent)
        if (eye && eye.open > 0.2) this.power = Math.max(ACT1_FLOOR, this.power - dt / LOOK_POWER_S);
        this.tuneCall = 0.55 + 0.12 * ease(clamp01(this.t / 1.6)); // (the song swells a little as it turns to it)
        m.power = this.power;
        break;
      }
      case 'street': {
        // act two: behind its head on the lens side, held still: the whole far side fills the opening (the photographs'
        // edges just outside the frame), the head in the near corner, and the beam moves across the street -- the view
        // only leans a little after it
        if (this.glitchOut !== undefined) { // after the cut: the picture settles within GLITCH_OUT2_S (the digital part
          // within 0.08 s, the dip back up in 0.28 s); the matching shot held, then the move to act two's view
          this.glitchOut += dt; const g = this.glitchOut;
          this.glitch = Math.max(0, 1 - g / GLITCH_OUT2_S) ** 1.6; this.glitchBlock = clamp01(1 - g / 0.08); this.glitchDark = clamp01(1 - g / 0.28) ** 1.4; this.interference = Math.max(0, 1 - g / 0.6);
          if (g > MATCH.hold + MATCH.move) this.glitchOut = undefined;
        }
        if (this.gazeHeld && Math.hypot(input.pointer.x - this.gazeHeld.x, input.pointer.y - this.gazeHeld.y) > 0.06) { this.gazeHeld = null; m.lookOverride = undefined; } // you move: the gaze is yours
        const mv = this.glitchOut === undefined ? 1 : ease(clamp01((this.glitchOut - MATCH.hold) / MATCH.move));
        this.cam.pos.copy(MATCH.pos).lerp(ACT2_POS, mv);
        this.cam.look.copy(MATCH.look).lerp(this._w.copy(ACT2_LOOK).lerp(this._v.copy(eyePos).addScaledVector(m.dir, 10), ctx.camera.aspect < 1 ? 0.5 : 0.05), mv); // (a phone held upright sees a narrow slice: the view turns half way after the gaze, or the shops at the ends stay out of frame -- Codex player-3)
        this.cam.fov = MATCH.fov + (ACT2_FOV - MATCH.fov) * mv;
        // the view steps after the gaze (a dolly, not a pan): looking to the ends of the street it moves toward the door
        // and a little across, to see past the jambs that hid most of the noodle shop and half the tailor's from here
        // (2026-10-26). Across, only so far: to the left the set on its cartons stands 0.4 m away (x 0.49 on, z < -1.26
        // -- a ±0.8 m slide put the lens inside it), to the right the bench (x < -0.88)
        const b = THREE.MathUtils.clamp(Math.atan2(m.dir.x, m.dir.z) / 0.6, -1, 1) * mv; // + toward the noodle shop (the screen's left)
        this.side = (this.side ?? 0) + ((b > 0 ? -0.45 : -0.25) * b - (this.side ?? 0)) * Math.min(1, dt * 0.8);
        this.fwd = (this.fwd ?? 0) + (0.8 * Math.abs(b) - (this.fwd ?? 0)) * Math.min(1, dt * 0.8);
        this.cam.pos.x += this.side; this.cam.look.x += this.side; this.cam.pos.z += this.fwd; this.cam.look.z += this.fwd;
        // resting on a shop, the view leans in to it -- tighter and turned toward it -- so the people at its door can be
        // seen (Codex player-4: act two read as "light five shops", not as a street worth stopping in)
        const rest = this.lastOn && this.dwell[this.lastOn.key] > 1.0 ? this.lastOn : null;
        if (rest) this.restPos = rest.pos;
        this.restK = (this.restK ?? 0) + ((rest ? 1 : 0) - (this.restK ?? 0)) * Math.min(1, dt * (rest ? 0.7 : 1.5));
        if (this.restPos && this.restK > 0.001) { this.cam.look.lerp(this.restPos, 0.35 * this.restK * mv); this.cam.fov -= 12 * this.restK * mv; }
        this.streetTime += dt; this.tuneCall = Math.max(0, (this.tuneCall ?? 0) - dt * 0.25);
        Object.assign(m, ACT2_BEAM);
        const settled = this.t > MATCH.hold + MATCH.move + 0.4;
        const movedFrom = this.ptr0 ? Math.hypot(input.pointer.x - this.ptr0.x, input.pointer.y - this.ptr0.y) > 0.06 : Math.abs(input.pointer.x) > 0.25 || Math.abs(input.pointer.y) > 0.25; // (a move since the cut, wherever the pointer was)
        if (!this.moved2 && movedFrom) this.moved2 = true; // (latched the first time: a move and back again does not bring the hint)
        // act one taught "hold to keep its eye open"; here it keeps it open itself -- said once, or a player holds on for
        // nothing (Codex player-4). A finger still steers, so on a touch screen only the move hint
        if (settled && !TOUCH && input.hold && this.letGoT === undefined) this.letGoT = this.t;
        const letGo = this.letGoT !== undefined && this.t - this.letGoT < 4.5 && input.hold;
        const hint2 = letGo ? tr('可以松开了，移动鼠标带它看看街对面', 'You can let go now; move the mouse to show it the street') : settled && !this.moved2 ? (TOUCH ? tr('滑动手指，让它看看街对面', 'Slide your finger to let it look across the street') : tr('移动鼠标，让它看看街对面', 'Move the mouse to let it look across the street')) : '';
        if (hint2 !== this.hint2) { this.hint2 = hint2; film.hint(hint2); }
        // the power failing: now and then the past drops out for a moment
        if (this.power < 0.35 && (this.dipT = (this.dipT ?? 2) - dt) < 0) { this.dipT = 2.5 + Math.random() * 3.5; this.dip = 0.14; audio?.play('click'); }
        if (eye && eye.open > 0.2) this.power = Math.max(0, this.power - dt / STREET_POWER_S);
        // the shops across the road: a beam that rests on one brings its sound back (once each)
        let on = null;
        for (const s of SPOTS) {
          const c = this._v.copy(s.pos).sub(m.origin).normalize().dot(m.dir), hit = m.strength > 0.5 && c > Math.cos(0.17);
          this.dwell[s.key] = hit ? (this.dwell[s.key] ?? 0) + dt : 0;
          if (hit) on = s;
          if (this.dwell[s.key] > 0.5 && !this.seen.has(s.key)) { this.seen.add(s.key); this.sinceSeen = 0; (this.foundAt ??= {})[s.key] = this.t; (this.heard ??= {})[s.key] = this.t; audio?.play(s.sound, { pos: s.pos }); }
          else if (hit && this.seen.has(s.key) && this.dwell[s.key] > 2 && this.t - ((this.heard ??= {})[s.key] ?? -99) > 8) { this.heard[s.key] = this.t; audio?.play(s.sound, { pos: s.pos, gain: 0.55 }); } // (stay with a shop found and now and then it answers, softly)
        }
        this.sinceSeen += dt; this.lastOn = on;
        // nothing found for a while: one of the shops not yet seen calls from its side of the street (a bell)
        if (!(on && !this.seen.has(on.key)) && this.sinceSeen > 6 && (this.callT = (this.callT ?? 5) - dt) < 0) { // (resting on a shop already found does not silence the others -- Codex player-3)
          const unseen = SPOTS.filter((x) => !this.seen.has(x.key)), s = unseen[(this.calls = (this.calls ?? -1) + 1) % Math.max(1, unseen.length)]; this.callT = 7; // (in turn: the first unseen one called every time)
          if (s) { audio?.play(s.sound, { pos: s.pos }); this.callFlash = { key: s.key, t0: this.t }; } // the shop itself calls, from its side of the street, its sign flickering like a tube that will not quite start
        }
        // enough: all five shops (and a moment with the last); or three, half a minute on the street and nothing new for a
        // while; or the power nearly gone -- then one last look (2026-10-26: three shops and 5 s ended it after 11 s)
        const enough = this.seen.size >= SPOTS.length ? this.sinceSeen > 3.5 : this.seen.size >= 3 && this.streetTime > 30 && this.sinceSeen > 6;
        if (enough || this.power < 0.14 || this.streetTime > 70 || input.wasPressed('KeyD')) { film.hint(''); this.set('last'); }
        this.dip = Math.max(0, (this.dip ?? 0) - dt);
        m.power = this.dip > 0 ? 0.05 : this.power;
        m.pastK = on ? 0.2 : 0.07; // a shop come back throws its evening light in at the door (atmo.js: x the beam's strength)
        break;
      }
      case 'last': {
        // its last look: it turns back to the electronics shop where the song comes from; with what is left, the whole
        // street lights up as it was, and we stay with it, pushing slowly in toward the people at that shop's window;
        // then it cannot hold it any more. (Its face cut in here for two seconds -- judges r4-r5: from behind, "a dark back
        // of a head". Codex player-4: it broke the street just come back, and the end's close-up on its face, the iris
        // closing, says it better: taken out)
        if (this.t < 0.05) this.cut = true; // (from the exploring view behind it: a cut to its side)
        const push = ease(clamp01((this.t - 4.6) / 7.6));
        this.cam.pos.copy(SIDE.pos); this.cam.look.copy(SIDE.look).lerp(SPOTS.find((x) => x.key === 'tv').pos, 0.15 * push); this.cam.fov = SIDE.fov - 2 * ease(clamp01((this.t - 2.6) / 2)) - 3.5 * push;
        m.forceOpen = true; Object.assign(m, ACT2_BEAM, { coreK: undefined, roomK: undefined, pastX: undefined, pastAngle: undefined }, SIDE.beam);
        eye?.aim(SPOTS.find((x) => x.key === 'tv').pos);
        m.memWide = 1 + 3.2 * ease(clamp01((this.t - 2.6) / 2.0)); // the shop alone a moment (the song), then the whole street
        this.power = Math.max(0.03, this.power - dt * 0.03);
        m.power = Math.max(0.34, this.power); // (the whole street at full strength, whatever act two left: from 0.2 it lit at 0.6. No stutter at its end any more: dark there, it lit again as the fade began -- "the power came back", Codex player-2)
        m.pastK = 0.4 + 0.6 * ease(clamp01((this.t - 2.6) / 2.0)); // the whole street's evening floods in over it
        if (this.t > 12.2) this.set('fade');
        break;
      }
      case 'fade': {
        // the last of the power: the beam stutters and dies, the street goes back to what it is now and the song stops
        // mid-phrase (sound.js, 2.3 s); the shops it found stay a moment longer and go out one by one (below); then its
        // face as the iris closes for the last time, the dusk from the street on it. Its power here runs on its own clock
        // (2026-10-26: from what act two had left, 0.06, the whole street went at once)
        m.holdGaze = true;
        this.power = Math.max(0, this.power - dt / 3);
        // (its face from 5.5 s: the light flickers once more and the iris closes there -- 6.2 to ~7 s -- not before the cut:
        // the shot opened on a lens already dark, Codex player-2)
        // (the stutter is in its light, not its iris: the iris stays open till the face shot and closes there)
        const flick = Math.random() < 0.3 ? 0.15 : 1;
        m.power = this.t < 2.8 ? 0.34 * (1 - 0.7 * this.t / 2.8) * (this.t > 2.2 ? flick : 1) : this.t < 5.5 ? 0.02 : 0.22 * (1 - clamp01((this.t - 5.5) / 1.4)) * flick;
        m.forceOpen = this.t < 6.2;
        if (this.t > 5.3) atmo?.set('out');
        m.memWide = this.t < 2.8 ? 4.2 : 1;
        m.pastK = this.t < 2.8 ? 1 : 0; // (with the power: atmo.js)
        if (this.t < 5.5) { // (to 5.5: the shops it remembered stay a moment and go out one by one -- below -- then its face)
          this.cam.pos.copy(SIDE.pos); this.cam.look.copy(SIDE.look); this.cam.fov = SIDE.fov - 2;
        } else {
          if (!this.faced) { this.faced = true; this.cut = true; }
          this.cam.pos.copy(EYE0).addScaledVector(FACING, 0.78).addScaledVector(LEFT, 0.18).add(this._w.set(0, 0.03, 0));
          this.cam.look.copy(EYE0).add(this._w.set(0, 0.02, 0)); this.cam.fov = 34;
        }
        if (this.t > 9.2) this.set('end');
        break;
      }
      case 'end': {
        // from inside, behind it: it still faces the street, dark against it; the lamp across the road comes on over the
        // rubble; a digger somewhere; black; the card
        m.forceOpen = false; m.holdGaze = true; m.headLift = 1; m.pastK = 0; m.duskK = undefined; m.doorK = 0; m.glowK = 0; m.robotFillK = undefined; m.lampK = undefined;
        const u = ease(clamp01(this.t / 12));
        // from inside, to its left: its side against the doorway, the night sky's cold edge on its arm and chest, the dark
        // street beyond with the one lamp (r4-r8: from behind, in the dark, it was a black box); pushing in slowly
        this.cam.pos.copy(SIDE.pos).lerp(this._w.set(0.922, 0.92, -0.3), u); this.cam.look.copy(SIDE.look); this.cam.fov = SIDE.fov - 2 * u;
        if (this.t < 0.05) this.cut = true;
        film.fade(Math.min(1, Math.max(0, (this.t - 5) / 2.5))); // (Codex player-1: the dark street held long after the farewell -- 7 + 3 s -> 5 + 2.5 s)
        if (this.t > 9.5) film.endCard(); // (two seconds of silence first: sound.js)
        if (this.t > 13.5) film.replayHint(); // (4 s after the card: 9.5 s later was long enough to leave -- Codex player-2) // (ten seconds after the card: at thirty the screen sat dark and still for long enough to wonder)
        if (this.t > 11 && (input.wasPressed('Pointer') || input.wasPressed('Space'))) location.reload();
        break;
      }
    }
    // the shops it found in act two keep their evening (index.js REM_SHOPS): coming up over a second or two when found,
    // breathing a little, down with the beam when the power dips, held through the last look; when the light dies they go
    // out one by one from the far ends in, the electronics shop last, each with a flicker and a switch's click
    const rk = ctx.api.shop?.remK;
    if (rk) {
      this.rem ??= SPOTS.map(() => 0); this.outDone ??= new Set();
      let sum = 0;
      SPOTS.forEach((s, i) => {
        const lit = this.seen.has(s.key) && (this.phase === 'street' || this.phase === 'last' || this.phase === 'fade');
        let want = lit ? 1 : 0, flick = 1;
        if (this.phase === 'fade' && lit) {
          const out = 3.0 + OUT_ORDER[s.key] * 0.45; // (Codex player-1: the farewell was quicker than the empty end after it)
          if (this.t > out) { want = 0; if (!this.outDone.has(s.key)) { this.outDone.add(s.key); audio?.play('lampoff', { pos: s.pos }); } } else if (this.t > out - 0.28) flick = Math.random() < 0.5 ? 1 : 0.15;
        }
        this.rem[i] += (want - this.rem[i]) * Math.min(1, dt * (want > this.rem[i] ? 2.5 : 14));
        const pk = this.phase === 'street' && this.foundAt?.[s.key] !== undefined ? Math.max(0, 1 - (this.t - this.foundAt[s.key]) / 1.4) : 0; // (found: a flash that settles into its kept light)
        const ft = this.phase === 'street' && this.callFlash?.key === s.key && !this.seen.has(s.key) ? this.t - this.callFlash.t0 : -1; // (a shop calling: its sign flickers three times, then glows and fades)
        const ck = ctx.api.shop?.callK; if (ck) ck[i].value = ft < 0 || ft > 1.6 ? 0 : ft < 0.08 || (ft > 0.2 && ft < 0.32) ? 0.9 : ft > 0.5 ? 0.9 * (1 - (ft - 0.5) / 1.1) : 0;
        rk[i].value = this.rem[i] * (0.9 + 0.1 * Math.sin(time * 1.1 + i * 1.7)) * (this.phase === 'street' && this.dip > 0 ? 0.25 : 1) * flick + 0.45 * pk * pk;
        sum += this.rem[i];
      });
      this.remembered = sum / SPOTS.length; // (sound.js: the past street's murmur stays with them)
    }
    if (this.phase !== 'turn' && this.glitchOut === undefined) this.glitch = this.glitchBlock = this.glitchDark = this.interference = 0;
    const PP = ctx.postfx?.params; if (PP?.glitch) { PP.glitch.value = this.glitch ?? 0; PP.glitchBlock.value = this.glitchBlock ?? 0; PP.glitchDark.value = this.glitchDark ?? 0; }
    film.power(this.power, this.phase === 'look' || this.phase === 'turn' || this.phase === 'street' || this.phase === 'last');
    if (this.phase !== 'look' && ctx.postfx.params.bokeh.value > 0) ctx.postfx.params.bokeh.value = Math.max(0, ctx.postfx.params.bokeh.value - dt * 3); // depth of field only on act one's close-ups
    // a soft key on its face while we are in front of it: in the shop from the bench side (from the camera's side while
    // we come in: the chest and legs read too); facing the street, from the street
    const fl = ctx.api.shop?.faceLight; if (fl) {
      const inShop = this.phase === 'arrive' || this.phase === 'wait' || this.phase === 'waking' || this.phase === 'title';
      if (inShop) { fl.position.set(...(this.phase === 'arrive' ? [0.45, 1.25, 0.25] : [-1.35, 1.05, 0.62])); fl.target.position.set(-0.6, this.phase === 'arrive' ? 0.6 : 0.8, 0.98); }
      else if (this.phase === 'end') { fl.position.set(1.122, 1.7, 2.8); fl.target.position.set(-0.378, 0.85, 1.45); fl.distance = 6; } // the night sky at the door's left edge: grazing the side of it we see from behind (its range was 3 m: from outside it reached nothing) // the end: the street lamp's cold edge on its head, shoulder and arm, from outside right (r7: a black lump)
      else if (this.phase === 'street' && this.glitchOut !== undefined) { // the matching shot: the lit shop's warmth on the lens barrel's near
        // edge (round 3), then with the camera's own blend to its act-two place (round 4: the place, aim and cone jumped)
        const u = ease(clamp01((this.glitchOut - MATCH.hold) / MATCH.move));
        fl.position.set(-0.482, 1.031, 1.844).lerp(this._w.set(0.472, 1.25, 2.75), u); fl.target.position.copy(EYE0).add(this._w.set(0, -0.12 * u, 0));
      }
      else { fl.position.set(0.472, 1.25, 2.75); fl.target.position.copy(EYE0).add(this._w.set(0, -0.12, 0)); }
      fl.target.updateMatrixWorld(); fl.angle = this.phase === 'arrive' ? 0.7 : this.phase === 'turn' ? 0.9 : this.phase === 'street' && this.glitchOut !== undefined ? 0.5 + (0.28 - 0.5) * ease(clamp01((this.glitchOut - MATCH.hold) / MATCH.move)) : this.phase === 'street' || this.phase === 'last' ? 0.28 : 0.6;
      fl.color.set(this.phase === 'end' ? 0xc9d6ff : 0xffe2c0); if (this.phase !== 'end') fl.distance = 3;
      const want = this.phase === 'end' ? 4.5 * clamp01((this.t - 2) / 3) : this.phase === 'wait' ? 2.6 : this.phase === 'waking' ? 2.0 : this.phase === 'fade' ? 1.4 : this.phase === 'arrive' ? 3.2 * clamp01((this.t - 9.4) / 2.6) : this.phase === 'turn' ? 0 : this.phase === 'street' && this.glitchOut !== undefined ? 3.95 + (1.6 - 3.95) * ease(clamp01((this.glitchOut - MATCH.hold) / MATCH.move)) : this.phase === 'street' || this.phase === 'last' ? 1.6 : 0;
      // (the doorway shot: off -- it is aimed where the head will be after the cut, and before the cut nothing is there;
      // it comes on with the cut)
      fl.intensity = this.cut && this.phase === 'street' ? want : fl.intensity + (want - fl.intensity) * Math.min(1, dt * 1.5);
    }

    // the camera eases toward its target, a little handheld drift on top
    const k = this.phase === 'waking' ? 3 : this.phase === 'look' ? 2.2 : this.phase === 'turn' ? 6 : 1.4; // (the turn's path is eased itself: follow it closely)
    const snap = this.cut; // (a cut is a cut for the lens too: no zoom easing across it)
    if (this.cut) { this.curPos.copy(this.cam.pos); this.curLook.copy(this.cam.look); this.cut = false; }
    this.curPos.lerp(this.cam.pos, Math.min(1, dt * k));
    if (this.phase === 'look' && this.headKeep && !this.benchShotOn) { // act one: never within 55 cm of its head, a little above it when near
      const H = this.headKeep, dx = this.curPos.x - H.x, dz = this.curPos.z - H.z, dh = Math.hypot(dx, dz);
      if (dh < 0.55) { const s = 0.55 / Math.max(dh, 1e-3); this.curPos.x = H.x + dx * s; this.curPos.z = H.z + dz * s; }
      this.curPos.y = Math.max(this.curPos.y, H.y + 0.45 * THREE.MathUtils.smoothstep(0.8 - dh, 0, 0.3));
    }
    this.curLook.lerp(this.cam.look, Math.min(1, dt * k * 1.2));
    const cam = ctx.camera;
    cam.position.copy(this.curPos);
    cam.position.x += Math.sin(time * 0.37) * 0.006; cam.position.y += Math.sin(time * 0.53) * 0.004;
    if (this.shake > 0) { this.shake -= dt; const a = Math.max(0, this.shake) * 0.012; cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; }
    cam.lookAt(this.curLook);
    // portrait screens (phones held upright) see a narrow slice: widen the vertical angle so the same things stay in frame
    const want = Math.min(78, this.cam.fov * (cam.aspect < 1 ? Math.min(1.6, 1 / Math.sqrt(cam.aspect)) : 1));
    if (Math.abs(cam.fov - want) > 0.01) { cam.fov += snap ? want - cam.fov : (want - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
  },
};
