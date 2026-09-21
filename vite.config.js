import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb', '**/*.glsl'],
  server: { port: 5174 },
});
