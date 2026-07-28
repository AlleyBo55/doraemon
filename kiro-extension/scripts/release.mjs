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

/**
 * Matches the folder name the extension looks for at runtime. Overridable so one
 * runner can cross-compile for a sibling architecture, e.g. darwin-x64 built on
 * an arm64 mac, which avoids depending on a second runner image.
 */
/**
 * Universal mode packages one VSIX with no TargetPlatform, carrying every
 * companion binary staged in bin/. That single file installs on any OS, which is
 * what you want when handing someone a download link rather than using a
 * registry. A platform-specific VSIX is refused outright by a mismatched host.
 */
const universal = process.argv.includes('--universal');

const explicitTarget =
  process.argv.find((arg) => arg.startsWith('--target='))?.split('=')[1] ||
  process.env['DORAEMON_VSIX_TARGET'] ||
  undefined;
const target = explicitTarget ?? `${process.platform}-${process.arch}`;
const outDir = path.join(root, 'release');
const label = universal ? 'universal' : target;
const vsix = path.join(outDir, `${manifest.name}-${manifest.version}-${label}.vsix`);

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    // npx is npx.cmd on Windows, and spawnSync cannot exec a .cmd without a
    // shell. Omitting this fails the whole win32 build with a bare ENOENT.
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n[doraemon] "${command} ${args.join(' ')}" failed`);
    process.exit(result.status ?? 1);
  }
};

const ALL_TARGETS = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'];

const binaryFor = (t) =>
  path.join(root, 'bin', t, t.startsWith('win32') ? 'doraemon-companion.exe' : 'doraemon-companion');

const staged = async () => {
  const found = [];
  for (const t of ALL_TARGETS) {
    try {
      await fs.access(binaryFor(t));
      found.push(t);
    } catch {
      // Not built on this machine.
    }
  }
  return found;
};

async function assertCompanionPresent() {
  const present = await staged();

  if (universal) {
    if (present.length === 0) {
      console.error('[doraemon] no companion binaries staged in bin/.');
      console.error('[doraemon] a universal VSIX with none of them has no desktop mode at all.');
      process.exit(1);
    }

    const missing = ALL_TARGETS.filter((t) => !present.includes(t));
    console.log(`[doraemon] universal build includes: ${present.join(', ')}`);
    if (missing.length > 0) {
      // Not fatal: those users still get window and sidebar mode.
      console.warn(`[doraemon] WARNING no companion for: ${missing.join(', ')}`);
      console.warn('[doraemon] those platforms fall back to window mode, not the floating mascot.');
    }
    return;
  }

  if (!present.includes(target)) {
    console.error(`[doraemon] missing ${path.relative(root, binaryFor(target))}`);
    console.error('[doraemon] run "npm run build-companion" on this platform first.');
    console.error('[doraemon] shipping without it would silently drop desktop mode.');
    process.exit(1);
  }
}

await assertCompanionPresent();
await fs.mkdir(outDir, { recursive: true });

console.log(`[doraemon] packaging ${universal ? 'universal (all platforms)' : `for ${target}`}`);
run('npx', [
  '--yes',
  '@vscode/vsce',
  'package',
  '--no-dependencies',
  // Omitting --target leaves TargetPlatform unset, so any host accepts it.
  ...(universal ? [] : ['--target', target]),
  '-o',
  vsix,
]);

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

/*
 * The tag names the release but the VSIX version comes from package.json. If they
 * disagree, the wrong version is published under a misleading tag, and Open VSX
 * will not let it be replaced afterwards.
 */
const tag = process.env['GITHUB_REF_NAME'];
if (tag && tag.startsWith('kiro-extension-v')) {
  const tagged = tag.slice('kiro-extension-v'.length);
  if (tagged !== manifest.version) {
    console.error(`[doraemon] tag ${tag} does not match package.json ${manifest.version}.`);
    console.error('[doraemon] bump the version and retag, rather than publishing a mismatch.');
    process.exit(1);
  }
}

/*
 * Publishing into a namespace that does not exist fails outright. Creating it is
 * idempotent, so doing it here means the first ever release needs no manual step.
 */
console.log(`[doraemon] ensuring namespace "${manifest.publisher}" exists`);
const namespace = spawnSync(
  'npx',
  ['--yes', 'ovsx', 'create-namespace', manifest.publisher],
  { cwd: root, encoding: 'utf-8', shell: process.platform === 'win32' }
);
const namespaceOutput = `${namespace.stdout ?? ''}${namespace.stderr ?? ''}`;
if (namespace.status !== 0 && !/already (exists|owned)/i.test(namespaceOutput)) {
  console.error('[doraemon] could not create the namespace:');
  console.error(namespaceOutput.trim());
  console.error('[doraemon] claim it manually at https://open-vsx.org and retry.');
  process.exit(1);
}

console.log(`[doraemon] publishing ${target} to Open VSX as "${manifest.publisher}"`);
run('npx', ['--yes', 'ovsx', 'publish', vsix, '--target', target]);
console.log(`[doraemon] published ${manifest.name} ${manifest.version} (${target})`);
