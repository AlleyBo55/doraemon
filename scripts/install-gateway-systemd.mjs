#!/usr/bin/env node
// Linux companion to install-gateway-launchagent.mjs.
// Installs a systemd --user service that runs the kiro gateway.
//
// Usage:  node scripts/install-gateway-systemd.mjs
//
// Logs: journalctl --user -u doraemon-kiro-gateway -f
// Stop: systemctl --user stop doraemon-kiro-gateway
// Disable: systemctl --user disable doraemon-kiro-gateway

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

if (process.platform !== 'linux') {
  console.error('[install-systemd] this script is for Linux. On macOS use install-gateway-launchagent.mjs.');
  process.exit(2);
}

const SERVICE_NAME = 'doraemon-kiro-gateway.service';
const SYSTEMD_USER_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const UNIT_PATH = path.join(SYSTEMD_USER_DIR, SERVICE_NAME);

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'kiro-gateway.mjs');

function findNode() {
  return process.execPath;
}

function findNpx() {
  const node = findNode();
  const candidates = [
    path.join(path.dirname(node), 'npx'),
    '/usr/local/bin/npx',
    '/usr/bin/npx',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'npx';
}

function buildUnit() {
  const node = findNode();
  const npx = findNpx();
  const pathEnv = `${path.dirname(node)}:/usr/local/bin:/usr/bin:/bin`;
  return `[Unit]
Description=Doraemon Kiro Gateway (Anthropic-shape proxy backed by your Kiro session)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_ROOT}
Environment=HOME=${os.homedir()}
Environment=PATH=${pathEnv}
ExecStart=${npx} tsx ${SCRIPT}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`;
}

function ensureLingerEnabled() {
  // loginctl enable-linger keeps the user instance alive across reboots.
  try {
    const out = execSync(`loginctl show-user ${process.env['USER'] || ''} -p Linger --value`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (out === 'yes') {
      console.log('[install-systemd] linger already enabled');
      return;
    }
    console.log('[install-systemd] enabling linger so the service survives logout/reboots');
    execSync(`sudo loginctl enable-linger ${process.env['USER']}`, { stdio: 'inherit' });
  } catch (err) {
    console.warn(
      '[install-systemd] could not enable linger automatically. Run manually:\n' +
        `    sudo loginctl enable-linger ${process.env['USER']}`,
    );
  }
}

function main() {
  fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
  fs.writeFileSync(UNIT_PATH, buildUnit());
  console.log('[install-systemd] wrote', UNIT_PATH);

  ensureLingerEnabled();

  execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
  try {
    execSync(`systemctl --user enable --now ${SERVICE_NAME}`, { stdio: 'inherit' });
  } catch (err) {
    // If the user instance can't talk to the manager (no DBUS), bail with help.
    console.error('[install-systemd] systemctl --user failed.');
    console.error('If you are inside a remote ssh session without a user instance, try:');
    console.error('  sudo systemctl start user@$(id -u).service');
    console.error('Then re-run this script.');
    process.exit(1);
  }
  console.log(`\n[install-systemd] DONE.`);
  console.log(`  status:  systemctl --user status ${SERVICE_NAME}`);
  console.log(`  logs:    journalctl --user -u ${SERVICE_NAME} -f`);
  console.log(`  stop:    systemctl --user stop ${SERVICE_NAME}`);
}

main();
