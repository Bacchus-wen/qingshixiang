import * as THREE from 'three/webgpu';
import { lifeState, syncLife, inMemory, streetTint } from './life.js';
import { loadCrowd, MemoryOutfit } from './vat.js';
import legacyTemplate from './legacy.js';
import { crowd } from './state.js';
export { crowd } from './state.js'; // public contract used by src/story/fragment.js and traffic

const TAU = Math.PI * 2;
const CURB = .14, NEAR_Z = -7, FAR_Z = -35, LANE_CENTER = 4.2, TURN_RADIUS = .38;
const STRAIGHT = NEAR_Z - FAR_Z, ARC = Math.PI * TURN_RADIUS;
export const ROUTE_LENGTH = 2 * (STRAIGHT + ARC);
const wrap = (value, length) => ((value % length) + length) % length;
export const nearFade = distance => THREE.MathUtils.smoothstep(distance, 3.5, 5.5);

export function makePeople(variants) {
  // Four fixed slots per outfit. No compaction: previous VAT positions retain
  // identity when the eye closes, or a person crosses a cone/camera boundary.
  const slots = new Uint8Array(variants.length);
  return [-1, 1].flatMap(side => Array.from({ length: 8 }, (_, i) => {
    const type = i % 4, meta = variants[type].meta;
    const height = 1.60 + ((i * 7 + (side > 0 ? 3 : 0)) % 9) * .025;
    return {
      side, type, slot: slots[type]++, height, scale: height / meta.height,
      umbrella: meta.umbrella, speed: side < 0 ? .66 : .71,
      offset: (i + (side > 0 ? .35 : .08)) * ROUTE_LENGTH / 8,
      phase: (i * .371 + (side > 0 ? .19 : 0)) % 1,
      position: new THREE.Vector3(), yaw: 0,
    };
  }));
}

// A continuous pavement circuit: two straight lanes and rounded turnarounds.
// Absolute time makes screenshots/seeking reproducible; no sudden 180-degree
// flips or teleports, and equal speeds on each sidewalk keep people separated.
export function pose(person, t) {
  let d = wrap(person.offset + t * person.speed, ROUTE_LENGTH);
  let x, z, dx, dz;
  if (d < STRAIGHT) {
    x = -TURN_RADIUS; z = NEAR_Z - d; dx = 0; dz = -1;
  } else if ((d -= STRAIGHT) < ARC) {
    const a = Math.PI + d / TURN_RADIUS;
    x = Math.cos(a) * TURN_RADIUS; z = FAR_Z + Math.sin(a) * TURN_RADIUS;
    dx = -Math.sin(a); dz = Math.cos(a);
  } else if ((d -= ARC) < STRAIGHT) {
    x = TURN_RADIUS; z = FAR_Z + d; dx = 0; dz = 1;
  } else {
    d -= STRAIGHT;
    const a = d / TURN_RADIUS;
    x = Math.cos(a) * TURN_RADIUS; z = NEAR_Z + Math.sin(a) * TURN_RADIUS;
    dx = -Math.sin(a); dz = Math.cos(a);
  }
  person.position.set(person.side * (LANE_CENTER + x), CURB, z);
  person.yaw = Math.atan2(person.side * dx, dz);
}

export default {
  name: 'ghosts',
  loadCrowd,
  async init(ctx) {
    this.fallback = null;
    this.outfits = [];
    this.life = lifeState();
    try {
      const variants = await this.loadCrowd();
      this.people = makePeople(variants);
      for (let type = 0; type < variants.length; type++) {
        const count = this.people.filter(p => p.type === type).length;
        this.outfits.push(new MemoryOutfit(variants[type], this.life, count));
      }
    } catch (error) {
      for (const outfit of this.outfits) outfit.dispose();
      this.outfits = [];
      console.warn('[ghosts] VAT unavailable; falling back to existing people:', error.message);
      this.fallback = Object.create(legacyTemplate);
      await this.fallback.init(ctx);
      this.people = this.fallback.people; this.meshes = this.fallback.meshes; this.group = this.fallback.group;
      ctx.api.ghosts.source = 'fallback';
      ctx.api.ghosts.loadError = error.message;
      return;
    }
    this.group = new THREE.Group(); this.group.name = 'ghosts';
    this.meshes = this.outfits.map(o => o.mesh);
    this.group.add(...this.meshes); ctx.scene.add(this.group);
    this.tint = new THREE.Color();
    this.center = new THREE.Vector3(); this.cameraPosition = new THREE.Vector3();
    this.visible = new Uint8Array(this.people.length);
    this.broad = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), strength: 1, angle: 0, range: 0 };
    ctx.api.ghosts = {
      count: this.people.length, source: 'cybercity-vat', sceneDraws: this.meshes.length,
      umbrellaCount: this.people.filter(p => p.umbrella).length, waitingCount: 0, childCount: 0,
      visibleCount: 0, warmupFrames: 30, assetBytes: this.outfits.reduce((n, o) => n + o.meta.bytes, 0),
    };
    this._frames = 0;
    this.update(0, 0, ctx);
    this._frames = 0;
  },
  update(dt, t, ctx) {
    if (this.fallback) return this.fallback.update(dt, t, ctx);
    const warmup = this._frames++ < 30;
    const enabled = syncLife(this.life, ctx, crowd.value);
    this.group.visible = warmup || enabled;
    ctx.camera.getWorldPosition(this.cameraPosition);
    for (const outfit of this.outfits) outfit.begin();
    let visibleCount = 0;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i], outfit = this.outfits[p.type], meta = outfit.meta;
      pose(p, t);
      this.center.copy(p.position); this.center.y += .9 * p.scale;
      const distance = Math.hypot(p.position.x - this.cameraPosition.x, p.position.z - this.cameraPosition.z);
      const fade = nearFade(distance);
      const visible = enabled && fade > 0 && inMemory(this.center, meta.radius * p.scale, ctx, this.life, this.broad);
      // Match distance travelled to the authored gait speed, instead of skating
      // a full-speed walk clip along a slow route. Each pedestrian has a phase.
      const cycles = t * p.speed / (meta.speed * p.scale * meta.duration) + p.phase;
      const frame = wrap(cycles, 1) * meta.frames;
      streetTint(ctx, p.position, this.tint);
      outfit.set(p.slot, p, frame, this.tint, visible ? fade : 0, !this.visible[i]);
      this.visible[i] = visible ? 1 : 0;
      if (visible) visibleCount++;
    }
    for (const outfit of this.outfits) outfit.end(warmup);
    ctx.api.ghosts.visibleCount = visibleCount;
    ctx.api.ghosts.warmingUp = warmup;
  },
  dispose(ctx) {
    if (this.fallback) { this.fallback.dispose(ctx); this.fallback = null; return; }
    this.group?.removeFromParent();
    for (const outfit of this.outfits || []) outfit.dispose();
    this.outfits = [];
    if (ctx?.api) delete ctx.api.ghosts;
  },
};
