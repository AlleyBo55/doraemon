import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.cjs',
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
    publicDir: resolve(__dirname, 'src/renderer/public'),
    server: {
      fs: {
        allow: [resolve(__dirname, 'assets'), resolve(__dirname, 'src')],
      },
    },
  },
});
