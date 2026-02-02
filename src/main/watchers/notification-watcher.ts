import { exec } from 'child_process';
import { promisify } from 'util';
import { BrowserWindow } from 'electron';

const execAsync = promisify(exec);

export type NotificationInfo = {
  app: string;
  title: string;
  message: string;
  timestamp: number;
};

type NotificationCallback = (notification: NotificationInfo) => void;

let pollInterval: ReturnType<typeof setInterval> | null = null;
let callback: NotificationCallback | null = null;

const APP_NAMES: Record<string, string> = {
  'com.apple.MobileSMS': 'Messages',
  'com.apple.mail': 'Mail',
  'net.whatsapp.WhatsApp': 'WhatsApp',
  'com.microsoft.teams': 'Teams',
  'com.microsoft.Outlook': 'Outlook',
  'com.google.Chrome': 'Chrome',
  'com.apple.Safari': 'Safari',
  'org.mozilla.firefox': 'Firefox',
  'com.tinyspeck.slackmacgap': 'Slack',
  'com.hnc.Discord': 'Discord',
  'com.telegram.desktop': 'Telegram',
};

async function getActiveApp(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`
      osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'
    `);
    return stdout.trim();
  } catch {
    return null;
  }
}

export function startNotificationWatcher(
  _mainWindow: BrowserWindow,
  onNotification: NotificationCallback
) {
  callback = onNotification;
  
  // Note: macOS doesn't provide easy access to notification center
  // This is a placeholder - real implementation would need:
  // 1. Full Disk Access permission to read notification database
  // 2. Or use a native module to hook into notification center
  // For now, we'll just log that the watcher is started
  console.log('Notification watcher started (limited functionality on macOS)');
}

export function stopNotificationWatcher() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  callback = null;
}
