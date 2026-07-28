/**
 * Publishes an already-packaged VSIX to Open VSX, the registry Kiro installs
 * from. Packaging happens on the platform that can compile the native mascot;
 * uploading is just an HTTP request, so it is split out and runs anywhere.
 *
 *   node scripts/publish.mjs --target darwin-arm64
 *
 * Expects the matching VSIX to already exist in release/, which is how the CI
 * publish job consumes the artifact the build job produced.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf-8'));

const target = process.argv.find((arg) => arg.startsWith('--target='))?.split('=')[1];
if (!target) {
  console.error('[doraemon] usage: node scripts/publish.mjs --target=<platform>');
  process.exit(1);
}

if (!process.env['OVSX_PAT']) {
  console.error('[doraemon] OVSX_PAT resolved to an empty string, refusing to publish.');
  console.error('');
  console.error('[doraemon] In CI this usually means the secret lives under an');
  console.error('[doraemon] environment, but the job did not declare "environment:".');
  console.error('[doraemon] Locally, create a token at:');
  console.error('[doraemon] https://open-vsx.org/user-settings/tokens');
  process.exit(1);
}

/*
 * The tag names the release but the version comes from package.json. Publishing a
 * mismatch is unrecoverable: Open VSX treats a version as immutable, so the wrong
 * number cannot be replaced afterwards, only superseded by a higher one.
 */
const tag = process.env['GITHUB_REF_NAME'];
if (tag?.startsWith('kiro-extension-v')) {
  const tagged = tag.slice('kiro-extension-v'.length);
  if (tagged !== manifest.version) {
    console.error(`[doraemon] tag ${tag} does not match package.json ${manifest.version}.`);
    console.error('[doraemon] bump the version and retag, rather than publishing a mismatch.');
    process.exit(1);
  }
}

// Mirrors the name release.mjs packages under, so no globbing is needed.
const vsix = path.join(root, 'release', `${manifest.name}-${manifest.version}-${target}.vsix`);
try {
  await fs.access(vsix);
} catch {
  console.error(`[doraemon] ${path.relative(root, vsix)} is missing.`);
  console.error('[doraemon] package it first, or check the build artifact was downloaded.');
  process.exit(1);
}

const { size } = await fs.stat(vsix);
console.log(`[doraemon] publishing ${path.relative(root, vsix)} (${(size / 1024 / 1024).toFixed(2)} MB)`);

/*
 * Publishing into a namespace that does not exist fails outright. Creating it is
 * idempotent, so doing it here means the first ever release needs no manual step.
 * Four platforms race to create the same namespace and three will lose, which is
 * why an "already exists" result is treated as success.
 */
console.log(`[doraemon] ensuring namespace "${manifest.publisher}" exists`);
const namespace = spawnSync('npx', ['--yes', 'ovsx', 'create-namespace', manifest.publisher], {
  cwd: root,
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});
const namespaceOutput = `${namespace.stdout ?? ''}${namespace.stderr ?? ''}`;
if (namespace.status !== 0 && !/already (exists|owned)/i.test(namespaceOutput)) {
  console.error('[doraemon] could not create the namespace:');
  console.error(namespaceOutput.trim());
  console.error('[doraemon] claim it manually at https://open-vsx.org and retry.');
  process.exit(1);
}

console.log(`[doraemon] uploading ${target} as "${manifest.publisher}"`);
const publish = spawnSync('npx', ['--yes', 'ovsx', 'publish', vsix, '--target', target], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (publish.status !== 0) {
  console.error(`[doraemon] publishing ${target} failed`);
  process.exit(publish.status ?? 1);
}

console.log(`[doraemon] published ${manifest.name} ${manifest.version} (${target})`);
