import fs from 'node:fs/promises';
import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';
import { app, type BrowserWindow } from 'electron';

/**
 * Bridge for IDE-extension companion mode.
 *
 * The extension is the activity source: it knows exactly which file is open,
 * what changed and how many errors there are, so none of the local heuristics
 * in editor-watcher are needed. It drops a command file, this forwards it to the
 * renderer over the existing `editor-activity` channel.
 *
 * Also owns the lifetime contract: when the IDE that spawned us goes away, the
 * mascot goes away with it.
 */

const COMMAND_FILE = 'command.json';
const PARENT_POLL_MS = 4000;

type CompanionCommand = {
  id: string;
  emotion?: string;
  animation?: string | null;
  thought?: string | null;
  action?: string;
  language?: string;
};

let commandWatcher: FSWatcher | null = null;
let parentPoll: ReturnType<typeof setInterval> | null = null;
let lastCommandId = '';

const isProcessAlive = (pid: number): boolean => {
  try {
    // Signal 0 performs permission/existence checks without delivering a signal.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

function forward(window: BrowserWindow, command: CompanionCommand): void {
  if (window.isDestroyed()) return;

  window.webContents.send('editor-activity', {
    editor: 'kiro',
    action: command.action ?? 'typing',
    language: command.language,
    thought: command.thought ?? '',
    emotion: command.emotion ?? '',
    animation: command.animation ?? '',
  });
}

async function readCommand(commandPath: string): Promise<CompanionCommand | null> {
  try {
    const raw = await fs.readFile(commandPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;

    const command = parsed as CompanionCommand;
    if (typeof command.id !== 'string' || command.id === '') return null;
    return command;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[ExtensionBridge] Unreadable command:', err);
    }
    return null;
  }
}

export async function startExtensionBridge(window: BrowserWindow): Promise<void> {
  const commandDir = process.env['DORAEMON_COMMAND_DIR'];
  if (!commandDir) {
    console.warn('[ExtensionBridge] DORAEMON_COMMAND_DIR unset, no command channel');
  } else {
    await fs.mkdir(commandDir, { recursive: true });
    const commandPath = path.join(commandDir, COMMAND_FILE);

    commandWatcher = watch(commandDir, async (_eventType, filename) => {
      if (filename !== COMMAND_FILE) return;

      const command = await readCommand(commandPath);
      if (!command || command.id === lastCommandId) return;

      lastCommandId = command.id;
      forward(window, command);
      await fs.unlink(commandPath).catch(() => {});
    });

    commandWatcher.on('error', (err) => {
      console.error('[ExtensionBridge] Watcher error:', err);
    });

    console.log('[ExtensionBridge] Listening for commands in', commandDir);
  }

  // Tie our lifetime to the IDE that launched us, so a hard kill of the parent
  // does not leave an orphaned mascot floating on screen forever.
  const parentPid = Number(process.env['DORAEMON_PARENT_PID']);
  if (Number.isInteger(parentPid) && parentPid > 0) {
    parentPoll = setInterval(() => {
      if (!isProcessAlive(parentPid)) {
        console.log('[ExtensionBridge] Parent', parentPid, 'exited, shutting down');
        stopExtensionBridge();
        app.quit();
      }
    }, PARENT_POLL_MS);
    console.log('[ExtensionBridge] Following parent pid', parentPid);
  }
}

export function stopExtensionBridge(): void {
  if (commandWatcher) {
    commandWatcher.close();
    commandWatcher = null;
  }
  if (parentPoll) {
    clearInterval(parentPoll);
    parentPoll = null;
  }
}
