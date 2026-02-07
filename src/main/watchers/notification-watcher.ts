/**
 * Notification Watcher — Cross-Platform Dispatcher
 *
 * Picks the right notification strategy per platform:
 * 1. Browser extension (always available, default) — via web-notification-server.ts
 * 2. Linux: D-Bus listener (zero permissions)
 * 3. Windows: UserNotificationListener (mild "Notification access" toggle)
 * 4. macOS: SQLite DB polling (opt-in, requires Full Disk Access)
 *
 * The browser extension path is handled separately in main/index.ts.
 * This module handles native OS notification listening.
 */

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

type ActiveStrategy = 'dbus' | 'windows' | 'macos-fda' | 'none';

let activeStrategy: ActiveStrategy = 'none';
let callback: NotificationCallback | null = null;

// macOS-specific state
let macPollInterval: ReturnType<typeof setInterval> | null = null;
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

// ============================================
// macOS Full Disk Access helpers (kept for opt-in)
// ============================================

export async function checkFullDiskAccess(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
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

// macOS epoch starts Jan 1, 2001
const MACOS_EPOCH_OFFSET = 978307200;

async function getMacNotifications(): Promise<NotificationInfo[]> {
  const notifications: NotificationInfo[] = [];

  try {
    const nowMacOS = (Date.now() / 1000) - MACOS_EPOCH_OFFSET;
    const tenSecondsAgoMacOS = nowMacOS - 10;

    const query = `
      SELECT r.rec_id, a.identifier, r.delivered_date
      FROM record r
      JOIN app a ON r.app_id = a.app_id
      WHERE r.delivered_date > ${tenSecondsAgoMacOS}
      ORDER BY r.delivered_date DESC
      LIMIT 10
    `.replace(/\n/g, ' ');

    const { stdout } = await execAsync(
      `sqlite3 -json "${NOTIFICATION_DB_PATH}" "${query}"`,
      { timeout: 5000 }
    );

    if (stdout.trim() && stdout.trim() !== '[]') {
      const rows = JSON.parse(stdout);
      for (const row of rows) {
        const bundleId = row.identifier?.toLowerCase() || '';
        const appName = APP_NAMES[bundleId] || APP_NAMES[row.identifier] || row.identifier;
        const timestamp = (row.delivered_date + MACOS_EPOCH_OFFSET) * 1000;

        notifications.push({
          app: appName,
          title: appName,
          message: 'New notification',
          timestamp,
        });
      }
    }
  } catch (err: any) {
    if (err.code !== 'SQLITE_BUSY') {
      console.log('[NotificationWatcher:macOS] Query error:', err.message);
    }
  }

  return notifications;
}

async function pollMacNotifications(): Promise<void> {
  if (!callback) return;

  const notifications = await getMacNotifications();
  for (const notif of notifications) {
    if (notif.timestamp > lastNotificationTime) {
      console.log('[NotificationWatcher:macOS] New:', notif.app);
      callback(notif);
      lastNotificationTime = notif.timestamp;
    }
  }
}

function startMacOSStrategy(onNotification: NotificationCallback): void {
  callback = onNotification;
  lastNotificationTime = Date.now();
  macPollInterval = setInterval(pollMacNotifications, 5000);
  pollMacNotifications();
  activeStrategy = 'macos-fda';
  console.log('[NotificationWatcher] macOS FDA strategy active');
}

// ============================================
// Dispatcher — picks the right strategy
// ============================================

export async function startNotificationWatcher(
  _mainWindow: BrowserWindow,
  onNotification: NotificationCallback
): Promise<void> {
  callback = onNotification;
  const platform = process.platform;

  console.log('[NotificationWatcher] Starting for platform:', platform);

  if (platform === 'linux') {
    try {
      const { isDBusAvailable, startDBusListener } = await import('./dbus-notification-listener.js');
      const available = await isDBusAvailable();
      if (available) {
        const started = startDBusListener(onNotification);
        if (started) {
          activeStrategy = 'dbus';
          console.log('[NotificationWatcher] D-Bus listener active (zero permissions)');
          return;
        }
      }
      console.log('[NotificationWatcher] D-Bus not available, falling back to browser extension only');
    } catch (err) {
      console.error('[NotificationWatcher] Failed to load D-Bus listener:', err);
    }
    activeStrategy = 'none';
    return;
  }

  if (platform === 'win32') {
    try {
      const { checkNotificationAccess, startWindowsListener } = await import('./windows-notification-listener.js');
      const hasAccess = await checkNotificationAccess();
      if (hasAccess) {
        const started = startWindowsListener(onNotification);
        if (started) {
          activeStrategy = 'windows';
          console.log('[NotificationWatcher] Windows listener active');
          return;
        }
      }
      console.log('[NotificationWatcher] Windows notification access not granted, browser extension only');
    } catch (err) {
      console.error('[NotificationWatcher] Failed to load Windows listener:', err);
    }
    activeStrategy = 'none';
    return;
  }

  if (platform === 'darwin') {
    const hasAccess = await checkFullDiskAccess();
    if (hasAccess) {
      startMacOSStrategy(onNotification);
      return;
    }
    console.log('[NotificationWatcher] macOS FDA not granted — browser extension only');
    console.log('[NotificationWatcher] Enable in Settings → Advanced → Full Disk Access for native notifications');
    activeStrategy = 'none';
    return;
  }

  console.log('[NotificationWatcher] Unsupported platform:', platform);
  activeStrategy = 'none';
}

export function stopNotificationWatcher(): void {
  console.log('[NotificationWatcher] Stopping strategy:', activeStrategy);

  if (activeStrategy === 'dbus') {
    import('./dbus-notification-listener.js')
      .then(m => m.stopDBusListener())
      .catch(() => {});
  }

  if (activeStrategy === 'windows') {
    import('./windows-notification-listener.js')
      .then(m => m.stopWindowsListener())
      .catch(() => {});
  }

  if (activeStrategy === 'macos-fda') {
    if (macPollInterval) {
      clearInterval(macPollInterval);
      macPollInterval = null;
    }
  }

  callback = null;
  activeStrategy = 'none';
}

export function getActiveStrategy(): ActiveStrategy {
  return activeStrategy;
}
