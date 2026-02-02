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

// Electron API (for renderer)
contextBridge.exposeInMainWorld('electronAPI', {
  setMouseEvents: (enabled: boolean) => {
    ipcRenderer.send('set-mouse-events', enabled);
  },
  focusWindow: () => {
    ipcRenderer.send('focus-window');
  },
  onResetPosition: (callback: (pos: { x: number; y: number }) => void) => {
    ipcRenderer.on('reset-position', (_event: IpcRendererEvent, pos: { x: number; y: number }) => callback(pos));
  },
  onNotification: (callback: (data: { app: string; title: string; message: string }) => void) => {
    ipcRenderer.on('notification', (_event: IpcRendererEvent, data: { app: string; title: string; message: string }) => callback(data));
  },
  onEditorActivity: (callback: (data: { editor: string; action: string; file?: string; language?: string; thought: string }) => void) => {
    ipcRenderer.on('editor-activity', (_event: IpcRendererEvent, data: { editor: string; action: string; file?: string; language?: string; thought: string }) => callback(data));
  },
  // Model mode sync
  syncModelMode: (mode: 'single' | 'multi') => {
    ipcRenderer.send('sync-model-mode', mode);
  },
  getModelMode: () => ipcRenderer.invoke('get-model-mode'),
  onModelModeChanged: (callback: (mode: 'single' | 'multi') => void) => {
    ipcRenderer.on('model-mode-changed', (_event: IpcRendererEvent, mode: 'single' | 'multi') => callback(mode));
  },
  // Tray menu actions
  onToggleChat: (callback: () => void) => {
    ipcRenderer.on('toggle-chat', () => callback());
  },
  onClearHistory: (callback: () => void) => {
    ipcRenderer.on('clear-history', () => callback());
  },
  onTriggerEmotion: (callback: (emotion: string) => void) => {
    ipcRenderer.on('trigger-emotion', (_event: IpcRendererEvent, emotion: string) => callback(emotion));
  },
  // Web notifications from browser extension
  onWebNotification: (callback: (data: { source: string; title: string; body: string; url?: string }) => void) => {
    console.log('[Preload] Registering web-notification listener');
    ipcRenderer.on('web-notification', (_event: IpcRendererEvent, data: { source: string; title: string; body: string; url?: string }) => {
      console.log('[Preload] Received web-notification:', data);
      callback(data);
    });
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
