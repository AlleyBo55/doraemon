import fs from 'node:fs/promises';
import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';
import type { BrowserWindow } from 'electron';

const DORAEMON_DIR = '.doraemon';
const COMMAND_FILE = 'command.json';
const STATE_FILE = 'state.json';

type DoraemonCommand = {
  id: string;
  type: 'notify' | 'emotion' | 'remember' | 'recall' | 'coding_status' | 'celebrate';
  params: Record<string, unknown>;
  timestamp: number;
};

type DoraemonState = {
  emotion: string;
  lastActivity: string;
  isOnline: boolean;
  memories: number;
};

let commandWatcher: FSWatcher | null = null;
let mainWindow: BrowserWindow | null = null;
let workspacePath: string | null = null;
let lastProcessedCommandId: string = '';
let currentState: DoraemonState = {
  emotion: 'neutral',
  lastActivity: 'idle',
  isOnline: true,
  memories: 0,
};

async function ensureDoraemonDir(workspace: string): Promise<string> {
  const doraemonPath = path.join(workspace, DORAEMON_DIR);
  await fs.mkdir(doraemonPath, { recursive: true });
  return doraemonPath;
}

async function updateState(updates: Partial<DoraemonState>): Promise<void> {
  currentState = { ...currentState, ...updates };
  
  if (workspacePath) {
    const doraemonPath = await ensureDoraemonDir(workspacePath);
    await fs.writeFile(
      path.join(doraemonPath, STATE_FILE),
      JSON.stringify(currentState, null, 2)
    );
  }
}

function processCommand(command: DoraemonCommand): void {
  console.log('[MCP Watcher] Processing command:', command.type, command.params);
  
  switch (command.type) {
    case 'notify':
      mainWindow?.webContents.send('mcp-notify', {
        message: command.params.message,
        emotion: command.params.emotion || 'happy',
        duration: command.params.duration || 5000,
      });
      updateState({ lastActivity: 'notification' });
      break;
      
    case 'emotion':
      const emotion = command.params.emotion as string;
      mainWindow?.webContents.send('trigger-emotion', emotion);
      updateState({ emotion, lastActivity: 'emotion_change' });
      break;
      
    case 'coding_status':
      const action = command.params.action as string;
      const emotionMap: Record<string, string> = {
        started: 'coding',
        completed: 'coding_celebrate',
        error: 'frustrated',
        thinking: 'coding_thinking',
        reviewing: 'thinking',
      };
      
      mainWindow?.webContents.send('trigger-emotion', emotionMap[action] || 'coding');
      
      if (command.params.message) {
        mainWindow?.webContents.send('mcp-notify', {
          message: command.params.message,
          emotion: emotionMap[action] || 'coding',
          duration: 4000,
        });
      }
      
      updateState({
        emotion: emotionMap[action] || 'coding',
        lastActivity: `coding_${action}`,
      });
      break;
      
    case 'celebrate':
      mainWindow?.webContents.send('trigger-emotion', 'excited');
      mainWindow?.webContents.send('mcp-notify', {
        message: `🎉 ${command.params.reason}`,
        emotion: 'excited',
        duration: 6000,
      });
      updateState({ emotion: 'excited', lastActivity: 'celebration' });
      break;
      
    case 'remember':
      mainWindow?.webContents.send('memory-learn', {
        content: command.params.content,
        category: command.params.category,
        source: 'mcp',
      });
      updateState({ lastActivity: 'memory_store' });
      break;
      
    case 'recall':
      mainWindow?.webContents.send('memory-recall', {
        query: command.params.query,
      });
      updateState({ lastActivity: 'memory_recall' });
      break;
  }
}

export async function startCommandWatcher(
  window: BrowserWindow,
  workspace: string
): Promise<void> {
  mainWindow = window;
  workspacePath = workspace;
  
  const doraemonPath = await ensureDoraemonDir(workspace);
  const commandPath = path.join(doraemonPath, COMMAND_FILE);
  
  await updateState({ isOnline: true });
  
  if (commandWatcher) {
    commandWatcher.close();
  }
  
  commandWatcher = watch(doraemonPath, async (eventType, filename) => {
    if (filename !== COMMAND_FILE) return;
    
    try {
      const content = await fs.readFile(commandPath, 'utf-8');
      const command = JSON.parse(content) as DoraemonCommand;
      
      if (command.id === lastProcessedCommandId) return;
      lastProcessedCommandId = command.id;
      
      processCommand(command);
      
      await fs.unlink(commandPath).catch(() => {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[MCP Watcher] Error reading command:', err);
      }
    }
  });
  
  console.log('[MCP Watcher] Started watching:', doraemonPath);
}

export async function stopCommandWatcher(): Promise<void> {
  if (commandWatcher) {
    commandWatcher.close();
    commandWatcher = null;
  }
  
  await updateState({ isOnline: false });
  
  console.log('[MCP Watcher] Stopped');
}

export function updateMemoryCount(count: number): void {
  updateState({ memories: count });
}

export function getCurrentState(): DoraemonState {
  return { ...currentState };
}
