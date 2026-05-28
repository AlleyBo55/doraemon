import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, IpcMainEvent, protocol, net } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { patchConsole } from './utils/sanitize-log.js';

// Sanitize all console output (removes paths, API keys, etc.)
patchConsole();

// Load .env before config (env vars feed into cfg)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const home = process.env['HOME'] || process.env['USERPROFILE'] || '';

// Try multiple .env locations (first match wins per variable):
// 1. ~/.doraemon/.env (user config — works in both dev and production)
// 2. Project root (dev only — ../../ relative to out/main/)
// 3. App resources (production — bundled alongside the app)
dotenvConfig({ path: path.join(home, '.doraemon', '.env') });
dotenvConfig({ path: path.join(__dirname, '../../.env') });
dotenvConfig({ path: path.join(process.resourcesPath || __dirname, '.env') });

import { cfg } from './config.js';

import {
  checkNode,
  checkOpenClawInstalled,
  checkPort,
  killProcess,
  installOpenClaw,
  startDaemon,
  getInstallInstructions,
} from './daemon/index.js';
import {
  startNotificationWatcher,
  startEditorWatcher,
  getEditorThought,
  getStreakMessage,
  getBreakMessage,
  getDailySummary,
  getCodingStats,
  setStatsCallback,
  setBreakCallback,
  checkFullDiskAccess,
  requestFullDiskAccess,
} from './watchers/index.js';
import {
  startWebNotificationServer,
  type WebNotification,
} from './watchers/web-notification-server.js';
import { ExperienceSystem, experienceBridge, startMoltbookBrowser } from './experience-system/index.js';
import { initGatewayBridge } from './memory-system/gateway-bridge.js';
import { initConnector, learnFromEditor, learnFromNotification } from './memory-system/connector.js';
import { initApprovalQueue, openApprovalWindow, getPendingCount, setExperienceSystemRef } from './experience-system/approval-queue.js';
import { startProactiveEngine, stopProactiveEngine, onCodingActivity, onChatMessage, surfaceDreamInsight } from './experience-system/proactive-engine.js';
import { loadBond, recordInteraction } from './experience-system/bond-tracker.js';
import { flushHabits } from './experience-system/habit-tracker.js';
import { logConversation, exportConversationLog, getConversationLog, clearConversationLog } from './memory-system/conversation-log.js';
import {
  registerLLMProviderIpc,
  openPickerWindow,
  setProviderTrayRefresher,
  getCurrentProviderDisplayName,
} from './llm-provider-ipc.js';
import { setPickerOpener } from './llm-provider/index.js';
import { bootstrapProvider, stopKiroGateway } from './llm-provider/index.js';

let setupWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isOfflineMode = false;
let currentModelMode: 'haiku35' | 'haiku45' | 'multi' = 'haiku35';
let experienceSystem: ExperienceSystem | null = null;

/**
 * Get combined bounds that cover all displays
 */
function getCombinedDisplayBounds(displays: Electron.Display[]) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const display of displays) {
    const { x, y, width, height } = display.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Get primary display bounds for mascot movement
 */
function getPrimaryDisplayBounds() {
  const primary = screen.getPrimaryDisplay();
  return {
    x: primary.bounds.x,
    y: primary.bounds.y,
    width: primary.bounds.width,
    height: primary.bounds.height,
  };
}

/**
 * Get display bounds for a given point (mascot position)
 */
function getDisplayBoundsAtPoint(x: number, y: number) {
  const display = screen.getDisplayNearestPoint({ x, y });
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
  };
}

/**
 * Create the setup window for pre-flight checks
 */
function getPreloadPath(): string {
  const base = path.join(__dirname, '../preload/index');
  if (fs.existsSync(base + '.cjs')) return base + '.cjs';
  if (fs.existsSync(base + '.mjs')) return base + '.mjs';
  return base + '.js';
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 480,
    height: 640,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#F5F5F7',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env['NODE_ENV'] === 'development') {
    setupWindow.loadURL('http://localhost:5173/#/setup');
    setupWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    setupWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/setup',
    });
  }

  setupWindow.once('ready-to-show', () => {
    setupWindow?.show();
  });

  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

/**
 * Create the main mascot window
 */
function createMainWindow() {
  const allDisplays = screen.getAllDisplays();
  const combinedBounds = getCombinedDisplayBounds(allDisplays);

  mainWindow = new BrowserWindow({
    width: combinedBounds.width,
    height: combinedBounds.height,
    x: combinedBounds.x,
    y: combinedBounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  // Make window click-through except for the mascot
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Load the renderer
  if (process.env['NODE_ENV'] === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Start watchers
  startNotificationWatcher(mainWindow, (notification) => {
    mainWindow?.webContents.send('notification', {
      app: notification.app,
      title: notification.title,
      message: notification.message,
    });
    
    // Learn from notifications (aggressive learning)
    if (cfg.memorySystemEnabled) {
      learnFromNotification({
        app: notification.app,
        title: notification.title,
        body: notification.message,
      });
    }
  });

  startEditorWatcher(mainWindow, (activity) => {
    const { thought, emotion, animation } = getEditorThought(activity);
    mainWindow?.webContents.send('editor-activity', {
      ...activity,
      thought,
      emotion,
      animation,
    });
    
    // Feed to proactive engine + habit tracker
    onCodingActivity(activity.language, activity.action === 'git_commit');
    
    // Learn from editor activity (aggressive learning)
    if (cfg.memorySystemEnabled) {
      learnFromEditor({
        action: activity.action,
        language: activity.language,
        file: activity.file,
      });
    }
  });

  // Set up break reminder callback
  setBreakCallback((minutes) => {
    const message = getBreakMessage(minutes);
    mainWindow?.webContents.send('break-reminder', { minutes, message });
  });

  // Set up stats callback for productivity tracking
  setStatsCallback((stats) => {
    const streakMessage = getStreakMessage();
    if (streakMessage) {
      mainWindow?.webContents.send('coding-streak', { 
        minutes: stats.currentStreak, 
        message: streakMessage 
      });
    }
  });

  // Daily summary heartbeat - every 3 hours, show for 20 seconds (cannot be overridden)
  setInterval(() => {
    const summary = getDailySummary();
    console.log('[Main] Daily summary heartbeat:', summary);
    mainWindow?.webContents.send('daily-summary', { 
      message: summary, 
      duration: 20000,
      priority: true // Cannot be overridden
    });
  }, 3 * 60 * 60 * 1000); // 3 hours

  // Start web notification server for browser extension
  startWebNotificationServer(
    mainWindow,
    (notification: WebNotification) => {
      console.log('[Main] Forwarding web notification to renderer:', notification);
      mainWindow?.webContents.send('web-notification', {
        source: notification.source,
        title: notification.title,
        body: notification.body,
        url: notification.url,
      });
    },
    async (content) => {
      // Route browser content to autonomous learning system (FREE - no LLM)
      const { processBrowserContent } = await import('./experience-system/autonomous-learning.js');
      await processBrowserContent({
        source: content.source,
        contentType: content.contentType,
        content: content.content,
        title: content.title,
        url: content.url,
      });
      console.log('[Main] Browser content processed:', content.source, content.contentType);
    }
  );

  // Validate critical keys at startup
  console.log('[Main] Key validation:',
    'anthropicApiKey:', cfg.anthropicApiKey ? '✓ loaded' : '✗ MISSING',
    'moltbookApiKey:', cfg.moltbookApiKey ? '✓ loaded' : '✗ MISSING',
    'moltbookUsername:', cfg.moltbookUsername || '✗ MISSING',
    'moltbookBrowser:', cfg.moltbookBrowserEnabled ? 'ON' : 'OFF',
  );

  // Initialize experience system and connect bridge to main window
  experienceBridge.setMainWindow(mainWindow);
  experienceSystem = new ExperienceSystem({
    enabled: cfg.experienceSystemEnabled,
    heartbeatIntervalMinutes: 50,
  });
  
  // Set reference for approval queue to use
  setExperienceSystemRef(experienceSystem);
  
  experienceSystem.start().catch(err => {
    console.error('[Main] Experience system failed to start:', err);
  });

  // Start proactive decision engine
  loadBond();
  startProactiveEngine();

  // Initialize approval queue for supervised posting
  initApprovalQueue(mainWindow);
  
  // Start Moltbook browser for autonomous social engagement
  startMoltbookBrowser();

  // Initialize secure memory system with gateway bridge
  if (cfg.memorySystemEnabled) {
    initGatewayBridge(mainWindow);
    initConnector(mainWindow);
    // Memory exporter kept as library - not auto-started
    // startMemoryExporter();
    console.log('[Main] Memory system initialized with full connectivity');
  }
}

function createTray() {
  // Try multiple icon paths
  const iconPaths = [
    path.join(__dirname, '../renderer/dora-sprites/icon.png'),
    path.join(__dirname, '../../assets/dora-sprites/icon.png'),
  ];
  
  let icon: Electron.NativeImage | null = null;
  
  for (const iconPath of iconPaths) {
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      console.log('Tray icon loaded from:', iconPath);
      break;
    }
  }
  
  if (!icon) {
    // Fallback: Create a simple blue circle
    console.log('Creating fallback tray icon');
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const dx = x - size / 2;
        const dy = y - size / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < size / 2 - 1) {
          canvas[idx] = 0;       // R
          canvas[idx + 1] = 153; // G
          canvas[idx + 2] = 255; // B
          canvas[idx + 3] = 255; // A
        }
      }
    }
    icon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  }
  
  tray = new Tray(icon);
  
  updateTrayMenu();
  tray.setToolTip('Doraemon');
}

let cachedProviderLabel = 'LLM Provider…';

async function refreshProviderLabel(): Promise<void> {
  try {
    const name = await getCurrentProviderDisplayName();
    cachedProviderLabel = `LLM: ${name}`;
  } catch {
    cachedProviderLabel = 'LLM Provider…';
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show/Hide', 
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Chat',
      click: () => {
        mainWindow?.webContents.send('toggle-chat');
      }
    },
    {
      label: 'Clear History',
      click: () => {
        mainWindow?.webContents.send('clear-history');
      }
    },
    { type: 'separator' },
    {
      label: 'Model Mode',
      submenu: [
        {
          label: 'Haiku 3.5 (Default)',
          type: 'radio',
          checked: currentModelMode === 'haiku35',
          click: () => {
            currentModelMode = 'haiku35';
            mainWindow?.webContents.send('model-mode-changed', 'haiku35');
            updateTrayMenu();
          }
        },
        {
          label: 'Haiku 4.5',
          type: 'radio',
          checked: currentModelMode === 'haiku45',
          click: () => {
            currentModelMode = 'haiku45';
            mainWindow?.webContents.send('model-mode-changed', 'haiku45');
            updateTrayMenu();
          }
        },
        {
          label: 'Multi-Model Routing',
          type: 'radio',
          checked: currentModelMode === 'multi',
          click: () => {
            currentModelMode = 'multi';
            mainWindow?.webContents.send('model-mode-changed', 'multi');
            updateTrayMenu();
          }
        },
      ]
    },
    { type: 'separator' },
    {
      label: cachedProviderLabel,
      submenu: [
        {
          label: 'Switch LLM Provider…',
          click: () => {
            openPickerWindow();
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Emotions',
      submenu: [
        { label: '😊 Happy', click: () => mainWindow?.webContents.send('trigger-emotion', 'happy') },
        { label: '🎉 Excited', click: () => mainWindow?.webContents.send('trigger-emotion', 'excited') },
        { label: '🤔 Thinking', click: () => mainWindow?.webContents.send('trigger-emotion', 'thinking') },
        { label: '😴 Sleepy', click: () => mainWindow?.webContents.send('trigger-emotion', 'sleepy') },
        { label: '🎮 Playful', click: () => mainWindow?.webContents.send('trigger-emotion', 'playful') },
        { type: 'separator' },
        { label: '💻 Coding All Day', click: () => mainWindow?.webContents.send('trigger-emotion', 'coding_allday') },
        { label: '⌨️ Coding', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_coding_typing') },
        { label: '🔥 Coding Intense', click: () => mainWindow?.webContents.send('trigger-emotion', 'emotion_determination') },
        { label: '💭 Coding Thinking', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_coding_thinking') },
        { label: '🎊 Coding Celebrate', click: () => mainWindow?.webContents.send('trigger-emotion', 'emotion_pride') },
        { type: 'separator' },
        { label: '🔎 Research', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_research') },
        { label: '🧰 Gadget Search', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_gadget_search') },
        { label: '📱 Explain Gadget', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_explain_gadget') },
        { label: '🍡 Hungry', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_hungry') },
        { label: '🍽️ Eating', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_eating') },
        { label: '🛏️ Rest', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_rest') },
        { label: '💤 Nap', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_nap') },
        { label: '😡 Angry', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_angry') },
        { label: '🚶 Walk', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_walk') },
        { label: '🚁 Take-copter', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_take_copter') },
        { label: '⏳ Time Travel', click: () => mainWindow?.webContents.send('trigger-emotion', 'action_time_travel') },
        { type: 'separator' },
        { label: '⏹️ Stop Coding Mode', click: () => mainWindow?.webContents.send('stop-coding-mode') },
      ]
    },
    { type: 'separator' },
    { 
      label: 'Reset Position', 
      click: () => {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        const { x: displayX, y: displayY } = primaryDisplay.bounds;
        mainWindow?.webContents.send('reset-position', { 
          x: displayX + width / 2 - 64, 
          y: displayY + height / 2 - 64 
        });
      }
    },
    { type: 'separator' },
    {
      label: '📝 Moltbook Approval',
      click: () => {
        openApprovalWindow();
      },
      sublabel: getPendingCount() > 0 ? `${getPendingCount()} pending` : undefined,
    },
    { type: 'separator' },
    {
      label: '🧠 Memory',
      submenu: [
        { 
          label: 'Show Dashboard', 
          click: () => mainWindow?.webContents.send('show-memory-dashboard') 
        },
        { 
          label: 'What I Remember...', 
          click: () => mainWindow?.webContents.send('show-memory-summary') 
        },
        { type: 'separator' },
        { 
          label: 'Self Model', 
          click: () => mainWindow?.webContents.send('show-self-model') 
        },
        { 
          label: 'Emergent Goals', 
          click: () => mainWindow?.webContents.send('show-emergent-goals') 
        },
        { type: 'separator' },
        { 
          label: 'Security Flags', 
          click: () => mainWindow?.webContents.send('show-security-flags') 
        },
      ]
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Launch the main Doraemon window (called after setup completes)
 */
function launchDoraemon() {
  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }
  
  createMainWindow();
  createTray();
}

// ============================================
// Setup IPC Handlers
// ============================================

// Check Node.js
ipcMain.handle('setup:check-node', async () => {
  const result = await checkNode();
  return {
    success: result.meetsRequirement,
    version: result.version,
    message: result.error || (result.meetsRequirement ? undefined : `Node.js ${result.majorVersion} found, need v22+`),
  };
});

// Check OpenClaw installation
ipcMain.handle('setup:check-openclaw', async () => {
  const result = await checkOpenClawInstalled();
  return {
    success: result.installed,
    version: result.version,
    message: result.error,
  };
});

// Check port status
ipcMain.handle('setup:check-port', async (_event, port: number) => {
  const result = await checkPort(port);
  return {
    success: !result.inUse,
    pid: result.pid,
    message: result.inUse ? `Port ${port} in use by ${result.processName || 'unknown'}` : undefined,
  };
});

// Kill port process
ipcMain.handle('setup:kill-port', async () => {
  const portCheck = await checkPort(3000);
  if (portCheck.pid) {
    const killed = await killProcess(portCheck.pid);
    return { success: killed };
  }
  return { success: true };
});

// Kill a process by PID
ipcMain.handle('setup:kill-process', async (_event, pid: number) => {
  return await killProcess(pid);
});

// Install OpenClaw
ipcMain.handle('setup:install-openclaw', async (event) => {
  return await installOpenClaw((message) => {
    event.sender.send('setup:progress', message);
  });
});

// Start daemon
ipcMain.handle('setup:start-daemon', async (event, port: number) => {
  const result = await startDaemon(port, (message) => {
    event.sender.send('setup:progress', message);
  });
  return {
    success: result.success,
    message: result.error,
  };
});

// Get install instructions
ipcMain.handle('setup:get-instructions', () => {
  return getInstallInstructions();
});

// Launch Doraemon (after setup)
ipcMain.on('setup:launch-doraemon', () => {
  launchDoraemon();
});

// Continue in offline mode
ipcMain.on('setup:continue-offline', () => {
  isOfflineMode = true;
  launchDoraemon();
});

// Close setup window
ipcMain.on('setup:close-window', () => {
  app.quit();
});

// Minimize setup window
ipcMain.on('setup:minimize-window', () => {
  setupWindow?.minimize();
});

// Resize setup window
ipcMain.on('setup:resize-window', (_event, { height }: { height: number }) => {
  if (setupWindow) {
    const [width] = setupWindow.getSize();
    setupWindow.setSize(width, height, true);
  }
});

// ============================================
// Main Doraemon IPC Handlers
// ============================================

ipcMain.handle('get-config', () => {
  const assetsPath = path.join(__dirname, '../../assets/dora-sprites');
  
  return {
    openclawUrl: cfg.openclawUrl,
    spritePath: assetsPath,
    isOfflineMode,
    debugConversation: cfg.debugConversation,
  };
});

ipcMain.handle('log-conversation', (_event, entry: { direction: string; from: string; to: string; channel: string; body: string; tokens?: { input: number; output: number; total: number; model?: string; durationMs?: number } }) => {
  if (!cfg.debugConversation) return;
  logConversation(entry as Parameters<typeof logConversation>[0]);
});

ipcMain.handle('export-conversation-log', () => {
  return exportConversationLog();
});

ipcMain.handle('get-conversation-log', (_event, limit?: number) => {
  return getConversationLog(limit);
});

ipcMain.handle('clear-conversation-log', () => {
  return clearConversationLog();
});

ipcMain.handle('get-screen-size', () => {
  const bounds = getPrimaryDisplayBounds();
  return { 
    width: bounds.width, 
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
  };
});

ipcMain.handle('get-display-at-point', (_event, { x, y }: { x: number; y: number }) => {
  const bounds = getDisplayBoundsAtPoint(x, y);
  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
  };
});

ipcMain.on('set-position', (_event: IpcMainEvent, { x, y }: { x: number; y: number }) => {
  if (mainWindow) {
    mainWindow.setPosition(Math.round(x), Math.round(y), false);
  }
});

ipcMain.on('set-mouse-events', (_event: IpcMainEvent, enabled: boolean) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(!enabled, { forward: true });
    if (enabled) {
      mainWindow.setFocusable(true);
    }
  }
});

ipcMain.on('focus-window', () => {
  if (mainWindow) {
    mainWindow.focus();
  }
});

// Sync model mode from renderer
ipcMain.on('sync-model-mode', (_event: IpcMainEvent, mode: 'haiku35' | 'haiku45' | 'multi') => {
  currentModelMode = mode;
  updateTrayMenu();
});

// Get current model mode
ipcMain.handle('get-model-mode', () => {
  return currentModelMode;
});

// Check Full Disk Access permission for native notifications
ipcMain.handle('check-full-disk-access', async () => {
  return await checkFullDiskAccess();
});

// Request Full Disk Access (opens System Preferences)
ipcMain.handle('request-full-disk-access', async () => {
  await requestFullDiskAccess();
  return true;
});

// Get coding stats
ipcMain.handle('get-coding-stats', () => {
  const stats = getCodingStats();
  return {
    sessionStart: stats.sessionStart,
    totalCodingTime: stats.totalCodingTime,
    lastActivityTime: stats.lastActivityTime,
    filesEdited: stats.filesEdited.size,
    languagesUsed: Array.from(stats.languagesUsed),
    commitCount: stats.commitCount,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
  };
});

// Get daily summary
ipcMain.handle('get-daily-summary', () => {
  return getDailySummary();
});

// Proactive engine: receive chat messages for mood/bond tracking
ipcMain.on('proactive:chat-message', (_event: IpcMainEvent, userMessage: string) => {
  onChatMessage(userMessage);
});

// ============================================
// Media Feed IPC Handlers (Supervised Learning)
// ============================================

ipcMain.handle('media:feed', async (_event, input: {
  type: 'manga' | 'anime' | 'video' | 'article' | 'music' | 'game';
  title: string;
  chapter?: number;
  episode?: number;
  summary: string;
  highlights?: string[];
  url?: string;
}) => {
  const { feedMedia } = await import('./experience-system/media-feed.js');
  return await feedMedia(input);
});

ipcMain.handle('media:feed-manga', async (_event, title: string, chapter: number, summary: string, highlights?: string[]) => {
  const { feedManga } = await import('./experience-system/media-feed.js');
  return await feedManga(title, chapter, summary, highlights);
});

ipcMain.handle('media:feed-anime', async (_event, title: string, episode: number, summary: string, highlights?: string[]) => {
  const { feedAnime } = await import('./experience-system/media-feed.js');
  return await feedAnime(title, episode, summary, highlights);
});

ipcMain.handle('media:feed-video', async (_event, title: string, summary: string, url?: string, highlights?: string[]) => {
  const { feedVideo } = await import('./experience-system/media-feed.js');
  return await feedVideo(title, summary, url, highlights);
});

ipcMain.handle('media:feed-article', async (_event, title: string, summary: string, url?: string, highlights?: string[]) => {
  const { feedArticle } = await import('./experience-system/media-feed.js');
  return await feedArticle(title, summary, url, highlights);
});

ipcMain.handle('media:parse-chat', async (_event, message: string) => {
  const { parseMediaFromChat } = await import('./experience-system/media-feed.js');
  return parseMediaFromChat(message);
});

// ============================================
// URL Reader IPC Handlers
// ============================================

ipcMain.handle('url:read', async (_event, url: string) => {
  const { readURL, isURLReaderEnabled } = await import('./experience-system/url-reader.js');
  if (!isURLReaderEnabled()) {
    return { success: false, error: 'URL_READER_ENABLED is not set to 1' };
  }
  return readURL(url);
});

ipcMain.handle('url:read-manga', async (_event, site: string, mangaSlug: string, chapter: number) => {
  const { readMangaChapter, isURLReaderEnabled } = await import('./experience-system/url-reader.js');
  if (!isURLReaderEnabled()) {
    return { success: false, error: 'URL_READER_ENABLED is not set to 1' };
  }
  return readMangaChapter(site, mangaSlug, chapter);
});

ipcMain.handle('url:is-enabled', async () => {
  const { isURLReaderEnabled } = await import('./experience-system/url-reader.js');
  return isURLReaderEnabled();
});

// ============================================
// Autonomous Learning IPC Handlers
// ============================================

ipcMain.handle('autonomous:get-stats', async () => {
  const { getAutonomousLearningStats } = await import('./experience-system/autonomous-learning.js');
  return getAutonomousLearningStats();
});

ipcMain.handle('autonomous:get-sessions', async () => {
  const { getActiveSessions } = await import('./experience-system/autonomous-learning.js');
  return getActiveSessions();
});

ipcMain.handle('autonomous:reset-stats', async () => {
  const { resetDailyStats } = await import('./experience-system/autonomous-learning.js');
  resetDailyStats();
  return { success: true };
});

// ============================================
// Moltbook Browser IPC Handlers
// ============================================

ipcMain.handle('moltbook:get-stats', async () => {
  const { getMoltbookBrowserStats } = await import('./experience-system/moltbook-browser.js');
  return getMoltbookBrowserStats();
});

ipcMain.handle('moltbook:trigger-browse', async () => {
  const { triggerBrowseNow } = await import('./experience-system/moltbook-browser.js');
  await triggerBrowseNow();
  return { success: true };
});

ipcMain.handle('moltbook:reset-stats', async () => {
  const { resetMoltbookBrowserStats } = await import('./experience-system/moltbook-browser.js');
  resetMoltbookBrowserStats();
  return { success: true };
});

// ============================================
// Kiro Bridge IPC Handlers
// ============================================

ipcMain.handle('kiro:init', async (_event, workspacePath?: string) => {
  const { initKiroBridge } = await import('./ide-bridge/kiro-bridge.js');
  return initKiroBridge(workspacePath);
});

ipcMain.handle('kiro:ask', async (_event, message: string, workspacePath?: string) => {
  const { askKiro } = await import('./ide-bridge/kiro-bridge.js');
  return askKiro(message, workspacePath);
});

ipcMain.handle('kiro:fix-error', async (_event, error: string, file?: string, workspacePath?: string) => {
  const { askKiroToFix } = await import('./ide-bridge/kiro-bridge.js');
  return askKiroToFix(error, file, workspacePath);
});

ipcMain.handle('kiro:explain', async (_event, code: string, file?: string, workspacePath?: string) => {
  const { askKiroToExplain } = await import('./ide-bridge/kiro-bridge.js');
  return askKiroToExplain(code, file, workspacePath);
});

ipcMain.handle('kiro:review', async (_event, file: string, workspacePath?: string) => {
  const { askKiroToReview } = await import('./ide-bridge/kiro-bridge.js');
  return askKiroToReview(file, workspacePath);
});

ipcMain.handle('kiro:send', async (_event, message: string, type: string, context?: object, workspacePath?: string) => {
  const { sendToKiro } = await import('./ide-bridge/kiro-bridge.js');
  return sendToKiro(message, type as any, context as any, workspacePath);
});

// ============================================
// Unified IDE Bridge IPC Handlers
// ============================================

ipcMain.handle('ide:detect', async () => {
  const { detectRunningIDE } = await import('./ide-bridge/unified-bridge.js');
  return detectRunningIDE();
});

ipcMain.handle('ide:send', async (_event, message: string, preferredIDE?: string, workspacePath?: string) => {
  const { sendToIDE } = await import('./ide-bridge/unified-bridge.js');
  return sendToIDE(message, { preferredIDE: preferredIDE as any, workspacePath });
});

ipcMain.handle('ide:ask', async (_event, message: string, preferredIDE?: string, workspacePath?: string) => {
  const { askIDE } = await import('./ide-bridge/unified-bridge.js');
  return askIDE(message, { preferredIDE: preferredIDE as any, workspacePath });
});

ipcMain.handle('ide:fix-error', async (_event, error: string, file?: string, preferredIDE?: string, workspacePath?: string) => {
  const { askIDEToFix } = await import('./ide-bridge/unified-bridge.js');
  return askIDEToFix(error, file, { preferredIDE: preferredIDE as any, workspacePath });
});

ipcMain.handle('ide:explain', async (_event, code: string, preferredIDE?: string, workspacePath?: string) => {
  const { askIDEToExplain } = await import('./ide-bridge/unified-bridge.js');
  return askIDEToExplain(code, { preferredIDE: preferredIDE as any, workspacePath });
});

ipcMain.handle('ide:review', async (_event, file: string, preferredIDE?: string, workspacePath?: string) => {
  const { askIDEToReview } = await import('./ide-bridge/unified-bridge.js');
  return askIDEToReview(file, { preferredIDE: preferredIDE as any, workspacePath });
});

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(() => {
  // Register protocol for loading local assets
  protocol.handle('asset', (request) => {
    const url = request.url.replace('asset://', '');
    const filePath = path.join(__dirname, '../../assets', url);
    return net.fetch(`file://${filePath}`);
  });

  // LLM provider IPC + tray label refresher
  registerLLMProviderIpc();
  setProviderTrayRefresher(() => {
    void refreshProviderLabel().then(() => updateTrayMenu());
  });
  setPickerOpener(() => openPickerWindow());
  void refreshProviderLabel();
  void bootstrapProvider();

  // Check if we should skip setup (e.g., --skip-setup flag or env var)
  const skipSetup = cfg.skipSetup;
  
  if (skipSetup) {
    // Skip setup, go directly to main window
    createMainWindow();
    createTray();
  } else {
    // Show setup window first
    createSetupWindow();
  }

  screen.on('display-metrics-changed', () => {
    const allDisplays = screen.getAllDisplays();
    const combinedBounds = getCombinedDisplayBounds(allDisplays);
    mainWindow?.setBounds(combinedBounds);
  });

  screen.on('display-added', () => {
    const allDisplays = screen.getAllDisplays();
    const combinedBounds = getCombinedDisplayBounds(allDisplays);
    mainWindow?.setBounds(combinedBounds);
  });

  screen.on('display-removed', () => {
    const allDisplays = screen.getAllDisplays();
    const combinedBounds = getCombinedDisplayBounds(allDisplays);
    mainWindow?.setBounds(combinedBounds);
  });
});

app.on('before-quit', async () => {
  console.log('[Main] Graceful shutdown starting...');

  try {
    const { stopNotificationWatcher } = await import('./watchers/index.js');
    stopNotificationWatcher();
  } catch (err) {
    console.error('[Shutdown] Failed to stop notification watcher:', err);
  }

  try {
    const { stopEditorWatcher } = await import('./watchers/index.js');
    stopEditorWatcher();
  } catch (err) {
    console.error('[Shutdown] Failed to stop editor watcher:', err);
  }

  try {
    const { stopWebNotificationServer } = await import('./watchers/web-notification-server.js');
    stopWebNotificationServer();
  } catch (err) {
    console.error('[Shutdown] Failed to stop web notification server:', err);
  }

  try {
    const { stopMCPServer } = await import('./mcp-server/index.js');
    stopMCPServer();
  } catch (err) {
    console.error('[Shutdown] Failed to stop MCP server:', err);
  }

  try {
    const { stopCommandWatcher } = await import('./mcp-server/command-watcher.js');
    await stopCommandWatcher();
  } catch (err) {
    console.error('[Shutdown] Failed to stop command watcher:', err);
  }

  try {
    const { closeKiroBridge } = await import('./ide-bridge/kiro-bridge.js');
    closeKiroBridge();
  } catch (err) {
    console.error('[Shutdown] Failed to close Kiro bridge:', err);
  }

  try {
    await stopKiroGateway();
  } catch (err) {
    console.error('[Shutdown] Failed to stop Kiro gateway:', err);
  }

  try {
    const { stopMoltbookBrowser } = await import('./experience-system/moltbook-browser.js');
    stopMoltbookBrowser();
  } catch (err) {
    console.error('[Shutdown] Failed to stop Moltbook browser:', err);
  }

  if (experienceSystem) {
    try {
      experienceSystem.stop();
    } catch (err) {
      console.error('[Shutdown] Failed to stop experience system:', err);
    }
  }

  try {
    stopProactiveEngine();
    flushHabits();
  } catch (err) {
    console.error('[Shutdown] Failed to stop proactive engine:', err);
  }

  try {
    const { cleanup } = await import('./memory-system/connector.js');
    cleanup();
  } catch (err) {
    console.error('[Shutdown] Failed to cleanup memory connector:', err);
  }

  console.log('[Main] Graceful shutdown complete');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (mainWindow === null && setupWindow === null) {
      createSetupWindow();
    }
  }
});
