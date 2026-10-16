import * as THREE from 'three/webgpu';
import { lifeState, syncLife, fullFlood, inMemory, streetTint } from './life.js';
import { loadCrowd, MemoryOutfit } from './vat.js';
import legacyTemplate from './legacy.js';
import { crowd } from './state.js';
import { population, pose } from './routes.js';
export { crowd } from './state.js'; // public contract used by src/story/fragment.js and traffic
export { pose } from './routes.js';

const wrap = (value, length) => ((value % length) + length) % length;
export const nearFade = distance => THREE.MathUtils.smoothstep(distance, 3.5, 5.5);

export function makePeople(variants, facades = []) {
  const slots = new Uint8Array(variants.length);
  return population(facades).map((p, i) => {
    const type = i % variants.length, meta = variants[type].meta;
    return { ...p, type, slot: slots[type]++, scale: p.height / meta.height, umbrella: meta.umbrella };
  });
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
      this.people = makePeople(variants, ctx.api.street?.facades);
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
    this.animated = new Uint8Array(this.people.length);
    this.broad = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), strength: 1, angle: 0, range: 0 };
    ctx.api.ghosts = {
      count: this.people.length, source: 'cybercity-vat', sceneDraws: this.meshes.length,
      umbrellaCount: this.people.filter(p => p.umbrella).length, waitingCount: this.people.filter(p => p.waiting).length, childCount: 0,
      visibleCount: 0, animationRange: 40, animatedCount: 0, crossingCount: 8, warmupFrames: 30, assetBytes: this.outfits.reduce((n, o) => n + o.meta.bytes, 0),
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
    let visibleCount = 0, animatedCount = 0;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i], outfit = this.outfits[p.type], meta = outfit.meta;
      pose(p, t);
      this.center.copy(p.position); this.center.y += .9 * p.scale;
      const distance = Math.hypot(p.position.x - this.cameraPosition.x, p.position.z - this.cameraPosition.z);
      const fade = nearFade(distance); // even in the full flood: nobody walks through the lens
      const visible = enabled && fade > 0 && inMemory(this.center, meta.radius * p.scale, ctx, this.life, this.broad);
      if (!visible && !warmup) {
        outfit.hide(p.slot);
        this.visible[i] = 0;
        continue;
      }
      const animated = !p.waiting && distance <= 40;
      // Match distance travelled to the authored gait speed, instead of skating
      // a full-speed walk clip along a slow route. Each pedestrian has a phase.
      const cycles = (animated ? t * p.speed / (meta.speed * p.scale * meta.duration) : 0) + p.phase;
      const frame = wrap(cycles, 1) * meta.frames;
      streetTint(ctx, p.position, this.tint);
      outfit.set(p.slot, p, frame, this.tint, visible ? fade : 0, !this.visible[i] || this.animated[i] !== Number(animated));
      this.animated[i] = animated ? 1 : 0;
      if (visible && animated) animatedCount++;
      this.visible[i] = visible ? 1 : 0;
      if (visible) visibleCount++;
    }
    for (const outfit of this.outfits) outfit.end(warmup);
    ctx.api.ghosts.visibleCount = visibleCount;
    ctx.api.ghosts.animatedCount = animatedCount;
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
