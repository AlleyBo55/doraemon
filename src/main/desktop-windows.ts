import { app, ipcMain, screen, type BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * Tells the mascot where other apps' windows are, so he can stand on, ride and
 * climb them. Enumeration lives in the Kiro companion binary's --window-probe
 * mode, so the desktop app and the extension share one native implementation.
 */

export interface DesktopWindowRect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

type ProbeLine = {
  space?: string;
  windows?: unknown;
  unsupported?: string;
};

const BINARY = process.platform === 'win32' ? 'doraemon-companion.exe' : 'doraemon-companion';
const RESTART_DELAY_MS = 5000;
const MAX_RESTARTS = 5;

let probe: ChildProcess | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let restarts = 0;
let stopped = true;
let latest: DesktopWindowRect[] = [];

ipcMain.handle('get-desktop-windows', () => latest);

/** Packaged builds ship the binary in Resources/bin; dev runs use the extension's staged build. */
function findProbe(): string | null {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'bin', BINARY)]
    : [
        path.join(app.getAppPath(), 'kiro-extension', 'bin', `${process.platform}-${process.arch}`, BINARY),
        path.join(app.getAppPath(), 'kiro-extension', 'companion', 'target', 'release', BINARY),
      ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function parseWindows(value: unknown): DesktopWindowRect[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (w): w is DesktopWindowRect =>
      typeof w === 'object' && w !== null &&
      [w.id, w.x, w.y, w.w, w.h].every(isFiniteNumber) && w.w > 0 && w.h > 0
  );
}

/**
 * macOS reports points, which already are Electron's DIP screen space. Windows
 * reports physical pixels, which only Electron can map across mixed-DPI
 * monitors. X11 reports physical pixels under one global scale.
 */
function toScreenSpace(space: string | undefined, windows: DesktopWindowRect[]): DesktopWindowRect[] {
  if (space !== 'physical') return windows;

  if (process.platform === 'win32') {
    return windows.map((w) => {
      const rect = screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h });
      return { id: w.id, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
  }

  const scale = screen.getPrimaryDisplay().scaleFactor || 1;
  return windows.map((w) => ({ id: w.id, x: w.x / scale, y: w.y / scale, w: w.w / scale, h: w.h / scale }));
}

function launch(target: BrowserWindow): void {
  const binary = findProbe();
  if (!binary) {
    console.log('[DesktopWindows] No window probe binary found; Doraemon stays off other windows');
    return;
  }

  // Excluding our own PID keeps the full-screen overlay from hiding every window behind it.
  const child = spawn(binary, ['--window-probe', '--exclude-pid', String(process.pid)], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  probe = child;
  let unsupported = false;

  if (child.stdout) {
    readline.createInterface({ input: child.stdout }).on('line', (raw) => {
      let line: ProbeLine;
      try {
        line = JSON.parse(raw) as ProbeLine;
      } catch {
        return;
      }
      if (line.unsupported) {
        unsupported = true;
        console.log('[DesktopWindows] Window probe unsupported here:', line.unsupported);
        return;
      }
      latest = toScreenSpace(line.space, parseWindows(line.windows));
      if (!target.isDestroyed()) target.webContents.send('desktop-windows', latest);
    });
  }

  child.on('error', (err) => {
    console.warn('[DesktopWindows] Window probe failed to start:', err.message);
  });

  child.on('exit', (code) => {
    if (probe === child) probe = null;
    if (stopped || unsupported || target.isDestroyed()) return;
    if (restarts >= MAX_RESTARTS) {
      console.warn('[DesktopWindows] Window probe keeps exiting; giving up');
      return;
    }
    restarts++;
    console.warn(`[DesktopWindows] Window probe exited (code ${code}); restarting`);
    restartTimer = setTimeout(() => launch(target), RESTART_DELAY_MS);
  });
}

export function startDesktopWindowFeed(target: BrowserWindow): void {
  if (!stopped) return;
  stopped = false;
  restarts = 0;
  launch(target);
}

export function stopDesktopWindowFeed(): void {
  stopped = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  // Closing stdin is the probe's signal to exit; the kill covers a probe that is stuck.
  probe?.stdin?.end();
  probe?.kill();
  probe = null;
}
