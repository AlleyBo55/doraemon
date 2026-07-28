/** Verifies quarantine detection and clearing against a really-quarantined file. */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Module from 'node:module';
import os from 'node:os';

const root = path.dirname(import.meta.dirname);
const out = path.join(root, 'dist/.qcheck.cjs');

// desktop-companion imports vscode, so stub it before loading.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return { workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, window: {}, Uri: {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

await build({
  entryPoints: [path.join(root, 'src/desktop-companion.ts')],
  outfile: out,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  logLevel: 'silent',
});

const require = Module.createRequire(import.meta.url);
const { isQuarantined, clearQuarantine } = require(out);

if (process.platform !== 'darwin') {
  console.log('[doraemon] quarantine is a macOS concept, skipping');
  process.exit(0);
}

const source = path.join(root, 'bin', `darwin-${process.arch}`, 'doraemon-companion');
if (!fs.existsSync(source)) {
  console.log(`[doraemon] ${path.relative(root, source)} not built, skipping`);
  process.exit(0);
}

const clean = path.join(os.tmpdir(), 'dora-q-clean');
const dirty = path.join(os.tmpdir(), 'dora-q-dirty');

for (const copy of [clean, dirty]) {
  fs.copyFileSync(source, copy);
  fs.chmodSync(copy, 0o755);
}

// Reproduce what macOS does to a file that arrived inside a download.
execFileSync('xattr', ['-w', 'com.apple.quarantine', '0083;00000000;Safari;', dirty]);

assert.equal(await isQuarantined(clean), false, 'a locally built binary must read as clean');
console.log('✓ clean binary detected as not quarantined');

assert.equal(await isQuarantined(dirty), true, 'a quarantined binary must be detected');
console.log('✓ quarantined binary detected');

assert.equal(await clearQuarantine(dirty), true, 'clearing must succeed');
assert.equal(await isQuarantined(dirty), false, 'flag must be gone after clearing');
console.log('✓ clearing removes the flag');

// And the cleared binary must now actually run.
let ran = false;
try {
  execFileSync(dirty, [], {
    env: { ...process.env, DORAEMON_ASSET_DIR: path.join(root, 'media') },
    timeout: 5000,
    stdio: 'pipe',
  });
} catch (err) {
  ran = /mascot window ready/.test(String(err.stdout ?? '')) || err.signal === 'SIGTERM';
}
assert.ok(ran, 'the de-quarantined binary must start');
console.log('✓ de-quarantined binary starts');

fs.rmSync(out, { force: true });
fs.rmSync(clean, { force: true });
fs.rmSync(dirty, { force: true });
console.log('\nQuarantine handling verified end to end.');
