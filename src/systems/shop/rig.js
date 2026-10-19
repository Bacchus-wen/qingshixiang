import * as THREE from 'three/webgpu';
import { Fn, positionGeometry, normalGeometry, normalLocal, uniform, vec4, float, smoothstep, max, vec2, mix, normalize } from 'three/tsl';

// A soft neck for the generated robot. The Tripo model is one mesh (head, body, stool fused), so the head is turned in
// the vertex shader: every vertex is blended between its rest position and the head transform by a weight that is 1 in
// the radio-box head, 0 in the body and shoulders, and ramps smoothly through the neck and the cables around it (a
// skinning weight computed from position instead of painted). Nothing is cut, so no seam can open; the cables flex.
// Measured on the source mesh with tools/robot-rig-probe.mjs (model space of the placed robot: height 1.05 m, origin at
// the bottom centre, facing +z, x = the robot's left).
const NECK = new THREE.Vector3(0.0, 0.762, 0.02);                  // the neck socket under the head box: the pivot
const HB = { a: 0.788, bx: -0.232, bz: -0.26 };                    // underside of the (bowed, tilted) head box: y = a + bx x + bz z
export const EYE_LOCAL = new THREE.Vector3(0.1112, 0.8306, 0.1937); // centre of the camera-lens eye
export const EYE_DIR_LOCAL = new THREE.Vector3(0.305, -0.276, 0.912).normalize(); // its optical axis (bowed rest pose)

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _t = new THREE.Matrix4(), _r = new THREE.Matrix4();

export class HeadRig {
  constructor() {
    this.yaw = 0; this.pitch = 0; this.roll = 0;   // radians; yaw about the neck's vertical axis, pitch > 0 lifts the face
    this.mat = uniform(new THREE.Matrix4());      // model space: T(neck) R T(-neck)
    this.rot = uniform(new THREE.Matrix4());      // rotation only, for normals
    this.update();
  }
  update() {
    _e.set(-this.pitch, this.yaw, this.roll); _q.setFromEuler(_e);
    this.rot.value.makeRotationFromQuaternion(_q);
    this.mat.value.makeTranslation(NECK.x, NECK.y, NECK.z).multiply(_r.copy(this.rot.value)).multiply(_t.makeTranslation(-NECK.x, -NECK.y, -NECK.z));
  }
  // nodes for one mesh of one level. Q maps the mesh's own vertex space (quantised: offset + uniform scale) to the
  // robot's model space. position: the material's positionNode (also used by the shadow passes); model: the rest-pose
  // model-space position, for masks in the fragment stage (the eye glow)
  nodes(Q) {
    const q = uniform(Q.clone()), qi = uniform(Q.clone().invert());
    const { mat, rot } = this;
    const position = Fn(() => {
      const pm = q.mul(vec4(positionGeometry, 1)).xyz;
      const w = headWeight(pm);
      const moved = mix(pm, mat.mul(vec4(pm, 1)).xyz, w);
      const n = normalGeometry; // directions are the same in both spaces (no rotation in Q)
      normalLocal.assign(normalize(mix(n, rot.mul(vec4(n, 0)).xyz, w)));
      return qi.mul(vec4(moved, 1)).xyz;
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

// 1 in the head, 0 in the body; the neck and the cables near it (within ~12 cm of the neck axis, up to 7 cm under the
// head box) blend, so they bend and twist with the head instead of tearing
function headWeight(p) {
  const d = p.y.sub(float(HB.a).add(p.x.mul(HB.bx)).add(p.z.mul(HB.bz)));
  const r = vec2(p.x.sub(NECK.x), p.z.sub(NECK.z)).length();
  const head = smoothstep(-0.004, 0.006, d);
  const neck = smoothstep(-0.07, 0.0, d).mul(float(1).sub(smoothstep(0.07, 0.125, r)));
  return max(head, neck);
}
