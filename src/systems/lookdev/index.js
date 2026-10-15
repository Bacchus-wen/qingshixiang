import { vec3, vec2, Fn, texture3D, screenCoordinate, uniform, fract, interleavedGradientNoise, time } from 'three/tsl';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

// Look-dev bench for the "silver present / one-colour memory" direction:
// achromatic wet street + volumetric fog + one flickering cold lamp + the eye as a coloured projector spot.
function noise3D(THREE, size = 64) {
  const data = new Uint8Array(size ** 3);
  const perlin = new ImprovedNoise();
  let i = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    data[i++] = 128 + 128 * perlin.noise((x / size) * 8, (y / size) * 8, (z / size) * 8);
  }
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RedFormat; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

// Placeholder memory image: warm silhouettes of a lit shopfront (replaced later by a live render target).
function memoryTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, '#f2c48a'); grd.addColorStop(0.7, '#c9854a'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(20,10,5,0.75)';
  for (let k = 0; k < 7; k++) { const x = 30 + k * 32; g.fillRect(x, 150 - (k % 3) * 8, 10, 70); g.beginPath(); g.arc(x + 5, 140 - (k % 3) * 8, 8, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(255,230,180,0.9)'; g.fillRect(40, 60, 176, 18);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  name: 'lookdev',
  async init(ctx) {
    const { THREE, scene, postfx } = ctx;
    scene.background = new THREE.Color(0x020203);
    const grey = (v, r = 0.85) => new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(v, v, v), roughness: r });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), grey(0.08, 0.18));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    // two rows of blocky facades with recessed shopfront voids
    for (const side of [-1, 1]) {
      for (let k = 0; k < 7; k++) {
        const h = 6 + ((k * 37) % 5) * 2.2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, h, 6), grey(0.18 + (k % 3) * 0.04));
        b.position.set(side * 7.5, h / 2, -k * 6.4 + 6);
        b.castShadow = b.receiveShadow = true;
        scene.add(b);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 3.2), grey(0.04, 0.5));
        door.position.set(side * 4.62, 1.3, b.position.z);
        scene.add(door);
      }
    }
    // the robot stand-in, sitting against the left wall
    const robot = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 6, 12), grey(0.35, 0.5));
    robot.position.set(-4.2, 0.8, 2); robot.castShadow = true;
    scene.add(robot);
    this.eyePos = new THREE.Vector3(-4.0, 1.45, 1.6);

    // cold, failing street lamp
    this.lamp = new THREE.SpotLight(0xdfe6ee, 60, 30, 0.75, 0.6, 2);
    this.lamp.position.set(3.8, 6.5, -8); this.lamp.target.position.set(1, 0, -9);
    this.lamp.castShadow = true; this.lamp.shadow.mapSize.set(1024, 1024);
    scene.add(this.lamp, this.lamp.target);
    scene.add(new THREE.HemisphereLight(0x1a1c20, 0x050505, 0.15));

    // the eye: the only coloured light in the world, projecting the memory image
    this.eye = new THREE.SpotLight(0xffffff, 140, 40, 0.32, 0.45, 1.6);
    this.eye.map = memoryTexture(THREE);
    this.eye.position.copy(this.eyePos);
    this.eye.target.position.set(4, 1.2, -10);
    this.eye.castShadow = true; this.eye.shadow.mapSize.set(1024, 1024); this.eye.shadow.camera.near = 0.3;
    scene.add(this.eye, this.eye.target);

    // volumetric fog box covering the street
    const tex = noise3D(THREE);
    const vol = new THREE.VolumeNodeMaterial();
    vol.steps = ctx.params.get('vsteps') ? +ctx.params.get('vsteps') : 14;
    vol.transparent = true;
    vol.blending = THREE.AdditiveBlending;
    const jit = postfx.volumeJitter;
    vol.offsetNode = fract(interleavedGradientNoise(screenCoordinate.add(jit.mul(100))).add(jit.x));
    this.density = uniform(0.9);
    vol.scatteringNode = Fn(({ positionRay }) => {
      const drift = vec3(time.mul(0.15), time.mul(-0.05), time.mul(0.08));
      const n = (s) => texture3D(tex, positionRay.add(drift).mul(s).mod(1), 0).r.add(0.5);
      return this.density.mix(1, n(0.06).mul(n(0.023)));
    });
    if (ctx.params.get('nofog') === null) {
      const fog = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 50), vol);
      fog.position.set(0, 6.01, -10); fog.receiveShadow = true;
      scene.add(fog);
      postfx.registerVolume(vol);
    }
  },
  update(dt, t) {
    // contact-failing lamp: mostly on, occasional drop-outs
    const f = Math.sin(t * 23.0) * Math.sin(t * 7.1) > 0.92 ? 0.15 : 1;
    this.lamp.intensity = 60 * f;
  },
};
