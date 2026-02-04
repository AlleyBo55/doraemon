import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [preact()],
    build: {
      outDir: 'out/renderer',
    },
    publicDir: resolve(__dirname, 'src/renderer/public'),
    server: {
      fs: {
        allow: [resolve(__dirname, 'assets'), resolve(__dirname, 'src')],
      },
    },
  },
});
