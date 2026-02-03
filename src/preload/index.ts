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
  onEditorActivity: (callback: (data: { editor: string; action: string; file?: string; language?: string; fileType?: string; thought: string; emotion: string; animation: string }) => void) => {
    ipcRenderer.on('editor-activity', (_event: IpcRendererEvent, data: { editor: string; action: string; file?: string; language?: string; fileType?: string; thought: string; emotion: string; animation: string }) => callback(data));
  },
  // Break reminders
  onBreakReminder: (callback: (data: { minutes: number; message: string }) => void) => {
    ipcRenderer.on('break-reminder', (_event: IpcRendererEvent, data: { minutes: number; message: string }) => callback(data));
  },
  // Coding streak notifications
  onCodingStreak: (callback: (data: { minutes: number; message: string }) => void) => {
    ipcRenderer.on('coding-streak', (_event: IpcRendererEvent, data: { minutes: number; message: string }) => callback(data));
  },
  // Daily summary heartbeat (every 3 hours)
  onDailySummary: (callback: (data: { message: string; duration: number; priority: boolean }) => void) => {
    ipcRenderer.on('daily-summary', (_event: IpcRendererEvent, data: { message: string; duration: number; priority: boolean }) => callback(data));
  },
  // Get coding stats
  getCodingStats: () => ipcRenderer.invoke('get-coding-stats'),
  // Get daily summary
  getDailySummary: () => ipcRenderer.invoke('get-daily-summary'),
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
  onStopCodingMode: (callback: () => void) => {
    ipcRenderer.on('stop-coding-mode', () => callback());
  },
  // Web notifications from browser extension
  onWebNotification: (callback: (data: { source: string; title: string; body: string; url?: string }) => void) => {
    console.log('[Preload] Registering web-notification listener');
    ipcRenderer.on('web-notification', (_event: IpcRendererEvent, data: { source: string; title: string; body: string; url?: string }) => {
      console.log('[Preload] Received web-notification:', data);
      callback(data);
    });
  },
  
  // Experience System events (consciousness/emotion bridge)
  onExperienceEmotion: (callback: (data: { emotion: string; intensity: number; valence: number; arousal: number; trigger: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { emotion: string; intensity: number; valence: number; arousal: number; trigger: string }) => callback(data);
    ipcRenderer.on('experience-emotion', handler);
    return () => ipcRenderer.removeListener('experience-emotion', handler);
  },
  onExperienceThought: (callback: (data: { thought: string; duration: number; priority: boolean; source: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { thought: string; duration: number; priority: boolean; source: string }) => callback(data);
    ipcRenderer.on('experience-thought', handler);
    return () => ipcRenderer.removeListener('experience-thought', handler);
  },
  onConsciousnessUpdate: (callback: (data: { selfState: string; goals: string[]; recentEvents: string[]; timeAwareness: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { selfState: string; goals: string[]; recentEvents: string[]; timeAwareness: string }) => callback(data);
    ipcRenderer.on('consciousness-update', handler);
    return () => ipcRenderer.removeListener('consciousness-update', handler);
  },
  onLivingPostGenerated: (callback: (data: { id: string; content: string; emotion: string; category: string; timestamp: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { id: string; content: string; emotion: string; category: string; timestamp: string }) => callback(data);
    ipcRenderer.on('living-post-generated', handler);
    return () => ipcRenderer.removeListener('living-post-generated', handler);
  },
  onExperienceHeartbeat: (callback: (data: { isRunning: boolean; postsGenerated: number; lastPostTime: string | null }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { isRunning: boolean; postsGenerated: number; lastPostTime: string | null }) => callback(data);
    ipcRenderer.on('experience-heartbeat', handler);
    return () => ipcRenderer.removeListener('experience-heartbeat', handler);
  },
});

// Setup API (for setup window)
contextBridge.exposeInMainWorld('setupAPI', {
  // System checks
  checkNode: () => ipcRenderer.invoke('setup:check-node'),
  checkOpenClaw: () => ipcRenderer.invoke('setup:check-openclaw'),
  checkPort: () => ipcRenderer.invoke('setup:check-port', 18789),
  
  // Permissions
  checkFullDiskAccess: () => ipcRenderer.invoke('check-full-disk-access'),
  requestFullDiskAccess: () => ipcRenderer.invoke('request-full-disk-access'),
  
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
