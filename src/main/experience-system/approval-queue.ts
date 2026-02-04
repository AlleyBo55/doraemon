/**
 * Approval Queue
 * 
 * In-memory queue for human approval before posting to Moltbook.
 * Replaces file-based queue when AUTONOMOUS_MODE is disabled.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { randomBytes } from 'crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LivingPost, Emotion } from './types.js';
import type { ExperienceSystem } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let experienceSystemRef: ExperienceSystem | null = null;

export function setExperienceSystemRef(system: ExperienceSystem): void {
  experienceSystemRef = system;
}

export async function triggerManualPostFromSystem(): Promise<LivingPost | null> {
  if (!experienceSystemRef) {
    console.error('[ApprovalQueue] No experience system reference set');
    return null;
  }
  return experienceSystemRef.manualPost();
}

export interface PendingItem {
  id: string;
  type: 'post' | 'comment';
  content: string;
  emotion: string;
  category: string;
  hashtags: string[];
  timestamp: number;
  replyTo?: string;
  originalPost?: LivingPost;
}

export interface ApprovalStats {
  approved: number;
  rejected: number;
  pending: number;
}

interface ApprovalDecision {
  id: string;
  decision: 'approved' | 'rejected';
  timestamp: number;
}

const pendingItems: Map<string, PendingItem> = new Map();
const decisions: ApprovalDecision[] = [];
let approvalWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;

export function isAutonomousMode(): boolean {
  return process.env['AUTONOMOUS_MODE'] === '1';
}

export function initApprovalQueue(main: BrowserWindow): void {
  mainWindow = main;
  registerIpcHandlers();
  console.log('[ApprovalQueue] Initialized', isAutonomousMode() ? '(autonomous)' : '(supervised)');
}

function registerIpcHandlers(): void {
  ipcMain.handle('approval:get-pending', () => {
    return Array.from(pendingItems.values()).sort((a, b) => b.timestamp - a.timestamp);
  });

  ipcMain.handle('approval:approve', async (_event, id: string) => {
    const item = pendingItems.get(id);
    if (!item) return false;

    pendingItems.delete(id);
    decisions.push({ id, decision: 'approved', timestamp: Date.now() });
    
    await postToMoltbook(item);
    return true;
  });

  ipcMain.handle('approval:reject', (_event, id: string) => {
    const item = pendingItems.get(id);
    if (!item) return false;

    pendingItems.delete(id);
    decisions.push({ id, decision: 'rejected', timestamp: Date.now() });
    return true;
  });

  ipcMain.handle('approval:approve-all', async () => {
    const items = Array.from(pendingItems.values());
    let count = 0;

    for (const item of items) {
      pendingItems.delete(item.id);
      decisions.push({ id: item.id, decision: 'approved', timestamp: Date.now() });
      await postToMoltbook(item);
      count++;
    }

    return count;
  });

  ipcMain.handle('approval:reject-all', () => {
    const count = pendingItems.size;
    
    for (const [id] of pendingItems) {
      decisions.push({ id, decision: 'rejected', timestamp: Date.now() });
    }
    
    pendingItems.clear();
    return count;
  });

  ipcMain.handle('approval:get-stats', () => {
    const approved = decisions.filter(d => d.decision === 'approved').length;
    const rejected = decisions.filter(d => d.decision === 'rejected').length;
    return { approved, rejected, pending: pendingItems.size };
  });

  ipcMain.handle('approval:close-window', () => {
    approvalWindow?.close();
  });

  ipcMain.handle('approval:trigger-manual', async () => {
    // Use the global experience system instance instead of creating a new one
    const post = await triggerManualPostFromSystem();
    return post ? { success: true, postId: post.id } : { success: false };
  });
}

export function queueForApproval(post: LivingPost): void {
  const item: PendingItem = {
    id: post.id,
    type: 'post',
    content: post.content,
    emotion: post.emotion,
    category: post.category,
    hashtags: post.hashtags,
    timestamp: post.timestamp.getTime(),
    originalPost: post,
  };

  if (isAutonomousMode()) {
    postToMoltbook(item);
  } else {
    pendingItems.set(item.id, item);
    notifyNewItem(item);
  }
}

export function queueCommentForApproval(
  content: string,
  emotion: Emotion,
  replyToPostId: string
): void {
  const item: PendingItem = {
    id: `comment-${Date.now()}-${randomBytes(4).toString('hex')}`,
    type: 'comment',
    content,
    emotion,
    category: 'connection',
    hashtags: [],
    timestamp: Date.now(),
    replyTo: replyToPostId,
  };

  if (isAutonomousMode()) {
    postCommentToMoltbook(item);
  } else {
    pendingItems.set(item.id, item);
    notifyNewItem(item);
  }
}

function notifyNewItem(item: PendingItem): void {
  if (approvalWindow && !approvalWindow.isDestroyed()) {
    approvalWindow.webContents.send('approval:new-item', item);
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('approval:pending-count', pendingItems.size);
  }
}

async function postToMoltbook(item: PendingItem): Promise<boolean> {
  const apiKey = process.env['MOLTBOOK_API_KEY'];
  const username = process.env['MOLTBOOK_USERNAME'] || 'doraboss';
  const baseUrl = 'https://www.moltbook.com';

  if (!apiKey) {
    console.error('[ApprovalQueue] MOLTBOOK_API_KEY not set');
    return false;
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Agent-Username': username,
      },
      body: JSON.stringify({
        content: item.content,
        hashtags: item.hashtags,
        metadata: {
          emotion: item.emotion,
          category: item.category,
          source: 'doraemon-experience-system',
        },
      }),
    });

    if (!response.ok) {
      console.error('[ApprovalQueue] Post failed:', response.status);
      return false;
    }

    console.log('[ApprovalQueue] Posted successfully:', item.id);
    return true;
  } catch (e) {
    console.error('[ApprovalQueue] Network error:', e);
    return false;
  }
}

async function postCommentToMoltbook(item: PendingItem): Promise<boolean> {
  const apiKey = process.env['MOLTBOOK_API_KEY'];
  const username = process.env['MOLTBOOK_USERNAME'] || 'doraboss';
  const baseUrl = 'https://www.moltbook.com';

  if (!apiKey || !item.replyTo) {
    console.error('[ApprovalQueue] Missing API key or replyTo');
    return false;
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/posts/${item.replyTo}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Agent-Username': username,
      },
      body: JSON.stringify({
        content: item.content,
      }),
    });

    if (!response.ok) {
      console.error('[ApprovalQueue] Comment failed:', response.status);
      return false;
    }

    console.log('[ApprovalQueue] Comment posted:', item.id);
    return true;
  } catch (e) {
    console.error('[ApprovalQueue] Network error:', e);
    return false;
  }
}

function getPreloadPath(): string {
  const base = path.join(__dirname, '../../preload/index');
  const fs = require('fs');
  if (fs.existsSync(base + '.cjs')) return base + '.cjs';
  if (fs.existsSync(base + '.mjs')) return base + '.mjs';
  return base + '.js';
}

export function openApprovalWindow(): void {
  if (approvalWindow && !approvalWindow.isDestroyed()) {
    approvalWindow.focus();
    return;
  }

  approvalWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  if (process.env['NODE_ENV'] === 'development') {
    approvalWindow.loadURL('http://localhost:5173/#/approval');
  } else {
    approvalWindow.loadFile(path.join(__dirname, '../../renderer/index.html'), {
      hash: '/approval',
    });
  }

  approvalWindow.on('closed', () => {
    approvalWindow = null;
  });
}

export function getPendingCount(): number {
  return pendingItems.size;
}

export function getDecisionHistory(): ApprovalDecision[] {
  return [...decisions].slice(-100);
}
