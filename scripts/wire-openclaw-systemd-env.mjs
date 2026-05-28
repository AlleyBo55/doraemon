#!/usr/bin/env node
// Linux equivalent of the macOS PlistBuddy step in wire-openclaw-kiro.mjs.
//
// OpenClaw on Linux runs as a systemd --user service when installed by
// `openclaw gateway install`. We add a drop-in override that injects
// ANTHROPIC_BASE_URL into the service's environment.
//
// Drop-in path: ~/.config/systemd/user/<openclaw-unit-name>.d/doraemon-kiro.conf

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

if (process.platform !== 'linux') {
  console.error('[wire-systemd-env] this script is for Linux only.');
  process.exit(2);
}

const KIRO_BASE_URL = 'http://127.0.0.1:18790';
const SYSTEMD_USER_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');

function findOpenClawUnit() {
  if (!fs.existsSync(SYSTEMD_USER_DIR)) return null;
  // Common names: openclaw.service, ai.openclaw.gateway.service, openclaw-gateway.service
  const candidates = fs
    .readdirSync(SYSTEMD_USER_DIR)
    .filter((name) => /openclaw/i.test(name) && name.endsWith('.service'));
  if (candidates.length === 0) return null;
  // Prefer one that contains "gateway".
  const gateway = candidates.find((c) => c.toLowerCase().includes('gateway'));
  return gateway ?? candidates[0];
}

function dropinPathFor(unitName) {
  return path.join(SYSTEMD_USER_DIR, `${unitName}.d`, 'doraemon-kiro.conf');
}

function writeDropin(unitName) {
  const dest = dropinPathFor(unitName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    `[Service]
Environment=ANTHROPIC_BASE_URL=${KIRO_BASE_URL}
Environment=ANTHROPIC_API_URL=${KIRO_BASE_URL}
`,
  );
  console.log('[wire-systemd-env] wrote drop-in', dest);
}

function main() {
  const unit = findOpenClawUnit();
  if (!unit) {
    console.error(
      '[wire-systemd-env] could not find an OpenClaw user service in ' + SYSTEMD_USER_DIR,
    );
    console.error(
      'Install OpenClaw as a user service first:  openclaw gateway install',
    );
    process.exit(2);
  }
  console.log('[wire-systemd-env] OpenClaw unit:', unit);
  writeDropin(unit);
  execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
  try {
    execSync(`systemctl --user restart ${unit}`, { stdio: 'inherit' });
  } catch (err) {
    console.warn(
      '[wire-systemd-env] could not restart automatically. Restart manually with:\n' +
        `    systemctl --user restart ${unit}`,
    );
  }
  console.log('\n[wire-systemd-env] DONE. Verify with:');
  console.log(`    systemctl --user show ${unit} -p Environment`);
}

main();
