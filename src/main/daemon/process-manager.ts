import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { InstallResult, StartDaemonResult } from './types';
import { DEFAULT_PORT } from './types';
import { checkOpenClawInstalled } from './openclaw-checker';
import { checkPort } from './port-checker';

const execAsync = promisify(exec);

export async function killProcess(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /PID ${pid} /F`);
    } else {
      await execAsync(`kill -9 ${pid}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  } catch {
    return false;
  }
}

export async function installOpenClaw(
  onProgress?: (message: string) => void
): Promise<InstallResult> {
  onProgress?.('Starting OpenClaw installation...');

  return new Promise((resolve) => {
    const logs: string[] = [];

    const child = spawn('npm', ['install', '-g', 'openclaw@latest'], {
      shell: true,
      env: { ...process.env },
    });

    child.stdout?.on('data', (data) => {
      const msg = data.toString();
      logs.push(msg);
      onProgress?.(msg.trim());
    });

    child.stderr?.on('data', (data) => {
      const msg = data.toString();
      logs.push(msg);
      if (msg.includes('sharp')) onProgress?.('⚠️ Sharp module issue detected...');
      else if (msg.includes('node-gyp')) onProgress?.('⚠️ Build tools issue detected...');
      else if (msg.includes('EACCES') || msg.includes('permission')) onProgress?.('⚠️ Permission issue detected...');
    });

    child.on('close', (code) => {
      const fullLogs = logs.join('\n');
      if (code === 0) {
        resolve({ success: true, logs: fullLogs });
        return;
      }

      let errorType: InstallResult['errorType'] = 'unknown';
      let suggestion = '';

      if (fullLogs.includes('sharp')) {
        errorType = 'sharp';
        suggestion = 'Sharp requires Node.js 22 LTS. Try: nvm install 22 && nvm use 22';
      } else if (fullLogs.includes('node-gyp') || fullLogs.includes('build tools')) {
        errorType = 'node-gyp';
        suggestion = process.platform === 'darwin'
          ? 'Install Xcode Command Line Tools: xcode-select --install'
          : process.platform === 'win32'
          ? 'Install Windows Build Tools: npm install -g windows-build-tools'
          : 'Install build-essential: sudo apt-get install build-essential';
      } else if (fullLogs.includes('EACCES') || fullLogs.includes('permission')) {
        errorType = 'permission';
        suggestion = 'Try running with sudo, or fix npm permissions';
      } else if (fullLogs.includes('ETIMEDOUT') || fullLogs.includes('ENOTFOUND')) {
        errorType = 'network';
        suggestion = 'Check your internet connection and try again';
      }

      resolve({ success: false, error: `Installation failed with exit code ${code}`, errorType, suggestion, logs: fullLogs });
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message, errorType: 'unknown', logs: logs.join('\n') });
    });
  });
}

export async function startDaemon(
  port: number = DEFAULT_PORT,
  onProgress?: (message: string) => void
): Promise<StartDaemonResult> {
  onProgress?.('Checking OpenClaw Gateway...');

  try {
    const openclawCheck = await checkOpenClawInstalled();
    if (!openclawCheck.installed) {
      return { success: false, error: 'OpenClaw is not installed' };
    }

    const portCheck = await checkPort(port);
    
    if (portCheck.inUse && portCheck.isOpenClaw) {
      onProgress?.('Gateway already running!');
      return { success: true, pid: portCheck.pid ?? undefined };
    }

    onProgress?.('Starting OpenClaw Gateway...');
    const child = spawn('openclaw', ['gateway', '--port', String(port)], {
      shell: true,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();

    onProgress?.('Waiting for Gateway to be ready...');

    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const check = await checkPort(port);
      if (check.inUse && check.isOpenClaw) {
        onProgress?.('Gateway is ready!');
        return { success: true, pid: check.pid ?? undefined };
      }
    }

    return { success: false, error: 'Gateway did not start within 10 seconds' };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
