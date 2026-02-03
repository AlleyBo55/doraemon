import { watch, FSWatcher, existsSync, statSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
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

const LANGUAGE_EMOTIONS: Record<string, { emotion: string; thoughts: string[] }> = {
  'TypeScript': { 
    emotion: 'excited', 
    thoughts: ['TypeScript! Type safety is the best~', 'Ooh, strong types! I love it!', 'TypeScript makes me happy~'] 
  },
  'TypeScript React': { 
    emotion: 'excited', 
    thoughts: ['TSX! Components with types~', 'React + TypeScript = Perfect!', 'Building UI with safety~'] 
  },
  'JavaScript': { 
    emotion: 'happy', 
    thoughts: ['JavaScript time!', 'Classic JS~', 'Dynamic and fun!'] 
  },
  'Python': { 
    emotion: 'relaxed', 
    thoughts: ['Python~ So readable!', 'Indentation matters here~', 'Pythonic code incoming!'] 
  },
  'Rust': { 
    emotion: 'determined', 
    thoughts: ['Rust! Memory safety!', 'Fighting the borrow checker~', 'Fearless concurrency!'] 
  },
  'Regex': { 
    emotion: 'anxious', 
    thoughts: ['R-regex?! Scary...', 'So many symbols...', 'I hope this works...', '.*? What does that mean?!'] 
  },
  'Go': { 
    emotion: 'determined', 
    thoughts: ['Go go go!', 'Simple and fast~', 'Goroutines!'] 
  },
  'CSS': { 
    emotion: 'curious', 
    thoughts: ['Making things pretty~', 'Flexbox or Grid?', 'Styling time!'] 
  },
  'HTML': { 
    emotion: 'relaxed', 
    thoughts: ['HTML structure~', 'Building the skeleton!', 'Semantic tags!'] 
  },
  'JSON': { 
    emotion: 'neutral', 
    thoughts: ['Config time~', 'Data data data...', 'Curly braces everywhere!'] 
  },
  'Markdown': { 
    emotion: 'relaxed', 
    thoughts: ['Documentation!', 'Writing docs~', 'README time!'] 
  },
};

const FILE_TYPE_REACTIONS: Record<string, { emotion: string; thoughts: string[] }> = {
  test: { 
    emotion: 'determined', 
    thoughts: ['Testing time!', 'Let\'s make sure it works~', 'Tests are important!', 'Quality assurance!'] 
  },
  config: { 
    emotion: 'thinking', 
    thoughts: ['Config files... boring but important~', 'Setting things up!', 'Configuration time~'] 
  },
  component: { 
    emotion: 'excited', 
    thoughts: ['Building components!', 'UI time~', 'Making it look good!'] 
  },
  style: { 
    emotion: 'playful', 
    thoughts: ['Styling!', 'Making it pretty~', 'CSS magic!'] 
  },
  docs: { 
    emotion: 'proud', 
    thoughts: ['Documentation! So responsible~', 'Helping future devs!', 'Good documentation!'] 
  },
  code: { 
    emotion: 'working', 
    thoughts: ['Coding coding~', 'Building features!', 'Let\'s go!'] 
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
  
  breakCheckInterval = setInterval(checkBreakReminder, 60 * 1000);
  idleCheckInterval = setInterval(checkIdleState, 30 * 1000);
  
  console.log(`[EditorWatcher] Started with ${watchers.length} active watchers`);
}

export function stopEditorWatcher() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (breakCheckInterval) { clearInterval(breakCheckInterval); breakCheckInterval = null; }
  if (idleCheckInterval) { clearInterval(idleCheckInterval); idleCheckInterval = null; }
  for (const watcher of watchers) watcher.close();
  watchers.length = 0;
  callback = null;
  statsCallback = null;
  breakCallback = null;
}

export function setStatsCallback(cb: StatsCallback) { statsCallback = cb; }
export function setBreakCallback(cb: BreakCallback) { breakCallback = cb; }
export function getCodingStats(): CodingStats { return codingStats; }

export function getEditorThought(activity: EditorActivity): { thought: string; emotion: string } {
  const language = activity.language || 'Unknown';
  const fileType = activity.fileType || 'code';
  const langReaction = LANGUAGE_EMOTIONS[language];
  const fileReaction = FILE_TYPE_REACTIONS[fileType];
  
  const actionThoughts: Record<EditorActivity['action'], { thoughts: string[]; emotion: string }> = {
    file_opened: {
      thoughts: [
        `Oh! Working on ${activity.file}~`,
        `${activity.file}? Let's see...`,
        `Opening ${activity.file}!`,
      ],
      emotion: langReaction?.emotion || 'curious',
    },
    file_saved: {
      thoughts: [
        `Good job saving ${activity.file}!`,
        `Progress! Keep going~`,
        `Saved! Nice work~`,
      ],
      emotion: 'proud',
    },
    file_created: {
      thoughts: [
        `A new file! ${activity.file}~`,
        `Creating something new? Exciting!`,
        `Fresh start with ${activity.file}!`,
      ],
      emotion: 'excited',
    },
    typing: {
      thoughts: [
        `Coding hard, I see~`,
        `Type type type...`,
        `You're on a roll!`,
        `Focus mode activated!`,
      ],
      emotion: 'working',
    },
    idle: {
      thoughts: [
        `Taking a break?`,
        `Need any help?`,
        `*yawn* Getting sleepy...`,
        `Zzz... wake me when you're back~`,
      ],
      emotion: 'sleepy',
    },
    git_commit: {
      thoughts: [
        `Nice commit! 🎉`,
        `Code saved to history!`,
        `Another commit! You're productive~`,
        `Git push time?`,
      ],
      emotion: 'celebrate',
    },
    git_conflict: {
      thoughts: [
        `Uh oh... merge conflict!`,
        `Conflict detected! Don't panic~`,
        `Time to resolve some conflicts...`,
      ],
      emotion: 'anxious',
    },
    error_detected: {
      thoughts: [
        `Hmm, something's wrong...`,
        `Error detected! Let me help~`,
        `Oops, there's an issue here...`,
      ],
      emotion: 'thinking',
    },
  };

  let thoughts: string[] = [];
  let emotion = 'neutral';

  const actionData = actionThoughts[activity.action];
  if (actionData) {
    thoughts = [...actionData.thoughts];
    emotion = actionData.emotion;
  }

  if (langReaction && activity.action === 'file_opened') {
    thoughts = [...thoughts, ...langReaction.thoughts];
    emotion = langReaction.emotion;
  }

  if (fileReaction && (activity.action === 'file_opened' || activity.action === 'file_created')) {
    thoughts = [...thoughts, ...fileReaction.thoughts];
    if (fileType === 'test') emotion = fileReaction.emotion;
  }

  const streakMinutes = codingStats.currentStreak;
  if (streakMinutes >= 120) {
    thoughts.push(`Wow! ${Math.floor(streakMinutes / 60)} hours of coding! Take a break?`);
    emotion = 'proud';
  } else if (streakMinutes >= 60) {
    thoughts.push(`1 hour streak! You're doing great~`);
  }

  const thought = thoughts[Math.floor(Math.random() * thoughts.length)] || 'Working~';
  return { thought, emotion };
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
