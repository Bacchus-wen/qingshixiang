import * as THREE from 'three/webgpu';
import { planSigns } from './layout.js';
import { buildAtlas } from './atlas.js';
import { createMaterials } from './materials.js';
import { buildMeshes, updatePowers } from './geometry.js';

export default {
  name: 'neon',
  async init(ctx) {
    this.dispose();
    this.ctx = ctx;
    this.mode = ctx.params.get('neon') || 'cone';
    if (this.mode === 'off') { ctx.api.neon = { enabled: false, count: 0 }; return; }
    let facades = ctx.api.street?.facades;
    // ?only=neon is a self-contained inspection layer, no need to initialize the street.
    if (!facades?.length && (ctx.params.get('only') || '').split(',').includes('neon')) {
      facades = [-1, 1].flatMap((side) => Array.from({ length: 5 }, (_, i) => ({ side, z: 2 - i * 9, w: 7, h: 12 + i % 3 * 3, frontX: side * 5, shop: true })));
    }
    if (!facades?.length) { ctx.api.neon = { enabled: false, count: 0, reason: 'No street facades' }; return; }
    this.signs = planSigns(facades, ctx.api.signs);
    this.atlas = await buildAtlas(this.signs);
    this.materials = createMaterials(this.atlas.texture, this.mode);
    this.meshes = buildMeshes(this.signs, this.atlas, this.materials);
    this.root = new THREE.Group(); this.root.name = 'neon';
    this.root.add(...this.meshes); ctx.scene.add(this.root);
    ctx.api.neon = {
      enabled: true, mode: this.mode, count: this.signs.length,
      surviving: this.signs.filter((s) => s.alive).length,
      lightboxes: this.signs.filter((s) => s.kind === 'box').length,
      hanging: this.signs.filter((s) => s.kind === 'hanger').length,
      brokenInMemory: this.signs.filter((s) => s.broken).length,
      sceneDraws: this.meshes.length, occluderDraws: 2,
      atlasSize: [this.atlas.width, this.atlas.height], signs: this.signs,
    };
  },
  update(dt, t) {
    // Shot mode uses the engine's fixed dt and simulation t; never renderer/OS wall time.
    if (this.meshes && this.mode !== 'past') updatePowers(this.meshes, t);
  },
  dispose() {
    this.root?.removeFromParent();
    for (const mesh of this.meshes || []) mesh.geometry.dispose();
    for (const m of Object.values(this.materials || {})) m.dispose();
    this.atlas?.texture.dispose();
    if (this.ctx) delete this.ctx.api.neon;
    this.root = this.meshes = this.materials = this.atlas = this.signs = this.ctx = null;
  },
};
