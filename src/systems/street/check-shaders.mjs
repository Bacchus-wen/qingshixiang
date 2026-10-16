// Static shader-source generation only: no GPU, browser, canvas context, server or port.
// Bundle with source aliases so NodeBuilder and materials use ONE Three/TSL singleton.
import { build } from 'esbuild';
await build({
  stdin: { resolveDir: process.cwd(), contents: `
    import * as THREE from 'three/webgpu';
    import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
    import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
    import { createWallMaterial, createWindowMaterial, createShutterMaterial, createShopMaterial } from './src/systems/street/cc-materials.js';
    import { wallData, constantAttribute } from './src/systems/street/cc-geometry.js';
    const tex = Object.fromEntries(['atlas_albedo','atlas_normal','interior_atlas','shutter','shelves'].map(k => {
      const t = new THREE.DataTexture(new Uint8Array(16).fill(127),2,2); t.needsUpdate = true; return [k,t];
    }));
    const p = new URLSearchParams();
    const mats = [createWallMaterial(tex,p),createWindowMaterial(tex,p),createShutterMaterial(tex),createShopMaterial(tex.shelves,p,'shelves')];
    const errors = []; const originalError = console.error; console.error = (...a) => { errors.push(a.join(' ')); originalError(...a); };
    for (const Builder of [WGSLNodeBuilder,GLSLNodeBuilder]) for (const material of mats) {
    const renderer = new THREE.WebGPURenderer({forceWebGL: Builder === GLSLNodeBuilder, canvas:{width:64,height:64,style:{}}});
    renderer.hasFeature = () => false;
    renderer.hasCompatibility = () => false;
    renderer.backend.extensions = { has: () => false, get: () => null };

      const mesh = wallData(new THREE.Mesh(new THREE.PlaneGeometry(),material));
      constantAttribute(mesh.geometry,'ccRoom',[2,1,2.5,1]);
      constantAttribute(mesh.geometry,'ccSize',[1.1,1.3]);
      const b = new Builder(mesh,renderer); b.scene = new THREE.Scene(); b.camera = new THREE.PerspectiveCamera();
      b.build();
      if (!b.fragmentShader || /NaN|undefined/.test(b.fragmentShader)) throw new Error('Invalid shader: '+material.name);
      console.log(Builder.name,material.name,b.vertexShader.length,b.fragmentShader.length);
    }
    if (errors.length) throw new Error(errors.join('\\n'));
  ` },
  alias: { 'three/webgpu': 'three/src/Three.WebGPU.js', 'three/tsl': 'three/src/Three.TSL.js' },
  bundle: true, platform: 'node', format: 'esm', outfile: 'dist/cc-shader-check.mjs', logLevel: 'warning',
});
await import('../../../dist/cc-shader-check.mjs');
