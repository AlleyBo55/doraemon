/**
 * Packages a platform-specific VSIX, and optionally publishes it to Open VSX
 * (the registry Kiro installs from).
 *
 *   node scripts/release.mjs            package only
 *   node scripts/release.mjs --publish  package then publish
 *
 * The companion is a native binary, so a VSIX is only valid for the platform it
 * was built on. Each platform must therefore be packaged on that platform and
 * published under its own --target.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf-8'));

/** Matches the folder name the extension looks for at runtime. */
const target = `${process.platform}-${process.arch}`;
const outDir = path.join(root, 'release');
const vsix = path.join(outDir, `${manifest.name}-${manifest.version}-${target}.vsix`);

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n[doraemon] "${command} ${args.join(' ')}" failed`);
    process.exit(result.status ?? 1);
  }
};

async function assertCompanionPresent() {
  const name = process.platform === 'win32' ? 'doraemon-companion.exe' : 'doraemon-companion';
  const binary = path.join(root, 'bin', target, name);

  try {
    await fs.access(binary);
  } catch {
    console.error(`[doraemon] missing ${path.relative(root, binary)}`);
    console.error('[doraemon] run "npm run build-companion" on this platform first.');
    console.error('[doraemon] shipping without it would silently drop desktop mode.');
    process.exit(1);
  }
}

await assertCompanionPresent();
await fs.mkdir(outDir, { recursive: true });

console.log(`[doraemon] packaging for ${target}`);
run('npx', ['--yes', '@vscode/vsce', 'package', '--no-dependencies', '--target', target, '-o', vsix]);

const { size } = await fs.stat(vsix);
console.log(`[doraemon] packaged ${path.relative(root, vsix)} (${(size / 1024 / 1024).toFixed(2)} MB)`);

if (!process.argv.includes('--publish')) {
  console.log('[doraemon] add --publish to upload to Open VSX');
  process.exit(0);
}

if (!process.env['OVSX_PAT']) {
  console.error('[doraemon] OVSX_PAT is not set, refusing to publish.');
  console.error('[doraemon] create a token at https://open-vsx.org/user-settings/tokens');
  process.exit(1);
}

console.log(`[doraemon] publishing ${target} to Open VSX as "${manifest.publisher}"`);
run('npx', ['--yes', 'ovsx', 'publish', vsix, '--target', target]);
console.log('[doraemon] published');
