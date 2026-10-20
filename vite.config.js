import { defineConfig } from 'vite';
import { rmSync, readdirSync } from 'node:fs';

// tools/build-pages.mjs (the public GitHub Pages version) sets PAGES_SITE: only the experience, and no wholesale copy of
// assets/ -- the script copies just the files the story loads
const SITE = !!process.env.PAGES_SITE;

export default defineConfig({
  publicDir: SITE ? false : 'assets',
  base: process.env.PAGES_BASE || '/', // GitHub Pages build sets PAGES_BASE=/<repo>/
  build: { target: 'esnext', chunkSizeWarningLimit: 3000, rollupOptions: { input: SITE ? { main: 'index.html' } : { main: 'index.html', compare: 'compare.html' } } },
  // one three.js: addons import 'three', the app imports 'three/webgpu' (a superset) -- alias so both resolve to the
  // same module instead of bundling and running two copies of the core
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  plugins: [(() => { let out = 'dist'; return {
    // assets/generated holds the raw generation records (reference images, Tripo originals): never shipped. The model
    // comparison stage's raw models (generated/compare, ~560 MB) are kept only when KEEP_COMPARE=1.
    name: 'drop-generated',
    apply: 'build',
    configResolved(c) { out = c.build.outDir; }, // (--outDir: not always dist)
    closeBundle() {
      if (SITE) return;
      const g = `${out}/generated`;
      if (!process.env.KEEP_COMPARE) { rmSync(g, { recursive: true, force: true }); return; }
      for (const f of readdirSync(g)) if (f !== 'compare') rmSync(`${g}/${f}`, { recursive: true, force: true });
    },
  }; })()],
});
