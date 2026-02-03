import { exec } from 'child_process';
import { promisify } from 'util';
import { BrowserWindow, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

const FULL_DISK_ACCESS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

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
  'com.apple.mobilesms': '💬 Messages',
  'com.apple.mail': '📧 Mail',
  'net.whatsapp.whatsapp': '💬 WhatsApp',
  'com.microsoft.teams': '💬 Teams',
  'com.microsoft.outlook': '📧 Outlook',
  'com.google.chrome': '🌐 Chrome',
  'com.google.chrome.framework.alertnotificationservice': '🌐 Chrome',
  'com.apple.safari': '🌐 Safari',
  'org.mozilla.firefox': '🦊 Firefox',
  'com.tinyspeck.slackmacgap': '💼 Slack',
  'com.hnc.discord': '🎮 Discord',
  'com.telegram.desktop': '✈️ Telegram',
  'com.spotify.client': '🎵 Spotify',
  'com.apple.facetime': '📞 FaceTime',
  'com.apple.reminders': '📝 Reminders',
  'com.apple.notes': '📒 Notes',
  'com.apple.ical': '📅 Calendar',
};

const NOTIFICATION_DB_PATH = path.join(
  os.homedir(),
  'Library/Group Containers/group.com.apple.usernoted/db2/db'
);

export async function checkFullDiskAccess(): Promise<boolean> {
  try {
    await fs.promises.access(NOTIFICATION_DB_PATH, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function requestFullDiskAccess(): Promise<void> {
  await shell.openExternal(FULL_DISK_ACCESS_URL);
}

// macOS epoch starts Jan 1, 2001 (Unix epoch + 978307200 seconds)
const MACOS_EPOCH_OFFSET = 978307200;

async function getRecentNotifications(): Promise<NotificationInfo[]> {
  const notifications: NotificationInfo[] = [];
  
  try {
    // Convert current time to macOS epoch
    const nowMacOS = (Date.now() / 1000) - MACOS_EPOCH_OFFSET;
    const tenSecondsAgoMacOS = nowMacOS - 10;
    
    // Query recent notifications with app identifier
    const query = `
      SELECT r.rec_id, a.identifier, r.delivered_date 
      FROM record r 
      JOIN app a ON r.app_id = a.app_id 
      WHERE r.delivered_date > ${tenSecondsAgoMacOS}
      ORDER BY r.delivered_date DESC 
      LIMIT 10
    `.replace(/\n/g, ' ');
    
    const { stdout, stderr } = await execAsync(
      `sqlite3 -json "${NOTIFICATION_DB_PATH}" "${query}"`,
      { timeout: 5000 }
    );
    
    if (stderr) {
      console.log('[NotificationWatcher] SQLite error:', stderr);
    }
    
    if (stdout.trim() && stdout.trim() !== '[]') {
      try {
        const rows = JSON.parse(stdout);
        
        for (const row of rows) {
          const bundleId = row.identifier?.toLowerCase() || '';
          const appName = APP_NAMES[bundleId] || APP_NAMES[row.identifier] || row.identifier;
          
          // Convert macOS epoch to Unix timestamp
          const timestamp = (row.delivered_date + MACOS_EPOCH_OFFSET) * 1000;
          
          notifications.push({
            app: appName,
            title: appName,
            message: 'New notification',
            timestamp,
          });
        }
        
        if (rows.length > 0) {
          console.log('[NotificationWatcher] Found', rows.length, 'new notifications');
        }
      } catch (parseErr) {
        console.log('[NotificationWatcher] Parse error:', parseErr);
      }
    }
  } catch (err: any) {
    // Silently fail for db locked, etc
    if (err.code !== 'SQLITE_BUSY') {
      console.log('[NotificationWatcher] Query error:', err.message);
    }
  }
  
  return notifications;
}

async function pollNotifications() {
  if (!callback) return;
  
  const notifications = await getRecentNotifications();
  
  for (const notif of notifications) {
    if (notif.timestamp > lastNotificationTime) {
      console.log('[NotificationWatcher] New notification:', notif.app, notif.title);
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
