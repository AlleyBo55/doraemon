/**
 * Compiles the Rust floating-mascot companion and stages the binary under
 * bin/<platform>-<arch>/ so it ships inside the VSIX. One extension install then
 * gives a transparent desktop mascot with nothing else to download.
 *
 * Skips gracefully when cargo is unavailable: sidebar and window modes still
 * work without the companion, so a missing Rust toolchain must not fail the build.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const crateDir = path.join(root, 'companion');

const BINARY_NAME = process.platform === 'win32' ? 'doraemon-companion.exe' : 'doraemon-companion';

/** Flags win over env, so CI can configure a whole job without extra steps. */
const argValue = (name, envKey) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ||
  process.env[envKey] ||
  undefined;

/**
 * Rust triple to build for. Left empty this builds natively; set it to
 * cross-compile, e.g. x86_64-apple-darwin from an arm64 mac.
 */
const rustTarget = argValue('rust-target', 'DORAEMON_RUST_TARGET');

/** VSIX-friendly folder the extension looks in at runtime. */
export const targetTriple = () =>
  argValue('vsix-target', 'DORAEMON_VSIX_TARGET') ?? `${process.platform}-${process.arch}`;

const cargo = (args) =>
  spawnSync('cargo', args, {
    cwd: crateDir,
    stdio: 'inherit',
    // cargo is an .exe on Windows so no shell is needed, but stay consistent
    // with release.mjs in case a wrapper shim is ever used.
    shell: process.platform === 'win32',
  });

const hasCargo = () =>
  spawnSync('cargo', ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  }).status === 0;

async function main() {
  if (!hasCargo()) {
    console.warn('[doraemon] cargo not found, skipping the companion binary.');
    console.warn('[doraemon] sidebar and window modes will still work.');
    return;
  }

  if (rustTarget) {
    console.log(`[doraemon] cross-compiling for ${rustTarget}`);
    const added = cargo(['fetch']);
    if (added.status !== 0) process.exit(added.status ?? 1);
  }

  const buildArgs = ['build', '--release'];
  if (rustTarget) buildArgs.push('--target', rustTarget);

  const build = cargo(buildArgs);
  if (build.status !== 0) {
    console.error('[doraemon] companion build failed');
    process.exit(build.status ?? 1);
  }

  const releaseDir = rustTarget
    ? path.join(crateDir, 'target', rustTarget, 'release')
    : path.join(crateDir, 'target/release');

  const from = path.join(releaseDir, BINARY_NAME);
  const destinationDir = path.join(root, 'bin', targetTriple());
  const to = path.join(destinationDir, BINARY_NAME);

  await fs.mkdir(destinationDir, { recursive: true });
  await fs.copyFile(from, to);
  await fs.chmod(to, 0o755);

  const { size } = await fs.stat(to);
  console.log(
    `[doraemon] companion staged: bin/${targetTriple()}/${BINARY_NAME} ` +
      `(${(size / 1024).toFixed(0)} KB)`
  );
}

await main();
