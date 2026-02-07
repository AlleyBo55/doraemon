import fs from 'node:fs/promises';
import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';

export type DoraemonRequest = {
  id: string;
  type: 'chat' | 'command' | 'file-edit';
  message?: string;
  command?: string;
  file?: string;
  content?: string;
  timestamp: number;
};

export type DoraemonResponse = {
  id: string;
  success: boolean;
  result?: string;
  error?: string;
  timestamp: number;
};

const DORAEMON_DIR = '.doraemon';
const REQUEST_FILE = 'request.json';
const RESPONSE_FILE = 'response.json';

export async function ensureDoraemonDir(workspacePath: string): Promise<string> {
  const doraemonPath = path.join(workspacePath, DORAEMON_DIR);
  try {
    await fs.mkdir(doraemonPath, { recursive: true });
  } catch (err) {
    console.error('[FileProtocol] Failed to create .doraemon dir:', err);
  }
  return doraemonPath;
}

export async function sendRequest(
  workspacePath: string,
  request: Omit<DoraemonRequest, 'id' | 'timestamp'>
): Promise<string> {
  const doraemonPath = await ensureDoraemonDir(workspacePath);
  const requestPath = path.join(doraemonPath, REQUEST_FILE);
  
  const fullRequest: DoraemonRequest = {
    ...request,
    id: `dora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  
  await fs.writeFile(requestPath, JSON.stringify(fullRequest, null, 2));
  console.log(`[Doraemon] Request sent: ${fullRequest.id}`);
  
  return fullRequest.id;
}

export async function waitForResponse(
  workspacePath: string,
  requestId: string,
  timeoutMs = 60000
): Promise<DoraemonResponse | null> {
  const doraemonPath = await ensureDoraemonDir(workspacePath);
  const responsePath = path.join(doraemonPath, RESPONSE_FILE);

  return new Promise<DoraemonResponse | null>((resolve) => {
    let watcher: FSWatcher | null = null;
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      watcher?.close();
      clearTimeout(timer);
    };

    const tryRead = async () => {
      try {
        const content = await fs.readFile(responsePath, 'utf-8');
        const response = JSON.parse(content) as DoraemonResponse;
        if (response.id === requestId) {
          cleanup();
          await fs.unlink(responsePath).catch(() => {});
          resolve(response);
          return true;
        }
      } catch {
        // File doesn't exist yet or parse error — expected
      }
      return false;
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    // Check if response already exists
    tryRead().then((found) => {
      if (found || settled) return;

      watcher = watch(doraemonPath, async (_eventType, filename) => {
        if (filename !== RESPONSE_FILE || settled) return;
        await tryRead();
      });

      watcher.on('error', (err) => {
        console.error('[FileProtocol] Watcher error:', err);
        cleanup();
        resolve(null);
      });
    });
  });
}

export async function sendChatMessage(
  workspacePath: string,
  message: string
): Promise<DoraemonResponse | null> {
  const requestId = await sendRequest(workspacePath, {
    type: 'chat',
    message,
  });
  
  return waitForResponse(workspacePath, requestId);
}

export async function executeCommand(
  workspacePath: string,
  command: string
): Promise<DoraemonResponse | null> {
  const requestId = await sendRequest(workspacePath, {
    type: 'command',
    command,
  });
  
  return waitForResponse(workspacePath, requestId);
}

export function watchForRequests(
  workspacePath: string,
  onRequest: (request: DoraemonRequest) => Promise<DoraemonResponse>
): () => void {
  const doraemonPath = path.join(workspacePath, DORAEMON_DIR);
  const requestPath = path.join(doraemonPath, REQUEST_FILE);
  const responsePath = path.join(doraemonPath, RESPONSE_FILE);
  
  let lastProcessedId = '';
  
  const watcher = watch(doraemonPath, async (eventType, filename) => {
    if (filename !== REQUEST_FILE) return;
    
    try {
      const content = await fs.readFile(requestPath, 'utf-8');
      const request = JSON.parse(content) as DoraemonRequest;
      
      if (request.id === lastProcessedId) return;
      lastProcessedId = request.id;
      
      console.log(`[Doraemon Watcher] Processing request: ${request.id}`);
      
      const response = await onRequest(request);
      await fs.writeFile(responsePath, JSON.stringify(response, null, 2));
      
      await fs.unlink(requestPath).catch(() => {});
    } catch (err) {
      console.error('[Doraemon Watcher] Error:', err);
    }
  });
  
  return () => watcher.close();
}
