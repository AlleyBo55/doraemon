import { defineConfig } from 'electron-vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: 'src/preload/index.ts',
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [preact()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
          setup: resolve(__dirname, 'src/renderer/setup.html'),
        },
      },
    },
    publicDir: resolve(__dirname, 'assets'),
  },
});
