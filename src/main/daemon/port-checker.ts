import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import http from 'node:http';
import type { PortCheckResult } from './types';
import { DEFAULT_PORT } from './types';

const execAsync = promisify(exec);

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

function checkIfOpenClawGateway(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 2000);

    try {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        clearTimeout(timeout);
        resolve(res.statusCode === 200 || res.statusCode === 426);
      });

      req.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        clearTimeout(timeout);
        resolve(false);
      });
    } catch {
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

async function getProcessInfo(port: number): Promise<{ pid: number | null; processName: string | null }> {
  let pid: number | null = null;
  let processName: string | null = null;

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const { stdout } = await execAsync(`lsof -i :${port} -t 2>/dev/null || true`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    if (pids.length > 0) {
      pid = parseInt(pids[0], 10);
      try {
        const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o comm= 2>/dev/null || true`);
        processName = psOutput.trim();
      } catch (err) {
        console.error('[PortChecker] Failed to get process name:', err);
      }
    }
  } else if (process.platform === 'win32') {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[1].includes(`:${port}`)) {
        pid = parseInt(parts[4], 10);
        break;
      }
    }
    if (pid) {
      try {
        const { stdout: taskOutput } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
        const match = taskOutput.match(/"([^"]+)"/);
        if (match) processName = match[1];
      } catch (err) {
        console.error('[PortChecker] Failed to get Windows process name:', err);
      }
    }
  }

  return { pid, processName };
}

export async function checkPort(port: number = DEFAULT_PORT): Promise<PortCheckResult> {
  const inUse = await isPortInUse(port);

  if (!inUse) {
    return { inUse: false, pid: null, processName: null, isOpenClaw: false };
  }

  try {
    const { pid, processName } = await getProcessInfo(port);
    const isOpenClaw = await checkIfOpenClawGateway(port);

    return { inUse: true, pid, processName, isOpenClaw };
  } catch (e) {
    return { inUse: true, pid: null, processName: null, isOpenClaw: false, error: String(e) };
  }
}
