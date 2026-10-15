import * as THREE from 'three/webgpu';
import {
  vec3, Fn, texture3D, screenCoordinate, uniform, fract, interleavedGradientNoise, time, fog, color,
  exponentialHeightFogFactor, smoothstep, float, abs, lights,
} from 'three/tsl';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

// Atmosphere: global height fog (depth through silhouettes) + local ray-marched volumes where light shafts matter.
// Local boxes keep step length short (sharp shafts) and cost bounded. Other systems can call ctx.api.atmo.volume().
function noise3D(size = 64) {
  const data = new Uint8Array(size ** 3);
  const perlin = new ImprovedNoise();
  let i = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    data[i++] = 128 + 127 * perlin.noise((x / size) * 6, (y / size) * 6, (z / size) * 6);
  }
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RedFormat; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

export default {
  name: 'atmo',
  async init(ctx) {
    const { scene, postfx, params } = ctx;
    this.fogDensity = uniform(0.014);
    this.fogHeight = uniform(5.5);
    this.fogColor = uniform(new THREE.Color(0x08090a));
    scene.fogNode = fog(this.fogColor, exponentialHeightFogFactor(this.fogDensity, this.fogHeight));
    scene.backgroundNode = this.fogColor.mul(0.6);

    const tex = noise3D();
    const jit = postfx.volumeJitter;
    this.mist = uniform(1.0); // scales every volume's density (rain makes it thicker)
    const steps = params.get('q') === 'low' ? 8 : 18;

    // density: drifting noise, thicker near the ground
    const makeMat = (density, center, half) => {
      const m = new THREE.VolumeNodeMaterial();
      m.steps = steps;
      m.transparent = true;
      m.blending = THREE.AdditiveBlending;
      m.offsetNode = fract(interleavedGradientNoise(screenCoordinate.add(jit.mul(100))).add(jit.x));
      const d = uniform(density);
      m.scatteringNode = Fn(({ positionRay }) => {
        const drift = vec3(time.mul(0.22), time.mul(-0.04), time.mul(0.11));
        const n = (s) => texture3D(tex, positionRay.add(drift).mul(s).mod(1), 0).r.add(0.5);
        const ground = smoothstep(9.0, 0.0, positionRay.y).mul(0.7).add(0.3);
        // soft falloff toward the box faces so no box edge is ever visible
        const q = abs(positionRay.sub(center)).div(half);
        const edge = smoothstep(1.0, 0.55, q.x).mul(smoothstep(1.0, 0.55, q.z)).mul(smoothstep(1.0, 0.7, q.y));
        return d.mul(this.mist).mul(n(0.07).mul(n(0.021))).mul(ground).mul(edge);
      });
      m.userData.density = d;
      return m;
    };

    this.volumes = [];
    // onlyLights: the volume scatters just these lights (a beam volume must not glow with every street lamp)
    const volume = (center, size, density = 0.6, onlyLights = null) => {
      const m = makeMat(density, uniform(center.clone()), uniform(size.clone().multiplyScalar(0.5)));
      if (onlyLights) m.lightsNode = lights(onlyLights);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), m);
      mesh.position.copy(center);
      mesh.renderOrder = 10;
      scene.add(mesh);
      postfx.registerVolume(m);
      this.volumes.push(mesh);
      return mesh;
    };
    ctx.api.atmo = { volume, fogDensity: this.fogDensity, mist: this.mist };

    if (params.get('novol') !== null) return;
    // shafts under the street lamps (positions published by the street system)
    const st = ctx.api.street;
    if (st) {
      for (const l of [st.lamp, st.far]) {
        const p = l.position.clone(); p.y = 3.8; p.x = (p.x + l.target.position.x) / 2; p.z = (p.z + l.target.position.z) / 2;
        volume(p, new THREE.Vector3(12, 8.5, 12), 0.07, [l]);
      }
    }
  },
  update(dt, t, ctx) {
    this.mist.value = 0.6 + 0.5 * ctx.world.rain;
  },
};
