import * as THREE from 'three/webgpu';
import {
  Fn, abs, cameraPosition, color, distance, exp, exponentialHeightFogFactor, float, fog, fract, interleavedGradientNoise, lights, mix, positionWorld, positionWorldDirection, screenCoordinate, smoothstep, texture3D, time, uniform, vec3,
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
    this.fogDensity = uniform(0.0045); // v3: clear first 8 m, ~9% at 30 m, ~30% at the lane's end
    this.fogHeight = uniform(8);
    // v2: night is not black. A cold blue-grey haze (moonlit rain) that silhouettes read against
    this.fogBase = new THREE.Color(0.030, 0.036, 0.052);
    this.fogColor = uniform(this.fogBase.clone());
    // v3 (after cybercity): clear air for the first metres, then a height-attenuated haze whose colour is the sky's
    // own light pollution in that direction -- distant buildings dissolve into light, not into grey
    const hazeColor = Fn(([dir]) => {
      const h = dir.y.max(0);
      const base = this.fogColor;
      const sodium = vec3(0.07, 0.04, 0.02).mul(exp(h.mul(-12))).mul(smoothstep(0.2, -0.9, dir.z)); // down the lane (-Z)
      const magenta = vec3(0.04, 0.012, 0.035).mul(exp(h.mul(-7)));
      return base.add(sodium).add(magenta);
    });
    this.hazeColor = hazeColor;
    {
      const V = positionWorld.sub(cameraPosition);
      const dist = V.length();
      const y = positionWorld.y;
      const height = exp(y.max(0).mul(-0.05));                                   // thins out above the street
      const fogStart = float(8);
      const optical = dist.sub(fogStart).max(0).mul(this.fogDensity).mul(height);
      const factor = float(1).sub(exp(optical.negate())).min(0.9);
      scene.fogNode = fog(hazeColor(V.normalize()), factor);
    }
    // the sky stays dark even in a flash (a lit sky between the rooftops read as a flat grey rectangle)
    // v2 sky: deep navy overhead, the city's sodium/neon glow low on the horizon between the rooftops
    this.skyColor = uniform(new THREE.Color(0x050506)); // lightning still adds to it
    {
      const d = positionWorldDirection.y;
      const zen = vec3(0.006, 0.009, 0.022), hor = vec3(0.075, 0.05, 0.065);
      scene.backgroundNode = mix(hazeColor(positionWorldDirection).mul(1.6), zen, smoothstep(-0.02, 0.45, d)).add(this.skyColor);
    }

    const tex = noise3D();
    const jit = postfx.volumeJitter;
    this.mist = uniform(1.0); // scales every volume's density (rain makes it thicker)
    const steps = ctx.quality === 'low' ? 8 : 16;

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
        const ground = float(1).sub(smoothstep(0.0, 9.0, positionRay.y)).mul(0.7).add(0.3);
        // soft falloff toward the box faces so no box edge is ever visible
        const q = abs(positionRay.sub(center)).div(half);
        const edge = float(1).sub(smoothstep(0.55, 1.0, q.x)).mul(float(1).sub(smoothstep(0.55, 1.0, q.z))).mul(float(1).sub(smoothstep(0.7, 1.0, q.y)));
        // fade out right around the camera so walking through a shaft never washes the frame
        const near = smoothstep(0.8, 4.5, distance(positionRay, cameraPosition));
        return d.mul(this.mist).mul(n(0.07).mul(n(0.021))).mul(ground).mul(edge).mul(near);
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
    // lightning: the only moment the whole street is seen at once; a cold key from above + brighter haze
    this.bolt = new THREE.DirectionalLight(0xdfe7f2, 0);
    // back-light from the sky at the far end of the lane: the street flashes into silhouettes and rims
    this.bolt.position.set(8, 70, -140); this.bolt.target.position.set(0, 0, -5);
    scene.add(this.bolt, this.bolt.target);
    this.nextBolt = params.get('bolt') ? parseFloat(params.get('bolt')) : 34; this.boltT = -1;
    ctx.api.atmo = { volume, fogDensity: this.fogDensity, mist: this.mist, strike: () => { this.nextBolt = 0; } };

    if (params.get('novol') !== null) return;
    // shafts under the street lamps (positions published by the street system)
    const st = ctx.api.street;
    if (st) {
      // v3: only a narrow shaft hugging each lamp cone (the 12 m boxes were the grey slab across the street)
      for (const l of [st.lamp, st.far]) {
        const p = l.position.clone(); p.y = 3.6; p.x = (p.x + l.target.position.x) / 2; p.z = (p.z + l.target.position.z) / 2;
        volume(p, new THREE.Vector3(5, 7.5, 5), 0.05, [l]); // a visible sodium shaft in the rain
      }
    }
  },
  update(dt, t, ctx) {
    this.mist.value = 0.6 + 0.5 * ctx.world.rain;
    // lightning envelope: 2-3 fast pulses over ~0.5 s, then a long dark tail
    this.nextBolt -= dt;
    if (this.nextBolt <= 0 && this.boltT < 0 && (!ctx.isShot || ctx.params.get('bolt') !== null)) { this.boltT = 0; this.pulses = [0, 0.09 + Math.random() * 0.05, 0.26 + Math.random() * 0.12]; }
    if (this.boltT >= 0) {
      this.boltT += dt;
      let v = 0;
      for (const p of this.pulses) { const x = this.boltT - p; if (x > 0) v = Math.max(v, Math.exp(-x * 18) * (p === 0 ? 1 : 0.7)); }
      this.bolt.intensity = v * 2.2;
      this.fogColor.value.copy(this.fogBase).addScalar(v * 0.03);
      ctx.world.lightning = v;
      if (this.boltT > 1.2) { this.boltT = -1; this.nextBolt = 25 + Math.random() * 30; this.fogColor.value.copy(this.fogBase); ctx.world.lightning = 0; }
    }
  },
};
