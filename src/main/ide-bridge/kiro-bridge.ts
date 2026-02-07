import fs from 'node:fs/promises';
import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';

export type KiroRequest = {
  id: string;
  type: 'chat' | 'command' | 'code-review' | 'explain' | 'fix-error';
  message: string;
  context?: {
    file?: string;
    selection?: string;
    error?: string;
  };
  timestamp: number;
};

export type KiroResponse = {
  id: string;
  success: boolean;
  result?: string;
  error?: string;
  timestamp: number;
};

const DORAEMON_DIR = '.doraemon';
const REQUEST_FILE = 'request.json';
const RESPONSE_FILE = 'response.json';

let responseWatcher: FSWatcher | null = null;
let pendingCallbacks: Map<string, (response: KiroResponse) => void> = new Map();
let watchedWorkspace: string | null = null;

function generateId(): string {
  return `dora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {}
}

async function findWorkspaceRoot(): Promise<string | null> {
  const possibleRoots = [
    process.cwd(),
    process.env['WORKSPACE_PATH'],
    path.join(process.env['HOME'] || '', 'Projects'),
  ].filter(Boolean) as string[];
  
  for (const root of possibleRoots) {
    try {
      const kiroPath = path.join(root, '.kiro');
      await fs.access(kiroPath);
      return root;
    } catch {}
  }
  
  return possibleRoots[0] || null;
}

export async function initKiroBridge(workspacePath?: string): Promise<boolean> {
  const workspace = workspacePath || await findWorkspaceRoot();
  if (!workspace) {
    console.log('[Kiro Bridge] No workspace found');
    return false;
  }

  if (watchedWorkspace === workspace && responseWatcher) {
    return true;
  }
  
  const doraemonPath = path.join(workspace, DORAEMON_DIR);
  await ensureDir(doraemonPath);
  
  const responsePath = path.join(doraemonPath, RESPONSE_FILE);
  
  if (responseWatcher) {
    responseWatcher.close();
  }
  
  responseWatcher = watch(doraemonPath, async (eventType, filename) => {
    if (filename !== RESPONSE_FILE) return;
    
    try {
      const content = await fs.readFile(responsePath, 'utf-8');
      const response = JSON.parse(content) as KiroResponse;
      
      const callback = pendingCallbacks.get(response.id);
      if (callback) {
        pendingCallbacks.delete(response.id);
        callback(response);
        await fs.unlink(responsePath).catch(() => {});
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[Kiro Bridge] Error reading response:', err);
      }
    }
  });

  responseWatcher.on('error', (err) => {
    console.error('[Kiro Bridge] Watcher error, restarting:', err);
    responseWatcher = null;
    watchedWorkspace = null;
    setTimeout(() => initKiroBridge(workspace), 1000);
  });
  
  watchedWorkspace = workspace;
  console.log('[Kiro Bridge] Initialized at:', doraemonPath);
  return true;
}

export async function sendToKiro(
  message: string,
  type: KiroRequest['type'] = 'chat',
  context?: KiroRequest['context'],
  workspacePath?: string
): Promise<KiroResponse> {
  const workspace = workspacePath || await findWorkspaceRoot();
  if (!workspace) {
    return {
      id: 'error',
      success: false,
      error: 'No workspace found',
      timestamp: Date.now(),
    };
  }
  
  const doraemonPath = path.join(workspace, DORAEMON_DIR);
  await ensureDir(doraemonPath);
  
  const requestPath = path.join(doraemonPath, REQUEST_FILE);
  
  const request: KiroRequest = {
    id: generateId(),
    type,
    message,
    context,
    timestamp: Date.now(),
  };
  
  return new Promise(async (resolve) => {
    const timeout = setTimeout(() => {
      pendingCallbacks.delete(request.id);
      resolve({
        id: request.id,
        success: false,
        error: 'Request timed out (60s)',
        timestamp: Date.now(),
      });
    }, 60000);
    
    pendingCallbacks.set(request.id, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
    
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2));
    console.log('[Kiro Bridge] Request sent:', request.id, request.type);
  });
}

export async function askKiro(message: string, workspacePath?: string): Promise<string> {
  const response = await sendToKiro(message, 'chat', undefined, workspacePath);
  return response.success ? (response.result || '') : `Error: ${response.error}`;
}

export async function askKiroToFix(error: string, file?: string, workspacePath?: string): Promise<string> {
  const response = await sendToKiro(
    `Fix this error: ${error}`,
    'fix-error',
    { error, file },
    workspacePath
  );
  return response.success ? (response.result || '') : `Error: ${response.error}`;
}

export async function askKiroToExplain(code: string, file?: string, workspacePath?: string): Promise<string> {
  const response = await sendToKiro(
    `Explain this code: ${code}`,
    'explain',
    { selection: code, file },
    workspacePath
  );
  return response.success ? (response.result || '') : `Error: ${response.error}`;
}

export async function askKiroToReview(file: string, workspacePath?: string): Promise<string> {
  const response = await sendToKiro(
    `Review this file: ${file}`,
    'code-review',
    { file },
    workspacePath
  );
  return response.success ? (response.result || '') : `Error: ${response.error}`;
}

export function closeKiroBridge(): void {
  if (responseWatcher) {
    responseWatcher.close();
    responseWatcher = null;
  }
  pendingCallbacks.clear();
  watchedWorkspace = null;
}
