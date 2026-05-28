#!/usr/bin/env node
// Calls Kiro's ListAvailableModels endpoint with your local credentials so we
// can see EXACTLY which models your entitlement supports (not just what the
// IDE bundle hardcodes).

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const CRED_PATH = path.join(os.homedir(), '.aws', 'sso', 'cache', 'kiro-auth-token.json');
const DEFAULT_REGION = 'us-east-1';

function loadCreds() {
  const raw = fs.readFileSync(CRED_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function refreshIfNeeded(creds) {
  const expiresAt = Date.parse(creds.expiresAt || '1970-01-01');
  if (Number.isFinite(expiresAt) && Date.now() + 60_000 < expiresAt) {
    return creds;
  }
  const region = creds.region || DEFAULT_REGION;
  const url = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: creds.refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh failed HTTP ${res.status}`);
  const data = await res.json();
  return { ...creds, accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: data.expiresAt };
}

async function listModels(creds, origin) {
  const region = creds.region || DEFAULT_REGION;
  const params = new URLSearchParams({ origin, maxResults: '50' });
  if (creds.profileArn) params.set('profileArn', creds.profileArn);
  const url = `https://codewhisperer.${region}.amazonaws.com/ListAvailableModels?${params}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'x-amz-target': 'AmazonCodeWhispererService.ListAvailableModels',
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  return { status: res.status, body: text, origin };
}

async function main() {
  let creds = loadCreds();
  creds = await refreshIfNeeded(creds);
  console.log('region:', creds.region || DEFAULT_REGION);
  console.log('profileArn:', creds.profileArn || '(none)');

  // Try multiple origins; "AI_EDITOR" / "CHAT" / "MARKETPLACE" are typical.
  for (const origin of ['AI_EDITOR', 'CHAT', 'IDE', 'MARKETPLACE']) {
    const r = await listModels(creds, origin);
    console.log(`\n[origin=${origin}] HTTP ${r.status}`);
    console.log(r.body.slice(0, 4000));
  }
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
