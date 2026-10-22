import * as THREE from 'three/webgpu';
import { Fn, positionGeometry, normalGeometry, normalLocal, uniform, vec3, vec4, float, smoothstep, max, vec2, normalize, sin, cos } from 'three/tsl';

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

// The body on its stool (2026-10-21): the stool is its own mesh now (tools/blender/robot_split.py) and stays put; for act
// two the whole robot is turned half round about the stool's own vertical axis -- a rigid turn, nothing bends (the
// turn is not shown: act one ends on a glitch of its picture, story.js). (Waist, lean and spring-shin weights were tried
// for an animated turn and taken out again 2026-10-22: weights blended from position stretch a steel body like rubber.)
export const STOOL_AXIS = new THREE.Vector3(-0.0976, 0, -0.129);   // centre of the seat (model x, z)

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _t = new THREE.Matrix4(), _r = new THREE.Matrix4(), _b = new THREE.Matrix4();

export class HeadRig {
  constructor() {
    this.yaw = 0; this.pitch = 0; this.roll = 0;   // radians; yaw about the neck's vertical axis, pitch > 0 lifts the face
    this.body = 0;                                // radians about the stool's axis (the whole robot, rigid)
    this.mat = uniform(new THREE.Matrix4());      // model space: body x T(neck) R T(-neck) (the whole head: the eye, the lens)
    this.rot = uniform(new THREE.Matrix4());      // rotation only
    this.ang = uniform(new THREE.Vector3());      // (yaw, -pitch, roll) for the per-vertex twist
    this.bodyAng = uniform(0);
    this.update();
  }
  update() {
    _e.set(-this.pitch, this.yaw, this.roll); _q.setFromEuler(_e); this.ang.value.set(this.yaw, -this.pitch, this.roll);
    this.bodyAng.value = this.body;
    // the head: T(neck) R T(-neck); then the whole robot about the stool's axis
    _r.makeRotationFromQuaternion(_q);
    this.mat.value.makeTranslation(NECK.x, NECK.y, NECK.z).multiply(_r).multiply(_t.makeTranslation(-NECK.x, -NECK.y, -NECK.z));
    this.mat.value.premultiply(_b.makeTranslation(-STOOL_AXIS.x, 0, -STOOL_AXIS.z)).premultiply(_t.makeRotationY(this.body)).premultiply(_b.makeTranslation(STOOL_AXIS.x, 0, STOOL_AXIS.z));
    this.rot.value.makeRotationY(this.body).multiply(_r);
  }
  // nodes for one mesh of one level. Q maps the mesh's own vertex space (quantised: offset + uniform scale) to the
  // robot's model space. position: the material's positionNode (also used by the shadow passes); model: the rest-pose
  // model-space position, for masks in the fragment stage (the eye glow)
  nodes(Q) {
    const q = uniform(Q.clone()), qi = uniform(Q.clone().invert());
    const { ang, bodyAng } = this, neck = vec3(NECK.x, NECK.y, NECK.z), axis = vec3(STOOL_AXIS.x, 0, STOOL_AXIS.z);
    const position = Fn(() => {
      const pm = q.mul(vec4(positionGeometry, 1)).xyz;
      const w = headWeight(pm);
      let p = twist(pm.sub(neck), w, ang).add(neck), n = twist(normalGeometry, w, ang); // directions are the same in both spaces (no rotation in Q)
      p = rotY(p.sub(axis), bodyAng).add(axis); n = rotY(n, bodyAng);                  // the whole robot, round the stool
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
