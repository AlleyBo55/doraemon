#!/usr/bin/env node
// Makes OpenClaw's bundled pi-ai read ANTHROPIC_BASE_URL at runtime instead of
// the hardcoded "https://api.anthropic.com" baked into models.generated.js.
//
// This patches a single file inside OpenClaw's installed node_modules and is
// idempotent — re-run after every `npm update -g openclaw`.
//
// Usage:
//   node scripts/patch-openclaw-anthropic-baseurl.mjs
//   ANTHROPIC_BASE_URL=http://127.0.0.1:18790 launchctl bootstrap ...
//
// Works on macOS and Linux. The patched code falls back to the original URL
// when the env var is unset, so it stays safe if you remove the gateway.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PATCH_MARK = '/* doraemon-patched-baseurl-v1 */';
const HARD_URL = 'https://api.anthropic.com';
const PATCHED_EXPR = `(globalThis.process?.env?.ANTHROPIC_BASE_URL || ${JSON.stringify(HARD_URL)}) ${PATCH_MARK}`;

function findOpenClawDir() {
  // Try the npm global root first (works on macOS, Linux).
  try {
    const root = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    const candidate = path.join(root, 'openclaw');
    if (fs.existsSync(candidate)) return candidate;
  } catch {}

  // Fallbacks for common Contabo / Linux paths.
  const guesses = [
    '/usr/lib/node_modules/openclaw',
    '/usr/local/lib/node_modules/openclaw',
    path.join(process.env['HOME'] || '', '.nvm/versions/node'),
  ];
  for (const g of guesses) {
    if (g.endsWith('/.nvm/versions/node') && fs.existsSync(g)) {
      // Pick the first node version dir that contains openclaw.
      for (const v of fs.readdirSync(g)) {
        const cand = path.join(g, v, 'lib', 'node_modules', 'openclaw');
        if (fs.existsSync(cand)) return cand;
      }
      continue;
    }
    if (fs.existsSync(g)) return g;
  }
  throw new Error('Could not locate OpenClaw install dir. Set OPENCLAW_DIR env to override.');
}

function findModelsFile(openclawDir) {
  const target = path.join(
    openclawDir,
    'node_modules',
    '@mariozechner',
    'pi-ai',
    'dist',
    'models.generated.js',
  );
  if (!fs.existsSync(target)) {
    throw new Error(`pi-ai models.generated.js not found at ${target}`);
  }
  return target;
}

function backupOnce(filePath) {
  const bk = `${filePath}.doraemon-original`;
  if (!fs.existsSync(bk)) {
    fs.copyFileSync(filePath, bk);
    console.log('[patch] backup written:', bk);
  } else {
    console.log('[patch] backup already exists:', bk);
  }
  return bk;
}

function applyPatch(filePath) {
  const original = fs.readFileSync(filePath, 'utf-8');
  if (original.includes(PATCH_MARK)) {
    console.log('[patch] already patched. nothing to do.');
    return false;
  }

  // Replace every quoted hardcoded URL with the runtime expression.
  const quoted = `"${HARD_URL}"`;
  if (!original.includes(quoted)) {
    throw new Error(`No occurrence of ${quoted} found — file shape changed; refusing to patch.`);
  }

  const patched = original.split(quoted).join(PATCHED_EXPR);

  fs.writeFileSync(filePath, patched, 'utf-8');
  const occurrences = original.split(quoted).length - 1;
  console.log(`[patch] replaced ${occurrences} occurrence(s) of ${quoted}`);
  return true;
}

function main() {
  const overrideDir = process.env['OPENCLAW_DIR'];
  const openclawDir = overrideDir && fs.existsSync(overrideDir) ? overrideDir : findOpenClawDir();
  console.log('[patch] OpenClaw dir:', openclawDir);

  const target = findModelsFile(openclawDir);
  console.log('[patch] target file:', target);

  backupOnce(target);
  applyPatch(target);

  console.log('\n[patch] DONE. To use it:');
  console.log('  1) Set ANTHROPIC_BASE_URL on the OpenClaw process:');
  console.log('     macOS: PlistBuddy -c \'Add :EnvironmentVariables:ANTHROPIC_BASE_URL string http://127.0.0.1:18790\' ~/Library/LaunchAgents/ai.openclaw.gateway.plist');
  console.log('     Linux/systemd: Environment=ANTHROPIC_BASE_URL=http://127.0.0.1:18790');
  console.log('  2) Restart OpenClaw.');
  console.log('  3) Re-run this script after every `npm update -g openclaw`.');
}

main();
