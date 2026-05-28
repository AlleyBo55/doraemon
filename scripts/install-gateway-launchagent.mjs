#!/usr/bin/env node
// Installs a macOS LaunchAgent so the Kiro gateway runs in the background and
// survives reboots. Idempotent.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const HOME = os.homedir();
const LABEL = 'dev.doraemon.kiro-gateway';
const PLIST_PATH = path.join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LOG_DIR = path.join(HOME, '.openclaw', 'logs');
const STDOUT_LOG = path.join(LOG_DIR, 'kiro-gateway.log');
const STDERR_LOG = path.join(LOG_DIR, 'kiro-gateway.err.log');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'kiro-gateway.mjs');

function findNode() {
  // Prefer the same node that's running this script.
  return process.execPath;
}

function findNpx() {
  // Resolve npx near our node binary.
  const candidates = [
    path.join(path.dirname(findNode()), 'npx'),
    '/usr/local/bin/npx',
    '/opt/homebrew/bin/npx',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'npx';
}

function buildPlist() {
  const node = findNode();
  const npx = findNpx();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npx}</string>
    <string>tsx</string>
    <string>${SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${STDOUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${STDERR_LOG}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>PATH</key>
    <string>${path.dirname(node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;
}

function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
  fs.writeFileSync(PLIST_PATH, buildPlist());
  console.log('[install] wrote', PLIST_PATH);

  const uid = process.getuid?.() ?? 0;
  try {
    execSync(`launchctl bootout gui/${uid}/${LABEL}`, { stdio: 'pipe' });
  } catch {}
  try {
    execSync(`launchctl bootstrap gui/${uid} ${PLIST_PATH}`, { stdio: 'pipe' });
    console.log('[install] LaunchAgent loaded.');
  } catch (err) {
    console.error('[install] launchctl bootstrap failed:', err.message);
    process.exit(1);
  }
  console.log(`[install] logs:  tail -f ${STDOUT_LOG}`);
  console.log(`[install] stop:  launchctl bootout gui/${uid}/${LABEL}`);
  console.log(`[install] start: launchctl bootstrap gui/${uid} ${PLIST_PATH}`);
}

main();
