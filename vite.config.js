import { defineConfig } from 'vite';
import { rmSync, readdirSync } from 'node:fs';

export default defineConfig({
  publicDir: 'assets',
  base: process.env.PAGES_BASE || '/', // GitHub Pages build sets PAGES_BASE=/<repo>/
  build: { target: 'esnext', chunkSizeWarningLimit: 3000, rollupOptions: { input: { main: 'index.html', compare: 'compare.html' } } },
  // one three.js: addons import 'three', the app imports 'three/webgpu' (a superset) -- alias so both resolve to the
  // same module instead of bundling and running two copies of the core
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  plugins: [{
    // assets/generated holds the raw generation records (reference images, Tripo originals): never shipped. The model
    // comparison stage's raw models (generated/compare, ~560 MB) are kept only when KEEP_COMPARE=1.
    name: 'drop-generated',
    apply: 'build',
    closeBundle() {
      if (!process.env.KEEP_COMPARE) { rmSync('dist/generated', { recursive: true, force: true }); return; }
      for (const f of readdirSync('dist/generated')) if (f !== 'compare') rmSync('dist/generated/' + f, { recursive: true, force: true });
    },
  }],
});
