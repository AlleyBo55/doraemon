import * as vscode from 'vscode';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Reaction } from './reactions';

/**
 * Runs the Doraemon desktop app as a companion process so the mascot floats on
 * the desktop instead of being trapped in a webview. An extension cannot create
 * an always-on-top OS window itself, so it delegates to a process that can and
 * owns that process's lifetime.
 */

const COMMAND_FILE = 'command.json';
// command.json is a single-slot channel: the companion deletes each file after
// reading it, so writes are serialised with a gap to avoid clobbering.
const WRITE_INTERVAL_MS = 150;

/** Default install locations, in priority order, per platform. */
function candidateBinaries(): string[] {
  const home = os.homedir();

  switch (process.platform) {
    case 'darwin':
      return [
        '/Applications/Doraemon.app/Contents/MacOS/Doraemon',
        path.join(home, 'Applications/Doraemon.app/Contents/MacOS/Doraemon'),
      ];
    case 'win32': {
      const localAppData = process.env['LOCALAPPDATA'] ?? path.join(home, 'AppData/Local');
      return [
        path.join(localAppData, 'Programs/doraemon-desktop/Doraemon.exe'),
        path.join(localAppData, 'Programs/Doraemon/Doraemon.exe'),
      ];
    }
    default:
      return [
        '/opt/Doraemon/doraemon',
        '/opt/doraemon-desktop/doraemon-desktop',
        '/usr/bin/doraemon',
        '/usr/local/bin/doraemon',
        // AppImage builds have no install location, so cover the usual drop spots.
        path.join(home, 'Applications/Doraemon.AppImage'),
        path.join(home, '.local/bin/Doraemon.AppImage'),
        path.join(home, 'Downloads/Doraemon.AppImage'),
      ];
  }
}

/**
 * Known platform caveats for the transparent overlay, so a degraded experience
 * is explained rather than looking like a bug.
 */
export function platformCaveat(): string | null {
  if (process.platform !== 'linux') return null;
  // The bundled companion moves a small window rather than overlaying the whole
  // screen, so it needs no mouse forwarding and stays interactive on Linux.
  // Transparency still depends on the window manager compositing.
  return (
    'On Linux the floating mascot needs a compositing window manager to render ' +
    'transparently. Without one it will show a solid background.'
  );
}

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
};

/**
 * macOS tags anything that arrived inside a downloaded archive with
 * com.apple.quarantine. Our companion is ad-hoc signed rather than notarized, so
 * a quarantined copy is killed on launch and prints nothing at all: the mascot
 * simply never appears, with no error anywhere. Detecting it lets us explain the
 * situation instead of failing silently.
 */
export async function isQuarantined(binary: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;

  return new Promise((resolve) => {
    execFile('xattr', ['-p', 'com.apple.quarantine', binary], (error) => {
      // A non-zero exit means the attribute is absent, which is what we want.
      resolve(!error);
    });
  });
}

/**
 * Removes the quarantine flag from the bundled companion only. Deliberately not
 * automatic: this relaxes a security control, so it happens on explicit consent
 * and never as a silent workaround.
 */
export async function clearQuarantine(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('xattr', ['-d', 'com.apple.quarantine', binary], (error) => {
      resolve(!error);
    });
  });
}

export type Resolution = {
  binary: string | null;
  /** Where the winning path came from, for diagnostics. */
  source: 'bundled' | 'remembered' | 'setting' | 'autodetect' | 'none';
  bundledValue: string;
  bundledExists: boolean;
  settingValue: string;
  rememberedValue: string;
  settingExists: boolean | null;
  rememberedExists: boolean | null;
  checked: string[];
};

/**
 * The companion binary that ships inside the extension. This is the whole point
 * of the design: no separate download, no path to configure.
 */
export function bundledCompanionPath(extensionUri: vscode.Uri): string {
  const name = process.platform === 'win32' ? 'doraemon-companion.exe' : 'doraemon-companion';
  return path.join(extensionUri.fsPath, 'bin', `${process.platform}-${process.arch}`, name);
}

/**
 * Resolves the companion binary. The bundled one wins, so the common case needs
 * no configuration at all. An explicitly chosen path beats the setting, since
 * settings resolution differs between editor forks and a path the user picked
 * by hand should never be second-guessed.
 */
export async function resolveCompanion(
  extensionUri: vscode.Uri,
  remembered: string
): Promise<Resolution> {
  const settingValue = vscode.workspace
    .getConfiguration('doraemon')
    .get<string>('desktopAppPath', '')
    .trim();

  const bundledValue = bundledCompanionPath(extensionUri);
  const bundledExists = await exists(bundledValue);
  const rememberedPath = remembered.trim();
  const rememberedExists = rememberedPath ? await exists(rememberedPath) : null;
  const settingExists = settingValue ? await exists(settingValue) : null;

  const base = {
    bundledValue,
    bundledExists,
    settingValue,
    rememberedValue: rememberedPath,
    settingExists,
    rememberedExists,
  };

  if (rememberedPath && rememberedExists) {
    return { ...base, binary: rememberedPath, source: 'remembered', checked: [] };
  }
  if (settingValue && settingExists) {
    return { ...base, binary: settingValue, source: 'setting', checked: [] };
  }
  if (bundledExists) {
    return { ...base, binary: bundledValue, source: 'bundled', checked: [] };
  }

  const checked = candidateBinaries();
  for (const candidate of checked) {
    if (await exists(candidate)) {
      return { ...base, binary: candidate, source: 'autodetect', checked };
    }
  }

  return { ...base, binary: null, source: 'none', checked };
}

export class DesktopCompanion implements vscode.Disposable {
  private child: ChildProcess | undefined;
  private readonly commandDir: string;
  private queued: Reaction | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 0;
  private stopping = false;

  lastError: string | null = null;

  /**
   * Why the last start attempt refused to spawn, when the reason is something the
   * user can act on rather than a plain failure.
   */
  lastBlock: 'quarantine' | null = null;

  /** Binary the last attempt would have used, for a follow-up action. */
  lastResolvedBinary: string | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    storageUri: vscode.Uri,
    private readonly remembered: () => string = () => ''
  ) {
    this.commandDir = path.join(storageUri.fsPath, 'companion');
  }

  get isRunning(): boolean {
    return this.child !== undefined && this.child.exitCode === null && !this.child.killed;
  }

  resolve(): Promise<Resolution> {
    return resolveCompanion(this.extensionUri, this.remembered());
  }

  /** Launches the companion. Returns the binary used, or null if none was found. */
  async start(): Promise<string | null> {
    if (this.isRunning) return this.child?.spawnfile ?? null;

    this.lastError = null;
    this.lastBlock = null;
    const resolution = await this.resolve();
    const binary = resolution.binary;
    this.lastResolvedBinary = binary;
    if (!binary) return null;

    // Only the bundled companion understands the asset directory; the Electron
    // desktop app needs its --extension-mode flag instead.
    const isBundled = resolution.source === 'bundled';

    // Spawning a quarantined binary looks like success but the process dies
    // immediately with no output, so stop here and let the caller ask.
    if (isBundled && (await isQuarantined(binary))) {
      this.lastBlock = 'quarantine';
      return null;
    }

    // Some packaging and transfer paths drop the executable bit. Restoring it is
    // cheaper than failing to launch with a confusing EACCES.
    if (isBundled && process.platform !== 'win32') {
      await fs.chmod(binary, 0o755).catch(() => {});
    }

    await fs.mkdir(this.commandDir, { recursive: true });
    // Clear any command left behind by a previous session.
    await fs.rm(path.join(this.commandDir, COMMAND_FILE), { force: true });

    this.stopping = false;
    this.child = spawn(binary, isBundled ? [] : ['--extension-mode'], {
      env: {
        ...process.env,
        DORAEMON_EXTENSION_MODE: '1',
        DORAEMON_COMMAND_DIR: this.commandDir,
        // The bundled companion serves its sprites and markup from here.
        DORAEMON_ASSET_DIR: path.join(this.extensionUri.fsPath, 'media'),
        // Lets the mascot bring this IDE forward when its bubble is clicked.
        DORAEMON_IDE_APP: vscode.env.appName,
        // Belt and braces: the companion also polls this and exits if the IDE
        // is killed in a way that skips our disposal path.
        DORAEMON_PARENT_PID: String(process.pid),
      },
      stdio: 'ignore',
      detached: false,
      windowsHide: true,
    });

    this.child.on('exit', (code, signal) => {
      const wasUnexpected = !this.stopping && code !== 0 && signal === null;
      this.child = undefined;
      if (wasUnexpected) {
        console.warn(`[doraemon] companion exited unexpectedly (code ${code})`);
      }
    });

    this.child.on('error', (err) => {
      this.lastError = err.message;
      console.error('[doraemon] failed to spawn companion:', err);
      this.child = undefined;
      void vscode.window.showErrorMessage(`Doraemon could not launch: ${err.message}`);
    });

    this.child.unref?.();
    return binary;
  }

  /**
   * Queues a reaction. Only the newest is kept while a write is pending, since a
   * stale reaction is worse than a skipped one.
   */
  send(reaction: Reaction): void {
    if (!this.isRunning) return;
    this.queued = reaction;
    if (this.writeTimer) return;
    void this.flush();
  }

  private async flush(): Promise<void> {
    const reaction = this.queued;
    this.queued = null;
    if (!reaction) return;

    const payload = {
      id: `ext-${Date.now()}-${++this.nextId}`,
      emotion: reaction.emotion,
      animation: reaction.animation,
      thought: reaction.thought,
    };

    try {
      // Write beside the target then rename, so the companion's watcher never
      // observes a half-written file.
      const target = path.join(this.commandDir, COMMAND_FILE);
      const temp = `${target}.${payload.id}.tmp`;
      await fs.writeFile(temp, JSON.stringify(payload), 'utf-8');
      await fs.rename(temp, target);
    } catch (err) {
      console.error('[doraemon] could not write companion command:', err);
    }

    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      if (this.queued) void this.flush();
    }, WRITE_INTERVAL_MS);
  }

  stop(): void {
    this.stopping = true;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    this.queued = null;

    const child = this.child;
    this.child = undefined;
    if (!child || child.exitCode !== null) return;

    // SIGTERM lets Electron run its before-quit handlers.
    child.kill('SIGTERM');
    const pid = child.pid;
    if (pid === undefined) return;

    setTimeout(() => {
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone, which is the expected path.
      }
    }, 3000);
  }

  dispose(): void {
    this.stop();
  }
}
