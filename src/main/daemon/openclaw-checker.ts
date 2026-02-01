import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { OpenClawCheckResult } from './types';

const execAsync = promisify(exec);

export async function checkOpenClawInstalled(): Promise<OpenClawCheckResult> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout: pathOutput } = await execAsync(`${whichCmd} openclaw`);
    const openclawPath = pathOutput.trim().split('\n')[0];

    const { stdout: versionOutput } = await execAsync('openclaw --version');
    const version = versionOutput.trim();

    return {
      installed: true,
      version,
      path: openclawPath,
    };
  } catch {
    try {
      const { stdout } = await execAsync('npx openclaw --version', { timeout: 10000 });
      return {
        installed: true,
        version: stdout.trim(),
        path: 'npx',
      };
    } catch {
      return {
        installed: false,
        version: null,
        path: null,
        error: 'OpenClaw not found',
      };
    }
  }
}
