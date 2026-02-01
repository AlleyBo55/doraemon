import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

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
