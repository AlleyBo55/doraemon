/**
 * Loads the built extension host bundle against a stubbed VS Code API and
 * exercises activation, every contributed command, and each activity reaction.
 * Temporary verification harness, not part of the shipped extension.
 */
import Module from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const listeners = {};
const commands = new Map();
const posted = [];
let webviewProvider = null;
let infoMessages = [];
let quickPickAnswer = 'joy';

const emitter = (name) => (handler) => {
  (listeners[name] ??= []).push(handler);
  return { dispose() {} };
};

const config = {
  // Pinned to sidebar so this script never spawns a GUI process.
  // Desktop mode is covered by smoke-desktop.mjs.
  target: 'sidebar',
  desktopAppPath: '',
  showThoughts: true,
  thoughtIntervalSeconds: 45,
  reactToDiagnostics: true,
  breakReminderMinutes: 60,
  idleMinutes: 5,
};

class Disposable {
  constructor(fn) { this._fn = fn; }
  dispose() { this._fn?.(); }
}

class EventEmitter {
  constructor() { this._handlers = []; }
  get event() {
    return (handler) => {
      this._handlers.push(handler);
      return { dispose() {} };
    };
  }
  fire(value) { for (const h of this._handlers) h(value); }
  dispose() { this._handlers.length = 0; }
}

const createdPanels = [];
const executedCommands = [];
const registeredSerializers = new Map();
const openedDocuments = [];
const createdWatchers = [];
const writtenFiles = [];
const existingFiles = new Set();
let stateFileContent = '';

/** Stands in for a webview panel the editor restored after a window reload. */
const makeRestoredPanel = () => {
  const panel = {
    posted: [],
    disposed: false,
    webview: {
      options: {},
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (uri) => uri.toString(),
      postMessage: async (m) => { panel.posted.push(m); return true; },
      onDidReceiveMessage: (h) => { panel._onMessage = h; return new Disposable(); },
    },
    reveal: () => {},
    onDidDispose: (h) => { panel._onDispose = h; return new Disposable(); },
    dispose: () => { panel.disposed = true; panel._onDispose?.(); },
  };
  return panel;
};

const vscodeStub = {
  Disposable,
  EventEmitter,
  ViewColumn: { Active: -1, One: 1 },
  RelativePattern: class { constructor(folder, glob) { this.glob = glob; } toString() { return this.glob; } },
  env: { appName: 'Kiro' },
  extensions: { getExtension: () => undefined },
  tasks: {
    onDidStartTask: emitter('taskStart'),
    onDidEndTaskProcess: emitter('taskEnd'),
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Uri: {
    joinPath: (base, ...parts) => ({
      fsPath: path.join(base.fsPath, ...parts),
      toString: () => `file://${path.join(base.fsPath, ...parts)}`,
      scheme: 'file',
    }),
    file: (p) => ({ fsPath: p, toString: () => `file://${p}`, scheme: 'file' }),
  },
  window: {
    activeTextEditor: undefined,
    registerWebviewViewProvider: (id, provider) => {
      webviewProvider = { id, provider };
      return new Disposable();
    },
    onDidChangeActiveTextEditor: emitter('activeEditor'),
    onDidChangeTextEditorSelection: emitter('selection'),
    onDidOpenTerminal: emitter('terminalOpen'),
    onDidStartTerminalShellExecution: emitter('shellStart'),
    onDidEndTerminalShellExecution: emitter('shellEnd'),
    onDidChangeWindowState: emitter('windowState'),
    state: { focused: true },
    showQuickPick: async () => quickPickAnswer,
    showTextDocument: async () => undefined,
    showOpenDialog: async () => undefined,
    showErrorMessage: async (msg) => { infoMessages.push(msg); return undefined; },
    showInformationMessage: async (msg) => { infoMessages.push(msg); return undefined; },
    showWarningMessage: async (msg) => { infoMessages.push(msg); return undefined; },
    registerWebviewPanelSerializer: (viewType, serializer) => {
      registeredSerializers.set(viewType, serializer);
      return new Disposable();
    },
    createWebviewPanel: (viewType, title) => {
      const panel = {
        viewType,
        title,
        posted: [],
        webview: {
          options: {},
          html: '',
          cspSource: 'vscode-resource:',
          asWebviewUri: (uri) => uri.toString(),
          postMessage: async (m) => { panel.posted.push(m); return true; },
          onDidReceiveMessage: (h) => { panel._onMessage = h; return new Disposable(); },
        },
        reveal: () => {},
        onDidDispose: (h) => { panel._onDispose = h; return new Disposable(); },
        dispose: () => { panel._disposed = true; panel._onDispose?.(); },
      };
      createdPanels.push(panel);
      return panel;
    },
  },
  workspace: {
    getConfiguration: () => ({
      get: (key, fallback) => (key in config ? config[key] : fallback),
    }),
    openTextDocument: async (opts) => {
      openedDocuments.push(opts);
      return opts;
    },
    onDidChangeTextDocument: emitter('changeDoc'),
    onDidSaveTextDocument: emitter('saveDoc'),
    workspaceFolders: [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }],
    onDidChangeWorkspaceFolders: emitter('folders'),
    fs: {
      readFile: async () => Buffer.from(stateFileContent, 'utf-8'),
      stat: async (uri) => {
        const relative = String(uri.fsPath).replace(/^\/ws\//, '');
        if (existingFiles.has(relative)) return { type: 1, size: 1 };
        throw new Error('ENOENT');
      },
      createDirectory: async () => {},
      writeFile: async (uri, bytes) => {
        writtenFiles.push({
          path: String(uri.fsPath),
          content: Buffer.from(bytes).toString('utf-8'),
        });
      },
    },
    createFileSystemWatcher: (pattern) => {
      const handlers = [];
      const watcher = {
        pattern: String(pattern),
        onDidCreate: (h) => { handlers.push(h); return new Disposable(); },
        onDidChange: (h) => { handlers.push(h); return new Disposable(); },
        onDidDelete: () => new Disposable(),
        dispose: () => {},
        // Awaits handlers so async reads settle before assertions run.
        fire: async (uri) => { for (const h of handlers) await h(uri); },
      };
      createdWatchers.push(watcher);
      return watcher;
    },
    onDidChangeConfiguration: emitter('changeConfig'),
    onDidCreateFiles: emitter('createFiles'),
    onDidDeleteFiles: emitter('deleteFiles'),
    onDidRenameFiles: emitter('renameFiles'),
  },
  languages: {
    getDiagnostics: (uri) => (uri ? [] : []),
    onDidChangeDiagnostics: emitter('diagnostics'),
  },
  debug: {
    onDidStartDebugSession: emitter('debugStart'),
    onDidTerminateDebugSession: emitter('debugStop'),
    onDidChangeBreakpoints: emitter('breakpoints'),
  },
  commands: {
    registerCommand: (id, handler) => {
      commands.set(id, handler);
      return new Disposable();
    },
    executeCommand: async (id) => { executedCommands.push(id); },
  },
};

// Intercept require('vscode') for the bundled CJS extension host.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, parent, isMain);
};

const require = Module.createRequire(import.meta.url);
const extension = require(path.join(root, 'dist/extension.js'));

/* ── activate ──────────────────────────────────────────────────────────── */

const subscriptions = [];
const globalStateStore = new Map();
extension.activate({
  subscriptions,
  extensionUri: vscodeStub.Uri.file(root),
  globalStorageUri: vscodeStub.Uri.file(path.join(root, '.test-storage')),
  globalState: {
    get: (k, d) => (globalStateStore.has(k) ? globalStateStore.get(k) : d),
    update: async (k, v) => { globalStateStore.set(k, v); },
  },
});

assert.equal(webviewProvider?.id, 'doraemon.pet', 'pet view provider must register');
assert.ok(subscriptions.length > 0, 'activation must register disposables');

for (const id of [
  'doraemon.focus',
  'doraemon.triggerEmotion',
  'doraemon.showStats',
  'doraemon.resetPosition',
]) {
  assert.ok(commands.has(id), `command ${id} must be registered`);
}
console.log(`✓ activate registered ${commands.size} commands and the pet view`);

/* ── webview receives reactions ────────────────────────────────────────── */

const view = {
  visible: true,
  webview: {
    options: {},
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: (uri) => uri.toString(),
    postMessage: async (msg) => { posted.push(msg); return true; },
    onDidReceiveMessage: (handler) => { view._onMessage = handler; return new Disposable(); },
  },
  onDidDispose: () => new Disposable(),
};

webviewProvider.provider.resolveWebviewView(view);
assert.ok(view.webview.html.includes('<img id="sprite"'), 'html must render the sprite element');
assert.ok(view.webview.html.includes('Content-Security-Policy'), 'html must set a CSP');
assert.ok(view.webview.html.includes('dora-sprites'), 'html must expose the sprite base');
assert.ok(!view.webview.html.includes("script-src 'unsafe-inline'"), 'scripts must be nonce-gated');
console.log('✓ webview html renders with a nonce-gated CSP');

/* ── activity reactions produce messages ───────────────────────────────── */

const doc = {
  uri: vscodeStub.Uri.file('/tmp/example.ts'),
  languageId: 'typescript',
};

posted.length = 0;
for (const handler of listeners.changeDoc ?? []) {
  handler({ document: doc, contentChanges: [{ text: 'x' }] });
}
assert.equal(posted.length, 1, 'typing must produce exactly one reaction');
assert.equal(posted[0].type, 'react');
assert.equal(posted[0].animation, 'action_coding_typing');
console.log(`✓ typing -> ${posted[0].emotion} / ${posted[0].animation}`);

// Typing again immediately must be throttled.
posted.length = 0;
for (const handler of listeners.changeDoc ?? []) {
  handler({ document: doc, contentChanges: [{ text: 'y' }] });
}
assert.equal(posted.length, 0, 'repeated typing must be throttled');
console.log('✓ repeated typing is throttled');

posted.length = 0;
for (const handler of listeners.saveDoc ?? []) handler(doc);
assert.equal(posted[0]?.emotion, 'satisfaction', 'saving must read as satisfaction');
console.log(`✓ save -> ${posted[0].emotion}`);

/** Fires an event group and returns the reaction it produced. */
const fire0 = (group, ...args) => {
  posted.length = 0;
  for (const handler of listeners[group] ?? []) handler(...args);
  return posted[0];
};

posted.length = 0;
for (const handler of listeners.activeEditor ?? []) handler({ document: doc });
assert.match(posted[0]?.thought ?? '', /TypeScript/, 'file switch must name the language');
console.log(`✓ switch file -> "${posted[0].thought}"`);

// The language pool is keyed by language, so it must never be mismatched.
for (let i = 0; i < 40; i++) {
  const line = fire0('activeEditor', { document: doc })?.thought ?? '';
  assert.doesNotMatch(
    line,
    /\b(CSS|Python|Rust|Ruby|PHP|Swift|Kotlin|Java|Go|C\+\+)\b/,
    `TypeScript file got a mismatched language line: "${line}"`
  );
}
console.log('✓ language lines always match the actual file language');

posted.length = 0;
for (const handler of listeners.debugStart ?? []) handler({});
assert.equal(posted[0]?.emotion, 'determination');
for (const handler of listeners.debugStop ?? []) handler({});
console.log('✓ debug start/stop react');

/* ── errors appearing and clearing ─────────────────────────────────────── */

vscodeStub.window.activeTextEditor = { document: doc };
let fakeErrors = 3;
vscodeStub.languages.getDiagnostics = (uri) =>
  uri ? Array.from({ length: fakeErrors }, () => ({ severity: 0 })) : [];

posted.length = 0;
for (const handler of listeners.diagnostics ?? []) handler({ uris: [doc.uri] });
assert.equal(posted[0]?.emotion, 'concern', '3 errors should be concern, not frustration');

fakeErrors = 9;
posted.length = 0;
for (const handler of listeners.diagnostics ?? []) handler({ uris: [doc.uri] });
assert.equal(posted[0]?.emotion, 'frustration', '9 errors should escalate to frustration');
assert.match(posted[0]?.thought ?? '', /9 errors/);

fakeErrors = 0;
posted.length = 0;
for (const handler of listeners.diagnostics ?? []) handler({ uris: [doc.uri] });
assert.equal(posted[0]?.emotion, 'pride', 'clearing errors should read as pride');
console.log('✓ diagnostics escalate 3->concern, 9->frustration, 0->pride');

/* ── commands run ──────────────────────────────────────────────────────── */

posted.length = 0;
quickPickAnswer = 'hungry';
await commands.get('doraemon.triggerEmotion')();
assert.equal(posted[0]?.emotion, 'hungry', 'quick pick choice must reach the webview');

posted.length = 0;
await commands.get('doraemon.resetPosition')();
assert.equal(posted[0]?.type, 'resetPosition');

infoMessages = [];
await commands.get('doraemon.showStats')();
assert.match(infoMessages[0] ?? '', /files/, 'stats must report file count');
assert.match(infoMessages[0] ?? '', /typescript/, 'stats must report the language used');
console.log(`✓ stats -> ${infoMessages[0]}`);

/* ── poking round-trips from the webview ───────────────────────────────── */

posted.length = 0;
view._onMessage({ type: 'poked' });
assert.equal(posted[0]?.emotion, 'playful', 'a poke must produce a playful reaction');
console.log('✓ poke round-trips webview -> host -> webview');

/* ── thoughts can be muted ─────────────────────────────────────────────── */

config.showThoughts = false;
posted.length = 0;
view._onMessage({ type: 'poked' });
assert.equal(posted[0]?.thought, null, 'showThoughts=false must suppress bubble text');
assert.equal(posted[0]?.emotion, 'playful', 'muting thoughts must not mute animation');
console.log('✓ showThoughts=false suppresses text but keeps animation');

/* ── the wider activity surface ────────────────────────────────────────── */

// An earlier block muted thoughts; these checks assert on thought text.
config.showThoughts = true;

/** Fires an event group and returns the single reaction it produced. */
const fire = (group, ...args) => {
  posted.length = 0;
  for (const handler of listeners[group] ?? []) handler(...args);
  return posted[0];
};

const fileUri = (p) => ({ ...vscodeStub.Uri.file(p), path: p });

{
  const created = fire('createFiles', { files: [fileUri('/tmp/brand-new.ts')] });
  assert.match(created?.thought ?? '', /brand-new\.ts/, 'file creation must name the file');

  const deleted = fire('deleteFiles', { files: [fileUri('/tmp/old.ts')] });
  assert.match(deleted?.thought ?? '', /old\.ts/, 'file deletion must name the file');

  const renamed = fire('renameFiles', { files: [{ oldUri: fileUri('/a'), newUri: fileUri('/b') }] });
  assert.equal(renamed?.emotion, 'wonder', 'rename must react');
  console.log('✓ file create / delete / rename react');
}

{
  const opened = fire('terminalOpen', {});
  assert.equal(opened?.emotion, 'curiosity', 'opening a terminal must react');

  const test = fire('shellStart', { execution: { commandLine: { value: 'npm test' } } });
  assert.match(test?.thought ?? '', /[Tt]ests/, `npm test should be recognised, got: ${test?.thought}`);

  // Throttled straight after, so advance past the window using a fresh command.
  await new Promise((r) => setTimeout(r, 10));
  const failed = fire('shellEnd', {
    exitCode: 1,
    execution: { commandLine: { value: 'npm test' } },
  });
  assert.equal(failed?.emotion, 'frustration', 'a failing command must read as frustration');

  const ok = fire('shellEnd', { exitCode: 0, execution: { commandLine: { value: 'ls' } } });
  assert.equal(ok, undefined, 'a successful command must not trigger the failure reaction');
  console.log('✓ terminal open, command recognition, and failure detection');
}

{
  const started = fire('taskStart', { execution: { task: { name: 'build' } } });
  assert.match(started?.thought ?? '', /build/, 'task start must name the task');

  const passed = fire('taskEnd', { exitCode: 0, execution: { task: { name: 'build' } } });
  assert.equal(passed?.emotion, 'joy', 'a passing task must read as joy');

  const failedTask = fire('taskEnd', { exitCode: 2, execution: { task: { name: 'lint' } } });
  assert.equal(failedTask?.emotion, 'concern', 'a failing task must read as concern');
  assert.match(failedTask?.thought ?? '', /lint/, 'a failing task must name the task');
  console.log('✓ task start / success / failure react with the task name');
}

{
  const bp = fire('breakpoints', { added: [{}], removed: [], changed: [] });
  assert.equal(bp?.emotion, 'curiosity', 'adding a breakpoint must react');

  const removedOnly = fire('breakpoints', { added: [], removed: [{}], changed: [] });
  assert.equal(removedOnly, undefined, 'removing a breakpoint alone must stay quiet');
  console.log('✓ breakpoints react on add only');
}

{
  const blurred = fire('windowState', { focused: false });
  assert.equal(blurred?.emotion, 'calm', 'losing focus must settle him down');
  assert.equal(blurred?.thought, null, 'no chatter while you are away');

  const refocused = fire('windowState', { focused: true });
  assert.equal(refocused?.emotion, 'connection', 'regaining focus must greet you');

  const repeat = fire('windowState', { focused: true });
  assert.equal(repeat, undefined, 'repeated identical window state must not re-react');
  console.log('✓ window focus / blur react once per transition');
}

{
  const bigSelection = fire('selection', {
    textEditor: { document: doc },
    selections: [{ isEmpty: false, start: { line: 1 }, end: { line: 40 } }],
  });
  assert.equal(bigSelection?.emotion, 'contemplation', 'a large selection reads as reviewing');

  const smallSelection = fire('selection', {
    textEditor: { document: doc },
    selections: [{ isEmpty: false, start: { line: 1 }, end: { line: 3 } }],
  });
  assert.equal(smallSelection, undefined, 'a small selection must not trigger reading');
  console.log('✓ large selection reads as reviewing code, small ones ignored');
}

/* ── thoughts come from the shared pools, not a handful of literals ────── */

{
  // Saving is not throttled, so it is the cleanest way to sample the pool.
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const r = fire('saveDoc', doc);
    if (r?.thought) seen.add(r.thought);
  }
  assert.ok(
    seen.size > 8,
    `save thoughts should draw from a wide pool, saw only ${seen.size} distinct lines`
  );
  console.log(`✓ thoughts drawn from the shared coding pools (${seen.size} distinct in 80 draws)`);
}

/* ── detached window lives outside the IDE frame ───────────────────────── */

config.showThoughts = true;
executedCommands.length = 0;
await commands.get('doraemon.openInWindow')();

assert.equal(createdPanels.length, 1, 'a webview panel must be created');
assert.ok(
  executedCommands.includes('workbench.action.moveEditorToNewWindow'),
  `panel must be detached into its own OS window, ran: ${executedCommands.join(', ')}`
);
const petWindow = createdPanels[0];
assert.ok(petWindow.webview.html.includes('<img id="sprite"'), 'window must render the sprite');
assert.ok(petWindow.webview.html.includes('Content-Security-Policy'), 'window must set a CSP');
console.log('✓ pet detaches into a separate OS window with the same renderer');

// While the window is open it owns the mascot, so the sidebar must stay quiet.
posted.length = 0;
petWindow.posted.length = 0;
for (const handler of listeners.saveDoc ?? []) handler(doc);
assert.equal(petWindow.posted.length, 1, 'the detached window must receive the reaction');
assert.equal(posted.length, 0, 'the sidebar must not double-react while the window is open');
console.log('✓ detached window owns reactions, no duplicate Doraemon in the sidebar');

// Poking the detached pet still round-trips.
posted.length = 0;
petWindow.posted.length = 0;
petWindow._onMessage({ type: 'poked' });
assert.equal(petWindow.posted[0]?.emotion, 'playful', 'poke must reach the detached window');
console.log('✓ poke works in the detached window');

// Closing it hands ownership back to the sidebar.
await commands.get('doraemon.closeWindow')();
posted.length = 0;
for (const handler of listeners.saveDoc ?? []) handler(doc);
assert.equal(posted.length, 1, 'closing the window must return reactions to the sidebar');
console.log('✓ closing the window hands the mascot back to the sidebar');

/* ── a reloaded window must not leave a dead pet tab ───────────────────── */

{
  const serializer = registeredSerializers.get('doraemon.petPanel');
  assert.ok(serializer, 'a webview panel serializer must be registered');

  // Sidebar mode: the restored tab is adopted and re-rendered, not left blank.
  config.target = 'sidebar';
  const adopted = makeRestoredPanel();
  await serializer.deserializeWebviewPanel(adopted);
  assert.equal(adopted.disposed, false, 'in sidebar mode the restored tab is kept');
  assert.ok(
    adopted.webview.html.includes('<img id="sprite"'),
    'an adopted tab must be re-rendered, not left blank'
  );
  await commands.get('doraemon.closeWindow')();

  // Desktop mode: the restored tab is stale and must be discarded.
  config.target = 'desktop';
  const stale = makeRestoredPanel();
  await serializer.deserializeWebviewPanel(stale);
  assert.equal(stale.disposed, true, 'in desktop mode the restored tab must be disposed');
  config.target = 'sidebar';
  console.log('✓ restored pet tab is adopted in sidebar mode, discarded in desktop mode');
}

/* ── Kiro agent state arrives via the hook-written file ────────────────── */

{
  assert.ok(createdWatchers.length > 0, 'a file watcher must be registered for agent state');
  const watcher = createdWatchers[0];
  assert.match(watcher.pattern, /\.kiro\/doraemon\/agent-state\.json$/,
    `watcher must target the hook state file, got: ${watcher.pattern}`);

  /** Simulates a hook writing the state file. */
  const report = async (payload) => {
    posted.length = 0;
    stateFileContent = JSON.stringify(payload);
    await watcher.fire({ fsPath: '/ws/.kiro/doraemon/agent-state.json' });
    return posted[0];
  };

  const working = await report({ state: 'working', message: 'Kiro is working on it~' });
  assert.equal(working?.emotion, 'focus', 'working must read as focus');
  assert.match(working?.thought ?? '', /working on it/);

  const thinking = await report({ state: 'thinking' });
  assert.equal(thinking?.emotion, 'contemplation', 'thinking must read as contemplation');
  assert.match(thinking?.thought ?? '', /thinking/i, 'thinking must fall back to a default line');

  const confirm = await report({ state: 'confirm', message: 'Kiro needs your approval.' });
  assert.equal(confirm?.emotion, 'concern', 'confirm must read as concern');
  assert.ok(confirm.durationMs >= 60000,
    `an approval prompt must persist, got ${confirm.durationMs}ms`);

  const done = await report({ state: 'done', message: 'Kiro finished!' });
  assert.equal(done?.emotion, 'pride', 'done must read as pride');

  const failed = await report({ state: 'failed' });
  assert.equal(failed?.emotion, 'frustration', 'failure must read as frustration');

  // Junk and unknown phases must be ignored rather than crashing the watcher.
  posted.length = 0;
  stateFileContent = 'not json at all';
  await watcher.fire({ fsPath: '/ws/x' });
  assert.equal(posted.length, 0, 'invalid JSON must be ignored');

  stateFileContent = JSON.stringify({ state: 'nonsense' });
  await watcher.fire({ fsPath: '/ws/x' });
  assert.equal(posted.length, 0, 'unknown phases must be ignored');

  console.log('✓ agent state maps working/thinking/confirm/done/failed, ignores junk');

  // Duplicate writes of identical content must not re-fire the bubble.
  const first = await report({ state: 'done', message: 'same' });
  assert.ok(first, 'first write must react');
  posted.length = 0;
  await watcher.fire({ fsPath: '/ws/x' });
  assert.equal(posted.length, 0, 'an identical repeat write must be deduplicated');
  console.log('✓ repeated identical agent state is deduplicated');

  // Kiro has no "awaiting approval" trigger, so a stall is what we infer from.
  config.agentStallSeconds = 0.2;

  posted.length = 0;
  stateFileContent = JSON.stringify({ state: 'working', message: 'busy' });
  await watcher.fire({ fsPath: '/ws/x' });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(posted.length, 2, 'a stalled working state must escalate');
  assert.equal(posted[1]?.emotion, 'concern', 'the escalation must read as concern');
  assert.match(posted[1]?.thought ?? '', /gone quiet|waiting/i);

  // Finishing must cancel the suspicion rather than escalate after the fact.
  posted.length = 0;
  stateFileContent = JSON.stringify({ state: 'working', message: 'busy again' });
  await watcher.fire({ fsPath: '/ws/x' });
  stateFileContent = JSON.stringify({ state: 'done', message: 'all good' });
  await watcher.fire({ fsPath: '/ws/x' });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(posted.length, 2, 'finishing must cancel the stall escalation');
  assert.equal(posted[1]?.emotion, 'pride', 'the last word must be the completion');

  config.agentStallSeconds = 25;
  console.log('✓ a stalled agent escalates to "may be waiting", finishing cancels it');
}

/* ── hooks install themselves, with the right extension ────────────────── */

{
  assert.ok(writtenFiles.length > 0, 'activation must install the agent hooks');

  for (const written of writtenFiles) {
    assert.match(written.path, /\.kiro\.hook$/,
      `Kiro only loads *.kiro.hook, got: ${written.path}`);

    const hook = JSON.parse(written.content);
    assert.equal(hook.enabled, true, 'a hook must be enabled to run');
    assert.ok(['userPromptSubmit', 'preToolUse', 'agentStop'].includes(hook.when.type),
      `unexpected trigger: ${hook.when.type}`);
    assert.equal(hook.then.type, 'runCommand');
    assert.match(hook.then.command, /agent-state\.json/,
      'the hook must write the state file the extension watches');
  }

  const triggers = writtenFiles.map((w) => JSON.parse(w.content).when.type).sort();
  assert.deepEqual(triggers, ['agentStop', 'preToolUse', 'userPromptSubmit'],
    `expected one hook per lifecycle point, got ${triggers.join(', ')}`);

  // The command must be shaped for this platform, not blindly POSIX.
  const sample = JSON.parse(writtenFiles[0].content).then.command;
  if (process.platform === 'win32') {
    assert.match(sample, /powershell/i, 'Windows must get a PowerShell command');
  } else {
    assert.match(sample, /mkdir -p/, 'POSIX must get a shell command');
  }

  console.log(`✓ ${writtenFiles.length} hooks installed as *.kiro.hook, enabled, platform-correct`);

  // An existing hook must never be clobbered.
  existingFiles.add('.kiro/hooks/doraemon-agent-done.kiro.hook');
  writtenFiles.length = 0;
  const { installAgentHooks } = require(path.join(root, 'dist/extension.js'));
  if (typeof installAgentHooks === 'function') {
    await installAgentHooks();
    const clobbered = writtenFiles.some((w) => w.path.includes('agent-done'));
    assert.equal(clobbered, false, 'an existing hook must not be overwritten');
    console.log('✓ existing hooks are left alone');
  }
  existingFiles.clear();
}

/* ── diagnose reports what the extension actually sees ─────────────────── */

{
  openedDocuments.length = 0;
  config.target = 'desktop';
  config.desktopAppPath = '/definitely/not/here/Doraemon';
  await commands.get('doraemon.diagnose')();

  const report = openedDocuments[0]?.content ?? '';
  assert.match(report, /target setting:\s+desktop/, 'report must show the resolved target');
  assert.match(report, /companion running:\s+false/, 'report must show companion state');
  assert.match(report, /desktopAppPath value: \/definitely\/not\/here\/Doraemon/,
    'report must echo the configured path');
  assert.match(report, /exists:\s+false/, 'report must say whether the path exists');
  assert.match(report, /auto-detect candidates checked/, 'report must list candidates');
  console.log('✓ diagnose reports resolved target, path, existence and candidates');

  config.target = 'sidebar';
  config.desktopAppPath = '';
}

/* ── the bundled companion is used without any configuration ───────────── */

{
  openedDocuments.length = 0;
  config.desktopAppPath = '';
  await commands.get('doraemon.diagnose')();
  const report = openedDocuments[0]?.content ?? '';

  const bundled = path.join(root, 'bin', `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'doraemon-companion.exe' : 'doraemon-companion');

  assert.match(report, /bundled companion:/, 'report must mention the bundled companion');

  if (existsSync(bundled)) {
    assert.match(report, /resolved from:\s+bundled/,
      'with no path configured, the bundled companion must win');
    assert.ok(report.includes(bundled), 'report must show the bundled binary path');
    console.log('✓ bundled companion resolves with zero configuration');
  } else {
    console.log('- bundled companion not built, skipped (run "npm run build-companion")');
  }
}

/* ── clean teardown ────────────────────────────────────────────────────── */

for (const disposable of subscriptions) disposable.dispose?.();
extension.deactivate();
console.log('✓ disposed cleanly');

console.log('\nAll extension host smoke checks passed.');
