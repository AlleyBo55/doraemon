import { watch, FSWatcher, existsSync, statSync, readdirSync } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import { homedir } from 'os';
import { BrowserWindow } from 'electron';
import { codingActivityBuffer } from '../experience-system/coding-activity-buffer.js';
import { sanitizePath } from '../utils/sanitize-log.js';

export type EditorActivity = {
  editor: 'vscode' | 'kiro' | 'antigravity' | 'unknown';
  action: 'file_opened' | 'file_saved' | 'file_created' | 'typing' | 'idle' | 'git_commit' | 'git_conflict' | 'error_detected' | 'terminal_active' | 'ai_chat';
  file?: string;
  language?: string;
  fileType?: 'test' | 'config' | 'component' | 'style' | 'docs' | 'code';
  timestamp: number;
  errorCount?: number;
  commitMessage?: string;
};

export type CodingStats = {
  sessionStart: number;
  totalCodingTime: number;
  lastActivityTime: number;
  filesEdited: Set<string>;
  languagesUsed: Set<string>;
  commitCount: number;
  currentStreak: number;
  longestStreak: number;
};

type EditorCallback = (activity: EditorActivity) => void;
type StatsCallback = (stats: CodingStats) => void;
type BreakCallback = (minutes: number) => void;

const watchers: FSWatcher[] = [];
let callback: EditorCallback | null = null;
let statsCallback: StatsCallback | null = null;
let breakCallback: BreakCallback | null = null;
let lastActivity: EditorActivity | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let breakCheckInterval: ReturnType<typeof setInterval> | null = null;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
let historyPollInterval: ReturnType<typeof setInterval> | null = null;

// Track last known modification times for polling
const lastModTimes: Map<string, number> = new Map();

const codingStats: CodingStats = {
  sessionStart: Date.now(),
  totalCodingTime: 0,
  lastActivityTime: Date.now(),
  filesEdited: new Set(),
  languagesUsed: new Set(),
  commitCount: 0,
  currentStreak: 0,
  longestStreak: 0,
};

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
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.regex': 'Regex',
  '.re': 'Regex',
};

const LANGUAGE_EMOTIONS: Record<string, { emotion: string; animation: string; thoughts: string[] }> = {
  'TypeScript': { 
    emotion: 'excited',
    animation: 'coding_intense',
    thoughts: [
      'TypeScript! Type safety is the best~',
      'Ooh, strong types! I love it!',
      'TypeScript makes me happy~',
      'Types are like a warm blanket~',
      'No more undefined errors!',
      'Interface or type? Hmm~',
    ] 
  },
  'TypeScript React': { 
    emotion: 'excited',
    animation: 'coding_intense',
    thoughts: [
      'TSX! Components with types~',
      'React + TypeScript = Perfect!',
      'Building UI with safety~',
      'Props are typed! Yay~',
      'useState<T>() is so clean!',
    ] 
  },
  'JavaScript': { 
    emotion: 'happy',
    animation: 'coding_typing',
    thoughts: [
      'JavaScript time!',
      'Classic JS~',
      'Dynamic and fun!',
      'console.log debugging? 😅',
      'Async/await is nice~',
    ] 
  },
  'JavaScript React': {
    emotion: 'happy',
    animation: 'coding_intense',
    thoughts: [
      'React components!',
      'JSX is so expressive~',
      'Hooks are magical!',
      'useEffect time~',
    ]
  },
  'Python': { 
    emotion: 'relaxed',
    animation: 'coding_thinking',
    thoughts: [
      'Python~ So readable!',
      'Indentation matters here~',
      'Pythonic code incoming!',
      'import this 🐍',
      'List comprehension time!',
    ] 
  },
  'Rust': { 
    emotion: 'determined',
    animation: 'coding_focused',
    thoughts: [
      'Rust! Memory safety!',
      'Fighting the borrow checker~',
      'Fearless concurrency!',
      'No null pointers here!',
      'Cargo is so nice~',
    ] 
  },
  'Regex': { 
    emotion: 'anxious',
    animation: 'coding_thinking',
    thoughts: [
      'R-regex?! Scary...',
      'So many symbols...',
      'I hope this works...',
      '.*? What does that mean?!',
      'Regex is like magic spells~',
      'Testing on regex101...',
    ] 
  },
  'Go': { 
    emotion: 'determined',
    animation: 'coding_focused',
    thoughts: [
      'Go go go!',
      'Simple and fast~',
      'Goroutines!',
      'if err != nil { ... }',
      'Gopher power!',
    ] 
  },
  'CSS': { 
    emotion: 'curious',
    animation: 'coding_thinking',
    thoughts: [
      'Making things pretty~',
      'Flexbox or Grid?',
      'Styling time!',
      'Why won\'t it center?! 😤',
      'CSS is art~',
    ] 
  },
  'SCSS': {
    emotion: 'curious',
    animation: 'coding_thinking',
    thoughts: [
      'SCSS! Variables and nesting~',
      'Mixins are powerful!',
      '@include magic~',
    ]
  },
  'HTML': { 
    emotion: 'relaxed',
    animation: 'coding_typing',
    thoughts: [
      'HTML structure~',
      'Building the skeleton!',
      'Semantic tags!',
      '<div> soup? No no~',
      'Accessibility matters!',
    ] 
  },
  'JSON': { 
    emotion: 'neutral',
    animation: 'coding_thinking',
    thoughts: [
      'Config time~',
      'Data data data...',
      'Curly braces everywhere!',
      'Missing comma? 🤔',
      'package.json again~',
    ] 
  },
  'Markdown': { 
    emotion: 'relaxed',
    animation: 'coding_typing',
    thoughts: [
      'Documentation!',
      'Writing docs~',
      'README time!',
      '# Heading power!',
      'Good docs = happy devs~',
    ] 
  },
  'SQL': {
    emotion: 'thinking',
    animation: 'coding_thinking',
    thoughts: [
      'SELECT * FROM brain~',
      'JOIN the tables!',
      'Database queries~',
      'WHERE is the data?',
      'Indexing is important!',
    ]
  },
  'Shell': {
    emotion: 'determined',
    animation: 'coding_focused',
    thoughts: [
      'Shell scripting!',
      'chmod +x time~',
      'Bash magic!',
      'Piping data~',
      '#!/bin/bash',
    ]
  },
  'Vue': {
    emotion: 'happy',
    animation: 'coding_intense',
    thoughts: [
      'Vue.js! So elegant~',
      'Composition API!',
      'Reactive refs~',
      'v-if v-for v-bind~',
    ]
  },
  'Svelte': {
    emotion: 'excited',
    animation: 'coding_intense',
    thoughts: [
      'Svelte! No virtual DOM~',
      'Compile-time magic!',
      '$: reactive statements~',
      'So fast and clean!',
    ]
  },
};

const FILE_TYPE_REACTIONS: Record<string, { emotion: string; animation: string; thoughts: string[] }> = {
  test: { 
    emotion: 'determined',
    animation: 'coding_focused',
    thoughts: [
      'Testing time!',
      'Let\'s make sure it works~',
      'Tests are important!',
      'Quality assurance!',
      'expect().toBe() 🧪',
      'Green tests = happy life~',
      'TDD mode activated!',
    ] 
  },
  config: { 
    emotion: 'thinking',
    animation: 'coding_thinking',
    thoughts: [
      'Config files... boring but important~',
      'Setting things up!',
      'Configuration time~',
      'tsconfig.json again~',
      'Environment variables!',
      '.env secrets~',
    ] 
  },
  component: { 
    emotion: 'excited',
    animation: 'coding_intense',
    thoughts: [
      'Building components!',
      'UI time~',
      'Making it look good!',
      'Props and state~',
      'Reusable code!',
      'Component architecture~',
    ] 
  },
  style: { 
    emotion: 'playful',
    animation: 'coding_thinking',
    thoughts: [
      'Styling!',
      'Making it pretty~',
      'CSS magic!',
      'Colors and spacing~',
      'Responsive design!',
      'Dark mode? 🌙',
    ] 
  },
  docs: { 
    emotion: 'proud',
    animation: 'coding_typing',
    thoughts: [
      'Documentation! So responsible~',
      'Helping future devs!',
      'Good documentation!',
      'README updates~',
      'API docs time!',
      'Comments are love~',
    ] 
  },
  code: { 
    emotion: 'working',
    animation: 'coding_typing',
    thoughts: [
      'Coding coding~',
      'Building features!',
      'Let\'s go!',
      'Logic time!',
      'Algorithm thinking~',
      'Clean code!',
    ] 
  },
};

function getLanguage(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return LANGUAGE_MAP[ext] || 'Unknown';
}

function getFileType(filename: string): EditorActivity['fileType'] {
  const lower = filename.toLowerCase();
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__')) return 'test';
  if (lower.includes('config') || lower.includes('rc.') || lower === 'package.json' || lower === 'tsconfig.json') return 'config';
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less') || lower.includes('.style')) return 'style';
  if (lower.endsWith('.md') || lower.includes('readme') || lower.includes('docs')) return 'docs';
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx') || lower.includes('component')) return 'component';
  return 'code';
}

function safeWatch(filePath: string, onEvent: (event: string) => void): FSWatcher | null {
  try {
    if (!existsSync(filePath)) return null;
    const stats = statSync(filePath);
    if (!stats.isFile() && !stats.isDirectory()) return null;
    
    const watcher = watch(filePath, { persistent: false }, (event) => onEvent(event));
    watcher.on('error', (err) => console.error(`Watcher error for ${filePath}:`, err));
    return watcher;
  } catch (e) {
    console.error(`Failed to watch ${filePath}:`, e);
    return null;
  }
}

function updateCodingStats(activity: EditorActivity) {
  const now = Date.now();
  const timeSinceLastActivity = now - codingStats.lastActivityTime;
  
  // Feed activity to experience system buffer
  codingActivityBuffer.add({
    editor: activity.editor,
    action: activity.action,
    file: activity.file,
    language: activity.language,
    fileType: activity.fileType,
    timestamp: activity.timestamp,
  });
  
  if (timeSinceLastActivity < 5 * 60 * 1000) {
    codingStats.totalCodingTime += timeSinceLastActivity;
    codingStats.currentStreak = Math.floor(codingStats.totalCodingTime / (60 * 1000));
    if (codingStats.currentStreak > codingStats.longestStreak) {
      codingStats.longestStreak = codingStats.currentStreak;
    }
  }
  
  codingStats.lastActivityTime = now;
  
  if (activity.file) codingStats.filesEdited.add(activity.file);
  if (activity.language && activity.language !== 'Unknown') codingStats.languagesUsed.add(activity.language);
  if (activity.action === 'git_commit') codingStats.commitCount++;
  
  statsCallback?.(codingStats);
}

function checkBreakReminder() {
  const continuousCodingMinutes = Math.floor(codingStats.currentStreak);
  if (continuousCodingMinutes >= 45 && continuousCodingMinutes % 15 === 0) {
    breakCallback?.(continuousCodingMinutes);
  }
}

function checkIdleState() {
  const now = Date.now();
  const idleTime = now - codingStats.lastActivityTime;
  const idleMinutes = Math.floor(idleTime / (60 * 1000));
  
  if (idleMinutes >= 5 && lastActivity?.action !== 'idle') {
    const activity: EditorActivity = {
      editor: lastActivity?.editor || 'unknown',
      action: 'idle',
      timestamp: now,
    };
    lastActivity = activity;
    callback?.(activity);
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
        const activity: EditorActivity = { editor, action: 'typing', timestamp: Date.now() };
        updateCodingStats(activity);
        callback?.(activity);
      }
    });
    if (watcher) {
      watchers.push(watcher);
      console.log(`[EditorWatcher] Watching state: ${statePath}`);
    }
  }

  // Watch History folders for file edits (updates more frequently)
  const historyPaths = [
    join(home, 'Library/Application Support/Code/User/History'),
    join(home, 'Library/Application Support/Kiro/User/History'),
    join(home, '.config/Code/User/History'),
    join(home, '.config/Kiro/User/History'),
  ];

  for (const historyPath of historyPaths) {
    const watcher = safeWatch(historyPath, (event) => {
      if (event === 'rename') {
        const editor = historyPath.includes('Kiro') ? 'kiro' : 'vscode';
        console.log(`[EditorWatcher] History change detected: ${editor}`);
        const activity: EditorActivity = { editor, action: 'file_saved', timestamp: Date.now() };
        updateCodingStats(activity);
        callback?.(activity);
      }
    });
    if (watcher) {
      watchers.push(watcher);
      console.log(`[EditorWatcher] Watching history: ${historyPath}`);
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
            const language = getLanguage(fileName);
            const fileType = getFileType(fileName);
            
            const activity: EditorActivity = {
              editor: recentPath.includes('Kiro') ? 'kiro' : 'vscode',
              action: 'file_opened',
              file: fileName,
              language,
              fileType,
              timestamp: Date.now(),
            };
            
            if (!lastActivity || lastActivity.file !== activity.file) {
              lastActivity = activity;
              updateCodingStats(activity);
              console.log(`[EditorWatcher] File opened: ${fileName} (${language}, ${fileType})`);
              callback?.(activity);
            }
          }
        } catch { /* ignore parse errors */ }
      }
    });
    if (watcher) {
      watchers.push(watcher);
      console.log(`[EditorWatcher] Watching recent files: ${recentPath}`);
    }
  }
}

function watchGitDirectories() {
  const home = homedir();
  const commonPaths = [
    join(home, 'Developer'),
    join(home, 'Projects'),
    join(home, 'Code'),
    join(home, 'repos'),
    join(home, 'workspace'),
    join(home, 'ngoding'),  // Common dev folder
    join(home, 'dev'),
    join(home, 'src'),
  ];

  for (const basePath of commonPaths) {
    if (!existsSync(basePath)) continue;
    
    try {
      const dirs = readdirSync(basePath, { withFileTypes: true });
      for (const dir of dirs.slice(0, 15)) {
        if (!dir.isDirectory()) continue;
        const gitPath = join(basePath, dir.name, '.git');
        if (!existsSync(gitPath)) continue;
        
        // Watch .git/logs/HEAD - this updates on EVERY commit
        const logsHeadPath = join(gitPath, 'logs', 'HEAD');
        if (existsSync(logsHeadPath)) {
          const watcher = safeWatch(logsHeadPath, () => {
            console.log(`[EditorWatcher] Git commit detected in ${dir.name}`);
            const activity: EditorActivity = {
              editor: 'unknown',
              action: 'git_commit',
              timestamp: Date.now(),
            };
            updateCodingStats(activity);
            callback?.(activity);
          });
          if (watcher) {
            watchers.push(watcher);
            console.log(`[EditorWatcher] Watching git logs: ${logsHeadPath}`);
          }
        }
        
        // Also watch .git/index - updates on staging
        const indexPath = join(gitPath, 'index');
        if (existsSync(indexPath)) {
          const indexWatcher = safeWatch(indexPath, () => {
            // Don't trigger for every staging, just log
            console.log(`[EditorWatcher] Git staging activity in ${dir.name}`);
          });
          if (indexWatcher) watchers.push(indexWatcher);
        }

        const mergePath = join(gitPath, 'MERGE_HEAD');
        const mergeWatcher = safeWatch(mergePath, () => {
          console.log(`[EditorWatcher] Git merge conflict in ${dir.name}`);
          const activity: EditorActivity = {
            editor: 'unknown',
            action: 'git_conflict',
            timestamp: Date.now(),
          };
          callback?.(activity);
        });
        if (mergeWatcher) watchers.push(mergeWatcher);
      }
    } catch { /* ignore */ }
  }
}

async function pollHistoryFolders() {
  const home = homedir();
  const historyPaths = [
    { path: join(home, 'Library/Application Support/Code/User/History'), editor: 'vscode' as const },
    { path: join(home, 'Library/Application Support/Kiro/User/History'), editor: 'kiro' as const },
  ];

  for (const { path: historyPath, editor } of historyPaths) {
    if (!existsSync(historyPath)) {
      console.log(`[EditorWatcher] History path not found: ${historyPath}`);
      continue;
    }

    try {
      const entries = await readdir(historyPath, { withFileTypes: true });
      
      // Get all directories and check their modification times
      const dirsWithStats = await Promise.all(
        entries
          .filter(e => e.isDirectory())
          .map(async (entry) => {
            const dirPath = join(historyPath, entry.name);
            const entriesJsonPath = join(dirPath, 'entries.json');
            if (!existsSync(entriesJsonPath)) return null;
            try {
              const stats = await stat(entriesJsonPath);
              return { name: entry.name, mtime: stats.mtimeMs, path: entriesJsonPath };
            } catch {
              return null;
            }
          })
      );
      
      // Sort by modification time (most recent first) and take top 10
      const sortedDirs = dirsWithStats
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 10);
      
      for (const dir of sortedDirs) {
        const key = `history-json:${dir.path}`;
        const lastMtime = lastModTimes.get(key);
        
        if (lastMtime === undefined) {
          lastModTimes.set(key, dir.mtime);
          continue;
        }
        
        if (dir.mtime > lastMtime) {
          lastModTimes.set(key, dir.mtime);
          
          try {
            const entriesContent = await readFile(dir.path, 'utf-8');
            const entriesData = JSON.parse(entriesContent);
            
            console.log(`[EditorWatcher] Parsing entries.json:`, JSON.stringify(entriesData).substring(0, 200));
            
            // The resource field contains the actual file path
            if (!entriesData.resource || typeof entriesData.resource !== 'string') {
              console.log(`[EditorWatcher] No resource field in ${dir.path}`);
              continue;
            }
            
            let resourcePath = entriesData.resource;
            console.log(`[EditorWatcher] Raw resource: ${resourcePath}`);
            
            // Remove file:// or file:/// prefix
            if (resourcePath.startsWith('file:///')) {
              resourcePath = resourcePath.substring(8); // Remove 'file:///'
            } else if (resourcePath.startsWith('file://')) {
              resourcePath = resourcePath.substring(7); // Remove 'file://'
            }
            
            // Decode URI components (handles %20 for spaces, etc.)
            resourcePath = decodeURIComponent(resourcePath);
            
            // On macOS, paths start with / so we need to ensure it's there
            if (!resourcePath.startsWith('/') && process.platform === 'darwin') {
              resourcePath = '/' + resourcePath;
            }
            
            const fileName = basename(resourcePath);
            console.log(`[EditorWatcher] Extracted filename: ${fileName} from ${resourcePath}`);
            
            // Skip if we got an invalid filename
            if (!fileName || fileName === 'entries.json' || fileName === 'file') {
              console.log(`[EditorWatcher] Invalid filename, skipping`);
              continue;
            }
            
            const language = getLanguage(fileName);
            const fileType = getFileType(fileName);
            
            console.log(`[EditorWatcher] ✓ File activity: ${fileName} (${editor}, ${language}, ${fileType})`);
            
            const activity: EditorActivity = {
              editor,
              action: 'file_saved',
              file: fileName,
              language,
              fileType,
              timestamp: Date.now(),
            };
            
            lastActivity = activity;
            updateCodingStats(activity);
            callback?.(activity);
            return;
          } catch (e) {
            console.error(`[EditorWatcher] Error parsing ${dir.path}:`, e);
          }
        }
      }
    } catch (e) {
      console.error(`[EditorWatcher] Error polling history: ${e}`);
    }
  }
}

// Poll for git operations in active workspaces (detected from IDE workspace storage)
async function pollActiveWorkspaceGit() {
  const home = homedir();
  
  const storagePaths = [
    { path: join(home, 'Library/Application Support/Code/User/workspaceStorage'), editor: 'vscode' as const },
    { path: join(home, 'Library/Application Support/Kiro/User/workspaceStorage'), editor: 'kiro' as const },
  ];

  for (const { path: storagePath, editor } of storagePaths) {
    if (!existsSync(storagePath)) continue;

    try {
      const workspaces = await readdir(storagePath, { withFileTypes: true });
      
      // Check most recently modified workspaces
      const wsWithStats = await Promise.all(
        workspaces
          .filter(ws => ws.isDirectory())
          .slice(0, 10)
          .map(async (ws) => {
            const wsPath = join(storagePath, ws.name);
            try {
              const stats = await stat(wsPath);
              return { name: ws.name, path: wsPath, mtime: stats.mtimeMs };
            } catch {
              return null;
            }
          })
      );
      
      const sortedWs = wsWithStats
        .filter((w): w is NonNullable<typeof w> => w !== null)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 5);
      
      for (const ws of sortedWs) {
        // Try to read workspace.json to get the actual workspace path
        const workspaceJsonPath = join(ws.path, 'workspace.json');
        if (!existsSync(workspaceJsonPath)) continue;
        
        try {
          const content = await readFile(workspaceJsonPath, 'utf-8');
          const data = JSON.parse(content);
          
          // Get folder paths - handle both single folder and multi-root workspaces
          const folderPaths: string[] = [];
          
          // Single folder workspace
          if (data.folder) {
            folderPaths.push(data.folder);
          }
          
          // Multi-root workspace - need to read the .code-workspace file
          if (data.workspace) {
            let workspaceFilePath = data.workspace;
            if (workspaceFilePath.startsWith('file:///')) {
              workspaceFilePath = workspaceFilePath.substring(8);
            } else if (workspaceFilePath.startsWith('file://')) {
              workspaceFilePath = workspaceFilePath.substring(7);
            }
            workspaceFilePath = decodeURIComponent(workspaceFilePath);
            if (!workspaceFilePath.startsWith('/') && process.platform === 'darwin') {
              workspaceFilePath = '/' + workspaceFilePath;
            }
            
            // Read the .code-workspace file to get folder paths
            if (existsSync(workspaceFilePath)) {
              try {
                const wsContent = await readFile(workspaceFilePath, 'utf-8');
                const wsData = JSON.parse(wsContent);
                if (wsData.folders && Array.isArray(wsData.folders)) {
                  // Get the directory containing the .code-workspace file
                  const wsDir = workspaceFilePath.substring(0, workspaceFilePath.lastIndexOf('/'));
                  
                  for (const folder of wsData.folders) {
                    if (folder.path) {
                      // Paths in .code-workspace can be relative or absolute
                      let fPath = folder.path;
                      if (!fPath.startsWith('/')) {
                        // Relative path - use resolve() for proper path resolution
                        fPath = resolve(wsDir, fPath);
                      }
                      folderPaths.push(`file://${fPath}`);
                    }
                  }
                }
              } catch { /* ignore */ }
            }
          }
          
          if (folderPaths.length === 0) continue;
          
          // Debug: log the resolved folder paths (only once per workspace)
          const wsKey = `debug-ws:${ws.path}`;
          if (!lastModTimes.has(wsKey)) {
            lastModTimes.set(wsKey, 1);
            console.log(`[EditorWatcher] Monitoring workspace folders:`, folderPaths.map(p => {
              let fp = p;
              if (fp.startsWith('file:///')) fp = fp.substring(8);
              else if (fp.startsWith('file://')) fp = fp.substring(7);
              return decodeURIComponent(fp);
            }));
          }
          
          for (let folderPath of folderPaths) {
            // Remove file:// prefix
            if (folderPath.startsWith('file:///')) {
              folderPath = folderPath.substring(8);
            } else if (folderPath.startsWith('file://')) {
              folderPath = folderPath.substring(7);
            }
            folderPath = decodeURIComponent(folderPath);
            if (!folderPath.startsWith('/') && process.platform === 'darwin') {
              folderPath = '/' + folderPath;
            }
            
            // Check if this folder has a .git directory
            const gitPath = join(folderPath, '.git');
            if (!existsSync(gitPath)) continue;
            
            // Check .git/logs/HEAD for commits
            const gitLogsPath = join(gitPath, 'logs', 'HEAD');
            if (existsSync(gitLogsPath)) {
              try {
                const stats = await stat(gitLogsPath);
                const mtime = stats.mtimeMs;
                const key = `active-git-logs:${gitLogsPath}`;
                const lastMtime = lastModTimes.get(key);

                if (lastMtime === undefined) {
                  lastModTimes.set(key, mtime);
                } else if (mtime > lastMtime) {
                  lastModTimes.set(key, mtime);
                  
                  console.log(`[EditorWatcher] 🎉 Git commit detected in active workspace: ${basename(folderPath)}`);
                  
                  const activity: EditorActivity = {
                    editor,
                    action: 'git_commit',
                    timestamp: Date.now(),
                  };
                  
                  lastActivity = activity;
                  updateCodingStats(activity);
                  callback?.(activity);
                  return;
                }
              } catch { /* ignore */ }
            }
            
            // Check .git/index for staging (git add)
            const gitIndexPath = join(gitPath, 'index');
            if (existsSync(gitIndexPath)) {
              try {
                const stats = await stat(gitIndexPath);
                const mtime = stats.mtimeMs;
                const key = `active-git-index:${gitIndexPath}`;
                const lastMtime = lastModTimes.get(key);

                if (lastMtime === undefined) {
                  lastModTimes.set(key, mtime);
                } else if (mtime > lastMtime) {
                  lastModTimes.set(key, mtime);
                  
                  console.log(`[EditorWatcher] 📝 Git staging in active workspace: ${basename(folderPath)}`);
                  
                  const activity: EditorActivity = {
                    editor,
                    action: 'typing',
                    timestamp: Date.now(),
                  };
                  
                  updateCodingStats(activity);
                  callback?.(activity);
                  return;
                }
              } catch { /* ignore */ }
            }
            
            // Check .git/COMMIT_EDITMSG - created/updated during git commit
            const commitMsgPath = join(gitPath, 'COMMIT_EDITMSG');
            if (existsSync(commitMsgPath)) {
              try {
                const stats = await stat(commitMsgPath);
                const mtime = stats.mtimeMs;
                const key = `active-git-commitmsg:${commitMsgPath}`;
                const lastMtime = lastModTimes.get(key);
                const timeSinceModified = Date.now() - mtime;

                if (lastMtime === undefined) {
                  lastModTimes.set(key, mtime);
                } else if (mtime > lastMtime && timeSinceModified < 10000) {
                  lastModTimes.set(key, mtime);
                  
                  console.log(`[EditorWatcher] 🎉 Git commit message detected in active workspace: ${basename(folderPath)}`);
                  
                  const activity: EditorActivity = {
                    editor,
                    action: 'git_commit',
                    timestamp: Date.now(),
                  };
                  
                  lastActivity = activity;
                  updateCodingStats(activity);
                  callback?.(activity);
                  return;
                }
              } catch { /* ignore */ }
            }
            
            // Check .git/ORIG_HEAD - updated after git commit, merge, reset
            const origHeadPath = join(gitPath, 'ORIG_HEAD');
            if (existsSync(origHeadPath)) {
              try {
                const stats = await stat(origHeadPath);
                const mtime = stats.mtimeMs;
                const key = `active-git-orighead:${origHeadPath}`;
                const lastMtime = lastModTimes.get(key);
                const timeSinceModified = Date.now() - mtime;

                if (lastMtime === undefined) {
                  lastModTimes.set(key, mtime);
                } else if (mtime > lastMtime && timeSinceModified < 10000) {
                  lastModTimes.set(key, mtime);
                  
                  console.log(`[EditorWatcher] 🎉 Git operation detected in active workspace: ${basename(folderPath)}`);
                  
                  const activity: EditorActivity = {
                    editor,
                    action: 'git_commit',
                    timestamp: Date.now(),
                  };
                  
                  lastActivity = activity;
                  updateCodingStats(activity);
                  callback?.(activity);
                  return;
                }
              } catch { /* ignore */ }
            }
            
            // Check for build output directories
            const buildDirs = ['dist', 'build', 'out', '.next'];
            for (const buildDir of buildDirs) {
              const buildPath = join(folderPath, buildDir);
              if (!existsSync(buildPath)) continue;
              
              try {
                const stats = await stat(buildPath);
                const mtime = stats.mtimeMs;
                const key = `active-build:${buildPath}`;
                const lastMtime = lastModTimes.get(key);
                
                if (lastMtime === undefined) {
                  lastModTimes.set(key, mtime);
                } else if (mtime > lastMtime) {
                  const timeSinceModified = Date.now() - mtime;
                  if (timeSinceModified < 15000) { // Within 15 seconds
                    lastModTimes.set(key, mtime);
                    
                    console.log(`[EditorWatcher] 🎉 Build completed in active workspace: ${basename(folderPath)}/${buildDir}`);
                    
                    const activity: EditorActivity = {
                      editor,
                      action: 'git_commit', // Reuse for celebration
                      timestamp: Date.now(),
                    };
                    
                    lastActivity = activity;
                    updateCodingStats(activity);
                    callback?.(activity);
                    return;
                  }
                  lastModTimes.set(key, mtime);
                }
              } catch { /* ignore */ }
            }
          } // end for folderPaths
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
}

async function pollWorkspaceStorage() {
  const home = homedir();
  const storagePaths = [
    { path: join(home, 'Library/Application Support/Code/User/workspaceStorage'), editor: 'vscode' as const },
    { path: join(home, 'Library/Application Support/Kiro/User/workspaceStorage'), editor: 'kiro' as const },
  ];

  for (const { path: storagePath, editor } of storagePaths) {
    if (!existsSync(storagePath)) continue;

    try {
      const workspaces = await readdir(storagePath, { withFileTypes: true });
      
      for (const ws of workspaces.slice(0, 5)) {
        if (!ws.isDirectory()) continue;
        
        const stateFile = join(storagePath, ws.name, 'state.vscdb');
        if (!existsSync(stateFile)) continue;
        
        try {
          const stats = await stat(stateFile);
          const mtime = stats.mtimeMs;
          const lastMtime = lastModTimes.get(stateFile);
          
          if (lastMtime === undefined) {
            lastModTimes.set(stateFile, mtime);
            continue;
          }
          
          if (mtime > lastMtime + 1000) {
            lastModTimes.set(stateFile, mtime);
            
            console.log(`[EditorWatcher] Workspace activity detected: ${editor}`);
            
            const activity: EditorActivity = {
              editor,
              action: 'typing',
              timestamp: Date.now(),
            };
            
            updateCodingStats(activity);
            callback?.(activity);
            return;
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
}

async function pollTerminalHistory() {
  const home = homedir();
  
  // Method 1: Check running processes for build/dev commands (most reliable)
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Check for running node/npm processes
    const { stdout } = await execAsync('ps aux | grep -E "(npm|node|yarn|pnpm|git|eslint|tsc|vite|webpack)" | grep -v grep | head -20', { timeout: 2000 });
    
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        
        // Detect build commands
        if (lineLower.includes('npm run build') || 
            lineLower.includes('yarn build') || 
            lineLower.includes('pnpm build') ||
            lineLower.includes('vite build') ||
            lineLower.includes('webpack') ||
            lineLower.includes('tsc')) {
          
          const key = 'process:build';
          const now = Date.now();
          const lastTime = lastModTimes.get(key);
          
          // Only trigger once per 30 seconds for same process type
          if (!lastTime || now - lastTime > 30000) {
            lastModTimes.set(key, now);
            console.log(`[EditorWatcher] 🔨 Build process detected!`);
            
            const activity: EditorActivity = {
              editor: 'unknown',
              action: 'terminal_active',
              timestamp: now,
            };
            updateCodingStats(activity);
            callback?.(activity);
          }
        }
        
        // Detect dev server
        if (lineLower.includes('npm run dev') || 
            lineLower.includes('npm start') ||
            lineLower.includes('yarn dev') ||
            lineLower.includes('vite') ||
            lineLower.includes('next dev')) {
          
          const key = 'process:dev';
          const now = Date.now();
          const lastTime = lastModTimes.get(key);
          
          if (!lastTime || now - lastTime > 60000) {
            lastModTimes.set(key, now);
            console.log(`[EditorWatcher] 🚀 Dev server detected!`);
            
            const activity: EditorActivity = {
              editor: 'unknown',
              action: 'terminal_active',
              timestamp: now,
            };
            updateCodingStats(activity);
            callback?.(activity);
          }
        }
        
        // Detect git operations
        if (lineLower.includes('git commit') || 
            lineLower.includes('git push') ||
            lineLower.includes('git pull') ||
            lineLower.includes('git add')) {
          
          const key = 'process:git';
          const now = Date.now();
          const lastTime = lastModTimes.get(key);
          
          if (!lastTime || now - lastTime > 10000) {
            lastModTimes.set(key, now);
            console.log(`[EditorWatcher] 📝 Git operation detected!`);
            
            const activity: EditorActivity = {
              editor: 'unknown',
              action: 'git_commit',
              timestamp: now,
            };
            updateCodingStats(activity);
            callback?.(activity);
          }
        }
        
        // Detect eslint/lint
        if (lineLower.includes('eslint') || lineLower.includes('npm run lint')) {
          const key = 'process:lint';
          const now = Date.now();
          const lastTime = lastModTimes.get(key);
          
          if (!lastTime || now - lastTime > 30000) {
            lastModTimes.set(key, now);
            console.log(`[EditorWatcher] 🔍 Linting detected!`);
            
            const activity: EditorActivity = {
              editor: 'unknown',
              action: 'terminal_active',
              timestamp: now,
            };
            updateCodingStats(activity);
            callback?.(activity);
          }
        }
      }
    }
  } catch { /* ignore process check errors */ }
  
  // Method 2: Check VS Code/Kiro terminal state files
  const terminalStatePaths = [
    { path: join(home, 'Library/Application Support/Code/User/workspaceStorage'), editor: 'vscode' as const },
    { path: join(home, 'Library/Application Support/Kiro/User/workspaceStorage'), editor: 'kiro' as const },
  ];

  for (const { path: storagePath, editor } of terminalStatePaths) {
    if (!existsSync(storagePath)) continue;

    try {
      const workspaces = await readdir(storagePath, { withFileTypes: true });
      
      for (const ws of workspaces.slice(0, 10)) {
        if (!ws.isDirectory()) continue;
        
        // Check terminal history file
        const terminalHistoryPath = join(storagePath, ws.name, 'terminalHistory');
        if (existsSync(terminalHistoryPath)) {
          try {
            const stats = await stat(terminalHistoryPath);
            const mtime = stats.mtimeMs;
            const key = `terminal-state:${terminalHistoryPath}`;
            const lastMtime = lastModTimes.get(key);
            
            if (lastMtime === undefined) {
              lastModTimes.set(key, mtime);
              continue;
            }
            
            if (mtime > lastMtime) {
              lastModTimes.set(key, mtime);
              
              // Read terminal history to check for build/commit commands
              try {
                const content = await readFile(terminalHistoryPath, 'utf-8');
                const lines = content.trim().split('\n');
                const recentLines = lines.slice(-5); // Check last 5 commands
                
                for (const line of recentLines) {
                  const command = line.toLowerCase();
                  
                  // Detect build/deploy commands
                  if (command.includes('npm run build') || 
                      command.includes('yarn build') || 
                      command.includes('pnpm build') ||
                      command.includes('npm run deploy') ||
                      command.includes('vercel') ||
                      command.includes('npm publish') ||
                      command.includes('npx tsc') ||
                      command.includes('electron-vite build')) {
                    console.log(`[EditorWatcher] 🎉 Build command detected in ${editor} terminal!`);
                    const activity: EditorActivity = {
                      editor,
                      action: 'git_commit',
                      timestamp: Date.now(),
                    };
                    updateCodingStats(activity);
                    callback?.(activity);
                    return;
                  }
                  
                  // Detect git commands
                  if (command.includes('git commit') || command.includes('git push')) {
                    console.log(`[EditorWatcher] 🎉 Git command detected in ${editor} terminal!`);
                    const activity: EditorActivity = {
                      editor,
                      action: 'git_commit',
                      timestamp: Date.now(),
                    };
                    updateCodingStats(activity);
                    callback?.(activity);
                    return;
                  }
                }
              } catch { /* ignore read errors */ }
              
              // General terminal activity
              const activity: EditorActivity = {
                editor,
                action: 'terminal_active',
                timestamp: Date.now(),
              };
              updateCodingStats(activity);
              callback?.(activity);
              return;
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  
  // Method 2: Check zsh/bash history (fallback, may not update immediately)
  const historyFiles = [
    join(home, '.zsh_history'),
    join(home, '.bash_history'),
  ];

  for (const historyFile of historyFiles) {
    if (!existsSync(historyFile)) continue;

    try {
      const stats = await stat(historyFile);
      const mtime = stats.mtimeMs;
      const lastMtime = lastModTimes.get(historyFile);

      if (lastMtime === undefined) {
        lastModTimes.set(historyFile, mtime);
        continue;
      }

      if (mtime > lastMtime) {
        lastModTimes.set(historyFile, mtime);
        
        // Try to read the last command from history
        try {
          const content = await readFile(historyFile, 'utf-8');
          const lines = content.trim().split('\n');
          const lastLine = lines[lines.length - 1] || '';
          
          // zsh_history format: : timestamp:0;command OR just command
          // bash_history format: just the command
          let command = lastLine;
          if (lastLine.includes(';')) {
            command = lastLine.split(';').slice(1).join(';');
          }
          command = command.toLowerCase().trim();
          
          console.log(`[EditorWatcher] Terminal command: ${command.substring(0, 50)}`);
          
          // Detect build/deploy commands - trigger celebration!
          if (command.includes('npm run build') || 
              command.includes('yarn build') || 
              command.includes('pnpm build') ||
              command.includes('npm run deploy') ||
              command.includes('vercel') ||
              command.includes('npm publish')) {
            console.log(`[EditorWatcher] 🎉 Build/deploy command detected!`);
            const activity: EditorActivity = {
              editor: 'unknown',
              action: 'git_commit', // Reuse git_commit for celebration
              timestamp: Date.now(),
            };
            updateCodingStats(activity);
            callback?.(activity);
            return;
          }
          
          // Detect git commit from terminal
          if (command.includes('git commit') || command.includes('git push')) {
            console.log(`[EditorWatcher] 🎉 Git command detected!`);
            const activity: EditorActivity = {
              editor: 'unknown',
              action: 'git_commit',
              timestamp: Date.now(),
            };
            updateCodingStats(activity);
            callback?.(activity);
            return;
          }
        } catch { /* ignore read errors */ }
        
        const activity: EditorActivity = {
          editor: 'unknown',
          action: 'terminal_active',
          timestamp: Date.now(),
        };
        
        updateCodingStats(activity);
        callback?.(activity);
        return;
      }
    } catch { /* ignore */ }
  }
}

// Separate function to detect build completion via lock files and output directories
async function pollBuildActivity() {
  const home = homedir();
  const commonPaths = [
    join(home, 'Developer'),
    join(home, 'Projects'),
    join(home, 'Code'),
    join(home, 'repos'),
    join(home, 'workspace'),
    join(home, 'ngoding'),
    join(home, 'dev'),
    join(home, 'src'),
  ];

  for (const basePath of commonPaths) {
    if (!existsSync(basePath)) continue;

    try {
      const dirs = readdirSync(basePath, { withFileTypes: true });
      for (const dir of dirs.slice(0, 15)) {
        if (!dir.isDirectory()) continue;
        const projectPath = join(basePath, dir.name);
        
        // Check for build output directories that indicate a build just completed
        const buildIndicators = [
          { path: join(projectPath, 'dist'), name: 'dist' },
          { path: join(projectPath, 'build'), name: 'build' },
          { path: join(projectPath, 'out'), name: 'out' },
          { path: join(projectPath, '.next'), name: '.next' },
          { path: join(projectPath, 'node_modules', '.vite'), name: '.vite' },
        ];
        
        for (const { path: buildPath, name: buildName } of buildIndicators) {
          if (!existsSync(buildPath)) continue;
          
          try {
            const stats = await stat(buildPath);
            const mtime = stats.mtimeMs;
            const key = `build:${buildPath}`;
            const lastMtime = lastModTimes.get(key);
            
            if (lastMtime === undefined) {
              lastModTimes.set(key, mtime);
              continue;
            }
            
            // Build directory was modified recently (within 10 seconds)
            const timeSinceModified = Date.now() - mtime;
            if (mtime > lastMtime && timeSinceModified < 10000) {
              lastModTimes.set(key, mtime);
              
              console.log(`[EditorWatcher] 🎉 Build completed in ${dir.name}/${buildName}!`);
              
              const activity: EditorActivity = {
                editor: 'unknown',
                action: 'git_commit', // Reuse for celebration
                timestamp: Date.now(),
              };
              
              lastActivity = activity;
              updateCodingStats(activity);
              callback?.(activity);
              return;
            }
            
            lastModTimes.set(key, mtime);
          } catch { /* ignore */ }
        }
        
        // Also check for package-lock.json changes (npm install completed)
        const lockFiles = [
          join(projectPath, 'package-lock.json'),
          join(projectPath, 'yarn.lock'),
          join(projectPath, 'pnpm-lock.yaml'),
        ];
        
        for (const lockFile of lockFiles) {
          if (!existsSync(lockFile)) continue;
          
          try {
            const stats = await stat(lockFile);
            const mtime = stats.mtimeMs;
            const key = `lock:${lockFile}`;
            const lastMtime = lastModTimes.get(key);
            
            if (lastMtime === undefined) {
              lastModTimes.set(key, mtime);
              continue;
            }
            
            // Lock file was modified recently
            const timeSinceModified = Date.now() - mtime;
            if (mtime > lastMtime && timeSinceModified < 5000) {
              lastModTimes.set(key, mtime);
              
              console.log(`[EditorWatcher] 📦 Package install completed in ${dir.name}!`);
              
              // Don't trigger celebration for npm install, just log
            }
            
            lastModTimes.set(key, mtime);
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
}

async function pollAIChatActivity() {
  const home = homedir();
  
  const aiPaths = [
    // Kiro AI agent data - updates when chatting with AI
    { path: join(home, 'Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent/dev_data/devdata.sqlite'), editor: 'kiro' as const },
    { path: join(home, 'Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent/dev_data/tokens_generated.jsonl'), editor: 'kiro' as const },
    // VS Code Copilot
    { path: join(home, 'Library/Application Support/Code/User/globalStorage/github.copilot'), editor: 'vscode' as const },
    { path: join(home, 'Library/Application Support/Code/User/globalStorage/github.copilot-chat'), editor: 'vscode' as const },
    // Continue extension
    { path: join(home, '.continue'), editor: 'vscode' as const },
    // Cursor
    { path: join(home, '.cursor'), editor: 'unknown' as const },
  ];

  for (const { path: aiPath, editor } of aiPaths) {
    if (!existsSync(aiPath)) continue;

    try {
      const stats = await stat(aiPath);
      const mtime = stats.mtimeMs;
      const key = `ai:${aiPath}`;
      const lastMtime = lastModTimes.get(key);

      if (lastMtime === undefined) {
        lastModTimes.set(key, mtime);
        continue;
      }

      if (mtime > lastMtime + 1000) {
        lastModTimes.set(key, mtime);
        
        console.log(`[EditorWatcher] AI chat activity detected: ${editor} (${basename(aiPath)})`);
        
        const activity: EditorActivity = {
          editor,
          action: 'ai_chat',
          timestamp: Date.now(),
        };
        
        lastActivity = activity;
        updateCodingStats(activity);
        callback?.(activity);
        return;
      }
    } catch { /* ignore */ }
  }
}

async function pollRecentlyOpened() {
  const home = homedir();
  const recentPaths = [
    { path: join(home, 'Library/Application Support/Code/User/globalStorage/storage.json'), editor: 'vscode' as const },
    { path: join(home, 'Library/Application Support/Kiro/User/globalStorage/storage.json'), editor: 'kiro' as const },
  ];

  for (const { path: recentPath, editor } of recentPaths) {
    if (!existsSync(recentPath)) continue;

    try {
      const stats = await stat(recentPath);
      const mtime = stats.mtimeMs;
      const key = `recent:${recentPath}`;
      const lastMtime = lastModTimes.get(key);

      if (lastMtime === undefined) {
        lastModTimes.set(key, mtime);
        continue;
      }

      if (mtime > lastMtime) {
        lastModTimes.set(key, mtime);

        try {
          const content = await readFile(recentPath, 'utf-8');
          const data = JSON.parse(content);
          const recentFiles = data.openedPathsList?.entries || [];
          
          if (recentFiles.length > 0) {
            const mostRecent = recentFiles[0];
            const filePath = mostRecent.folderUri || mostRecent.fileUri || '';
            const fileName = basename(filePath);
            
            if (fileName && fileName !== lastActivity?.file) {
              const language = getLanguage(fileName);
              const fileType = getFileType(fileName);
              
              console.log(`[EditorWatcher] File opened: ${fileName} (${editor})`);
              
              const activity: EditorActivity = {
                editor,
                action: 'file_opened',
                file: fileName,
                language,
                fileType,
                timestamp: Date.now(),
              };
              
              lastActivity = activity;
              updateCodingStats(activity);
              callback?.(activity);
              return;
            }
          }
        } catch { /* ignore parse errors */ }
      }
    } catch { /* ignore */ }
  }

  const backupStatePaths = [
    { path: join(home, 'Library/Application Support/Code/Backups'), editor: 'vscode' as const },
    { path: join(home, 'Library/Application Support/Kiro/Backups'), editor: 'kiro' as const },
  ];

  for (const { path: backupPath, editor } of backupStatePaths) {
    if (!existsSync(backupPath)) continue;

    try {
      const stats = await stat(backupPath);
      const mtime = stats.mtimeMs;
      const key = `backup:${backupPath}`;
      const lastMtime = lastModTimes.get(key);

      if (lastMtime === undefined) {
        lastModTimes.set(key, mtime);
        continue;
      }

      if (mtime > lastMtime + 1000) {
        lastModTimes.set(key, mtime);
        
        console.log(`[EditorWatcher] Editor backup activity: ${editor}`);
        
        const activity: EditorActivity = {
          editor,
          action: 'typing',
          timestamp: Date.now(),
        };
        
        updateCodingStats(activity);
        callback?.(activity);
        return;
      }
    } catch { /* ignore */ }
  }
}

async function pollGitActivity() {
  const home = homedir();
  const commonPaths = [
    join(home, 'Developer'),
    join(home, 'Projects'),
    join(home, 'Code'),
    join(home, 'repos'),
    join(home, 'workspace'),
    join(home, 'ngoding'),
    join(home, 'dev'),
    join(home, 'src'),
  ];

  for (const basePath of commonPaths) {
    if (!existsSync(basePath)) continue;

    try {
      const dirs = readdirSync(basePath, { withFileTypes: true });
      for (const dir of dirs.slice(0, 15)) {
        if (!dir.isDirectory()) continue;
        
        const gitPath = join(basePath, dir.name, '.git');
        if (!existsSync(gitPath)) continue;
        
        // Check .git/logs/HEAD for commits
        const gitLogsPath = join(gitPath, 'logs', 'HEAD');
        if (existsSync(gitLogsPath)) {
          try {
            const stats = await stat(gitLogsPath);
            const mtime = stats.mtimeMs;
            const key = `git-logs:${gitLogsPath}`;
            const lastMtime = lastModTimes.get(key);

            if (lastMtime === undefined) {
              lastModTimes.set(key, mtime);
            } else if (mtime > lastMtime) {
              lastModTimes.set(key, mtime);
              
              console.log(`[EditorWatcher] 🎉 Git commit detected in ${dir.name}!`);
              
              const activity: EditorActivity = {
                editor: 'unknown',
                action: 'git_commit',
                timestamp: Date.now(),
              };
              
              lastActivity = activity;
              updateCodingStats(activity);
              callback?.(activity);
              return;
            }
          } catch { /* ignore */ }
        }
        
        // Check .git/index for staging activity (git add)
        const gitIndexPath = join(gitPath, 'index');
        if (existsSync(gitIndexPath)) {
          try {
            const stats = await stat(gitIndexPath);
            const mtime = stats.mtimeMs;
            const key = `git-index:${gitIndexPath}`;
            const lastMtime = lastModTimes.get(key);

            if (lastMtime === undefined) {
              lastModTimes.set(key, mtime);
            } else if (mtime > lastMtime) {
              lastModTimes.set(key, mtime);
              
              console.log(`[EditorWatcher] 📝 Git staging activity in ${dir.name}`);
              
              const activity: EditorActivity = {
                editor: 'unknown',
                action: 'typing', // Staging is like typing/working
                timestamp: Date.now(),
              };
              
              updateCodingStats(activity);
              callback?.(activity);
              return;
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
}

// Poll for file changes using git status
async function pollGitFileChanges() {
  const home = homedir();
  const commonPaths = [
    join(home, 'Developer'),
    join(home, 'Projects'),
    join(home, 'Code'),
    join(home, 'repos'),
    join(home, 'workspace'),
    join(home, 'ngoding'),
    join(home, 'dev'),
    join(home, 'src'),
  ];

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    for (const basePath of commonPaths) {
      if (!existsSync(basePath)) continue;

      try {
        const dirs = readdirSync(basePath, { withFileTypes: true });
        for (const dir of dirs.slice(0, 10)) {
          if (!dir.isDirectory()) continue;
          
          const projectPath = join(basePath, dir.name);
          const gitPath = join(projectPath, '.git');
          if (!existsSync(gitPath)) continue;

          try {
            // Run git status to get modified files
            const { stdout } = await execAsync('git status --porcelain 2>/dev/null | head -10', { 
              cwd: projectPath,
              timeout: 2000 
            });
            
            if (stdout.trim()) {
              const key = `git-status:${projectPath}`;
              const lastStatus = lastModTimes.get(key);
              const currentHash = stdout.trim().length; // Simple change detection
              
              if (lastStatus === undefined) {
                lastModTimes.set(key, currentHash);
                continue;
              }
              
              if (currentHash !== lastStatus) {
                lastModTimes.set(key, currentHash);
                
                // Parse the first modified file
                const lines = stdout.trim().split('\n');
                const firstLine = lines[0] || '';
                const status = firstLine.substring(0, 2).trim();
                const fileName = basename(firstLine.substring(3).trim());
                
                if (fileName) {
                  const language = getLanguage(fileName);
                  const fileType = getFileType(fileName);
                  
                  // Determine action based on git status
                  let action: EditorActivity['action'] = 'file_saved';
                  if (status === '??') action = 'file_created';
                  else if (status === 'D' || status === ' D') action = 'file_saved';
                  else if (status === 'M' || status === ' M' || status === 'MM') action = 'file_saved';
                  else if (status === 'A' || status === ' A') action = 'file_created';
                  
                  console.log(`[EditorWatcher] 📄 File change detected: ${fileName} (${status}) in ${dir.name}`);
                  
                  const activity: EditorActivity = {
                    editor: 'unknown',
                    action,
                    file: fileName,
                    language,
                    fileType,
                    timestamp: Date.now(),
                  };
                  
                  lastActivity = activity;
                  updateCodingStats(activity);
                  callback?.(activity);
                  return;
                }
              }
            }
          } catch { /* ignore git errors */ }
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore import errors */ }
}

export function startEditorWatcher(
  _mainWindow: BrowserWindow,
  onActivity: EditorCallback,
  _workspacePaths?: string[]
) {
  callback = onActivity;
  
  console.log('[EditorWatcher] Starting enhanced editor watcher...');
  
  watchVSCodeState();
  watchRecentFiles();
  watchGitDirectories();
  
  // Start polling for various activities (more reliable than fs.watch on macOS)
  historyPollInterval = setInterval(async () => {
    await pollHistoryFolders();
    await pollWorkspaceStorage();
    await pollActiveWorkspaceGit(); // Monitor git in active IDE workspaces
    await pollTerminalHistory();
    await pollAIChatActivity();
    await pollRecentlyOpened();
    await pollGitActivity();
    await pollGitFileChanges();
    await pollBuildActivity();
  }, 2000);
  
  // Fast poll for git operations (1 second) - catches quick git commit/push
  pollInterval = setInterval(async () => {
    await pollActiveWorkspaceGit();
  }, 1000);
  
  breakCheckInterval = setInterval(checkBreakReminder, 60 * 1000);
  idleCheckInterval = setInterval(checkIdleState, 30 * 1000);
  
  console.log(`[EditorWatcher] Started with ${watchers.length} active watchers + polling`);
}

export function stopEditorWatcher() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (breakCheckInterval) { clearInterval(breakCheckInterval); breakCheckInterval = null; }
  if (idleCheckInterval) { clearInterval(idleCheckInterval); idleCheckInterval = null; }
  if (historyPollInterval) { clearInterval(historyPollInterval); historyPollInterval = null; }
  for (const watcher of watchers) watcher.close();
  watchers.length = 0;
  lastModTimes.clear();
  callback = null;
  statsCallback = null;
  breakCallback = null;
}

export function setStatsCallback(cb: StatsCallback) { statsCallback = cb; }
export function setBreakCallback(cb: BreakCallback) { breakCallback = cb; }
export function getCodingStats(): CodingStats { return codingStats; }

export function getEditorThought(activity: EditorActivity): { thought: string; emotion: string; animation: string } {
  const language = activity.language || 'Unknown';
  const fileType = activity.fileType || 'code';
  const langReaction = LANGUAGE_EMOTIONS[language];
  const fileReaction = FILE_TYPE_REACTIONS[fileType];
  
  const actionThoughts: Record<EditorActivity['action'], { thoughts: string[]; emotion: string; animation: string }> = {
    file_opened: {
      thoughts: [
        `Oh! Working on ${activity.file}~`,
        `${activity.file}? Let's see...`,
        `Opening ${activity.file}!`,
        `New file! ${activity.file}~`,
        `What's in ${activity.file}?`,
      ],
      emotion: langReaction?.emotion || 'curious',
      animation: langReaction?.animation || 'coding_focused',
    },
    file_saved: {
      thoughts: [
        `Good job saving ${activity.file}!`,
        `Progress! Keep going~`,
        `Saved! Nice work~`,
        `Ctrl+S champion! 💾`,
        `${activity.file} saved~`,
        `Another save! You're careful~`,
      ],
      emotion: 'proud',
      animation: 'coding_celebrate',
    },
    file_created: {
      thoughts: [
        `A new file! ${activity.file}~`,
        `Creating something new? Exciting!`,
        `Fresh start with ${activity.file}!`,
        `New beginnings! ${activity.file}~`,
        `Blank canvas time!`,
      ],
      emotion: 'excited',
      animation: 'coding_intense',
    },
    typing: {
      thoughts: [
        `Coding hard, I see~`,
        `Type type type...`,
        `You're on a roll!`,
        `Focus mode activated!`,
        `Keyboard warrior! ⌨️`,
        `Flow state~`,
        `Code is flowing!`,
        `Fingers dancing on keys~`,
      ],
      emotion: 'working',
      animation: 'coding_typing',
    },
    idle: {
      thoughts: [
        `Taking a break?`,
        `Need any help?`,
        `*yawn* Getting sleepy...`,
        `Zzz... wake me when you're back~`,
        `Coffee break? ☕`,
        `Thinking time~`,
        `Stretching is good!`,
      ],
      emotion: 'sleepy',
      animation: 'sleepy',
    },
    git_commit: {
      thoughts: [
        `Nice commit! 🎉`,
        `Code saved to history!`,
        `Another commit! You're productive~`,
        `Git push time?`,
        `Commit message: "fix stuff" 😅`,
        `Version control hero!`,
        `History recorded~`,
      ],
      emotion: 'celebrate',
      animation: 'coding_celebrate',
    },
    git_conflict: {
      thoughts: [
        `Uh oh... merge conflict!`,
        `Conflict detected! Don't panic~`,
        `Time to resolve some conflicts...`,
        `<<<<<<< HEAD 😱`,
        `Git says there's a problem~`,
      ],
      emotion: 'anxious',
      animation: 'anxious',
    },
    error_detected: {
      thoughts: [
        `Hmm, something's wrong...`,
        `Error detected! Let me help~`,
        `Oops, there's an issue here...`,
        `Red squiggly lines! 🔴`,
        `TypeScript is angry~`,
        `Bug spotted!`,
      ],
      emotion: 'thinking',
      animation: 'coding_thinking',
    },
    terminal_active: {
      thoughts: [
        `Terminal time! 🖥️`,
        `Running commands~`,
        `npm install? npm run?`,
        `Shell magic happening!`,
        `Command line warrior!`,
        `$ sudo make me a sandwich`,
        `Bash bash bash~`,
        `What are we building?`,
      ],
      emotion: 'determined',
      animation: 'coding_focused',
    },
    ai_chat: {
      thoughts: [
        `AI pair programming! 🤖`,
        `Coding with AI assistance~`,
        `AI-powered development!`,
        `Smart coding session!`,
        `Two minds are better than one!`,
        `AI helping with the code~`,
        `Collaborative coding!`,
        `Let's build something great!`,
        `Code is flowing with AI~`,
        `Intense coding session!`,
        `Deep in the code~`,
        `Algorithm thinking with AI!`,
        `Debugging together~`,
        `Feature development time!`,
        `Refactoring with help~`,
      ],
      emotion: 'excited',
      animation: 'coding_intense',
    },
  };

  let thoughts: string[] = [];
  let emotion = 'neutral';
  let animation = 'coding';

  const actionData = actionThoughts[activity.action];
  if (actionData) {
    thoughts = [...actionData.thoughts];
    emotion = actionData.emotion;
    animation = actionData.animation;
  }

  // Randomize AI chat animation - prefer coding_intense
  if (activity.action === 'ai_chat') {
    const aiAnimations = ['coding_intense', 'coding_intense', 'coding_intense', 'coding_typing', 'coding_thinking'];
    animation = aiAnimations[Math.floor(Math.random() * aiAnimations.length)];
  }

  if (langReaction && activity.action === 'file_opened') {
    thoughts = [...thoughts, ...langReaction.thoughts];
    emotion = langReaction.emotion;
    animation = langReaction.animation;
  }

  if (fileReaction && (activity.action === 'file_opened' || activity.action === 'file_created')) {
    thoughts = [...thoughts, ...fileReaction.thoughts];
    if (fileType === 'test') {
      emotion = fileReaction.emotion;
      animation = fileReaction.animation;
    }
  }

  const streakMinutes = codingStats.currentStreak;
  if (streakMinutes >= 120) {
    thoughts.push(`Wow! ${Math.floor(streakMinutes / 60)} hours of coding! Take a break?`);
    emotion = 'proud';
    animation = 'coding_celebrate';
  } else if (streakMinutes >= 60) {
    thoughts.push(`1 hour streak! You're doing great~`);
    animation = 'coding_intense';
  } else if (streakMinutes >= 30) {
    thoughts.push(`30 min focus! Nice~`);
  }

  const thought = thoughts[Math.floor(Math.random() * thoughts.length)] || 'Working~';
  return { thought, emotion, animation };
}

export function getStreakMessage(): string | null {
  const minutes = codingStats.currentStreak;
  if (minutes >= 120) return `🔥 ${Math.floor(minutes / 60)} hour coding streak! Amazing!`;
  if (minutes >= 60) return `⭐ 1 hour streak! Keep it up~`;
  if (minutes >= 30) return `💪 30 min streak! You're focused!`;
  return null;
}

export function getBreakMessage(minutes: number): string {
  if (minutes >= 90) return `You've been coding for ${Math.floor(minutes / 60)}+ hours! Please take a break! 🙏`;
  if (minutes >= 60) return `1 hour of coding! Time for a stretch? 🧘`;
  return `${minutes} minutes of focus! Maybe grab some water? 💧`;
}

export function getDailySummary(): string {
  const hours = Math.floor(codingStats.totalCodingTime / (60 * 60 * 1000));
  const minutes = Math.floor((codingStats.totalCodingTime % (60 * 60 * 1000)) / (60 * 1000));
  const files = codingStats.filesEdited.size;
  const languages = Array.from(codingStats.languagesUsed).join(', ') || 'None';
  const commits = codingStats.commitCount;
  
  return `📊 Today's coding: ${hours}h ${minutes}m | ${files} files | ${commits} commits | Languages: ${languages}`;
}
