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

// Load .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.join(__dirname, '../../.env') });

let setupWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isOfflineMode = false;

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
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 320,
    height: 450,
    x: screenWidth - 350,
    y: screenHeight - 480,
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
}

function createTray() {
  // Try to load the Doraemon icon
  const iconPath = path.join(__dirname, '../../assets/dora-sprites/icon.png');
  let icon: Electron.NativeImage;
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    // Fallback: Create a simple blue circle
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
      label: 'Reset Position', 
      click: () => {
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        mainWindow?.setPosition(width - 350, height - 480);
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setToolTip('Doraemon');
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
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return { width, height };
});

ipcMain.on('set-position', (_event: IpcMainEvent, { x, y }: { x: number; y: number }) => {
  if (mainWindow) {
    mainWindow.setPosition(Math.round(x), Math.round(y), false);
  }
});

ipcMain.on('set-mouse-events', (_event: IpcMainEvent, enabled: boolean) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(!enabled, { forward: true });
  }
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
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow?.webContents.send('screen-change', { width, height });
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
