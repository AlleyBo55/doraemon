import { watch, FSWatcher, existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import { BrowserWindow } from 'electron';

export type EditorActivity = {
  editor: 'vscode' | 'kiro' | 'antigravity' | 'unknown';
  action: 'file_opened' | 'file_saved' | 'file_created' | 'typing' | 'idle';
  file?: string;
  language?: string;
  timestamp: number;
};

type EditorCallback = (activity: EditorActivity) => void;

const watchers: FSWatcher[] = [];
let callback: EditorCallback | null = null;
let lastActivity: EditorActivity | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript React',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript React',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.cpp': 'C++',
  '.c': 'C',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
};

function getLanguage(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return LANGUAGE_MAP[ext] || 'Unknown';
}

function detectEditor(path: string): EditorActivity['editor'] {
  if (path.includes('.vscode') || path.includes('Code')) return 'vscode';
  if (path.includes('.kiro') || path.includes('Kiro')) return 'kiro';
  if (path.includes('antigravity') || path.includes('Antigravity')) return 'antigravity';
  return 'unknown';
}

function safeWatch(filePath: string, onEvent: (event: string) => void): FSWatcher | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    
    const stats = statSync(filePath);
    if (!stats.isFile() && !stats.isDirectory()) {
      return null;
    }
    
    const watcher = watch(filePath, { persistent: false }, (event) => {
      onEvent(event);
    });
    
    watcher.on('error', (err) => {
      console.error(`Watcher error for ${filePath}:`, err);
    });
    
    return watcher;
  } catch (e) {
    console.error(`Failed to watch ${filePath}:`, e);
    return null;
  }
}

function watchVSCodeState() {
  const home = homedir();
  const statePaths = [
    join(home, 'Library/Application Support/Code/User/globalStorage/state.vscdb'),
    join(home, 'Library/Application Support/Kiro/User/globalStorage/state.vscdb'),
    join(home, '.config/Code/User/globalStorage/state.vscdb'),
    join(home, '.config/Kiro/User/globalStorage/state.vscdb'),
  ];

  for (const statePath of statePaths) {
    const watcher = safeWatch(statePath, (event) => {
      if (event === 'change') {
        const editor = statePath.includes('Kiro') ? 'kiro' : 'vscode';
        console.log(`[EditorWatcher] Activity detected: ${editor} typing`);
        callback?.({
          editor,
          action: 'typing',
          timestamp: Date.now(),
        });
      }
    });
    
    if (watcher) {
      watchers.push(watcher);
      console.log(`[EditorWatcher] Watching state: ${statePath}`);
    }
  }
}

function watchRecentFiles() {
  const home = homedir();
  const recentPaths = [
    join(home, 'Library/Application Support/Code/User/globalStorage/storage.json'),
    join(home, 'Library/Application Support/Kiro/User/globalStorage/storage.json'),
    join(home, '.config/Code/User/globalStorage/storage.json'),
    join(home, '.config/Kiro/User/globalStorage/storage.json'),
  ];

  for (const recentPath of recentPaths) {
    const watcher = safeWatch(recentPath, async (event) => {
      if (event === 'change') {
        try {
          const content = await readFile(recentPath, 'utf-8');
          const data = JSON.parse(content);
          const recentFiles = data.openedPathsList?.entries || [];
          
          if (recentFiles.length > 0) {
            const mostRecent = recentFiles[0];
            const filePath = mostRecent.folderUri || mostRecent.fileUri || '';
            const fileName = basename(filePath);
            
            const activity: EditorActivity = {
              editor: recentPath.includes('Kiro') ? 'kiro' : 'vscode',
              action: 'file_opened',
              file: fileName,
              language: getLanguage(fileName),
              timestamp: Date.now(),
            };
            
            if (!lastActivity || lastActivity.file !== activity.file) {
              lastActivity = activity;
              console.log(`[EditorWatcher] File opened: ${fileName}`);
              callback?.(activity);
            }
          }
        } catch {
          // Parse error - ignore
        }
      }
    });
    
    if (watcher) {
      watchers.push(watcher);
      console.log(`[EditorWatcher] Watching recent files: ${recentPath}`);
    }
  }
}

function watchWorkspaceFolder(workspacePath: string) {
  const watcher = safeWatch(workspacePath, (event) => {
    // Workspace watching handled differently
  });
  
  if (watcher) {
    watchers.push(watcher);
    console.log(`[EditorWatcher] Watching workspace: ${workspacePath}`);
  }
}

export function startEditorWatcher(
  _mainWindow: BrowserWindow,
  onActivity: EditorCallback,
  workspacePaths?: string[]
) {
  callback = onActivity;
  
  console.log('[EditorWatcher] Starting editor watcher...');
  
  watchVSCodeState();
  watchRecentFiles();
  
  if (workspacePaths) {
    for (const path of workspacePaths) {
      watchWorkspaceFolder(path);
    }
  }
  
  const watcherCount = watchers.length;
  console.log(`[EditorWatcher] Started with ${watcherCount} active watchers`);
  
  if (watcherCount === 0) {
    console.log('[EditorWatcher] No editor state files found to watch');
  }
}

export function stopEditorWatcher() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers.length = 0;
  callback = null;
}

export function getEditorThought(activity: EditorActivity): string {
  const thoughts: Record<EditorActivity['action'], string[]> = {
    file_opened: [
      `Oh! Working on ${activity.file}~`,
      `${activity.language}? Interesting choice!`,
      `Let me see what you're building~`,
    ],
    file_saved: [
      `Good job saving ${activity.file}!`,
      `Progress! Keep going~`,
      `Nice work on that ${activity.language}!`,
    ],
    file_created: [
      `A new file! ${activity.file}~`,
      `Creating something new? Exciting!`,
    ],
    typing: [
      `Coding hard, I see~`,
      `Type type type...`,
      `You're on a roll!`,
    ],
    idle: [
      `Taking a break?`,
      `Need any help?`,
    ],
  };
  
  const options = thoughts[activity.action] || thoughts.idle;
  return options[Math.floor(Math.random() * options.length)];
}
