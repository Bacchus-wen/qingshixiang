import {
  Fn, If, attribute, float, instanceIndex, storage, uniform, uv, varying,
  vec3, vec4, positionGeometry, smoothstep, fract, floor, sin,
} from 'three/tsl';

// Local, world-anchored weather volume, metres and seconds. No deposition ledger:
// splash rings are visual impact events on the authored y=0 receiver only.
const WIDTH = 26, HEIGHT = 16, DEPTH = 64, Z_MIN = -48;
const LIFE = 0.72; // Maximum; individual impacts live for 0.22–0.72 s.
const wrap = (x, span) => ((x % span) + span) % span;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Blend three distance bands, using squared distance to avoid a per-drop sqrt.
const speedScale = (d2) => 1.2 - 0.3 * smooth(36, 100, d2) - 0.3 * smooth(324, 576, d2);
const speedNode = (d2) => float(1.2).sub(smoothstep(36, 100, d2).mul(0.3))
  .sub(smoothstep(324, 576, d2).mul(0.3));

function seeds(count) {
  let seed = 0xdecafbad;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) a.set([
    (random() - 0.5) * WIDTH, random() * HEIGHT,
    Z_MIN + random() * DEPTH, 10 + random() * 6,
  ], i * 4);
  return a;
}

function quad(THREE, count) {
  const plane = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = plane.index;
  g.attributes = plane.attributes;
  g.instanceCount = count;
  return g;
}

export default {
  name: 'rain',
  async init(ctx) {
    const { THREE, renderer, scene, params } = ctx;
    this.gpu = renderer.backend.isWebGPUBackend === true;
    const low = params.get('q') === 'low';
    this.count = this.gpu ? (low ? 20000 : 60000) : (low ? 2400 : 6000);
    this.splashCount = this.gpu ? (low ? 1024 : 3072) : (low ? 256 : 768);
    this.group = new THREE.Group(); this.group.name = 'rain';
    this.meshes = [];
    this.u = {
      dt: uniform(0), time: uniform(0), rain: uniform(1),
      wind: uniform(new THREE.Vector2()), windTravel: uniform(new THREE.Vector2()),
      right: uniform(new THREE.Vector3(1, 0, 0)),
      origin: uniform(new THREE.Vector3()), dir: uniform(new THREE.Vector3(0, 0, -1)),
      cosine: uniform(0.94), range: uniform(40), strength: uniform(0),
      camera: uniform(new THREE.Vector3()), lightning: uniform(0),
    };
    this.lights = ['lamp', 'far'].map(name => ({
      name, position: uniform(new THREE.Vector3()), direction: uniform(new THREE.Vector3(0, -1, 0)),
      outer: uniform(0), inner: uniform(1), range: uniform(1), intensity: uniform(0),
      color: uniform(new THREE.Color()),
    }));
    this.lightTarget = new THREE.Vector3();
    const u = this.u;
    const data = seeds(this.count);
    const impacts = new Float32Array(this.splashCount * 4);
    for (let i = 0; i < this.splashCount; i++) impacts[i * 4 + 3] = LIFE;
    let drop, impact;
    if (this.gpu) {
      this.positions = storage(new THREE.StorageInstancedBufferAttribute(data, 4), 'vec4', this.count);
      this.impacts = storage(new THREE.StorageInstancedBufferAttribute(impacts, 4), 'vec4', this.splashCount);
      drop = this.positions.toAttribute(); impact = this.impacts.toAttribute();
      this.compute = Fn(() => {
        const p = this.positions.element(instanceIndex);
        const offset = p.xyz.sub(u.camera);
        const speed = p.w.mul(speedNode(offset.dot(offset))).toVar();
        If(instanceIndex.lessThan(this.splashCount), () => {
          const hit = this.impacts.element(instanceIndex);
          hit.w.assign(hit.w.add(u.dt).min(LIFE));
        });
        p.x.addAssign(u.wind.x.mul(u.dt));
        p.z.addAssign(u.wind.y.mul(u.dt));
        p.y.subAssign(speed.mul(u.dt));
        p.x.assign(p.x.add(WIDTH / 2).mod(WIDTH).sub(WIDTH / 2));
        p.z.assign(p.z.sub(Z_MIN).mod(DEPTH).add(Z_MIN));
        If(p.y.lessThanEqual(0), () => {
          If(instanceIndex.lessThan(this.splashCount), () => {
            const age = p.y.negate().div(speed);
            this.impacts.element(instanceIndex).assign(vec4(
              p.x.sub(u.wind.x.mul(age)), 0.018, p.z.sub(u.wind.y.mul(age)), age,
            ));
          });
          p.y.addAssign(HEIGHT);
          // Move the next fall to another world-space column, after recording
          // the real crossing. Fixed seed/step => repeatable screenshots.
          p.x.assign(p.x.add(5.173).add(p.w.mul(0.618)).add(WIDTH / 2).mod(WIDTH).sub(WIDTH / 2));
          p.z.assign(p.z.add(13.731).add(p.w.mul(1.137)).sub(Z_MIN).mod(DEPTH).add(Z_MIN));
        });
      })().compute(this.count);
    } else {
      // Only this reduced pool is uploaded on WebGL2; no storage/compute nodes.
      this.cpuDrops = new THREE.InstancedBufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage);
      this.cpuImpacts = new THREE.InstancedBufferAttribute(impacts, 4).setUsage(THREE.DynamicDrawUsage);
      drop = attribute('rainDrop', 'vec4'); impact = attribute('rainImpact', 'vec4');
    }

    const cone = (p) => {
      const delta = p.sub(u.origin), distance = delta.length().max(0.001);
      const alignment = delta.div(distance).dot(u.dir);
      return smoothstep(u.cosine, u.cosine.add(0.022).min(0.9999), alignment)
        .mul(float(1).sub(smoothstep(u.range.mul(0.65), u.range, distance)))
        .mul(u.strength);
    };
    const amber = uniform(new THREE.Color('#c9854a'));
    const spot = (p, light) => Fn(() => {
      const delta = p.sub(light.position).toVar();
      const d2 = delta.dot(delta).max(0.000001).toVar();
      const alignment = delta.div(d2.sqrt()).dot(light.direction);
      const angular = smoothstep(light.outer, light.inner, alignment);
      // Three-style inverse-square falloff with a smooth finite-distance cutoff.
      const cutoff = float(1).sub(d2.div(light.range.mul(light.range)).pow(2)).clamp().pow(2);
      return angular.mul(cutoff).mul(light.intensity).div(d2.max(0.25)).mul(0.08).clamp();
    })();
    // flash: thin streaks catch the lightning; big curtain planes and ground rings barely do (else they read as
    // lit squares on walls and water in the flash) (Claude, after Grok r5)
    const shade = (p, flash = 0.6) => {
      const lit = this.lights.map(light => light.color.mul(spot(p, light)));
      return vec3(0.65, 0.72, 0.8).mul(float(0.05).add(u.lightning.mul(flash)))
        .add(lit[0].add(lit[1]).mul(0.95))
        .add(amber.mul(cone(p)).mul(0.95)).min(vec3(1));
    };
    const material = () => new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true,
    });
    const add = (g, m, name) => {
      const mesh = new THREE.Mesh(g, m); mesh.name = name;
      mesh.frustumCulled = false; mesh.renderOrder = 10;
      this.group.add(mesh); this.meshes.push(mesh);
      return mesh;
    };

    const streak = material();
    const centre = drop.xyz;
    const cameraOffset = centre.sub(u.camera);
    const distance2 = cameraOffset.dot(cameraOffset);
    const velocity = vec3(u.wind.x, drop.w.mul(speedNode(distance2)).negate(), u.wind.y);
    const middle = smoothstep(36, 100, distance2), far = smoothstep(324, 576, distance2);
    const width = float(0.018).sub(middle.mul(0.008)).sub(far.mul(0.005));
    const defocus = float(1).sub(smoothstep(0.1225, 6.25, distance2));
    // Velocity-aligned ribbons with camera-facing width; 24 ms shutter length.
    streak.positionNode = centre.add(velocity.mul(positionGeometry.y).mul(0.024))
      .add(u.right.mul(positionGeometry.x).mul(width).mul(float(1).add(defocus.mul(3))));
    const dropWorld = varying(centre, 'rainWorld');
    // Light each tiny ribbon in the vertex stage, not for every covered pixel.
    streak.colorNode = varying(shade(centre), 'rainLight');
    const blur = varying(defocus, 'rainDefocus');
    const ribbon = float(1).sub(smoothstep(float(0.12).mul(float(1).sub(blur)), 0.5, uv().x.sub(0.5).abs())).pow(2);
    const taper = sin(uv().y.mul(Math.PI)).max(0);
    streak.opacityNode = ribbon.mul(taper).mul(0.56).mul(u.rain)
      .mul(float(1).div(float(1).add(blur.mul(7))))
      .mul(varying(smoothstep(0.0225, 0.2025, distance2), 'rainNearFade'))
      .mul(smoothstep(0, 0.2, dropWorld.y))
      .mul(float(1).sub(smoothstep(12, 16, dropWorld.y)));
    const dropsGeometry = quad(THREE, this.count);
    if (!this.gpu) dropsGeometry.setAttribute('rainDrop', this.cpuDrops);
    add(dropsGeometry, streak, 'rain-streaks');

    const rings = material();
    // Hash real, already randomly scattered hit positions; no spatial grid.
    // Independent hashes avoid identical radii/lifetimes and synchronized rings.
    const hitRandom = fract(sin(impact.x.mul(127.1).add(impact.z.mul(311.7))).mul(43758.5453));
    const sizeRandom = fract(sin(impact.x.mul(269.5).add(impact.z.mul(183.3))).mul(43758.5453));
    const age = impact.w.div(hitRandom.mul(0.5).add(0.22)).clamp();
    const radius = age.mul(sizeRandom.mul(0.15).add(0.04)).add(0.012);
    rings.positionNode = impact.xyz.add(vec3(positionGeometry.x, 0, positionGeometry.y).mul(radius.mul(2)));
    rings.colorNode = varying(shade(impact.xyz, 0.12).mul(0.8), 'rainHitLight');
    const circle = uv().sub(0.5).length().mul(2);
    rings.opacityNode = float(1).sub(smoothstep(0.035, 0.12, circle.sub(0.8).abs()))
      .mul(float(1).sub(varying(age, 'rainHitAge'))).mul(u.rain).mul(0.38);
    const hitsGeometry = quad(THREE, this.splashCount);
    if (!this.gpu) hitsGeometry.setAttribute('rainImpact', this.cpuImpacts);
    add(hitsGeometry, rings, 'rain-splashes');

    // Three sparse translucent curtains, world anchored behind the hero space.
    for (let i = 0; i < 3; i++) {
      const curtain = material();
      const p = positionGeometry.mul(vec3(24, 12, 1)).add(vec3(0, 6, -20 - i * 11));
      curtain.positionNode = p;
      const world = varying(p, `rainCurtain${i}`);
      const cell = uv().x.mul(190 + i * 37).add(u.windTravel.x.mul(-0.15));
      const column = floor(cell);
      const rnd = fract(sin(column.mul(127.1).add(i * 17)).mul(43758.5453));
      const line = float(1).sub(smoothstep(0.025, 0.095, fract(cell).sub(0.5).abs()));
      const trail = smoothstep(0.65, 0.95, fract(uv().y.mul(12).add(u.time.mul(2.2 - i * 0.35)).add(rnd)));
      const edge = smoothstep(0, 0.12, uv().x).mul(float(1).sub(smoothstep(0.88, 1, uv().x)))
        .mul(smoothstep(0, 0.08, uv().y)).mul(float(1).sub(smoothstep(0.7, 1, uv().y)));
      curtain.colorNode = shade(world, 0.08);
      curtain.opacityNode = line.mul(trail).mul(edge).mul(u.rain).mul(0.13);
      add(new THREE.PlaneGeometry(1, 1), curtain, `rain-curtain-${i}`);
    }
    scene.add(this.group);
    ctx.api.rain = {
      mode: this.gpu ? 'gpu-compute' : 'cpu', particleCount: this.count,
      splashCount: this.splashCount, curtains: 3,
      bounds: { width: WIDTH, height: HEIGHT, depth: DEPTH, zMin: Z_MIN },
    };
    this.sync(ctx);
    // Compile/enqueue before the engine starts its synchronous render loop.
    if (this.gpu) await renderer.computeAsync(this.compute);
  },

  sync(ctx) {
    const u = this.u, memory = ctx.memory;
    u.rain.value = Math.max(0, Math.min(1, ctx.world?.rain ?? 1));
    u.lightning.value = Math.max(0, Math.min(1, ctx.world?.lightning ?? 0));
    u.wind.value.copy(ctx.world?.wind ?? { x: 0, y: 0 });
    for (const light of this.lights) {
      const source = ctx.api.street?.[light.name];
      light.intensity.value = source?.visible ? Math.max(0, source.intensity) : 0;
      if (!source) continue;
      source.getWorldPosition(light.position.value);
      source.target.getWorldPosition(this.lightTarget);
      light.direction.value.copy(this.lightTarget).sub(light.position.value).normalize();
      light.outer.value = Math.cos(source.angle);
      light.inner.value = Math.max(light.outer.value + 0.00001, Math.cos(source.angle * (1 - source.penumbra)));
      light.range.value = source.distance > 0 ? source.distance : 1e6;
      light.color.value.copy(source.color);
    }
    if (memory) {
      u.origin.value.copy(memory.origin); u.dir.value.copy(memory.dir).normalize();
      u.cosine.value = Math.cos(memory.angle);
      u.range.value = Math.max(0.001, memory.range);
      u.strength.value = Math.max(0, Math.min(1, memory.strength));
    } else u.strength.value = 0;
    ctx.camera.updateMatrixWorld();
    u.camera.value.setFromMatrixPosition(ctx.camera.matrixWorld);
    u.right.value.setFromMatrixColumn(ctx.camera.matrixWorld, 0);
    this.group.visible = u.rain.value > 0;
  },

  update(dt, t, ctx) {
    this.sync(ctx);
    this.u.time.value = t;
    this.u.dt.value = Math.max(0, Math.min(dt, 0.1));
    this.u.windTravel.value.addScaledVector(this.u.wind.value, this.u.dt.value);
    if (this.gpu) ctx.renderer.compute(this.compute);
    else {
      const d = this.u.dt.value, wind = this.u.wind.value;
      const p = this.cpuDrops.array, hits = this.cpuImpacts.array;
      const camera = this.u.camera.value;
      for (let i = 0; i < this.count; i++) {
        const j = i * 4;
        const dx = p[j] - camera.x, dy = p[j + 1] - camera.y, dz = p[j + 2] - camera.z;
        const speed = p[j + 3] * speedScale(dx * dx + dy * dy + dz * dz);
        if (i < this.splashCount) hits[j + 3] = Math.min(LIFE, hits[j + 3] + d);
        p[j] = wrap(p[j] + wind.x * d + WIDTH / 2, WIDTH) - WIDTH / 2;
        p[j + 2] = wrap(p[j + 2] + wind.y * d - Z_MIN, DEPTH) + Z_MIN;
        p[j + 1] -= speed * d;
        if (p[j + 1] <= 0) {
          if (i < this.splashCount) {
            const age = -p[j + 1] / speed;
            hits[j] = p[j] - wind.x * age; hits[j + 1] = 0.018;
            hits[j + 2] = p[j + 2] - wind.y * age; hits[j + 3] = age;
          }
          p[j + 1] += HEIGHT;
          p[j] = wrap(p[j] + 5.173 + p[j + 3] * 0.618 + WIDTH / 2, WIDTH) - WIDTH / 2;
          p[j + 2] = wrap(p[j + 2] + 13.731 + p[j + 3] * 1.137 - Z_MIN, DEPTH) + Z_MIN;
        }
      }
      this.cpuDrops.needsUpdate = this.cpuImpacts.needsUpdate = true;
    }
  },

  dispose(ctx) {
    this.group?.removeFromParent();
    for (const mesh of this.meshes ?? []) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.compute?.dispose(); this.positions?.dispose(); this.impacts?.dispose();
    if (ctx?.api) delete ctx.api.rain;
  },
};
