import { BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  detectAll,
  getCurrentProvider,
  switchProvider,
  notifyPickerSelection,
  notifyPickerCancelled,
} from './llm-provider/index.js';
import type { ProviderName, ProviderStatus } from './llm-provider/types.js';
import type { IpcResult } from './llm-provider/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pickerWindow: BrowserWindow | null = null;
let trayMenuRefresh: (() => void) | null = null;

export function setProviderTrayRefresher(fn: () => void): void {
  trayMenuRefresh = fn;
}

function notifyMenuRefresh(): void {
  if (trayMenuRefresh) {
    try {
      trayMenuRefresh();
    } catch (err) {
      console.error('[LLMProviderIPC] tray refresh failed:', err);
    }
  }
}

function getPreloadPath(): string {
  const candidates = [
    path.join(__dirname, '../preload/index.cjs'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1] ?? candidates[0]!;
}

export function openPickerWindow(): void {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.focus();
    return;
  }

  pickerWindow = new BrowserWindow({
    width: 720,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Choose your LLM',
    backgroundColor: '#0b1220',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env['NODE_ENV'] === 'development') {
    pickerWindow.loadURL('http://localhost:5173/#/llm-picker');
  } else {
    pickerWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/llm-picker',
    });
  }

  pickerWindow.on('closed', () => {
    pickerWindow = null;
  });
}

export function closePickerWindow(): void {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.close();
  }
  pickerWindow = null;
}

export function registerLLMProviderIpc(): void {
  ipcMain.handle('llm:detect-providers', async (): Promise<ProviderStatus[]> => {
    return detectAll();
  });

  ipcMain.handle('llm:get-current-provider', async (): Promise<ProviderName | null> => {
    return getCurrentProvider();
  });

  ipcMain.handle(
    'llm:set-current-provider',
    async (_event, provider: ProviderName): Promise<IpcResult<{ warnings?: string[] }>> => {
      try {
        const result = await switchProvider(provider);
        notifyPickerSelection(provider);
        notifyMenuRefresh();
        const out: IpcResult<{ warnings?: string[] }> = { ok: true };
        if (result.warnings) (out as { warnings?: string[] }).warnings = result.warnings;
        return out;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        console.error('[LLMProviderIPC] switch failed:', message);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle('llm:open-picker', async (): Promise<IpcResult> => {
    try {
      openPickerWindow();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  });

  ipcMain.handle('llm:close-picker', async (): Promise<IpcResult> => {
    closePickerWindow();
    return { ok: true };
  });

  ipcMain.handle('llm:cancel-picker', async (): Promise<IpcResult> => {
    notifyPickerCancelled();
    return { ok: true };
  });

  ipcMain.handle('llm:get-provider-display-name', async (): Promise<string> => {
    const current = await getCurrentProvider();
    if (!current) return 'Not set';
    const map: Record<ProviderName, string> = {
      kiro: 'Kiro IDE',
      anthropic: 'Anthropic API',
      cloudflare: 'Cloudflare proxy',
      offline: 'Offline',
    };
    return map[current];
  });
}

export async function getCurrentProviderDisplayName(): Promise<string> {
  const current = await getCurrentProvider();
  if (!current) return 'Not set';
  const map: Record<ProviderName, string> = {
    kiro: 'Kiro IDE',
    anthropic: 'Anthropic API',
    cloudflare: 'Cloudflare proxy',
    offline: 'Offline',
  };
  return map[current];
}
