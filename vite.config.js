import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'assets',
  build: { target: 'esnext', chunkSizeWarningLimit: 3000 },
});
