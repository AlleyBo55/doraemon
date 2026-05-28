#!/usr/bin/env node
// Wires OpenClaw's per-agent auth profiles + LaunchAgent env so every chat
// hits Doraemon's local Kiro gateway on 127.0.0.1:<PORT>.
//
// Idempotent. Backs up every file it edits.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const HOME = os.homedir();
const OPENCLAW_DIR = path.join(HOME, '.openclaw');
const TOP_CFG = path.join(OPENCLAW_DIR, 'openclaw.json');
const TOP_AUTH = path.join(OPENCLAW_DIR, 'auth-profiles.json');
const AGENTS_DIR = path.join(OPENCLAW_DIR, 'agents');
const LAUNCH_AGENT = path.join(HOME, 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist');

const KIRO_PROFILE_ID = 'kiro:default';
const KIRO_PROVIDER = 'anthropic';
const KIRO_PORT = 18790;
const KIRO_BASE_URL = `http://127.0.0.1:${KIRO_PORT}`;

function backup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dst = `${filePath}.doraemon-backup-${stamp}`;
  fs.copyFileSync(filePath, dst);
  return dst;
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function getOrMintToken() {
  try {
    const c = JSON.parse(fs.readFileSync(TOP_CFG, 'utf-8'));
    const existing = c?.auth?.profiles?.[KIRO_PROFILE_ID]?.apiKey;
    if (typeof existing === 'string' && existing.length >= 16) return existing;
  } catch {}
  for (const dir of fs.readdirSync(AGENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const p = path.join(AGENTS_DIR, dir.name, 'agent', 'auth-profiles.json');
    if (!fs.existsSync(p)) continue;
    try {
      const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const k = c?.profiles?.[KIRO_PROFILE_ID]?.key;
      if (typeof k === 'string' && k.length >= 16) return k;
    } catch {}
  }
  return crypto.randomBytes(32).toString('hex');
}

function fixTopLevelConfig() {
  const cfg = JSON.parse(fs.readFileSync(TOP_CFG, 'utf-8'));
  let changed = false;

  // remove invalid kiro:default that openclaw rejects
  if (cfg.auth?.profiles?.[KIRO_PROFILE_ID]) {
    backup(TOP_CFG);
    delete cfg.auth.profiles[KIRO_PROFILE_ID];
    changed = true;
  }

  // strip private markers from earlier configurator versions
  const md = cfg.agents?.defaults?.model;
  if (md && md._previousPrimary !== undefined) {
    delete md._previousPrimary;
    changed = true;
  }
  if (Array.isArray(cfg.agents?.list)) {
    for (const a of cfg.agents.list) {
      if (a._previousModel !== undefined) {
        delete a._previousModel;
        changed = true;
      }
    }
  }

  if (changed) {
    writeJson(TOP_CFG, cfg);
    console.log('[wire] cleaned ~/.openclaw/openclaw.json');
  }
}

function fixTopLevelAuth() {
  if (!fs.existsSync(TOP_AUTH)) return;
  const c = JSON.parse(fs.readFileSync(TOP_AUTH, 'utf-8'));
  if (c[KIRO_PROFILE_ID]) {
    backup(TOP_AUTH);
    delete c[KIRO_PROFILE_ID];
    writeJson(TOP_AUTH, c);
    console.log('[wire] cleaned ~/.openclaw/auth-profiles.json');
  }
}

function wireAgentAuth(agentDir, token) {
  const file = path.join(AGENTS_DIR, agentDir, 'agent', 'auth-profiles.json');
  if (!fs.existsSync(file)) return false;
  const c = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!c.profiles) c.profiles = {};

  const existing = c.profiles[KIRO_PROFILE_ID];
  const desired = { type: 'api_key', provider: KIRO_PROVIDER, key: token };
  const same =
    existing && existing.type === desired.type && existing.provider === desired.provider && existing.key === desired.key;

  let changed = false;
  if (!same) {
    backup(file);
    c.profiles[KIRO_PROFILE_ID] = desired;
    changed = true;
  }

  // Pin lastGood for the anthropic provider to kiro:default.
  if (!c.lastGood) c.lastGood = {};
  if (c.lastGood[KIRO_PROVIDER] !== KIRO_PROFILE_ID) {
    if (!changed) backup(file);
    c.lastGood[KIRO_PROVIDER] = KIRO_PROFILE_ID;
    changed = true;
  }

  if (changed) {
    writeJson(file, c);
    console.log(`[wire] ${agentDir}: auth-profiles.json updated`);
    return true;
  }
  return false;
}

function setAgentAuthOrder(agentDir) {
  try {
    execSync(
      `openclaw models auth order set --provider ${KIRO_PROVIDER} --order ${KIRO_PROFILE_ID} --agent ${agentDir}`,
      { stdio: 'pipe' },
    );
    console.log(`[wire] ${agentDir}: auth order set`);
  } catch (e) {
    // Fallback to writing authOrder field directly
    const file = path.join(AGENTS_DIR, agentDir, 'agent', 'auth-profiles.json');
    if (!fs.existsSync(file)) return;
    const c = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!c.authOrder) c.authOrder = {};
    if (!Array.isArray(c.authOrder[KIRO_PROVIDER]) || c.authOrder[KIRO_PROVIDER][0] !== KIRO_PROFILE_ID) {
      backup(file);
      c.authOrder[KIRO_PROVIDER] = [KIRO_PROFILE_ID];
      writeJson(file, c);
      console.log(`[wire] ${agentDir}: authOrder pinned (cli failed: ${e.message?.slice(0, 80) ?? 'n/a'})`);
    }
  }
}

function patchLaunchAgent() {
  if (process.platform !== 'darwin') {
    console.log('[wire] skipping macOS LaunchAgent (not on darwin)');
    console.log('[wire] for Linux: run `node scripts/wire-openclaw-systemd-env.mjs` next');
    return false;
  }
  if (!fs.existsSync(LAUNCH_AGENT)) {
    console.warn('[wire] LaunchAgent plist not found — skipping env injection');
    return false;
  }
  const setOrAdd = (key, value) => {
    try {
      execSync(
        `/usr/libexec/PlistBuddy -c 'Set :EnvironmentVariables:${key} ${value}' "${LAUNCH_AGENT}"`,
        { stdio: 'pipe' },
      );
    } catch {
      try {
        execSync(
          `/usr/libexec/PlistBuddy -c 'Add :EnvironmentVariables:${key} string ${value}' "${LAUNCH_AGENT}"`,
          { stdio: 'pipe' },
        );
      } catch (e) {
        console.warn(`[wire] plist edit failed for ${key}:`, e.message?.slice(0, 100));
      }
    }
  };
  setOrAdd('ANTHROPIC_BASE_URL', KIRO_BASE_URL);
  setOrAdd('ANTHROPIC_API_URL', KIRO_BASE_URL);
  console.log(`[wire] LaunchAgent plist: ANTHROPIC_BASE_URL=${KIRO_BASE_URL}`);
  return true;
}

function main() {
  if (!fs.existsSync(TOP_CFG)) {
    console.error('[wire] OpenClaw config not found at', TOP_CFG);
    process.exit(2);
  }

  const token = getOrMintToken();
  console.log('[wire] gateway token: <stored in per-agent auth-profiles.json>');
  console.log('[wire] gateway base URL:', KIRO_BASE_URL);

  fixTopLevelConfig();
  fixTopLevelAuth();

  const agentDirs = fs
    .readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let touched = 0;
  for (const dir of agentDirs) {
    if (wireAgentAuth(dir, token)) touched += 1;
    setAgentAuthOrder(dir);
  }

  patchLaunchAgent();

  console.log(`\n[wire] DONE. Updated ${touched}/${agentDirs.length} agent auth files.`);
  console.log('[wire] Next:');
  console.log('  1) Make sure the Kiro gateway is running:  npx tsx scripts/kiro-gateway.mjs');
  console.log('  2) Restart OpenClaw to pick up the env var:');
  console.log('       launchctl bootout gui/$UID/ai.openclaw.gateway 2>/dev/null; launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist');
  console.log('     (or: openclaw gateway stop && openclaw gateway start)');
  console.log('  3) (Optional) Read the gateway token if you need it for debug:');
  console.log("       jq -r '.profiles[\"kiro:default\"].key' ~/.openclaw/agents/main/agent/auth-profiles.json");
}

main();
