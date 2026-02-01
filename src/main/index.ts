import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, IpcMainEvent, protocol } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

// Load .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.join(__dirname, '../../.env') });

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
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
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local files
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

app.whenReady().then(() => {
  // Register protocol for loading local assets
  protocol.registerFileProtocol('asset', (request, callback) => {
    const url = request.url.replace('asset://', '');
    const filePath = path.join(__dirname, '../../assets', url);
    callback({ path: filePath });
  });

  createWindow();
  createTray();

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
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-config', () => {
  const assetsPath = path.join(__dirname, '../../assets/dora-sprites');
  
  return {
    openclawUrl: process.env['OPENCLAW_URL'] || 'ws://127.0.0.1:18789',
    spritePath: assetsPath,
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
