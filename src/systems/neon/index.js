import * as THREE from 'three/webgpu';
import { planSigns } from './layout.js';
import { buildAtlas } from './atlas.js';
import { createMaterials } from './materials.js';
import { buildMeshes, updatePowers } from './geometry.js';
import { updateNeonLights, neonGain } from '../../materials/neonlight.js';

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
    // WebGPU allows 8 vertex buffers: the face batch never reads neonAnchor (only the ground spill does)
    for (const m of this.meshes) if (m.material === this.materials.face && m.geometry.attributes.neonAnchor) m.geometry.deleteAttribute('neonAnchor');
    this.root = new THREE.Group(); this.root.name = 'neon';
    this.root.add(...this.meshes); ctx.scene.add(this.root);
    // real lights (clustered renderer): one per sign, in front of its face; plus a warm one in every shop opening
    if (ctx.lightPool) {
      neonGain.value = 0; // the analytic fallback would light everything twice
      const C = new THREE.Color();
      for (const sg of this.signs) {
        const facing = sg.kind === 'blade' ? 0 : -sg.side;
        const area = Math.min(6, sg.w * sg.h);
        ctx.lightPool.add({ pos: new THREE.Vector3(sg.x + facing * (0.6 + 0.15 * sg.h), sg.y - 0.25 * sg.h, sg.z),
          color: C.set(sg.tint).clone(), intensity: (sg.kind === 'box' ? 6 : 9) * Math.sqrt(area) * 0.6,
          distance: Math.min(7.5, 4 + sg.w), alive: sg.alive ? 1 : 0, power: () => sg.power ?? 1, importance: sg.kind === 'roof' ? 1.4 : 1,
          // the climax door keeps its own warm light: remembered signs near it hold back while the marks play
          memScale: Math.hypot(sg.x - 5.0, sg.z + 14.2) < 8 ? () => (ctx.api.fragment?.state === 'playing' ? 0.12 : 1) : undefined });
      }
      for (const f of facades) if (f.shop && !f.home) {
        ctx.lightPool.add({ pos: new THREE.Vector3(f.frontX - f.side * 0.7, 2.6, f.z), color: new THREE.Color(1, 0.72, 0.45),
          intensity: 8, distance: 8, alive: 0, importance: 0.8 });
      }
    }
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
  update(dt, t, ctx) {
    // Shot mode uses the engine's fixed dt and simulation t; never renderer/OS wall time.
    if (this.meshes && this.mode !== 'past') updatePowers(this.meshes, t);
    if (!this.signs || ctx.params.get('nolight') !== null) return;
    if (ctx.lightPool) ctx.lightPool.update(ctx, { pastMode: this.mode === 'past' });
    else updateNeonLights(ctx, this.signs, { pastMode: this.mode === 'past' });
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
