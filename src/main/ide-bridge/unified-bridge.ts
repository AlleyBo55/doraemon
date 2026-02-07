import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sendToKiro, initKiroBridge } from './kiro-bridge.js';

const execAsync = promisify(exec);

export type IDEType = 'kiro' | 'vscode' | 'cursor' | 'antigravity' | 'auto';

export type UnifiedBridgeConfig = {
  preferredIDE?: IDEType;
  workspacePath?: string;
  waitForResponse?: boolean;
  timeoutMs?: number;
};

export type IDEResponse = {
  success: boolean;
  result?: string;
  error?: string;
  ide?: string;
  requestId?: string;
};

const IDE_APPS: Record<Exclude<IDEType, 'auto'>, string> = {
  kiro: 'Kiro',
  vscode: 'Visual Studio Code',
  cursor: 'Cursor',
  antigravity: 'Antigravity',
};

const IDE_PRIORITY: Exclude<IDEType, 'auto'>[] = ['kiro', 'antigravity', 'cursor', 'vscode'];

async function isAppRunning(appName: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;

  try {
    const script = `
      tell application "System Events"
        set appList to name of every process whose background only is false
        return appList contains "${appName}"
      end tell
    `;
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function activateApp(appName: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;

  try {
    const script = `
      tell application "${appName}"
        activate
      end tell
      delay 0.5
    `;
    await execAsync(`osascript -e '${script}'`);
    return true;
  } catch {
    return false;
  }
}

async function typeTextViaAppleScript(text: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;

  try {
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');

    const script = `
      tell application "System Events"
        keystroke "${escapedText}"
      end tell
    `;
    await execAsync(`osascript -e '${script}'`);
    return true;
  } catch {
    return false;
  }
}

async function pressEnterViaAppleScript(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;

  try {
    const script = `
      tell application "System Events"
        key code 36
      end tell
    `;
    await execAsync(`osascript -e '${script}'`);
    return true;
  } catch {
    return false;
  }
}

async function sendKeystrokeViaAppleScript(keys: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;

  try {
    const keyParts = keys.split(' ');
    let modifiers = '';
    let key = '';

    for (const part of keyParts) {
      if (['command', 'shift', 'option', 'control'].includes(part)) {
        modifiers += `${part} down, `;
      } else {
        key = part;
      }
    }

    modifiers = modifiers.slice(0, -2);

    const script = `
      tell application "System Events"
        keystroke "${key}" using {${modifiers}}
      end tell
      delay 0.3
    `;
    await execAsync(`osascript -e '${script}'`);
    return true;
  } catch {
    return false;
  }
}

export async function detectRunningIDE(): Promise<Exclude<IDEType, 'auto'> | null> {
  for (const ide of IDE_PRIORITY) {
    if (await isAppRunning(IDE_APPS[ide])) {
      return ide;
    }
  }
  return null;
}

async function sendViaAppleScript(
  ide: Exclude<IDEType, 'auto'>,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const appName = IDE_APPS[ide];

  if (!(await isAppRunning(appName))) {
    return { success: false, error: `${appName} is not running` };
  }

  await activateApp(appName);

  if (ide === 'antigravity') {
    await sendKeystrokeViaAppleScript('command shift a');
  } else if (ide === 'cursor') {
    await sendKeystrokeViaAppleScript('command l');
  } else if (ide === 'vscode') {
    await sendKeystrokeViaAppleScript('command shift p');
    await new Promise(r => setTimeout(r, 200));
    await typeTextViaAppleScript('GitHub Copilot: Open Chat');
    await pressEnterViaAppleScript();
  }

  await new Promise(r => setTimeout(r, 500));

  await typeTextViaAppleScript(message);
  await new Promise(r => setTimeout(r, 100));
  await pressEnterViaAppleScript();

  return { success: true };
}

export async function sendToIDE(
  message: string,
  config: UnifiedBridgeConfig = {}
): Promise<{ success: boolean; result?: string; error?: string; ide?: string }> {
  let targetIDE = config.preferredIDE;

  if (!targetIDE || targetIDE === 'auto') {
    const detected = await detectRunningIDE();
    if (!detected) {
      return { success: false, error: 'No supported IDE is running' };
    }
    targetIDE = detected;
  }

  console.log(`[Unified Bridge] Sending to ${targetIDE}: ${message.slice(0, 50)}...`);

  if (targetIDE === 'kiro') {
    await initKiroBridge(config.workspacePath);
    const response = await sendToKiro(message, 'chat', undefined, config.workspacePath);
    return {
      success: response.success,
      result: response.result,
      error: response.error,
      ide: 'kiro',
    };
  }

  const result = await sendViaAppleScript(targetIDE, message);
  return {
    ...result,
    ide: targetIDE,
    result: result.success ? 'Message sent via keyboard simulation' : undefined,
  };
}

export async function askIDE(
  message: string,
  config: UnifiedBridgeConfig = {}
): Promise<string> {
  const result = await sendToIDE(message, config);
  if (result.success) {
    return result.result || `Message sent to ${result.ide}`;
  }
  return `Error: ${result.error}`;
}

export async function askIDEToFix(
  error: string,
  file?: string,
  config: UnifiedBridgeConfig = {}
): Promise<string> {
  const message = file
    ? `Fix this error in ${file}: ${error}`
    : `Fix this error: ${error}`;
  return askIDE(message, config);
}

export async function askIDEToExplain(
  code: string,
  config: UnifiedBridgeConfig = {}
): Promise<string> {
  return askIDE(`Explain this code:\n\n${code}`, config);
}

export async function askIDEToReview(
  file: string,
  config: UnifiedBridgeConfig = {}
): Promise<string> {
  return askIDE(`Review this file: ${file}`, config);
}

export { initKiroBridge };
