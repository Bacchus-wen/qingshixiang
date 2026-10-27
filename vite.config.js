import { defineConfig } from 'vite';
import { rmSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NEVER, writeCredits } from './tools/publish.mjs';

// tools/build-pages.mjs (the public GitHub Pages version) sets PAGES_SITE: only the experience, and no wholesale copy of
// assets/ -- the script copies just the files the story loads
const SITE = !!process.env.PAGES_SITE;
// Vercel (it sets VERCEL=1) builds the published piece from the repo with `npm run build`: assets/ is copied whole,
// so after the build what must never be published is dropped (tools/publish.mjs: the unlicensed and NC assets, raw
// generations), the credits pages are written, and the model comparison page is left out (its files are not shipped)
const VERCEL = !!process.env.VERCEL;

export default defineConfig({
  publicDir: SITE ? false : 'assets',
  base: process.env.PAGES_BASE || '/', // GitHub Pages build sets PAGES_BASE=/<repo>/
  build: { target: 'esnext', chunkSizeWarningLimit: 3000, rollupOptions: { input: SITE || VERCEL ? { main: 'index.html' } : { main: 'index.html', compare: 'compare.html' } } },
  // one three.js: addons import 'three', the app imports 'three/webgpu' (a superset) -- alias so both resolve to the
  // same module instead of bundling and running two copies of the core
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  plugins: [(() => { let out = 'dist', root = process.cwd(); return {
    // assets/generated holds the raw generation records (reference images, Tripo originals): never shipped. The model
    // comparison stage's raw models (generated/compare, ~560 MB) are kept only when KEEP_COMPARE=1.
    name: 'drop-generated',
    apply: 'build',
    configResolved(c) { out = path.resolve(c.root, c.build.outDir); root = c.root; }, // (--outDir: not always dist)
    closeBundle() {
      if (SITE) return;
      const g = `${out}/generated`;
      if (!process.env.KEEP_COMPARE || VERCEL) rmSync(g, { recursive: true, force: true });
      else for (const f of readdirSync(g)) if (f !== 'compare') rmSync(`${g}/${f}`, { recursive: true, force: true });
      if (!VERCEL) return;
      const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
      let dropped = 0;
      for (const f of walk(out)) { const rel = path.relative(out, f).split(path.sep).join('/'); if (NEVER.some((re) => re.test(rel))) { rmSync(f, { force: true }); dropped++; } }
      const audio = path.join(out, 'audio'), sounds = statSync(audio, { throwIfNoEntry: false }) ? walk(audio).map((f) => path.basename(f).replace(/\.[^.]+$/, '')) : [];
      const lines = writeCredits({ root, out, sounds });
      console.log(`[vercel] dropped ${dropped} files that must not be published; credits pages with ${lines.length} sound credits`);
    },
  }; })()],
});
