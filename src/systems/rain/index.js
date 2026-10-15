import {
  Fn, If, attribute, float, instanceIndex, storage, uniform, uv, varying,
  vec3, vec4, positionGeometry, smoothstep, fract, floor, sin,
} from 'three/tsl';

// Local, world-anchored weather volume, metres and seconds. No deposition ledger:
// splash rings are visual impact events on the authored y=0 receiver only.
const WIDTH = 26, HEIGHT = 16, DEPTH = 64, Z_MIN = -48;
const LIFE = 0.48;
const wrap = (x, span) => ((x % span) + span) % span;

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
    };
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
        If(instanceIndex.lessThan(this.splashCount), () => {
          const hit = this.impacts.element(instanceIndex);
          hit.w.assign(hit.w.add(u.dt).min(LIFE));
        });
        p.x.addAssign(u.wind.x.mul(u.dt));
        p.z.addAssign(u.wind.y.mul(u.dt));
        p.y.subAssign(p.w.mul(u.dt));
        p.x.assign(p.x.add(WIDTH / 2).mod(WIDTH).sub(WIDTH / 2));
        p.z.assign(p.z.sub(Z_MIN).mod(DEPTH).add(Z_MIN));
        If(p.y.lessThanEqual(0), () => {
          If(instanceIndex.lessThan(this.splashCount), () => {
            const age = p.y.negate().div(p.w);
            this.impacts.element(instanceIndex).assign(vec4(
              p.x.sub(u.wind.x.mul(age)), 0.018, p.z.sub(u.wind.y.mul(age)), age,
            ));
          });
          p.y.addAssign(HEIGHT);
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
    const shade = (p) => vec3(0.13, 0.14, 0.15).add(amber.mul(cone(p)).mul(7));
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
    const velocity = vec3(u.wind.x, drop.w.negate(), u.wind.y);
    const centre = drop.xyz;
    // Velocity-aligned ribbons with camera-facing width; 24 ms shutter length.
    streak.positionNode = centre.add(velocity.mul(positionGeometry.y).mul(0.024))
      .add(u.right.mul(positionGeometry.x).mul(0.014));
    const dropWorld = varying(centre, 'rainWorld');
    streak.colorNode = shade(dropWorld);
    const ribbon = float(1).sub(smoothstep(0.12, 0.5, uv().x.sub(0.5).abs()));
    const taper = sin(uv().y.mul(Math.PI)).max(0);
    streak.opacityNode = ribbon.mul(taper).mul(0.56).mul(u.rain)
      .mul(smoothstep(0, 0.2, dropWorld.y))
      .mul(float(1).sub(smoothstep(12, 16, dropWorld.y)));
    const dropsGeometry = quad(THREE, this.count);
    if (!this.gpu) dropsGeometry.setAttribute('rainDrop', this.cpuDrops);
    add(dropsGeometry, streak, 'rain-streaks');

    const rings = material();
    const age = impact.w.div(LIFE).clamp();
    const radius = age.mul(0.23).add(0.025);
    rings.positionNode = impact.xyz.add(vec3(positionGeometry.x, 0, positionGeometry.y).mul(radius.mul(2)));
    rings.colorNode = shade(varying(impact.xyz, 'rainHitWorld')).mul(0.8);
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
      const trail = smoothstep(0.65, 0.95, fract(uv().y.mul(12).add(u.time.mul(3.4)).add(rnd)));
      const edge = smoothstep(0, 0.12, uv().x).mul(float(1).sub(smoothstep(0.88, 1, uv().x)))
        .mul(smoothstep(0, 0.08, uv().y)).mul(float(1).sub(smoothstep(0.7, 1, uv().y)));
      curtain.colorNode = shade(world);
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
    u.wind.value.copy(ctx.world?.wind ?? { x: 0, y: 0 });
    if (memory) {
      u.origin.value.copy(memory.origin); u.dir.value.copy(memory.dir).normalize();
      u.cosine.value = Math.cos(memory.angle);
      u.range.value = Math.max(0.001, memory.range);
      u.strength.value = Math.max(0, Math.min(1, memory.strength));
    } else u.strength.value = 0;
    ctx.camera.updateMatrixWorld();
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
      for (let i = 0; i < this.count; i++) {
        const j = i * 4;
        if (i < this.splashCount) hits[j + 3] = Math.min(LIFE, hits[j + 3] + d);
        p[j] = wrap(p[j] + wind.x * d + WIDTH / 2, WIDTH) - WIDTH / 2;
        p[j + 2] = wrap(p[j + 2] + wind.y * d - Z_MIN, DEPTH) + Z_MIN;
        p[j + 1] -= p[j + 3] * d;
        if (p[j + 1] <= 0) {
          if (i < this.splashCount) {
            const age = -p[j + 1] / p[j + 3];
            hits.set([p[j] - wind.x * age, 0.018, p[j + 2] - wind.y * age, age], j);
          }
          p[j + 1] += HEIGHT;
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
