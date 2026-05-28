#!/usr/bin/env node
// Step 1: list profiles
// Step 2: with profileArn, list models for each origin
// Step 3: also try a tiny chat call to confirm model IDs

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const CRED_PATH = path.join(os.homedir(), '.aws', 'sso', 'cache', 'kiro-auth-token.json');
const DEFAULT_REGION = 'us-east-1';

function loadCreds() {
  return JSON.parse(fs.readFileSync(CRED_PATH, 'utf-8'));
}

async function refreshIfNeeded(creds) {
  const expiresAt = Date.parse(creds.expiresAt || '1970-01-01');
  if (Number.isFinite(expiresAt) && Date.now() + 60_000 < expiresAt) return creds;
  const region = creds.region || DEFAULT_REGION;
  const url = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: creds.refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh HTTP ${res.status}`);
  const data = await res.json();
  return { ...creds, accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: data.expiresAt };
}

async function call(creds, method, pathName, query, body) {
  const region = creds.region || DEFAULT_REGION;
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const url = `https://codewhisperer.${region}.amazonaws.com${pathName}${qs}`;
  const headers = {
    Authorization: `Bearer ${creds.accessToken}`,
    Accept: 'application/json',
    'User-Agent': 'KiroIDE/1.0',
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  let creds = loadCreds();
  creds = await refreshIfNeeded(creds);
  console.log('region:', creds.region || DEFAULT_REGION);

  // 1) profiles
  console.log('\n=== POST /ListAvailableProfiles ===');
  const profiles = await call(creds, 'POST', '/ListAvailableProfiles', null, JSON.stringify({}));
  console.log('HTTP', profiles.status);
  console.log(profiles.body.slice(0, 2000));

  let profileArn = null;
  try {
    const j = JSON.parse(profiles.body);
    if (Array.isArray(j.profiles) && j.profiles[0]) profileArn = j.profiles[0].arn;
  } catch {}

  if (!profileArn) {
    console.log('\nNo profileArn could be parsed. Stopping.');
    return;
  }
  console.log('\nUsing profileArn:', profileArn);

  // 2) models for each origin
  for (const origin of ['AI_EDITOR', 'CHAT', 'IDE']) {
    console.log(`\n=== GET /ListAvailableModels?origin=${origin} ===`);
    const r = await call(creds, 'GET', '/ListAvailableModels', { origin, maxResults: '50', profileArn });
    console.log('HTTP', r.status);
    console.log(r.body.slice(0, 4000));
  }
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
