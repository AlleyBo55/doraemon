import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes('--watch');

/** Extension host: CommonJS, Node platform, vscode provided by the runtime. */
const hostConfig = {
  entryPoints: [path.join(root, 'src/extension.ts')],
  outfile: path.join(root, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: !watch ? false : 'inline',
  minify: !watch,
  logLevel: 'info',
};

/** Webview: plain browser bundle, no module loader needed. */
const webviewConfig = {
  entryPoints: [path.join(root, 'src/webview/main.ts')],
  outfile: path.join(root, 'dist/webview.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: !watch ? false : 'inline',
  minify: !watch,
  logLevel: 'info',
};

/**
 * Standalone floating mascot renderer. Lives in media/ because the Rust
 * companion serves that directory over its custom protocol.
 */
const companionConfig = {
  entryPoints: [path.join(root, 'src/companion/main.ts')],
  outfile: path.join(root, 'media/companion.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: false,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const contexts = await Promise.all([
    context(hostConfig),
    context(webviewConfig),
    context(companionConfig),
  ]);
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[doraemon] watching for changes');
} else {
  await Promise.all([build(hostConfig), build(webviewConfig), build(companionConfig)]);
  console.log('[doraemon] build complete');
}
