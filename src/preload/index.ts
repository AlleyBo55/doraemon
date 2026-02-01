import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Main Doraemon API (for mascot window)
contextBridge.exposeInMainWorld('doraemon', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  setPosition: (x: number, y: number) => {
    ipcRenderer.send('set-position', { x, y });
  },
  setMouseEvents: (enabled: boolean) => {
    ipcRenderer.send('set-mouse-events', enabled);
  },
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', callback);
  },
  onScreenChange: (callback: (size: { width: number; height: number }) => void) => {
    ipcRenderer.on('screen-change', (_event: IpcRendererEvent, size: { width: number; height: number }) => callback(size));
  },
});

// Setup API (for setup window)
contextBridge.exposeInMainWorld('setupAPI', {
  // System checks
  checkNode: () => ipcRenderer.invoke('setup:check-node'),
  checkOpenClaw: () => ipcRenderer.invoke('setup:check-openclaw'),
  checkPort: () => ipcRenderer.invoke('setup:check-port', 18789),
  
  // Actions
  killPort: () => ipcRenderer.invoke('setup:kill-port'),
  installOpenClaw: () => ipcRenderer.invoke('setup:install-openclaw'),
  startDaemon: () => ipcRenderer.invoke('setup:start-daemon', 18789),
  getInstallInstructions: () => ipcRenderer.invoke('setup:get-instructions'),
  
  // Setup complete - launch main window
  setupComplete: () => ipcRenderer.send('setup:launch-doraemon'),
  
  // Progress callback
  onProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('setup:progress', (_event: IpcRendererEvent, message: string) => callback(message));
  },
  
  // Window actions
  continueOffline: () => ipcRenderer.send('setup:continue-offline'),
  closeWindow: () => ipcRenderer.send('setup:close-window'),
  minimizeWindow: () => ipcRenderer.send('setup:minimize-window'),
  resizeWindow: (height: number) => ipcRenderer.send('setup:resize-window', { height }),
});
