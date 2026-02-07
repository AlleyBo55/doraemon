/**
 * D-Bus Notification Listener (Linux)
 *
 * Monitors org.freedesktop.Notifications via `dbus-monitor`.
 * Zero permissions needed — D-Bus session bus is user-accessible.
 * Catches all desktop notifications (Slack, Discord, Telegram, etc.)
 */

import { spawn, ChildProcess } from 'child_process';
import type { NotificationInfo } from './notification-watcher.js';

type NotificationCallback = (notification: NotificationInfo) => void;

let monitorProcess: ChildProcess | null = null;
let callback: NotificationCallback | null = null;

function parseNotifyMethod(output: string): NotificationInfo | null {
  try {
    const appNameMatch = output.match(/string "([^"]+)"\s+uint32/);
    const summaryMatch = output.match(/uint32 \d+\s+string "[^"]*"\s+string "[^"]*"\s+string "([^"]+)"/);
    const bodyMatch = output.match(/uint32 \d+\s+string "[^"]*"\s+string "[^"]*"\s+string "[^"]*"\s+string "([^"]*)"/);

    if (!appNameMatch) return null;

    const appName = appNameMatch[1];
    const title = summaryMatch?.[1] || appName;
    const message = bodyMatch?.[1] || 'New notification';

    return {
      app: appName,
      title,
      message,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

export function startDBusListener(onNotification: NotificationCallback): boolean {
  if (process.platform !== 'linux') return false;

  callback = onNotification;

  try {
    monitorProcess = spawn('dbus-monitor', [
      "--session",
      "interface='org.freedesktop.Notifications',member='Notify'",
    ]);

    let buffer = '';

    monitorProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();

      const methodCalls = buffer.split('method call');
      // Keep the last incomplete chunk in the buffer
      buffer = methodCalls.pop() || '';

      for (const chunk of methodCalls) {
        const notification = parseNotifyMethod(chunk);
        if (notification && callback) {
          console.log('[DBusListener] Notification:', notification.app, notification.title);
          callback(notification);
        }
      }
    });

    monitorProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[DBusListener] stderr:', data.toString().trim());
    });

    monitorProcess.on('error', (err) => {
      console.error('[DBusListener] Process error:', err.message);
      monitorProcess = null;
    });

    monitorProcess.on('close', (code) => {
      if (code !== null && code !== 0) {
        console.log('[DBusListener] Process exited with code:', code);
      }
      monitorProcess = null;
    });

    console.log('[DBusListener] Started monitoring D-Bus notifications');
    return true;
  } catch (err) {
    console.error('[DBusListener] Failed to start:', err);
    return false;
  }
}

export function stopDBusListener(): void {
  if (monitorProcess) {
    monitorProcess.kill();
    monitorProcess = null;
  }
  callback = null;
  console.log('[DBusListener] Stopped');
}

export async function isDBusAvailable(): Promise<boolean> {
  if (process.platform !== 'linux') return false;

  return new Promise((resolve) => {
    const test = spawn('dbus-monitor', ['--session', '--profile'], { timeout: 2000 });
    test.on('error', () => resolve(false));
    // If it starts without error, dbus-monitor is available
    setTimeout(() => {
      test.kill();
      resolve(true);
    }, 500);
  });
}
