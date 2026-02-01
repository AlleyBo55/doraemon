import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { NodeCheckResult } from './types';
import { REQUIRED_NODE_VERSION } from './types';

const execAsync = promisify(exec);

export async function checkNode(): Promise<NodeCheckResult> {
  try {
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim().replace('v', '');
    const majorVersion = parseInt(version.split('.')[0], 10);

    return {
      installed: true,
      version,
      majorVersion,
      meetsRequirement: majorVersion >= REQUIRED_NODE_VERSION,
    };
  } catch {
    return {
      installed: false,
      version: null,
      majorVersion: null,
      meetsRequirement: false,
      error: 'Node.js not found in PATH',
    };
  }
}
