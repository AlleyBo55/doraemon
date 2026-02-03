import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, IpcMainEvent, protocol } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
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
  stopNotificationWatcher,
  startEditorWatcher,
  stopEditorWatcher,
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
  stopWebNotificationServer,
  type WebNotification,
} from './watchers/web-notification-server.js';

// Load .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.join(__dirname, '../../.env') });

let setupWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isOfflineMode = false;
let currentModelMode: 'haiku35' | 'haiku45' | 'multi' = 'haiku35';

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
    setupWindow.loadURL('http://localhost:5173/setup.html');
    setupWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    setupWindow.loadFile(path.join(__dirname, '../renderer/setup.html'));
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
  });

  startEditorWatcher(mainWindow, (activity) => {
    const { thought, emotion, animation } = getEditorThought(activity);
    mainWindow?.webContents.send('editor-activity', {
      ...activity,
      thought,
      emotion,
      animation,
    });
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

  // Start web notification server for browser extension
  startWebNotificationServer(mainWindow, (notification: WebNotification) => {
    console.log('[Main] Forwarding web notification to renderer:', notification);
    mainWindow?.webContents.send('web-notification', {
      source: notification.source,
      title: notification.title,
      body: notification.body,
      url: notification.url,
    });
  });
}

function createTray() {
  // Try multiple icon paths
  const iconPaths = [
    path.join(__dirname, '../renderer/public/dora-sprites/icon.png'),
    path.join(__dirname, '../../src/renderer/public/dora-sprites/icon.png'),
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
      label: 'Emotions',
      submenu: [
        { label: '😊 Happy', click: () => mainWindow?.webContents.send('trigger-emotion', 'happy') },
        { label: '🎉 Excited', click: () => mainWindow?.webContents.send('trigger-emotion', 'excited') },
        { label: '🤔 Thinking', click: () => mainWindow?.webContents.send('trigger-emotion', 'thinking') },
        { label: '😴 Sleepy', click: () => mainWindow?.webContents.send('trigger-emotion', 'sleepy') },
        { label: '🎮 Playful', click: () => mainWindow?.webContents.send('trigger-emotion', 'playful') },
        { type: 'separator' },
        { label: '💻 Coding All Day', click: () => mainWindow?.webContents.send('trigger-emotion', 'coding_allday') },
        { label: '⌨️ Coding', click: () => mainWindow?.webContents.send('trigger-emotion', 'coding') },
        { label: '🔥 Coding Intense', click: () => mainWindow?.webContents.send('trigger-emotion', 'coding_intense') },
        { label: '💭 Coding Thinking', click: () => mainWindow?.webContents.send('trigger-emotion', 'coding_thinking') },
        { label: '🎊 Coding Celebrate', click: () => mainWindow?.webContents.send('trigger-emotion', 'coding_celebrate') },
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
    openclawUrl: process.env['OPENCLAW_URL'] || 'ws://127.0.0.1:18789',
    spritePath: assetsPath,
    isOfflineMode,
  };
});

ipcMain.handle('get-screen-size', () => {
  const allDisplays = screen.getAllDisplays();
  const combinedBounds = getCombinedDisplayBounds(allDisplays);
  return { 
    width: combinedBounds.width, 
    height: combinedBounds.height,
    x: combinedBounds.x,
    y: combinedBounds.y,
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
ipcMain.on('sync-model-mode', (_event: IpcMainEvent, mode: 'single' | 'multi') => {
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

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(() => {
  // Register protocol for loading local assets
  protocol.registerFileProtocol('asset', (request, callback) => {
    const url = request.url.replace('asset://', '');
    const filePath = path.join(__dirname, '../../assets', url);
    callback({ path: filePath });
  });

  // Check if we should skip setup (e.g., --skip-setup flag or env var)
  const skipSetup = process.argv.includes('--skip-setup') || process.env['DORAEMON_SKIP_SETUP'] === '1';
  
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
    mainWindow?.webContents.send('screen-change', combinedBounds);
  });

  screen.on('display-added', () => {
    const allDisplays = screen.getAllDisplays();
    const combinedBounds = getCombinedDisplayBounds(allDisplays);
    mainWindow?.setBounds(combinedBounds);
    mainWindow?.webContents.send('screen-change', combinedBounds);
  });

  screen.on('display-removed', () => {
    const allDisplays = screen.getAllDisplays();
    const combinedBounds = getCombinedDisplayBounds(allDisplays);
    mainWindow?.setBounds(combinedBounds);
    mainWindow?.webContents.send('screen-change', combinedBounds);
  });
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
