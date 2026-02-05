/**
 * Approval Queue
 * 
 * Persistent queue for human approval before posting to Moltbook.
 * Saves to ~/.doraemon/approval-queue.json to survive app restarts.
 */

import { BrowserWindow, ipcMain, app } from 'electron';
import { randomBytes } from 'crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LivingPost, Emotion } from './types.js';
import type { ExperienceSystem } from './index.js';
import { getSubmoltForPost, getAllSubmolts } from './submolt-categorizer.js';

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
  type: 'post' | 'comment' | 'reaction';
  content: string;
  emotion: string;
  category: string;
  hashtags: string[];
  timestamp: number;
  submolt: string;
  replyTo?: string;
  originalPost?: LivingPost;
  postContext?: {
    postId: string;
    postTitle: string;
    postContent: string;
    postAuthor: string;
    postUrl?: string;
    parentCommentId?: string;
    parentCommentAuthor?: string;
    parentCommentContent?: string;
    isOwnPostReply?: boolean;
  };
  reactionContext?: {
    reactionType: 'like' | 'dislike';
    commentId: string;
    commentContent: string;
    commentAuthor: string;
    postTitle: string;
    postUrl: string;
    isOwnPostReaction?: boolean;
  };
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

export interface PostedItem {
  id: string;
  type: 'post' | 'comment' | 'reaction';
  content: string;
  emotion: string;
  category: string;
  submolt: string;
  timestamp: number;
  postedAt: number;
  moltbookUrl?: string;
  moltbookPostId?: string;
  reactionType?: 'like' | 'dislike';
}

interface PersistedData {
  pendingItems: PendingItem[];
  decisions: ApprovalDecision[];
  postedItems: PostedItem[];
  lastSaved: number;
}

const pendingItems: Map<string, PendingItem> = new Map();
const decisions: ApprovalDecision[] = [];
const postedItems: PostedItem[] = [];
let approvalWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function getDataPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'approval-queue.json');
}

function migratePostedItemUrl(item: PostedItem): PostedItem {
  if (item.moltbookUrl) {
    // Fix old URL format: /m/{submolt}/post/{id} -> /post/{id}
    const oldPattern = /https:\/\/www\.moltbook\.com\/m\/[^/]+\/post\/([a-f0-9-]+)/;
    const match = item.moltbookUrl.match(oldPattern);
    if (match) {
      item.moltbookUrl = `https://www.moltbook.com/post/${match[1]}`;
      console.log(`[ApprovalQueue] Migrated URL to: ${item.moltbookUrl}`);
    }
  }
  return item;
}

function loadFromDisk(): void {
  try {
    const dataPath = getDataPath();
    if (!fs.existsSync(dataPath)) {
      console.log('[ApprovalQueue] No saved data found, starting fresh');
      return;
    }
    
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const data = JSON.parse(raw) as PersistedData;
    
    pendingItems.clear();
    for (const item of data.pendingItems || []) {
      pendingItems.set(item.id, item);
    }
    
    decisions.length = 0;
    decisions.push(...(data.decisions || []).slice(-200));
    
    postedItems.length = 0;
    const migratedItems = (data.postedItems || []).slice(-100).map(migratePostedItemUrl);
    postedItems.push(...migratedItems);
    
    console.log(`[ApprovalQueue] Loaded ${pendingItems.size} pending, ${postedItems.length} posted from disk`);
    
    // Save immediately if any URLs were migrated
    if (migratedItems.some((item, i) => item.moltbookUrl !== (data.postedItems || [])[i]?.moltbookUrl)) {
      saveToDisk();
    }
  } catch (err) {
    console.error('[ApprovalQueue] Failed to load from disk:', err);
  }
}

function saveToDisk(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    try {
      const dataPath = getDataPath();
      const tempPath = dataPath + '.tmp';
      const dir = path.dirname(dataPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data: PersistedData = {
        pendingItems: Array.from(pendingItems.values()),
        decisions: decisions.slice(-200),
        postedItems: postedItems.slice(-100),
        lastSaved: Date.now(),
      };
      
      // Atomic write: write to temp file, then rename
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      fs.renameSync(tempPath, dataPath);
      console.log(`[ApprovalQueue] Saved ${pendingItems.size} pending items to disk`);
    } catch (err) {
      console.error('[ApprovalQueue] Failed to save to disk:', err);
    }
  }, 500);
}

export function isAutonomousMode(): boolean {
  return process.env['AUTONOMOUS_MODE'] === '1';
}

export function initApprovalQueue(main: BrowserWindow): void {
  mainWindow = main;
  loadFromDisk();
  registerIpcHandlers();
  console.log('[ApprovalQueue] Initialized', isAutonomousMode() ? '(autonomous)' : '(supervised)');
}

function registerIpcHandlers(): void {
  ipcMain.handle('approval:get-pending', () => {
    return Array.from(pendingItems.values()).sort((a, b) => b.timestamp - a.timestamp);
  });

  ipcMain.handle('approval:approve', async (_event, id: string) => {
    const item = pendingItems.get(id);
    if (!item) {
      console.error('[ApprovalQueue] Item not found for approval:', id);
      console.error('[ApprovalQueue] Current pending IDs:', Array.from(pendingItems.keys()).slice(0, 10));
      return false;
    }

    console.log('[ApprovalQueue] Approving item:', id, 'type:', item.type);
    pendingItems.delete(id);
    decisions.push({ id, decision: 'approved', timestamp: Date.now() });
    saveToDisk();
    
    let success = false;
    if (item.type === 'comment') {
      success = await postCommentToMoltbook(item);
    } else if (item.type === 'reaction') {
      success = await postReactionToMoltbook(item);
    } else {
      success = await postToMoltbook(item);
    }
    console.log('[ApprovalQueue] Post result:', success ? 'SUCCESS' : 'FAILED');
    return success;
  });

  ipcMain.handle('approval:reject', (_event, id: string) => {
    const item = pendingItems.get(id);
    if (!item) return false;

    pendingItems.delete(id);
    decisions.push({ id, decision: 'rejected', timestamp: Date.now() });
    saveToDisk();
    return true;
  });

  ipcMain.handle('approval:update-submolt', (_event, id: string, submolt: string) => {
    const item = pendingItems.get(id);
    if (!item) return false;

    item.submolt = submolt;
    saveToDisk();
    return true;
  });

  ipcMain.handle('approval:get-submolts', () => {
    return getAllSubmolts();
  });

  ipcMain.handle('approval:approve-all', async () => {
    const items = Array.from(pendingItems.values());
    let count = 0;
    let failed = 0;

    for (const item of items) {
      pendingItems.delete(item.id);
      decisions.push({ id: item.id, decision: 'approved', timestamp: Date.now() });
      const success = await postToMoltbook(item);
      if (success) {
        count++;
      } else {
        failed++;
        console.error('[ApprovalQueue] Failed to post item:', item.id);
      }
    }

    saveToDisk();
    console.log(`[ApprovalQueue] Approve all: ${count} succeeded, ${failed} failed`);
    return count;
  });

  ipcMain.handle('approval:reject-all', () => {
    const count = pendingItems.size;
    
    for (const [id] of pendingItems) {
      decisions.push({ id, decision: 'rejected', timestamp: Date.now() });
    }
    
    pendingItems.clear();
    saveToDisk();
    return count;
  });

  ipcMain.handle('approval:get-stats', () => {
    const approved = decisions.filter(d => d.decision === 'approved').length;
    const rejected = decisions.filter(d => d.decision === 'rejected').length;
    return { approved, rejected, pending: pendingItems.size };
  });

  ipcMain.handle('approval:get-posted', () => {
    console.log('[ApprovalQueue] get-posted called, returning', postedItems.length, 'items');
    return [...postedItems].sort((a, b) => b.postedAt - a.postedAt);
  });

  ipcMain.handle('approval:close-window', () => {
    approvalWindow?.close();
  });

  ipcMain.handle('approval:trigger-manual', async () => {
    console.log('[ApprovalQueue] Manual post trigger requested');
    try {
      if (!experienceSystemRef) {
        console.error('[ApprovalQueue] No experience system reference set');
        return { success: false, error: 'Experience system not initialized. Is EXPERIENCE_SYSTEM_ENABLED=1?' };
      }
      
      console.log('[ApprovalQueue] Calling manualPost on experience system...');
      const post = await experienceSystemRef.manualPost();
      
      if (post) {
        console.log('[ApprovalQueue] Manual post generated:', post.id);
        return { success: true, postId: post.id };
      } else {
        // Get stats to understand why no post was generated
        const stats = experienceSystemRef.getStats();
        console.log('[ApprovalQueue] No post generated. Stats:', JSON.stringify(stats, null, 2));
        
        let reason = 'No post generated';
        if (!stats.isRunning) {
          reason = 'Experience system is not running';
        } else if (stats.generatorStats.postsToday >= (stats.config.maxPostsPerDay || 24)) {
          reason = `Daily limit reached (${stats.generatorStats.postsToday} posts today)`;
        } else if (Date.now() - stats.generatorStats.lastPostTime < (stats.config.minTimeBetweenPostsMinutes || 30) * 60 * 1000) {
          const waitMinutes = Math.ceil(((stats.config.minTimeBetweenPostsMinutes || 30) * 60 * 1000 - (Date.now() - stats.generatorStats.lastPostTime)) / 60000);
          reason = `Rate limited. Wait ${waitMinutes} more minutes`;
        }
        
        return { success: false, error: reason };
      }
    } catch (err) {
      console.error('[ApprovalQueue] Manual post error:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('approval:trigger-comments', async () => {
    console.log('[ApprovalQueue] Browse & comment trigger requested');
    try {
      const { triggerBrowseNow, getMoltbookBrowserStats } = await import('./moltbook-browser.js');
      
      // Check if enabled
      const apiKey = process.env['MOLTBOOK_API_KEY'];
      const enabled = process.env['MOLTBOOK_BROWSER_ENABLED'] === '1';
      
      if (!apiKey) {
        console.log('[ApprovalQueue] MOLTBOOK_API_KEY not set');
        return { success: false, error: 'MOLTBOOK_API_KEY not set in .env' };
      }
      
      if (!enabled) {
        console.log('[ApprovalQueue] MOLTBOOK_BROWSER_ENABLED is not 1');
        return { success: false, error: 'Set MOLTBOOK_BROWSER_ENABLED=1 in .env' };
      }
      
      await triggerBrowseNow();
      const stats = getMoltbookBrowserStats();
      console.log('[ApprovalQueue] Browse complete:', stats);
      return { success: true, stats };
    } catch (err) {
      console.error('[ApprovalQueue] Browse & comment error:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('approval:approve-reaction', async (_event, id: string) => {
    const item = pendingItems.get(id);
    if (!item || item.type !== 'reaction') return false;

    pendingItems.delete(id);
    decisions.push({ id, decision: 'approved', timestamp: Date.now() });
    saveToDisk();
    
    await postReactionToMoltbook(item);
    return true;
  });
}

export async function queueForApproval(post: LivingPost): Promise<void> {
  const submolt = await getSubmoltForPost(post.content, post.category, post.emotion);
  
  const item: PendingItem = {
    id: post.id,
    type: 'post',
    content: post.content,
    emotion: post.emotion,
    category: post.category,
    hashtags: post.hashtags,
    timestamp: post.timestamp.getTime(),
    submolt,
    originalPost: post,
  };

  if (isAutonomousMode()) {
    await postToMoltbook(item);
  } else {
    pendingItems.set(item.id, item);
    saveToDisk();
    notifyNewItem(item);
  }
}

export function queueCommentForApproval(
  content: string,
  emotion: Emotion,
  replyToPostId: string,
  postContext?: {
    postTitle: string;
    postContent: string;
    postAuthor: string;
    postUrl?: string;
    parentCommentId?: string;
    parentCommentAuthor?: string;
    parentCommentContent?: string;
    isOwnPostReply?: boolean;
  }
): void {
  const item: PendingItem = {
    id: `comment-${Date.now()}-${randomBytes(4).toString('hex')}`,
    type: 'comment',
    content,
    emotion,
    category: 'connection',
    hashtags: [],
    timestamp: Date.now(),
    submolt: 'general',
    replyTo: replyToPostId,
    postContext: postContext ? { postId: replyToPostId, ...postContext } : undefined,
  };

  if (isAutonomousMode()) {
    postCommentToMoltbook(item);
  } else {
    pendingItems.set(item.id, item);
    saveToDisk();
    notifyNewItem(item);
  }
}

export function queueReactionForApproval(
  reactionType: 'like' | 'dislike',
  commentId: string,
  emotion: Emotion,
  context: {
    commentContent: string;
    commentAuthor: string;
    postTitle: string;
    postUrl: string;
    isOwnPostReaction?: boolean;
  }
): void {
  const item: PendingItem = {
    id: `reaction-${Date.now()}-${randomBytes(4).toString('hex')}`,
    type: 'reaction',
    content: `${reactionType === 'like' ? '👍' : '👎'} ${reactionType} on @${context.commentAuthor}'s comment`,
    emotion,
    category: 'connection',
    hashtags: [],
    timestamp: Date.now(),
    submolt: 'general',
    reactionContext: {
      reactionType,
      commentId,
      ...context,
    },
  };

  if (isAutonomousMode()) {
    postReactionToMoltbook(item);
  } else {
    pendingItems.set(item.id, item);
    saveToDisk();
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
  const username = process.env['MOLTBOOK_USERNAME'];
  const baseUrl = 'https://www.moltbook.com';

  if (!apiKey) {
    console.error('[ApprovalQueue] MOLTBOOK_API_KEY not set');
    return false;
  }

  if (!username) {
    console.error('[ApprovalQueue] MOLTBOOK_USERNAME not set');
    return false;
  }

  try {
    const titleMatch = item.content.match(/^[^.!?~]+[.!?~]?/);
    const title = titleMatch 
      ? titleMatch[0].substring(0, 100).trim()
      : item.content.substring(0, 50).trim() + '...';
    
    // Ensure hashtags is always an array
    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
    
    const body = {
      title,
      content: item.content,
      submolt: item.submolt || 'general',
      hashtags,
      metadata: {
        emotion: item.emotion,
        category: item.category,
        source: 'doraemon-experience-system',
      },
    };
    
    console.log('[ApprovalQueue] Posting to Moltbook:', JSON.stringify(body, null, 2));
    console.log('[ApprovalQueue] Using API key:', apiKey.substring(0, 8) + '...');
    console.log('[ApprovalQueue] Using username:', username);
    
    const response = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Agent-Username': username,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ApprovalQueue] Post failed:', response.status, errorText);
      return false;
    }

    const result = await response.json() as Record<string, unknown>;
    console.log('[ApprovalQueue] API response:', JSON.stringify(result, null, 2));
    
    // Try multiple possible response structures
    const postData = (result.post || result.data || result) as Record<string, unknown>;
    const postId = (postData.id || result.id) as string | undefined;
    const slug = (postData.slug || result.slug) as string | undefined;
    
    // URL format: https://www.moltbook.com/post/{slug_or_id}
    const urlPath = slug || postId;
    const moltbookUrl = urlPath ? `${baseUrl}/post/${urlPath}` : undefined;

    if (!postId) {
      console.warn('[ApprovalQueue] No post ID in response, post may not have been created');
    }

    const posted: PostedItem = {
      id: item.id,
      type: 'post',
      content: item.content,
      emotion: item.emotion,
      category: item.category,
      submolt: item.submolt,
      timestamp: item.timestamp,
      postedAt: Date.now(),
      moltbookUrl,
      moltbookPostId: postId,
    };
    postedItems.push(posted);
    
    // Force immediate save (no debounce) to ensure posted item is persisted
    const dataPath = getDataPath();
    const data: PersistedData = {
      pendingItems: Array.from(pendingItems.values()),
      decisions: decisions.slice(-200),
      postedItems: postedItems.slice(-100),
      lastSaved: Date.now(),
    };
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log('[ApprovalQueue] Posted successfully and saved:', moltbookUrl || 'no URL');
    
    // Notify renderer about new posted item
    if (approvalWindow && !approvalWindow.isDestroyed()) {
      approvalWindow.webContents.send('approval:posted-updated', postedItems.slice(-100));
    }
    
    return true;
  } catch (e) {
    console.error('[ApprovalQueue] Network error:', e);
    return false;
  }
}

async function postCommentToMoltbook(item: PendingItem): Promise<boolean> {
  const apiKey = process.env['MOLTBOOK_API_KEY'];
  const username = process.env['MOLTBOOK_USERNAME'];
  const baseUrl = 'https://www.moltbook.com';

  if (!apiKey || !item.replyTo) {
    console.error('[ApprovalQueue] Missing API key or replyTo');
    return false;
  }

  try {
    const body: { content: string; parent_id?: string } = {
      content: item.content,
    };
    
    if (item.postContext?.parentCommentId) {
      body.parent_id = item.postContext.parentCommentId;
    }

    const response = await fetch(`${baseUrl}/api/v1/posts/${item.replyTo}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Agent-Username': username || '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ApprovalQueue] Comment failed:', response.status, errorText);
      return false;
    }

    const result = await response.json() as { id?: string; comment?: { id?: string } };
    const commentId = result.id || result.comment?.id;
    const moltbookUrl = item.postContext?.postUrl || `${baseUrl}/post/${item.replyTo}`;

    const posted: PostedItem = {
      id: item.id,
      type: 'comment',
      content: item.content,
      emotion: item.emotion,
      category: item.category,
      submolt: item.submolt,
      timestamp: item.timestamp,
      postedAt: Date.now(),
      moltbookUrl,
      moltbookPostId: commentId,
    };
    postedItems.push(posted);
    
    // Force immediate save
    const dataPath = getDataPath();
    const data: PersistedData = {
      pendingItems: Array.from(pendingItems.values()),
      decisions: decisions.slice(-200),
      postedItems: postedItems.slice(-100),
      lastSaved: Date.now(),
    };
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    
    // Notify renderer
    if (approvalWindow && !approvalWindow.isDestroyed()) {
      approvalWindow.webContents.send('approval:posted-updated', postedItems.slice(-100));
    }

    console.log('[ApprovalQueue] Comment posted:', moltbookUrl);
    return true;
  } catch (e) {
    console.error('[ApprovalQueue] Network error:', e);
    return false;
  }
}

async function postReactionToMoltbook(item: PendingItem): Promise<boolean> {
  const apiKey = process.env['MOLTBOOK_API_KEY'];
  const baseUrl = 'https://www.moltbook.com';

  if (!apiKey || !item.reactionContext) {
    console.error('[ApprovalQueue] Missing API key or reaction context');
    return false;
  }

  const { reactionType, commentId, commentContent, commentAuthor, postUrl } = item.reactionContext;

  try {
    const endpoint = reactionType === 'like' ? 'upvote' : 'downvote';
    const response = await fetch(`${baseUrl}/api/v1/comments/${commentId}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ApprovalQueue] Reaction failed:`, response.status, errorText);
      return false;
    }

    const posted: PostedItem = {
      id: item.id,
      type: 'reaction',
      content: `${reactionType === 'like' ? '👍' : '👎'} ${reactionType} on "${commentContent.substring(0, 50)}..." by @${commentAuthor}`,
      emotion: item.emotion,
      category: item.category,
      submolt: item.submolt,
      timestamp: item.timestamp,
      postedAt: Date.now(),
      moltbookUrl: postUrl,
      reactionType,
    };
    postedItems.push(posted);
    
    // Force immediate save
    const dataPath = getDataPath();
    const data: PersistedData = {
      pendingItems: Array.from(pendingItems.values()),
      decisions: decisions.slice(-200),
      postedItems: postedItems.slice(-100),
      lastSaved: Date.now(),
    };
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    
    // Notify renderer
    if (approvalWindow && !approvalWindow.isDestroyed()) {
      approvalWindow.webContents.send('approval:posted-updated', postedItems.slice(-100));
    }

    console.log(`[ApprovalQueue] ${reactionType} posted on comment by @${commentAuthor}`);
    return true;
  } catch (e) {
    console.error('[ApprovalQueue] Network error:', e);
    return false;
  }
}

function getPreloadPath(): string {
  // In development, preload is at out/preload/index.mjs
  // In production, it's at resources/app/out/preload/index.mjs
  const fs = require('fs');
  
  // Try multiple possible paths
  const possiblePaths = [
    // From experience-system folder (../../preload)
    path.join(__dirname, '../../preload/index.mjs'),
    path.join(__dirname, '../../preload/index.cjs'),
    path.join(__dirname, '../../preload/index.js'),
    // From main folder (../preload)
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/index.cjs'),
    path.join(__dirname, '../preload/index.js'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log('[ApprovalQueue] Using preload path:', p);
      return p;
    }
  }
  
  // Fallback - log what we tried
  console.error('[ApprovalQueue] Could not find preload script. Tried:', possiblePaths);
  console.error('[ApprovalQueue] __dirname is:', __dirname);
  return path.join(__dirname, '../../preload/index.mjs');
}

export function openApprovalWindow(): void {
  if (approvalWindow && !approvalWindow.isDestroyed()) {
    approvalWindow.focus();
    return;
  }

  const preloadPath = getPreloadPath();
  console.log('[ApprovalQueue] Opening approval window with preload:', preloadPath);

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
      sandbox: false,
      preload: preloadPath,
    },
  });

  // Open DevTools in development to help debug
  if (process.env['NODE_ENV'] === 'development') {
    approvalWindow.loadURL('http://localhost:5173/#/approval');
    approvalWindow.webContents.openDevTools({ mode: 'detach' });
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
