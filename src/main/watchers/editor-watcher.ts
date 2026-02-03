import { watch, FSWatcher, existsSync, statSync, readdirSync } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import { BrowserWindow } from 'electron';

export type EditorActivity = {
  editor: 'vscode' | 'kiro' | 'antigravity' | 'unknown';
  action: 'file_opened' | 'file_saved' | 'file_created' | 'typing' | 'idle' | 'git_commit' | 'git_conflict' | 'error_detected';
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
    animation: 'coding',
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
    animation: 'coding',
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
    animation: 'coding',
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
    animation: 'coding',
    thoughts: [
      'SCSS! Variables and nesting~',
      'Mixins are powerful!',
      '@include magic~',
    ]
  },
  'HTML': { 
    emotion: 'relaxed',
    animation: 'coding',
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
    animation: 'coding',
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
    animation: 'coding',
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
    animation: 'coding',
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
    animation: 'coding',
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
    animation: 'coding',
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

function detectEditor(path: string): EditorActivity['editor'] {
  if (path.includes('.vscode') || path.includes('Code')) return 'vscode';
  if (path.includes('.kiro') || path.includes('Kiro')) return 'kiro';
  if (path.includes('antigravity') || path.includes('Antigravity')) return 'antigravity';
  return 'unknown';
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
  ];

  for (const basePath of commonPaths) {
    if (!existsSync(basePath)) continue;
    
    try {
      const dirs = readdirSync(basePath, { withFileTypes: true });
      for (const dir of dirs.slice(0, 10)) {
        if (!dir.isDirectory()) continue;
        const gitPath = join(basePath, dir.name, '.git');
        if (!existsSync(gitPath)) continue;
        
        const headPath = join(gitPath, 'HEAD');
        const watcher = safeWatch(headPath, () => {
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
          console.log(`[EditorWatcher] Watching git: ${gitPath}`);
        }

        const mergePath = join(gitPath, 'MERGE_HEAD');
        const mergeWatcher = safeWatch(mergePath, () => {
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
    if (!existsSync(historyPath)) continue;

    try {
      const entries = await readdir(historyPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const subDir = join(historyPath, entry.name);
        try {
          const files = await readdir(subDir);
          
          for (const file of files) {
            const filePath = join(subDir, file);
            try {
              const stats = await stat(filePath);
              const mtime = stats.mtimeMs;
              const lastMtime = lastModTimes.get(filePath);
              
              if (lastMtime === undefined) {
                lastModTimes.set(filePath, mtime);
                continue;
              }
              
              if (mtime > lastMtime) {
                lastModTimes.set(filePath, mtime);
                
                const fileName = basename(file);
                const language = getLanguage(fileName);
                const fileType = getFileType(fileName);
                
                console.log(`[EditorWatcher] File activity detected: ${fileName} (${editor})`);
                
                const activity: EditorActivity = {
                  editor,
                  action: 'file_saved',
                  file: fileName,
                  language,
                  fileType,
                  timestamp: Date.now(),
                };
                
                updateCodingStats(activity);
                callback?.(activity);
                return;
              }
            } catch { /* ignore individual file errors */ }
          }
        } catch { /* ignore subdirectory errors */ }
      }
    } catch (e) {
      console.error(`[EditorWatcher] Error polling history: ${e}`);
    }
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

export function startEditorWatcher(
  _mainWindow: BrowserWindow,
  onActivity: EditorCallback,
  workspacePaths?: string[]
) {
  callback = onActivity;
  
  console.log('[EditorWatcher] Starting enhanced editor watcher...');
  
  watchVSCodeState();
  watchRecentFiles();
  watchGitDirectories();
  
  // Start polling for History folder changes (more reliable than fs.watch on macOS)
  historyPollInterval = setInterval(async () => {
    await pollHistoryFolders();
    await pollWorkspaceStorage();
  }, 2000);
  
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
      animation: langReaction?.animation || 'coding',
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
