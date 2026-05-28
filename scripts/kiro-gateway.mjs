#!/usr/bin/env node
// Standalone Kiro Gateway runner.
// Reads token+port from ~/.openclaw/openclaw.json (kiro:default profile)
// and serves Anthropic-shape /v1/messages backed by the user's local Kiro session.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');

// We import the compiled TS via ts-node on the fly. Easier path: shell out
// through tsx if available, otherwise fall back to dist outputs.
const distGateway = path.join(ROOT, 'out', 'main', 'llm-provider', 'http-gateway.js');
const srcGateway = path.join(ROOT, 'src', 'main', 'llm-provider', 'http-gateway.ts');

async function loadGateway() {
  if (fs.existsSync(distGateway)) {
    return import(pathToFileURL(distGateway).href);
  }
  // Try tsx loader
  try {
    await import('tsx/esm/api');
    const { tsImport } = await import('tsx/esm/api');
    return tsImport(srcGateway, import.meta.url);
  } catch {
    console.error('[kiro-gateway-cli] need either compiled out/ or `tsx` available.');
    console.error(`Looked for: ${distGateway}`);
    console.error('Run `npm install` and `npm run build:main` first, or `npx tsx scripts/kiro-gateway.mjs`');
    process.exit(2);
  }
}

function readGatewayConfig() {
  // Prefer per-agent auth-profiles.json (where wire-openclaw-kiro.mjs stores the token).
  const agentsRoot = path.join(os.homedir(), '.openclaw', 'agents');
  if (fs.existsSync(agentsRoot)) {
    for (const name of fs.readdirSync(agentsRoot)) {
      const p = path.join(agentsRoot, name, 'agent', 'auth-profiles.json');
      if (!fs.existsSync(p)) continue;
      try {
        const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const token = c?.profiles?.['kiro:default']?.key;
        if (typeof token === 'string' && token.length >= 16) {
          return { token, port: 18790 };
        }
      } catch {}
    }
  }
  // Fallback: top-level openclaw.json (older configurator versions).
  const top = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  if (fs.existsSync(top)) {
    const c = JSON.parse(fs.readFileSync(top, 'utf-8'));
    const profile = c?.auth?.profiles?.['kiro:default'];
    if (profile && typeof profile.apiKey === 'string') {
      const baseUrl = profile.baseUrl || 'http://127.0.0.1:18790';
      return { token: profile.apiKey, port: Number(new URL(baseUrl).port) || 18790 };
    }
  }
  console.error('[kiro-gateway-cli] no kiro:default profile found.');
  console.error('Run `node scripts/wire-openclaw-kiro.mjs` first.');
  process.exit(2);
}

async function main() {
  const { token, port } = readGatewayConfig();
  const mod = await loadGateway();
  await mod.startKiroGateway({ token, port });
  console.log(`[kiro-gateway-cli] gateway up on http://127.0.0.1:${port} — token from per-agent auth-profiles.json`);

  // Health probe so we know it's alive
  const probe = await new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/health', method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
  console.log('[kiro-gateway-cli] health:', probe);

  // Stay alive
  const shutdown = async () => {
    console.log('\n[kiro-gateway-cli] shutting down…');
    await mod.stopKiroGateway();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[kiro-gateway-cli] fatal:', err);
  process.exit(1);
});
