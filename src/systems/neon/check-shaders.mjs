// Source generation for WebGPU + WebGL2, without a browser, GPU context or listening port.
import { build } from 'esbuild';
await build({
  stdin: { resolveDir: process.cwd(), contents: `
    import * as THREE from 'three/webgpu';
    import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
    import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
    import { planSigns, artKey } from './src/systems/neon/layout.js';
    import { createMaterials } from './src/systems/neon/materials.js';
    import { buildMeshes } from './src/systems/neon/geometry.js';
    const signs = planSigns([{side: -1, z: -10, w: 7, h: 14, frontX: -5, shop: true}]);
    const texture = new THREE.DataTexture(new Uint8Array(16).fill(128), 2, 2); texture.needsUpdate = true;
    const atlas = {texture, entries: new Map(signs.map(s => [artKey(s), {uv: [0, 0, 1, 1]}]))};
    const errors = [], originalError = console.error;
    console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
    for (const mode of ['cone', 'past']) for (const Builder of [WGSLNodeBuilder, GLSLNodeBuilder]) {
      const renderer = new THREE.WebGPURenderer({forceWebGL: Builder === GLSLNodeBuilder, canvas: {width: 64, height: 64, style: {}}});
      renderer.hasFeature = () => false; renderer.hasCompatibility = () => false;
      renderer.backend.extensions = {has: () => false, get: () => null};
      const materials = createMaterials(texture, mode);
      const meshes = buildMeshes(signs, atlas, materials);
      for (const mesh of meshes) {
        const builder = new Builder(mesh, renderer);
        builder.scene = new THREE.Scene(); builder.camera = new THREE.PerspectiveCamera();
        builder.build();
        for (const code of [builder.vertexShader, builder.fragmentShader]) if (!code || /NaN|undefined/.test(code)) throw new Error('Invalid shader: ' + mesh.name);
        console.log(Builder.name, mode, mesh.name, builder.vertexShader.length, builder.fragmentShader.length);
        mesh.geometry.dispose();
      }
      Object.values(materials).forEach(m => m.dispose());
    }
    if (errors.length) throw new Error(errors.join('\\n'));
  ` },
  alias: { 'three/webgpu': 'three/src/Three.WebGPU.js', 'three/tsl': 'three/src/Three.TSL.js' },
  bundle: true, platform: 'node', format: 'esm', outfile: 'dist/neon-shader-check.mjs', logLevel: 'warning',
});
await import('../../../dist/neon-shader-check.mjs');
