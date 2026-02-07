/**
 * Windows Notification Listener
 *
 * Uses PowerShell to poll the Windows Action Center via WinRT APIs.
 * Requires "Notification access" toggle in Settings (mild permission).
 * Falls back gracefully if not available.
 */

import { exec, ChildProcess, spawn } from 'child_process';
import { promisify } from 'util';
import type { NotificationInfo } from './notification-watcher.js';

const execAsync = promisify(exec);

type NotificationCallback = (notification: NotificationInfo) => void;

let pollInterval: ReturnType<typeof setInterval> | null = null;
let callback: NotificationCallback | null = null;
let lastPollTime = Date.now();

const PS_POLL_SCRIPT = `
[Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications.Management, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus, Windows.UI.Notifications.Management, ContentType = WindowsRuntime] | Out-Null

$listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
$notifications = $listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast).GetAwaiter().GetResult()

$cutoff = [DateTimeOffset]::Now.AddSeconds(-10)
$results = @()

foreach ($n in $notifications) {
  if ($n.CreationTime -gt $cutoff) {
    $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
    $texts = $binding.GetTextElements()
    $title = if ($texts.Count -gt 0) { $texts[0].Text } else { "" }
    $body = if ($texts.Count -gt 1) { $texts[1].Text } else { "" }
    $results += @{
      AppId = $n.AppInfo.DisplayInfo.DisplayName
      Title = $title
      Body = $body
      Time = $n.CreationTime.ToUnixTimeMilliseconds()
    }
  }
}

$results | ConvertTo-Json -Compress
`;

async function pollNotifications(): Promise<void> {
  if (!callback) return;

  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${PS_POLL_SCRIPT.replace(/"/g, '\\"')}"`,
      { timeout: 8000 }
    );

    if (!stdout.trim() || stdout.trim() === 'null') return;

    const results = JSON.parse(stdout.trim());
    const notifications = Array.isArray(results) ? results : [results];

    for (const n of notifications) {
      const timestamp = typeof n.Time === 'number' ? n.Time : Date.now();
      if (timestamp <= lastPollTime) continue;

      const notification: NotificationInfo = {
        app: n.AppId || 'Unknown',
        title: n.Title || n.AppId || 'Notification',
        message: n.Body || 'New notification',
        timestamp,
      };

      console.log('[WindowsListener] Notification:', notification.app, notification.title);
      callback(notification);
      lastPollTime = timestamp;
    }
  } catch (err: any) {
    if (!err.message?.includes('Access is denied')) {
      console.log('[WindowsListener] Poll error:', err.message?.substring(0, 100));
    }
  }
}

export async function checkNotificationAccess(): Promise<boolean> {
  if (process.platform !== 'win32') return false;

  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "` +
      `[Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications.Management, ContentType = WindowsRuntime] | Out-Null; ` +
      `$l = [Windows.UI.Notifications.Management.UserNotificationListener]::Current; ` +
      `$s = $l.RequestAccessAsync().GetAwaiter().GetResult(); ` +
      `$s.ToString()"`,
      { timeout: 10000 }
    );
    return stdout.trim() === 'Allowed';
  } catch {
    return false;
  }
}

export function startWindowsListener(onNotification: NotificationCallback): boolean {
  if (process.platform !== 'win32') return false;

  callback = onNotification;
  lastPollTime = Date.now();

  pollInterval = setInterval(pollNotifications, 5000);
  pollNotifications();

  console.log('[WindowsListener] Started polling Windows notifications');
  return true;
}

export function stopWindowsListener(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  callback = null;
  console.log('[WindowsListener] Stopped');
}
