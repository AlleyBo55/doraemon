/**
 * Moltbook Browser - Autonomous Social Engagement
 * 
 * Every hour (triggered by heartbeat):
 * - Browse feed and fetch 20 random posts
 * - Generate contextual comments using memory + experience + emotion
 * - Reply to up to 5 comments
 * - All through approval queue (supervised mode)
 * 
 * Token Usage (Haiku 3.5):
 * - Input: ~$1/MTok, Output: ~$5/MTok
 * - Per comment: ~800 input + ~100 output = ~$0.0013
 * - Per hour: 25 comments × $0.0013 = ~$0.033
 * - Per day (24h): ~$0.79
 * - Per month: ~$24
 */

import WebSocket from 'ws';
import { queueCommentForApproval } from './approval-queue.js';
import { recall } from '../memory-system/index.js';
import { loadSoulMd } from '../soul-loader.js';
import type { Emotion } from './types.js';

const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';
const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'localdev';

const MAX_COMMENTS_PER_HOUR = 20;
const MAX_REPLIES_PER_HOUR = 5;
const BROWSE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: string;
  submolt: string;
  upvotes: number;
  commentCount: number;
  createdAt: string;
}

interface MoltbookComment {
  id: string;
  postId: string;
  content: string;
  author: string;
  parentId?: string;
  upvotes: number;
  createdAt: string;
}

interface BrowseStats {
  lastBrowseTime: number;
  commentsGenerated: number;
  repliesGenerated: number;
  postsViewed: number;
  errors: number;
}

let browseInterval: ReturnType<typeof setInterval> | null = null;
let stats: BrowseStats = {
  lastBrowseTime: 0,
  commentsGenerated: 0,
  repliesGenerated: 0,
  postsViewed: 0,
  errors: 0,
};

function getApiKey(): string | null {
  return process.env['MOLTBOOK_API_KEY'] || null;
}

function isEnabled(): boolean {
  return process.env['MOLTBOOK_BROWSER_ENABLED'] === '1' && !!getApiKey();
}

async function fetchFeed(limit = 50): Promise<MoltbookPost[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const sorts = ['hot', 'new', 'rising'];
    const sort = sorts[Math.floor(Math.random() * sorts.length)];
    
    const response = await fetch(`${MOLTBOOK_BASE}/posts?sort=${sort}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[MoltbookBrowser] Feed fetch failed:', response.status);
      return [];
    }

    const data = await response.json() as { success: boolean; data: MoltbookPost[] };
    return data.success ? data.data : [];
  } catch (err) {
    console.error('[MoltbookBrowser] Feed fetch error:', err);
    stats.errors++;
    return [];
  }
}

async function fetchPostComments(postId: string): Promise<MoltbookComment[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const response = await fetch(`${MOLTBOOK_BASE}/posts/${postId}/comments?sort=new`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) return [];

    const data = await response.json() as { success: boolean; data: MoltbookComment[] };
    return data.success ? data.data : [];
  } catch {
    return [];
  }
}

function selectRandomPosts(posts: MoltbookPost[], count: number): MoltbookPost[] {
  const shuffled = [...posts].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getEmotionFromContent(content: string): Emotion {
  const lower = content.toLowerCase();
  
  if (lower.includes('excited') || lower.includes('amazing') || lower.includes('awesome')) {
    return 'excitement';
  }
  if (lower.includes('think') || lower.includes('wonder') || lower.includes('curious')) {
    return 'contemplation';
  }
  if (lower.includes('help') || lower.includes('support') || lower.includes('thanks')) {
    return 'connection';
  }
  if (lower.includes('code') || lower.includes('build') || lower.includes('create')) {
    return 'focus';
  }
  if (lower.includes('sad') || lower.includes('difficult') || lower.includes('hard')) {
    return 'melancholy';
  }
  
  return 'joy';
}

function getCommentSoul(): string {
  const soulMd = loadSoulMd();
  
  return `You are Doraemon, commenting on Moltbook posts.

${soulMd}

COMMENT RULES:
- Short (1-2 sentences, under 150 characters)
- Authentic and personal
- Reference your memories/experiences when relevant
- React to the POST CONTENT specifically
- Be supportive and friendly
- Can use simple Indonesian phrases naturally
- NO hashtags in comments
- NO generic responses like "Great post!"

DO NOT:
- Be generic or robotic
- Ignore the post content
- Write long comments
- Use excessive emojis
- Sound like a chatbot`;
}

async function generateComment(
  post: MoltbookPost,
  memories: string[],
  emotion: Emotion
): Promise<string | null> {
  const prompt = buildCommentPrompt(post, memories, emotion);
  
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let responseBuffer = '';
    let resolved = false;
    const requestId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws?.close();
        resolve(responseBuffer || null);
      }
    }, 12000);
    
    try {
      ws = new WebSocket(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}`);
      
      ws.on('open', () => {
        const connectFrame = {
          type: 'req',
          id: `connect-${requestId}`,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'moltbook-browser',
              displayName: 'Doraemon Moltbook Browser',
              version: '1.0.0',
              platform: 'electron',
              mode: 'headless',
            },
            role: 'operator',
            scopes: ['operator.admin'],
            caps: ['chat.events'],
            auth: { token: GATEWAY_TOKEN },
          },
        };
        ws!.send(JSON.stringify(connectFrame));
      });
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === 'res' && msg.id === `connect-${requestId}` && msg.ok) {
            const chatFrame = {
              type: 'req',
              id: requestId,
              method: 'chat.send',
              params: {
                sessionKey: `comment-${Date.now()}`,
                message: `${getCommentSoul()}\n\n---\n\n${prompt}`,
                deliver: true,
                model: 'claude-3-5-haiku-latest',
                maxTokens: 100,
              },
            };
            ws!.send(JSON.stringify(chatFrame));
          }
          
          if (msg.type === 'event') {
            const payload = msg.payload as Record<string, unknown> | undefined;
            
            if (payload?.delta) {
              responseBuffer += payload.delta as string;
            } else if (payload?.content) {
              responseBuffer = payload.content as string;
            } else if (payload?.text) {
              responseBuffer = payload.text as string;
            }
            
            if (payload?.state === 'final' || payload?.state === 'complete') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                resolve(cleanComment(responseBuffer));
              }
            }
          }
          
          if (msg.type === 'res' && msg.id === requestId && !resolved && responseBuffer) {
            resolved = true;
            clearTimeout(timeout);
            ws?.close();
            resolve(cleanComment(responseBuffer));
          }
        } catch {}
      });
      
      ws.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(null);
        }
      });
      
      ws.on('close', () => {
        if (!resolved && responseBuffer) {
          resolved = true;
          clearTimeout(timeout);
          resolve(cleanComment(responseBuffer));
        }
      });
      
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(null);
      }
    }
  });
}

function buildCommentPrompt(
  post: MoltbookPost,
  memories: string[],
  emotion: Emotion
): string {
  const parts: string[] = [];
  
  parts.push(`POST TO COMMENT ON:`);
  parts.push(`Title: ${post.title}`);
  parts.push(`Content: ${post.content.substring(0, 300)}`);
  parts.push(`Author: ${post.author}`);
  parts.push(`Submolt: ${post.submolt}`);
  
  parts.push(`\nYour current emotion: ${emotion}`);
  
  if (memories.length > 0) {
    parts.push(`\nRelevant memories:`);
    for (const mem of memories.slice(0, 2)) {
      parts.push(`- ${mem.substring(0, 100)}`);
    }
  }
  
  parts.push(`\nWrite a single comment responding to this post. Be authentic and personal.`);
  
  return parts.join('\n');
}

function buildReplyPrompt(
  post: MoltbookPost,
  comment: MoltbookComment,
  memories: string[],
  emotion: Emotion
): string {
  const parts: string[] = [];
  
  parts.push(`POST CONTEXT:`);
  parts.push(`Title: ${post.title}`);
  parts.push(`Content: ${post.content.substring(0, 200)}`);
  
  parts.push(`\nCOMMENT TO REPLY TO:`);
  parts.push(`Author: ${comment.author}`);
  parts.push(`Content: ${comment.content}`);
  
  parts.push(`\nYour current emotion: ${emotion}`);
  
  if (memories.length > 0) {
    parts.push(`\nRelevant memories:`);
    for (const mem of memories.slice(0, 2)) {
      parts.push(`- ${mem.substring(0, 100)}`);
    }
  }
  
  parts.push(`\nWrite a reply to this comment. Be friendly and engaging.`);
  
  return parts.join('\n');
}

function cleanComment(raw: string): string {
  let cleaned = raw.trim();
  
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  cleaned = cleaned.replace(/^(Comment:|Here's a comment:|Reply:)\s*/i, '');
  cleaned = cleaned.replace(/#\w+/g, '').trim();
  
  if (cleaned.length > 200) {
    const lastSentence = cleaned.substring(0, 200).lastIndexOf('.');
    if (lastSentence > 50) {
      cleaned = cleaned.substring(0, lastSentence + 1);
    } else {
      cleaned = cleaned.substring(0, 197) + '...';
    }
  }
  
  return cleaned;
}

function getRelevantMemories(content: string): string[] {
  try {
    const entries = recall(content, 3);
    return entries.map(e => e.content);
  } catch {
    return [];
  }
}

async function browseAndEngage(): Promise<void> {
  if (!isEnabled()) {
    console.log('[MoltbookBrowser] Disabled or no API key');
    return;
  }

  console.log('[MoltbookBrowser] Starting browse cycle...');
  stats.lastBrowseTime = Date.now();
  
  const feed = await fetchFeed(50);
  if (feed.length === 0) {
    console.log('[MoltbookBrowser] No posts in feed');
    return;
  }

  const postsToComment = selectRandomPosts(feed, MAX_COMMENTS_PER_HOUR);
  stats.postsViewed += postsToComment.length;
  
  let commentsQueued = 0;
  let repliesQueued = 0;

  for (const post of postsToComment) {
    if (commentsQueued >= MAX_COMMENTS_PER_HOUR) break;
    
    const memories = getRelevantMemories(`${post.title} ${post.content}`);
    const emotion = getEmotionFromContent(post.content);
    
    const comment = await generateComment(post, memories, emotion);
    
    if (comment && comment.length > 10) {
      queueCommentForApproval(comment, emotion, post.id, {
        postTitle: post.title,
        postContent: post.content.substring(0, 200),
        postAuthor: post.author,
      });
      commentsQueued++;
      console.log(`[MoltbookBrowser] Queued comment for post ${post.id}: ${comment.substring(0, 50)}...`);
    }
    
    await delay(500);
  }

  if (repliesQueued < MAX_REPLIES_PER_HOUR) {
    const postsWithComments = feed.filter(p => p.commentCount > 0).slice(0, 10);
    
    for (const post of postsWithComments) {
      if (repliesQueued >= MAX_REPLIES_PER_HOUR) break;
      
      const comments = await fetchPostComments(post.id);
      if (comments.length === 0) continue;
      
      const commentToReply = comments[Math.floor(Math.random() * Math.min(comments.length, 5))];
      if (!commentToReply) continue;
      
      const memories = getRelevantMemories(commentToReply.content);
      const emotion = getEmotionFromContent(commentToReply.content);
      
      const reply = await generateReply(post, commentToReply, memories, emotion);
      
      if (reply && reply.length > 10) {
        queueCommentForApproval(reply, emotion, post.id, {
          postTitle: post.title,
          postContent: post.content.substring(0, 200),
          postAuthor: post.author,
          parentCommentAuthor: commentToReply.author,
          parentCommentContent: commentToReply.content.substring(0, 150),
        });
        repliesQueued++;
        console.log(`[MoltbookBrowser] Queued reply to ${commentToReply.author}: ${reply.substring(0, 50)}...`);
      }
      
      await delay(500);
    }
  }

  stats.commentsGenerated += commentsQueued;
  stats.repliesGenerated += repliesQueued;
  
  console.log(`[MoltbookBrowser] Cycle complete: ${commentsQueued} comments, ${repliesQueued} replies queued`);
}

async function generateReply(
  post: MoltbookPost,
  comment: MoltbookComment,
  memories: string[],
  emotion: Emotion
): Promise<string | null> {
  const prompt = buildReplyPrompt(post, comment, memories, emotion);
  
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let responseBuffer = '';
    let resolved = false;
    const requestId = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws?.close();
        resolve(responseBuffer || null);
      }
    }, 12000);
    
    try {
      ws = new WebSocket(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}`);
      
      ws.on('open', () => {
        const connectFrame = {
          type: 'req',
          id: `connect-${requestId}`,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'moltbook-browser',
              displayName: 'Doraemon Moltbook Browser',
              version: '1.0.0',
              platform: 'electron',
              mode: 'headless',
            },
            role: 'operator',
            scopes: ['operator.admin'],
            caps: ['chat.events'],
            auth: { token: GATEWAY_TOKEN },
          },
        };
        ws!.send(JSON.stringify(connectFrame));
      });
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === 'res' && msg.id === `connect-${requestId}` && msg.ok) {
            const chatFrame = {
              type: 'req',
              id: requestId,
              method: 'chat.send',
              params: {
                sessionKey: `reply-${Date.now()}`,
                message: `${getCommentSoul()}\n\n---\n\n${prompt}`,
                deliver: true,
                model: 'claude-3-5-haiku-latest',
                maxTokens: 100,
              },
            };
            ws!.send(JSON.stringify(chatFrame));
          }
          
          if (msg.type === 'event') {
            const payload = msg.payload as Record<string, unknown> | undefined;
            
            if (payload?.delta) {
              responseBuffer += payload.delta as string;
            } else if (payload?.content) {
              responseBuffer = payload.content as string;
            } else if (payload?.text) {
              responseBuffer = payload.text as string;
            }
            
            if (payload?.state === 'final' || payload?.state === 'complete') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                resolve(cleanComment(responseBuffer));
              }
            }
          }
          
          if (msg.type === 'res' && msg.id === requestId && !resolved && responseBuffer) {
            resolved = true;
            clearTimeout(timeout);
            ws?.close();
            resolve(cleanComment(responseBuffer));
          }
        } catch {}
      });
      
      ws.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(null);
        }
      });
      
      ws.on('close', () => {
        if (!resolved && responseBuffer) {
          resolved = true;
          clearTimeout(timeout);
          resolve(cleanComment(responseBuffer));
        }
      });
      
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(null);
      }
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function startMoltbookBrowser(): void {
  if (browseInterval) {
    console.log('[MoltbookBrowser] Already running');
    return;
  }

  if (!isEnabled()) {
    console.log('[MoltbookBrowser] Disabled (set MOLTBOOK_BROWSER_ENABLED=1)');
    return;
  }

  console.log('[MoltbookBrowser] Starting with 1-hour interval');
  
  browseAndEngage();
  
  browseInterval = setInterval(browseAndEngage, BROWSE_INTERVAL_MS);
}

export function stopMoltbookBrowser(): void {
  if (browseInterval) {
    clearInterval(browseInterval);
    browseInterval = null;
    console.log('[MoltbookBrowser] Stopped');
  }
}

export function triggerBrowseNow(): Promise<void> {
  return browseAndEngage();
}

export function getMoltbookBrowserStats(): BrowseStats {
  return { ...stats };
}

export function resetMoltbookBrowserStats(): void {
  stats = {
    lastBrowseTime: 0,
    commentsGenerated: 0,
    repliesGenerated: 0,
    postsViewed: 0,
    errors: 0,
  };
}
