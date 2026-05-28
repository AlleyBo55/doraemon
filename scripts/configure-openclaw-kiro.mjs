#!/usr/bin/env node
// Configures ~/.openclaw/openclaw.json to route through the local Kiro gateway:
//   - orchestrator (agents.defaults.model.primary) → kiro/claude-opus-4-5
//   - every sub-agent in agents.list → kiro/claude-haiku-4-5
//   - auth profile kiro:default points at http://127.0.0.1:<PORT> with a generated token
//
// Idempotent. Backs up the previous config alongside it.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');

const distConfigurator = path.join(ROOT, 'out', 'main', 'llm-provider', 'openclaw-configurator.js');
const srcConfigurator = path.join(ROOT, 'src', 'main', 'llm-provider', 'openclaw-configurator.ts');

const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const DEFAULT_PORT = 18790;

async function loadConfigurator() {
  if (fs.existsSync(distConfigurator)) {
    return import(pathToFileURL(distConfigurator).href);
  }
  try {
    const { tsImport } = await import('tsx/esm/api');
    return tsImport(srcConfigurator, import.meta.url);
  } catch {
    console.error('[configure-openclaw-kiro] need either compiled out/ or tsx available.');
    console.error('Run `npm install` first, or `npx tsx scripts/configure-openclaw-kiro.mjs`');
    process.exit(2);
  }
}

function getOrMintToken() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      const existing = cfg?.auth?.profiles?.['kiro:default']?.apiKey;
      if (typeof existing === 'string' && existing.length >= 16) {
        return existing;
      }
    } catch {
      // fall through to mint
    }
  }
  return crypto.randomBytes(32).toString('hex');
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[configure-openclaw-kiro] OpenClaw config not found at ${CONFIG_PATH}`);
    console.error('Install OpenClaw first: npm install -g @openclaw/cli && openclaw init');
    process.exit(2);
  }

  const token = getOrMintToken();
  const mod = await loadConfigurator();

  const result = await mod.configureOpenClawForKiro({ token, port: DEFAULT_PORT });
  console.log('[configure-openclaw-kiro] wrote', result.configPath);
  console.log('[configure-openclaw-kiro] backup', result.backupPath);
  console.log('[configure-openclaw-kiro] rewrote', result.rewroteAgents, 'sub-agent models to anthropic/claude-haiku-4-5');
  console.log('[configure-openclaw-kiro] orchestrator → anthropic/claude-opus-4-6');
  console.log('[configure-openclaw-kiro] gateway URL → http://127.0.0.1:' + DEFAULT_PORT);
  console.log('\nNext: run `node scripts/kiro-gateway.mjs` (or `npx tsx scripts/kiro-gateway.mjs`)');
  console.log('Then restart OpenClaw: `openclaw gateway stop && openclaw gateway start`');
}

main().catch((err) => {
  console.error('[configure-openclaw-kiro] fatal:', err);
  process.exit(1);
});
