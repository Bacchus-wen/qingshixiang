import * as THREE from 'three/webgpu';
import { Fn, positionGeometry, normalGeometry, normalLocal, uniform, vec3, vec4, float, smoothstep, max, vec2, normalize, sin, cos, mix } from 'three/tsl';

// A soft neck for the generated robot. The Tripo model is one mesh (head, body, stool fused), so the head is turned in
// the vertex shader by a weight that is 1 in the radio-box head, 0 in the body and shoulders, and ramps through the neck
// and the cables around it (a skinning weight computed from position instead of painted). Each vertex is rotated by its
// weight's share of the head's angles -- a twist about the neck, not a blend of two positions: a blend shrinks and smears
// the neck at large turns (the candy-wrapper collapse), a twist keeps every vertex at its distance from the pivot.
// Nothing is cut, so no seam can open; the cables wind round the neck as the head turns.
// Measured on the source mesh with tools/robot-rig-probe.mjs (model space of the placed robot: height 1.05 m, origin at
// the bottom centre, facing +z, x = the robot's left).
const NECK = new THREE.Vector3(0.0, 0.762, 0.02);                  // the neck socket under the head box: the pivot
const HB = { a: 0.788, bx: -0.232, bz: -0.26 };                    // underside of the (bowed, tilted) head box: y = a + bx x + bz z
export const EYE_LOCAL = new THREE.Vector3(0.1112, 0.8306, 0.1937); // centre of the camera-lens eye
export const EYE_DIR_LOCAL = new THREE.Vector3(0.305, -0.276, 0.912).normalize(); // its optical axis (bowed rest pose)

// The body on its stool (2026-10-21). The stool is its own mesh now (tools/blender/robot_split.py); the robot turns on it
// the way a person does, with three more weights from position, applied after the neck's twist:
//  - the waist: everything above the pelvis turns about the spine, fully from the chest up (a lead of the shoulders),
//    nothing below the hips -- the hands resting on the knees stay with the legs;
//  - the feet: each boot lifts, the spring shins taking it (left and right apart);
//  - the body: all of the robot round the stool's own vertical axis -- so it shifts on the seat as it comes round, and
//    its legs pass outside the stool's legs (round its own hips the shins would sweep through them).
export const STOOL_AXIS = new THREE.Vector3(-0.0976, 0, -0.129);   // centre of the seat (model x, z)
const SPINE = new THREE.Vector3(0.0, 0, -0.05);                     // the torso's vertical axis
const WAIST = [0.43, 0.58];                                         // twist weight 0 at the hips -> 1 from the chest up
const SHIN = [0.24, 0.10];                                          // lift weight 0 above the springs -> 1 in the boots
const SIDE = [-0.005, 0.055];                                       // right boot (x < 0) -> left boot (x > 0.1)

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _t = new THREE.Matrix4(), _r = new THREE.Matrix4(), _b = new THREE.Matrix4();

export class HeadRig {
  constructor() {
    this.yaw = 0; this.pitch = 0; this.roll = 0;   // radians; yaw about the neck's vertical axis, pitch > 0 lifts the face
    this.body = 0; this.waist = 0; this.liftL = 0; this.liftR = 0; // radians about the stool's axis / the spine; metres
    this.mat = uniform(new THREE.Matrix4());      // model space: body x waist x T(neck) R T(-neck) (the whole head: the eye, the lens)
    this.rot = uniform(new THREE.Matrix4());      // rotation only
    this.ang = uniform(new THREE.Vector3());      // (yaw, -pitch, roll) for the per-vertex twist
    this.bw = uniform(new THREE.Vector2());       // (body, waist) angles
    this.lift = uniform(new THREE.Vector2());     // (left, right) boot lift
    this.update();
  }
  update() {
    _e.set(-this.pitch, this.yaw, this.roll); _q.setFromEuler(_e); this.ang.value.set(this.yaw, -this.pitch, this.roll);
    this.bw.value.set(this.body, this.waist); this.lift.value.set(this.liftL, this.liftR);
    // the head: T(neck) R T(-neck); then the waist about the spine; then the body about the stool's axis (the head is
    // above the waist's ramp and above the shins: it takes both turns whole and no lift)
    _r.makeRotationFromQuaternion(_q);
    this.mat.value.makeTranslation(NECK.x, NECK.y, NECK.z).multiply(_r).multiply(_t.makeTranslation(-NECK.x, -NECK.y, -NECK.z));
    this.mat.value.premultiply(_b.makeTranslation(-SPINE.x, 0, -SPINE.z)).premultiply(_t.makeRotationY(this.waist)).premultiply(_b.makeTranslation(SPINE.x, 0, SPINE.z));
    this.mat.value.premultiply(_b.makeTranslation(-STOOL_AXIS.x, 0, -STOOL_AXIS.z)).premultiply(_t.makeRotationY(this.body)).premultiply(_b.makeTranslation(STOOL_AXIS.x, 0, STOOL_AXIS.z));
    this.rot.value.makeRotationY(this.body + this.waist).multiply(_r);
  }
  // nodes for one mesh of one level. Q maps the mesh's own vertex space (quantised: offset + uniform scale) to the
  // robot's model space. position: the material's positionNode (also used by the shadow passes); model: the rest-pose
  // model-space position, for masks in the fragment stage (the eye glow)
  nodes(Q) {
    const q = uniform(Q.clone()), qi = uniform(Q.clone().invert());
    const { ang, bw, lift } = this, neck = vec3(NECK.x, NECK.y, NECK.z);
    const spine = vec3(SPINE.x, 0, SPINE.z), axis = vec3(STOOL_AXIS.x, 0, STOOL_AXIS.z);
    const position = Fn(() => {
      const pm = q.mul(vec4(positionGeometry, 1)).xyz;
      const w = headWeight(pm);
      let p = twist(pm.sub(neck), w, ang).add(neck), n = twist(normalGeometry, w, ang); // directions are the same in both spaces (no rotation in Q)
      const ww = smoothstep(WAIST[0], WAIST[1], pm.y).mul(bw.y);                       // the waist
      p = rotY(p.sub(spine), ww).add(spine); n = rotY(n, ww);
      const up = smoothstep(SHIN[0], SHIN[1], pm.y).mul(mix(lift.y, lift.x, smoothstep(SIDE[0], SIDE[1], pm.x))); // the boots
      p = p.add(vec3(0, up, 0));
      p = rotY(p.sub(axis), bw.x).add(axis); n = rotY(n, bw.x);                        // the body, round the stool
      normalLocal.assign(normalize(n));
      return qi.mul(vec4(p, 1)).xyz;
    })();
    return { position, model: q.mul(vec4(positionGeometry, 1)).xyz };
  }
  // the eye in world space for a placed robot (object: its LodObject, whose local frame is the model space)
  eye(object, outPos, outDir) {
    outPos.copy(EYE_LOCAL).applyMatrix4(this.mat.value).applyMatrix4(object.matrixWorld);
    outDir.copy(EYE_DIR_LOCAL).applyMatrix4(this.rot.value).transformDirection(object.matrixWorld);
    return outPos;
  }
}

// R = Ry(yaw) Rx(-pitch) Rz(roll) (THREE.Euler 'YXZ', as in update()), each angle scaled by the weight w
const rotY = (v, a) => { const c = cos(a), s = sin(a); return vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.z.mul(c).sub(v.x.mul(s))); };
const rotX = (v, a) => { const c = cos(a), s = sin(a); return vec3(v.x, v.y.mul(c).sub(v.z.mul(s)), v.y.mul(s).add(v.z.mul(c))); };
const rotZ = (v, a) => { const c = cos(a), s = sin(a); return vec3(v.x.mul(c).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(c)), v.z); };
const twist = (v, w, ang) => rotY(rotX(rotZ(v, ang.z.mul(w)), ang.y.mul(w)), ang.x.mul(w));

// 1 in the head (the whole box, its underside too: the box turns rigid), 0 in the body; the neck and the cables near it
// (within ~12 cm of the neck axis, up to 7 cm under the head box) twist part of the way, so they wind instead of tearing
function headWeight(p) {
  const d = p.y.sub(float(HB.a).add(p.x.mul(HB.bx)).add(p.z.mul(HB.bz)));
  const r = vec2(p.x.sub(NECK.x), p.z.sub(NECK.z)).length();
  const head = smoothstep(-0.016, -0.005, d);
  const neck = smoothstep(-0.07, 0.0, d).mul(float(1).sub(smoothstep(0.07, 0.125, r)));
  return max(head, neck);
}

// The turn on the stool, as a function of progress k (0 facing its bench .. 1 facing the street, half a turn): three
// shuffles round the stool's axis -- 60, 65 and 55 degrees, a short rest between -- each lifting the left boot and then
// the right as the hips come round; the shoulders lead the hips through the turn and square up at the end. (The head's
// own lead is the eye's: the story turns the gaze first.) Shared by the story and the review shot.
const SHUFFLES = [[0, 0.26, -Math.PI / 3], [0.33, 0.6, -Math.PI * (125 / 180)], [0.67, 0.94, -Math.PI]];
const ease = (x) => x * x * (3 - 2 * x);
const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));
export function turnPose(rig, k) {
  k = Math.min(1, Math.max(0, k));
  let body = 0, from = 0, liftL = 0, liftR = 0;
  for (const [a, b, to] of SHUFFLES) {
    if (k >= b) { body = from = to; continue; }
    if (k > a) { const u = (k - a) / (b - a); body = from + (to - from) * ease(u); liftL = 0.045 * bump(u / 0.7); liftR = 0.04 * bump((u - 0.3) / 0.7); }
    break;
  }
  rig.body = body; rig.liftL = liftL; rig.liftR = liftR;
  rig.waist = -0.24 * bump(Math.min(1, k / 0.94));
}
