import { exec } from 'child_process';
import { promisify } from 'util';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
let lastNotificationTime = Date.now();

const APP_NAMES: Record<string, string> = {
  'com.apple.MobileSMS': '💬 Messages',
  'com.apple.mail': '📧 Mail',
  'net.whatsapp.WhatsApp': '💬 WhatsApp',
  'com.microsoft.teams': '💬 Teams',
  'com.microsoft.Outlook': '📧 Outlook',
  'com.google.Chrome': '🌐 Chrome',
  'com.apple.Safari': '🌐 Safari',
  'org.mozilla.firefox': '🦊 Firefox',
  'com.tinyspeck.slackmacgap': '💼 Slack',
  'com.hnc.Discord': '🎮 Discord',
  'com.telegram.desktop': '✈️ Telegram',
  'com.spotify.client': '🎵 Spotify',
};

const NOTIFICATION_DB_PATH = path.join(
  os.homedir(),
  'Library/Group Containers/group.com.apple.usernoted/db2/db'
);

async function checkFullDiskAccess(): Promise<boolean> {
  try {
    await fs.promises.access(NOTIFICATION_DB_PATH, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function getRecentNotifications(): Promise<NotificationInfo[]> {
  const notifications: NotificationInfo[] = [];
  
  try {
    // Use sqlite3 to query the notification database
    const query = `
      SELECT 
        app_id,
        title,
        body,
        delivered_date
      FROM record
      WHERE delivered_date > ${(lastNotificationTime - Date.now()) / 1000}
      ORDER BY delivered_date DESC
      LIMIT 10
    `;
    
    const { stdout } = await execAsync(
      `sqlite3 -json "${NOTIFICATION_DB_PATH}" "${query}"`,
      { timeout: 5000 }
    );
    
    if (stdout.trim()) {
      const rows = JSON.parse(stdout);
      for (const row of rows) {
        const appName = APP_NAMES[row.app_id] || row.app_id;
        notifications.push({
          app: appName,
          title: row.title || appName,
          message: row.body || '',
          timestamp: row.delivered_date * 1000 + Date.now(),
        });
      }
    }
  } catch (err) {
    // Database might be locked or inaccessible
  }
  
  return notifications;
}

async function pollNotifications() {
  if (!callback) return;
  
  const notifications = await getRecentNotifications();
  
  for (const notif of notifications) {
    if (notif.timestamp > lastNotificationTime) {
      callback(notif);
      lastNotificationTime = notif.timestamp;
    }
  }
}

export async function startNotificationWatcher(
  _mainWindow: BrowserWindow,
  onNotification: NotificationCallback
) {
  callback = onNotification;
  
  const hasAccess = await checkFullDiskAccess();
  
  if (!hasAccess) {
    console.log('[NotificationWatcher] Limited functionality - Full Disk Access not granted');
    console.log('[NotificationWatcher] To enable native notifications:');
    console.log('  1. Open System Preferences → Privacy & Security → Full Disk Access');
    console.log('  2. Add and enable Doraemon (or your terminal/IDE if running in dev)');
    console.log('[NotificationWatcher] Web notifications via browser extension still work');
    return;
  }
  
  console.log('[NotificationWatcher] Full Disk Access granted - watching native notifications');
  
  // Poll every 5 seconds
  pollInterval = setInterval(pollNotifications, 5000);
  
  // Initial poll
  pollNotifications();
}

export function stopNotificationWatcher() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  callback = null;
}
