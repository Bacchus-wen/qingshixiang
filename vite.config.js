import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';

export default defineConfig({
  publicDir: 'assets',
  base: process.env.PAGES_BASE || '/', // GitHub Pages build sets PAGES_BASE=/<repo>/
  build: { target: 'esnext', chunkSizeWarningLimit: 3000 },
  plugins: [{
    // assets/generated holds the raw generation records (reference images, Tripo originals): never shipped
    name: 'drop-generated',
    apply: 'build',
    closeBundle() { rmSync('dist/generated', { recursive: true, force: true }); },
  }],
});
