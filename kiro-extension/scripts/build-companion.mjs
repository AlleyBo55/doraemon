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

/** VSIX-friendly target folder, matching what the extension looks for at runtime. */
export const targetTriple = () => `${process.platform}-${process.arch}`;

const hasCargo = () =>
  spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status === 0;

async function main() {
  if (!hasCargo()) {
    console.warn('[doraemon] cargo not found, skipping the companion binary.');
    console.warn('[doraemon] sidebar and window modes will still work.');
    return;
  }

  const build = spawnSync('cargo', ['build', '--release'], {
    cwd: crateDir,
    stdio: 'inherit',
  });

  if (build.status !== 0) {
    console.error('[doraemon] companion build failed');
    process.exit(build.status ?? 1);
  }

  const from = path.join(crateDir, 'target/release', BINARY_NAME);
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
