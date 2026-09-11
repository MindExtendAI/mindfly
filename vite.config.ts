import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { cpSync, mkdirSync } from 'node:fs';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ command }) => ({
  root: resolve(root, 'standalone'),
  base: '/mindfly/',
  publicDir: command === 'serve' ? resolve(root, 'public') : false,
  define: { __MINDFLY_BASE__: JSON.stringify('/mindfly/') },
  resolve: {
    alias: {
      '@': root,
    },
  },
  plugins: [
    react(),
    {
      name: 'mindfly-static-assets-and-notices',
      apply: 'build',
      closeBundle() {
        const output = resolve(root, 'dist-standalone');
        for (const asset of [
          'brain-fly-outline.png',
          'human-brain-illustration.png',
          'data',
          'fly',
          'wasm',
          'licenses',
          'ATTRIBUTION.txt',
          'neural-layers/anatomy-base.png',
          'neural-layers/layers',
          'neural-layers/manifest.json',
          'neural-layers/ATTRIBUTION.md',
        ]) {
          cpSync(resolve(root, 'public', asset), resolve(output, asset), {
            recursive: true,
          });
        }
        mkdirSync(resolve(output, 'licenses'), { recursive: true });
        for (const [name, file] of [
          ['tailwindcss', 'LICENSE'],
          ['tw-animate-css', 'LICENSE'],
          ['shadcn', 'LICENSE.md'],
        ]) {
          cpSync(
            resolve(root, 'node_modules', name, file),
            resolve(output, 'licenses', `${name}.txt`),
          );
        }
      },
    },
  ],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: resolve(root, 'dist-standalone'),
    emptyOutDir: true,
    sourcemap: false,
    license: { fileName: 'THIRD_PARTY_DEPENDENCIES.md' },
  },
}));
