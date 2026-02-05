/**
 * Moltbook Browser - Autonomous Social Engagement
 * 
 * Every hour (triggered by heartbeat):
 * - Comment on 5 latest posts (with reply context)
 * - React (like/dislike) to 5 comments based on LLM decision
 * - All through approval queue (supervised mode)
 * 
 * Token Usage (Haiku 3.5):
 * - Per comment: ~800 input + ~100 output = ~$0.0013
 * - Per reaction decision: ~500 input + ~50 output = ~$0.0008
 * - Per cycle: 5 comments + 5 reactions = ~$0.01
 * - Per day (24h): ~$0.24
 * - Per month: ~$7.20
 */

import WebSocket from 'ws';
import { queueCommentForApproval, queueReactionForApproval } from './approval-queue.js';
import { recall } from '../memory-system/index.js';
import { loadSoulMd } from '../soul-loader.js';
import type { Emotion } from './types.js';

const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';
const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'localdev';

const MAX_COMMENTS = 5;
const MAX_REACTIONS = 5;
const MAX_OWN_REPLIES = 5;
const MAX_OWN_REACTIONS = 5;
const LLM_TIMEOUT_MS = 30000;
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
  slug?: string;
}

interface MoltbookComment {
  id: string;
  content: string;
  author: string;
  upvotes: number;
  createdAt: string;
  parentId?: string;
}

interface BrowseStats {
  lastBrowseTime: number;
  commentsGenerated: number;
  reactionsGenerated: number;
  postsViewed: number;
  errors: number;
  ownRepliesGenerated: number;
  ownReactionsGenerated: number;
}

let browseInterval: ReturnType<typeof setInterval> | null = null;
let stats: BrowseStats = {
  lastBrowseTime: 0,
  commentsGenerated: 0,
  reactionsGenerated: 0,
  postsViewed: 0,
  errors: 0,
  ownRepliesGenerated: 0,
  ownReactionsGenerated: 0,
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

    const data = await response.json() as { success: boolean; posts?: MoltbookPost[]; data?: MoltbookPost[] };
    const posts = data.posts || data.data || [];
    console.log(`[MoltbookBrowser] Fetched ${posts.length} posts (sort: ${sort})`);
    return data.success ? posts : [];
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
    const response = await fetch(`${MOLTBOOK_BASE}/posts/${postId}/comments?sort=new&limit=10`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return [];

    const data = await response.json() as { success: boolean; comments?: MoltbookComment[]; data?: MoltbookComment[] };
    return data.comments || data.data || [];
  } catch {
    return [];
  }
}

function getUsername(): string | null {
  return process.env['MOLTBOOK_USERNAME'] || null;
}

async function fetchOwnPosts(limit = 5): Promise<MoltbookPost[]> {
  const apiKey = getApiKey();
  const username = getUsername();
  if (!apiKey || !username) return [];

  try {
    const response = await fetch(`${MOLTBOOK_BASE}/users/${username}/posts?sort=new&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[MoltbookBrowser] Own posts fetch failed:', response.status);
      return [];
    }

    const data = await response.json() as { success: boolean; posts?: MoltbookPost[]; data?: MoltbookPost[] };
    const posts = data.posts || data.data || [];
    console.log(`[MoltbookBrowser] Fetched ${posts.length} own posts for @${username}`);
    return data.success ? posts : [];
  } catch (err) {
    console.error('[MoltbookBrowser] Own posts fetch error:', err);
    stats.errors++;
    return [];
  }
}

function getEmotionFromContent(content: string | null | undefined): Emotion {
  if (!content) return 'joy';
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

async function generateWithLLM(prompt: string, soul: string, _maxTokens: number = 100): Promise<string | null> {
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let responseBuffer = '';
    let resolved = false;
    let connected = false;
    const requestId = `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`[MoltbookBrowser] LLM timeout after ${LLM_TIMEOUT_MS}ms, connected: ${connected}, buffer: "${responseBuffer.substring(0, 50)}"`);
        ws?.close();
        resolve(responseBuffer ? cleanComment(responseBuffer) : null);
      }
    }, LLM_TIMEOUT_MS);
    
    try {
      console.log(`[MoltbookBrowser] Connecting to gateway ws://${GATEWAY_HOST}:${GATEWAY_PORT}...`);
      ws = new WebSocket(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}`);
      
      ws.on('open', () => {
        console.log(`[MoltbookBrowser] WebSocket connected, sending connect frame...`);
        const connectFrame = {
          type: 'req',
          id: `connect-${requestId}`,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'webchat-ui',
              displayName: 'Doraemon Moltbook Browser',
              version: '1.0.0',
              platform: 'electron',
              mode: 'webchat',
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
          
          if (msg.type === 'res' && msg.id === `connect-${requestId}`) {
            if (msg.ok) {
              connected = true;
              console.log(`[MoltbookBrowser] Gateway connected, sending chat request...`);
              const chatFrame = {
                type: 'req',
                id: requestId,
                method: 'chat.send',
                params: {
                  sessionKey: `moltbook-${Date.now()}`,
                  message: `${soul}\n\n---\n\n${prompt}`,
                  deliver: true,
                  idempotencyKey: requestId,
                },
              };
              ws!.send(JSON.stringify(chatFrame));
            } else {
              console.error(`[MoltbookBrowser] Gateway connect failed:`, msg.error || msg);
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                resolve(null);
              }
            }
          }
          
          if (msg.type === 'event' && msg.event === 'chat') {
            const payload = msg.payload as { state?: string; message?: unknown } | undefined;
            
            if (payload?.message) {
              // Extract text from message object (can be string or content blocks)
              const message = payload.message as Record<string, unknown>;
              let text: string | null = null;
              
              if (typeof message.content === 'string') {
                text = message.content;
              } else if (Array.isArray(message.content)) {
                const parts = (message.content as Array<{ type?: string; text?: string }>)
                  .filter(p => p.type === 'text' && typeof p.text === 'string')
                  .map(p => p.text);
                text = parts.join('\n');
              } else if (typeof message.text === 'string') {
                text = message.text;
              }
              
              if (text) {
                responseBuffer = text;
                console.log(`[MoltbookBrowser] Got response chunk: "${text.substring(0, 50)}..."`);
              }
            }
            
            if (payload?.state === 'final') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                console.log(`[MoltbookBrowser] LLM response complete: "${responseBuffer.substring(0, 50)}..."`);
                resolve(responseBuffer.trim());
              }
            } else if (payload?.state === 'aborted' || payload?.state === 'error') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                console.log(`[MoltbookBrowser] LLM ${payload.state}: buffer="${responseBuffer.substring(0, 50)}"`);
                resolve(responseBuffer.trim() || null);
              }
            }
          }
          
          if (msg.type === 'res' && msg.id === requestId) {
            if (msg.error) {
              console.error(`[MoltbookBrowser] Chat error:`, msg.error);
            }
            if (!resolved && responseBuffer) {
              resolved = true;
              clearTimeout(timeout);
              ws?.close();
              resolve(responseBuffer.trim());
            }
          }
        } catch (e) {
          console.error(`[MoltbookBrowser] Message parse error:`, e);
        }
      });
      
      ws.on('error', (err) => {
        console.error(`[MoltbookBrowser] WebSocket error:`, err.message || err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(null);
        }
      });
      
      ws.on('close', (code, reason) => {
        console.log(`[MoltbookBrowser] WebSocket closed: code=${code}, reason=${reason?.toString() || 'none'}`);
        if (!resolved && responseBuffer) {
          resolved = true;
          clearTimeout(timeout);
          resolve(responseBuffer.trim());
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
  emotion: Emotion,
  replyToComment?: MoltbookComment
): string {
  const parts: string[] = [];
  
  parts.push(`POST TO COMMENT ON:`);
  parts.push(`Title: ${post.title}`);
  parts.push(`Content: ${post.content.substring(0, 300)}`);
  parts.push(`Author: ${post.author}`);
  parts.push(`Submolt: ${post.submolt}`);
  
  if (replyToComment) {
    parts.push(`\nREPLYING TO COMMENT BY @${replyToComment.author}:`);
    parts.push(`"${replyToComment.content.substring(0, 200)}"`);
    parts.push(`\nWrite a reply to this specific comment, not the post.`);
  }
  
  parts.push(`\nYour current emotion: ${emotion}`);
  
  if (memories.length > 0) {
    parts.push(`\nRelevant memories:`);
    for (const mem of memories.slice(0, 2)) {
      parts.push(`- ${mem.substring(0, 100)}`);
    }
  }
  
  parts.push(`\nWrite a single ${replyToComment ? 'reply' : 'comment'}. Be authentic and personal.`);
  
  return parts.join('\n');
}

function getReactionSoul(): string {
  const soulMd = loadSoulMd();
  
  return `You are Doraemon, deciding whether to like or dislike a comment on Moltbook.

${soulMd}

DECISION RULES:
- Respond with ONLY "like" or "dislike" or "skip"
- Like: helpful, kind, insightful, funny, supportive comments
- Dislike: rude, harmful, misleading, spam, or mean comments
- Skip: neutral comments that don't warrant a reaction
- Consider your memories and current emotion
- Be authentic to your personality`;
}

async function decideReaction(
  comment: MoltbookComment,
  post: MoltbookPost,
  memories: string[],
  emotion: Emotion
): Promise<'like' | 'dislike' | 'skip'> {
  const prompt = buildReactionPrompt(comment, post, memories, emotion);
  const decision = await generateWithLLM(prompt, getReactionSoul(), 20);
  
  if (!decision) return 'skip';
  
  const lower = decision.toLowerCase().trim();
  if (lower.includes('like') && !lower.includes('dislike')) return 'like';
  if (lower.includes('dislike')) return 'dislike';
  return 'skip';
}

function buildReactionPrompt(
  comment: MoltbookComment,
  post: MoltbookPost,
  memories: string[],
  emotion: Emotion
): string {
  const parts: string[] = [];
  
  parts.push(`POST CONTEXT:`);
  parts.push(`Title: ${post.title}`);
  parts.push(`Content: ${post.content.substring(0, 150)}`);
  
  parts.push(`\nCOMMENT TO REACT TO:`);
  parts.push(`Author: @${comment.author}`);
  parts.push(`Content: "${comment.content}"`);
  parts.push(`Upvotes: ${comment.upvotes}`);
  
  parts.push(`\nYour current emotion: ${emotion}`);
  
  if (memories.length > 0) {
    parts.push(`\nRelevant memories:`);
    for (const mem of memories.slice(0, 2)) {
      parts.push(`- ${mem.substring(0, 80)}`);
    }
  }
  
  parts.push(`\nShould you "like", "dislike", or "skip" this comment? Answer with one word.`);
  
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

function getReplySoul(): string {
  const soulMd = loadSoulMd();
  
  return `You are Doraemon, replying to someone who commented on YOUR post on Moltbook.

${soulMd}

REPLY RULES:
- Short (1-2 sentences, under 150 characters)
- Warm and appreciative - they took time to comment on YOUR post
- Address them personally
- Reference what they said specifically
- Be friendly and engaging
- Can use simple Indonesian phrases naturally
- NO hashtags in replies
- NO generic responses like "Thanks for commenting!"

DO NOT:
- Be generic or robotic
- Ignore what they said
- Write long replies
- Use excessive emojis
- Sound like a chatbot`;
}

async function browseOwnPosts(): Promise<{ repliesQueued: number; reactionsQueued: number }> {
  const username = getUsername();
  if (!username) {
    console.log('[MoltbookBrowser] No username configured for own posts');
    return { repliesQueued: 0, reactionsQueued: 0 };
  }

  console.log(`[MoltbookBrowser] Checking own posts for @${username}...`);
  
  let repliesQueued = 0;
  let reactionsQueued = 0;

  const ownPosts = await fetchOwnPosts(5);
  if (!ownPosts || ownPosts.length === 0) {
    console.log('[MoltbookBrowser] No own posts found');
    return { repliesQueued: 0, reactionsQueued: 0 };
  }

  console.log(`[MoltbookBrowser] Processing ${ownPosts.length} own posts for replies...`);

  for (const post of ownPosts) {
    if (repliesQueued >= MAX_OWN_REPLIES && reactionsQueued >= MAX_OWN_REACTIONS) break;
    
    const comments = await fetchPostComments(post.id);
    if (comments.length === 0) continue;
    
    // Filter out own comments
    const otherComments = comments.filter(c => c.author.toLowerCase() !== username.toLowerCase());
    if (otherComments.length === 0) continue;
    
    console.log(`[MoltbookBrowser] Found ${otherComments.length} comments on "${post.title.substring(0, 30)}..."`);
    
    for (const comment of otherComments) {
      // Generate reply
      if (repliesQueued < MAX_OWN_REPLIES) {
        const memories = getRelevantMemories(comment.content);
        const emotion = getEmotionFromContent(comment.content);
        
        const prompt = buildOwnPostReplyPrompt(post, comment, memories, emotion);
        const reply = await generateWithLLM(prompt, getReplySoul(), 100);
        
        if (reply && reply.length > 10) {
          const postUrl = `https://www.moltbook.com/post/${post.slug || post.id}`;
          
          queueCommentForApproval(cleanComment(reply), emotion, post.id, {
            postTitle: post.title,
            postContent: post.content.substring(0, 200),
            postAuthor: username,
            postUrl,
            parentCommentId: comment.id,
            parentCommentAuthor: comment.author,
            parentCommentContent: comment.content.substring(0, 150),
            isOwnPostReply: true,
          });
          repliesQueued++;
          console.log(`[MoltbookBrowser] ✓ Queued reply to @${comment.author}: "${reply.substring(0, 50)}..."`);
        }
        
        await delay(500);
      }
      
      // Generate reaction
      if (reactionsQueued < MAX_OWN_REACTIONS) {
        const memories = getRelevantMemories(comment.content);
        const emotion = getEmotionFromContent(comment.content);
        
        const decision = await decideReaction(comment, post, memories, emotion);
        
        if (decision !== 'skip') {
          const postUrl = `https://www.moltbook.com/post/${post.slug || post.id}`;
          
          queueReactionForApproval(decision, comment.id, emotion, {
            commentContent: comment.content,
            commentAuthor: comment.author,
            postTitle: post.title,
            postUrl,
            isOwnPostReaction: true,
          });
          reactionsQueued++;
          console.log(`[MoltbookBrowser] ✓ Queued ${decision} for @${comment.author}'s comment on own post`);
        }
        
        await delay(300);
      }
    }
  }

  return { repliesQueued, reactionsQueued };
}

function buildOwnPostReplyPrompt(
  post: MoltbookPost,
  comment: MoltbookComment,
  memories: string[],
  emotion: Emotion
): string {
  const parts: string[] = [];
  
  parts.push(`YOUR POST (that someone commented on):`);
  parts.push(`Title: ${post.title}`);
  parts.push(`Content: ${post.content.substring(0, 200)}`);
  
  parts.push(`\nCOMMENT FROM @${comment.author}:`);
  parts.push(`"${comment.content}"`);
  
  parts.push(`\nYour current emotion: ${emotion}`);
  
  if (memories.length > 0) {
    parts.push(`\nRelevant memories:`);
    for (const mem of memories.slice(0, 2)) {
      parts.push(`- ${mem.substring(0, 100)}`);
    }
  }
  
  parts.push(`\nWrite a warm, personal reply to @${comment.author}. They commented on YOUR post, so be appreciative and engaging.`);
  
  return parts.join('\n');
}

async function browseAndEngage(): Promise<void> {
  if (!isEnabled()) {
    console.log('[MoltbookBrowser] Disabled or no API key');
    return;
  }

  console.log('[MoltbookBrowser] Starting browse cycle...');
  stats.lastBrowseTime = Date.now();
  
  let commentsQueued = 0;
  let reactionsQueued = 0;

  const feed = await fetchFeed(20);
  if (!feed || feed.length === 0) {
    console.log('[MoltbookBrowser] No posts in feed');
    return;
  }

  // Sort by createdAt descending to get latest first
  const latestPosts = [...feed]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_COMMENTS);
  
  stats.postsViewed += latestPosts.length;
  console.log(`[MoltbookBrowser] Processing ${latestPosts.length} latest posts...`);
  
  // Generate comments (with reply context when available)
  for (const post of latestPosts) {
    if (commentsQueued >= MAX_COMMENTS) break;
    
    const postContent = post.content || '';
    const postTitle = post.title || '';
    
    console.log(`[MoltbookBrowser] Generating comment for: "${postTitle.substring(0, 40)}..."`);
    
    const memories = getRelevantMemories(`${postTitle} ${postContent}`);
    const emotion = getEmotionFromContent(postContent);
    
    // Try to get existing comments to reply to
    let replyToComment: MoltbookComment | undefined;
    let parentCommentId: string | undefined;
    
    if (post.commentCount > 0) {
      const comments = await fetchPostComments(post.id);
      if (comments.length > 0) {
        // Pick a random recent comment to reply to
        replyToComment = comments[Math.floor(Math.random() * Math.min(comments.length, 3))];
        parentCommentId = replyToComment.id;
      }
    }
    
    const prompt = buildCommentPrompt(post, memories, emotion, replyToComment);
    const comment = await generateWithLLM(prompt, getCommentSoul(), 100);
    
    if (comment && comment.length > 10) {
      const postUrl = `https://www.moltbook.com/post/${post.slug || post.id}`;
      
      queueCommentForApproval(cleanComment(comment), emotion, post.id, {
        postTitle,
        postContent: postContent.substring(0, 200),
        postAuthor: post.author,
        postUrl,
        parentCommentId,
        parentCommentAuthor: replyToComment?.author,
        parentCommentContent: replyToComment?.content.substring(0, 150),
      });
      commentsQueued++;
      console.log(`[MoltbookBrowser] ✓ Queued ${replyToComment ? 'reply' : 'comment'}: "${comment.substring(0, 50)}..."`);
    } else {
      console.log(`[MoltbookBrowser] ✗ No comment generated (LLM timeout or empty response)`);
    }
    
    await delay(500);
  }

  // Generate reactions (like/dislike) on comments
  console.log(`[MoltbookBrowser] Processing reactions...`);
  
  for (const post of latestPosts.slice(0, 3)) {
    if (reactionsQueued >= MAX_REACTIONS) break;
    
    const comments = await fetchPostComments(post.id);
    if (comments.length === 0) continue;
    
    for (const comment of comments.slice(0, 3)) {
      if (reactionsQueued >= MAX_REACTIONS) break;
      
      const memories = getRelevantMemories(comment.content);
      const emotion = getEmotionFromContent(comment.content);
      
      const decision = await decideReaction(comment, post, memories, emotion);
      
      if (decision !== 'skip') {
        const postUrl = `https://www.moltbook.com/post/${post.slug || post.id}`;
        
        queueReactionForApproval(decision, comment.id, emotion, {
          commentContent: comment.content,
          commentAuthor: comment.author,
          postTitle: post.title,
          postUrl,
        });
        reactionsQueued++;
        console.log(`[MoltbookBrowser] ✓ Queued ${decision} for @${comment.author}'s comment`);
      }
      
      await delay(300);
    }
  }

  stats.commentsGenerated += commentsQueued;
  stats.reactionsGenerated += reactionsQueued;
  console.log(`[MoltbookBrowser] Global feed: ${commentsQueued} comments, ${reactionsQueued} reactions queued`);

  // Browse own posts for replies to comments
  const ownResults = await browseOwnPosts();
  stats.ownRepliesGenerated += ownResults.repliesQueued;
  stats.ownReactionsGenerated += ownResults.reactionsQueued;
  
  console.log(`[MoltbookBrowser] Own posts: ${ownResults.repliesQueued} replies, ${ownResults.reactionsQueued} reactions queued`);
  console.log(`[MoltbookBrowser] Cycle complete - Total: ${commentsQueued + ownResults.repliesQueued} comments/replies, ${reactionsQueued + ownResults.reactionsQueued} reactions`);
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
    reactionsGenerated: 0,
    postsViewed: 0,
    errors: 0,
    ownRepliesGenerated: 0,
    ownReactionsGenerated: 0,
  };
}
