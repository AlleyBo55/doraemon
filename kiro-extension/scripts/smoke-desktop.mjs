/**
 * End-to-end check for desktop companion mode: activates the extension host
 * against a stubbed VS Code API with target=desktop, confirms it really spawns
 * the Doraemon desktop app, that reactions reach it over the command channel,
 * and that disposing the extension takes the mascot down with it.
 *
 * Launches a real GUI process, so this is a separate script from `smoke`.
 */
import Module from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dora-ext-'));
const commandDir = path.join(storageDir, 'companion');

const listeners = {};
const commands = new Map();
const config = {
  target: 'desktop',
  desktopAppPath: '',
  showThoughts: true,
  thoughtIntervalSeconds: 45,
  reactToDiagnostics: true,
  breakReminderMinutes: 60,
  idleMinutes: 5,
};
const warnings = [];

const emitter = (name) => (handler) => {
  (listeners[name] ??= []).push(handler);
  return { dispose() {} };
};

class Disposable {
  constructor(fn) { this._fn = fn; }
  dispose() { this._fn?.(); }
}

class EventEmitter {
  constructor() { this._handlers = []; }
  get event() {
    return (handler) => { this._handlers.push(handler); return { dispose() {} }; };
  }
  fire(v) { for (const h of this._handlers) h(v); }
  dispose() { this._handlers.length = 0; }
}

const vscodeStub = {
  Disposable,
  EventEmitter,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Uri: {
    file: (p) => ({ fsPath: p, toString: () => `file://${p}`, scheme: 'file' }),
    joinPath: (base, ...parts) => ({
      fsPath: path.join(base.fsPath, ...parts),
      toString: () => `file://${path.join(base.fsPath, ...parts)}`,
      scheme: 'file',
    }),
  },
  window: {
    activeTextEditor: undefined,
    registerWebviewViewProvider: () => new Disposable(),
    onDidChangeActiveTextEditor: emitter('activeEditor'),
    showQuickPick: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async (m) => { warnings.push(m); return undefined; },
  },
  workspace: {
    getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d) }),
    onDidChangeTextDocument: emitter('changeDoc'),
    onDidSaveTextDocument: emitter('saveDoc'),
    onDidChangeConfiguration: emitter('changeConfig'),
  },
  languages: { getDiagnostics: () => [], onDidChangeDiagnostics: emitter('diagnostics') },
  debug: {
    onDidStartDebugSession: emitter('debugStart'),
    onDidTerminateDebugSession: emitter('debugStop'),
  },
  commands: {
    registerCommand: (id, h) => { commands.set(id, h); return new Disposable(); },
    executeCommand: async () => {},
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, parent, isMain);
};

const require = Module.createRequire(import.meta.url);
const extension = require(path.join(root, 'dist/extension.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const companionPids = () => {
  try {
    const out = execFileSync('pgrep', ['-f', 'DORAEMON_EXTENSION_MODE|--extension-mode'], {
      encoding: 'utf-8',
    });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

/* ── point at the freshly built local app, not a stale packaged one ─────── */

const repo = path.dirname(root);
const electronBinary = path.join(
  repo,
  'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
);
const builtMain = path.join(repo, 'out/main/index.js');

for (const required of [electronBinary, builtMain]) {
  try {
    await fs.access(required);
  } catch {
    console.log(`SKIP: ${required} missing. Run "npm run build" in the repo root first.`);
    process.exit(0);
  }
}

// `exec` so the shim is replaced by Electron and the PID we signal is the real
// process, matching how a packaged app behaves.
const shim = path.join(storageDir, 'doraemon-launcher.sh');
await fs.writeFile(shim, `#!/bin/sh\nexec "${electronBinary}" "${repo}" "$@"\n`, 'utf-8');
await fs.chmod(shim, 0o755);
config.desktopAppPath = shim;

/* ── activate in desktop mode ──────────────────────────────────────────── */

const subscriptions = [];
extension.activate({
  subscriptions,
  extensionUri: vscodeStub.Uri.file(root),
  globalStorageUri: vscodeStub.Uri.file(storageDir),
});

// Spawning is async inside activate; give the process time to appear.
await sleep(9000);

const pidsAfterStart = companionPids();
assert.ok(pidsAfterStart.length > 0, 'desktop mode must spawn the companion process');
assert.equal(warnings.length, 0, `no warnings expected, got: ${warnings.join('; ')}`);
console.log(`✓ companion spawned (pid ${pidsAfterStart[0]})`);

/* ── a reaction reaches the companion over the command channel ─────────── */

const doc = { uri: vscodeStub.Uri.file('/tmp/example.ts'), languageId: 'typescript' };
for (const handler of listeners.saveDoc ?? []) handler(doc);

// The companion deletes each command after consuming it.
let consumed = false;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try {
    await fs.access(path.join(commandDir, 'command.json'));
  } catch {
    consumed = true;
    break;
  }
}
assert.ok(consumed, 'the running companion must consume the command file');
console.log('✓ reaction delivered and consumed by the companion');

/* ── no leftover temp files from the atomic write ───────────────────────── */

const leftovers = (await fs.readdir(commandDir)).filter((f) => f.endsWith('.tmp'));
assert.equal(leftovers.length, 0, `atomic write left temp files: ${leftovers.join(', ')}`);
console.log('✓ no partial-write temp files left behind');

/* ── disposing the extension ends the mascot's stay ────────────────────── */

for (const disposable of subscriptions) disposable.dispose?.();
extension.deactivate();

let stopped = false;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  if (companionPids().length === 0) {
    stopped = true;
    break;
  }
}
assert.ok(stopped, 'disposing the extension must stop the companion');
console.log('✓ companion exits when the extension is disposed');

await fs.rm(storageDir, { recursive: true, force: true });
console.log('\nDesktop companion mode verified end to end.');
