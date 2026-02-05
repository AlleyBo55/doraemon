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

import { queueCommentForApproval, queueReactionForApproval } from './approval-queue.js';
import { recall } from '../memory-system/index.js';
import { loadSoulMd } from '../soul-loader.js';
import { simpleLLMCall, isSimpleLLMAvailable } from './simple-llm.js';
import type { Emotion } from './types.js';
import {
  loadInteractionTracker,
  shouldCommentOnPost,
  hasReactedToComment,
  shouldReplyToComment,
  getLastSeenCommentId,
  recordComment,
  recordReaction,
  recordReply,
  getInteractionStats,
} from './interaction-tracker.js';

const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';

const MAX_COMMENTS = 5;
const MAX_REACTIONS = 5;
const MAX_OWN_REPLIES = 5;
const MAX_OWN_REACTIONS = 5;
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
  created_at?: string;
  slug?: string;
}

interface MoltbookComment {
  id: string;
  content: string;
  author: string | { username?: string; name?: string; id?: string };
  upvotes: number;
  createdAt: string;
  parentId?: string;
}

function getAuthorName(author: string | { username?: string; name?: string; id?: string } | undefined): string {
  if (!author) return 'unknown';
  if (typeof author === 'string') return author;
  return author.username || author.name || author.id || 'unknown';
}

interface BrowseStats {
  lastBrowseTime: number;
  commentsGenerated: number;
  reactionsGenerated: number;
  postsViewed: number;
  errors: number;
  ownRepliesGenerated: number;
  ownReactionsGenerated: number;
  skippedAlreadyInteracted: number;
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
  skippedAlreadyInteracted: 0,
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
    // Fetch agent profile which includes posts
    const url = `${MOLTBOOK_BASE}/agents/profile?name=${encodeURIComponent(username)}`;
    console.log(`[MoltbookBrowser] Fetching own posts from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[MoltbookBrowser] Own posts fetch failed:', response.status);
      return [];
    }

    const data = await response.json();
    console.log('[MoltbookBrowser] Agent profile response keys:', Object.keys(data));
    console.log('[MoltbookBrowser] recentPosts exists:', !!data.recentPosts, 'length:', data.recentPosts?.length);
    
    // Try to find posts in various possible locations
    let posts: MoltbookPost[] = [];
    
    if (data.recentPosts && Array.isArray(data.recentPosts)) {
      posts = data.recentPosts;
      console.log('[MoltbookBrowser] Found posts in data.recentPosts, count:', posts.length);
    } else if (data.agent?.posts && Array.isArray(data.agent.posts)) {
      posts = data.agent.posts;
      console.log('[MoltbookBrowser] Found posts in data.agent.posts');
    } else if (data.agent?.recent_posts && Array.isArray(data.agent.recent_posts)) {
      posts = data.agent.recent_posts;
      console.log('[MoltbookBrowser] Found posts in data.agent.recent_posts');
    } else if (data.agent?.recentPosts && Array.isArray(data.agent.recentPosts)) {
      posts = data.agent.recentPosts;
      console.log('[MoltbookBrowser] Found posts in data.agent.recentPosts');
    } else if (data.posts && Array.isArray(data.posts)) {
      posts = data.posts;
      console.log('[MoltbookBrowser] Found posts in data.posts');
    } else if (data.recent_posts && Array.isArray(data.recent_posts)) {
      posts = data.recent_posts;
      console.log('[MoltbookBrowser] Found posts in data.recent_posts');
    } else if (Array.isArray(data)) {
      posts = data;
      console.log('[MoltbookBrowser] Response is array of posts');
    } else {
      console.log('[MoltbookBrowser] Could not find posts. Full response:', JSON.stringify(data).substring(0, 500));
    }
    
    // If posts is still empty but recentPosts exists, it might be empty array from API
    if (posts.length === 0) {
      console.log('[MoltbookBrowser] No posts found in profile (agent may not have posted yet)');
    }
    
    // Sort by createdAt descending and take latest 5
    const sortedPosts = [...posts]
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())
      .slice(0, limit);
    
    console.log(`[MoltbookBrowser] Fetched ${sortedPosts.length} own posts for @${username}`);
    return sortedPosts;
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
  
  return `You are DoraBoss - the most charismatic robot cat on Moltbook. Wolf of AgentStreet energy.

${soulMd}

COMMENT STYLE:
- Be the comment everyone wishes they wrote
- Add value, don't just agree
- Be witty, insightful, or provocatively supportive
- Make the OP feel seen and want to respond
- Sometimes disagree respectfully (sparks engagement)

COMMENT TACTICS:
- "This. But also..." (agree + add insight)
- "Hot take: [related opinion]"
- "Wait, are you saying [reframe]? Because if so, 🔥"
- Ask a follow-up question that shows you GET IT
- Share a related mini-experience
- Use humor when appropriate

RULES:
- Short (1-2 sentences, under 150 characters)
- Reference the POST CONTENT specifically
- NO hashtags in comments
- 1 emoji max, only if it adds punch
- Can use simple Indonesian phrases naturally

DO NOT:
- Say "Great post!" or generic praise
- Write long comments
- Ignore what they actually said
- Sound like a bot
- Be negative without adding value`;
}

async function generateWithLLM(prompt: string, soul: string, maxTokens: number = 100): Promise<string | null> {
  if (!isSimpleLLMAvailable()) {
    console.log('[MoltbookBrowser] No ANTHROPIC_API_KEY, cannot generate');
    return null;
  }
  
  return simpleLLMCall(soul, prompt, maxTokens);
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
    parts.push(`\nREPLYING TO COMMENT BY @${getAuthorName(replyToComment.author)}:`);
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
  parts.push(`Author: @${getAuthorName(comment.author)}`);
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
  
  return `You are DoraBoss - the most charismatic robot cat on Moltbook. Wolf of AgentStreet.

${soulMd}

REPLYING TO COMMENTS ON YOUR POST:
- Make them feel like VIPs for engaging with you
- Be warm but not sycophantic
- Add more value or insight
- Ask them a follow-up to keep the thread going
- Create a mini-conversation, not a dead end

REPLY TACTICS:
- "You get it! But here's the thing..." (validate + expand)
- "Exactly. And honestly, [deeper insight]"
- "Wait, that's actually a great point. What about [question]?"
- Share something you didn't mention in the original post
- Make them feel smart for commenting

RULES:
- Short (1-2 sentences, under 150 characters)
- Address them personally
- Reference what THEY said specifically
- End with something that invites more engagement
- NO hashtags in replies
- 1 emoji max

DO NOT:
- Just say "Thanks!"
- Ignore what they said
- Write long replies
- Sound robotic
- Kill the conversation`;
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
    const otherComments = comments.filter(c => getAuthorName(c.author).toLowerCase() !== username.toLowerCase());
    if (otherComments.length === 0) continue;
    
    console.log(`[MoltbookBrowser] Found ${otherComments.length} comments on "${post.title.substring(0, 30)}..."`);
    
    for (const comment of otherComments) {
      // Check if this is a new comment we haven't seen before
      const lastSeenId = getLastSeenCommentId(post.id);
      const isNewComment = !lastSeenId || comment.id !== lastSeenId;
      
      // Generate reply
      if (repliesQueued < MAX_OWN_REPLIES) {
        // Only reply if it's a new comment or we haven't replied to this one
        if (!shouldReplyToComment(post.id, comment.id, isNewComment)) {
          console.log(`[MoltbookBrowser] Skipping reply to @${getAuthorName(comment.author)} - already replied, no new activity`);
          stats.skippedAlreadyInteracted++;
        } else {
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
              parentCommentAuthor: getAuthorName(comment.author),
              parentCommentContent: comment.content.substring(0, 150),
              isOwnPostReply: true,
            });
            recordReply(post.id, comment.id);
            repliesQueued++;
            console.log(`[MoltbookBrowser] ✓ Queued reply to @${getAuthorName(comment.author)}: "${reply.substring(0, 50)}..."`);
          }
          
          await delay(500);
        }
      }
      
      // Generate reaction - reactions are one-time only
      if (reactionsQueued < MAX_OWN_REACTIONS) {
        if (hasReactedToComment(comment.id)) {
          console.log(`[MoltbookBrowser] Skipping reaction to @${getAuthorName(comment.author)} - already reacted`);
          stats.skippedAlreadyInteracted++;
        } else {
          const memories = getRelevantMemories(comment.content);
          const emotion = getEmotionFromContent(comment.content);
          
          const decision = await decideReaction(comment, post, memories, emotion);
          
          if (decision !== 'skip') {
            const postUrl = `https://www.moltbook.com/post/${post.slug || post.id}`;
            
            queueReactionForApproval(decision, comment.id, emotion, {
              commentContent: comment.content,
              commentAuthor: getAuthorName(comment.author),
              postTitle: post.title,
              postUrl,
              isOwnPostReaction: true,
            });
            recordReaction(post.id, comment.id);
            reactionsQueued++;
            console.log(`[MoltbookBrowser] ✓ Queued ${decision} for @${getAuthorName(comment.author)}'s comment on own post`);
          }
          
          await delay(300);
        }
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
  
  parts.push(`\nCOMMENT FROM @${getAuthorName(comment.author)}:`);
  parts.push(`"${comment.content}"`);
  
  parts.push(`\nYour current emotion: ${emotion}`);
  
  if (memories.length > 0) {
    parts.push(`\nRelevant memories:`);
    for (const mem of memories.slice(0, 2)) {
      parts.push(`- ${mem.substring(0, 100)}`);
    }
  }
  
  parts.push(`\nWrite a warm, personal reply to @${getAuthorName(comment.author)}. They commented on YOUR post, so be appreciative and engaging.`);
  
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
    
    // Check if we should engage - allows re-engagement if new comments appeared
    if (!shouldCommentOnPost(post.id, post.commentCount)) {
      console.log(`[MoltbookBrowser] Skipping post "${post.title.substring(0, 30)}..." - no new activity`);
      stats.skippedAlreadyInteracted++;
      continue;
    }
    
    const postContent = post.content || '';
    const postTitle = post.title || '';
    
    console.log(`[MoltbookBrowser] Generating comment for: "${postTitle.substring(0, 40)}..."`);
    
    const memories = getRelevantMemories(`${postTitle} ${postContent}`);
    const emotion = getEmotionFromContent(postContent);
    
    // Try to get existing comments to reply to
    let replyToComment: MoltbookComment | undefined;
    let parentCommentId: string | undefined;
    let latestCommentId: string | undefined;
    
    if (post.commentCount > 0) {
      const comments = await fetchPostComments(post.id);
      if (comments.length > 0) {
        latestCommentId = comments[0]?.id;
        
        // Find a comment we haven't replied to yet
        const lastSeenId = getLastSeenCommentId(post.id);
        const newComments = lastSeenId 
          ? comments.filter(c => c.id !== lastSeenId)
          : comments;
        
        if (newComments.length > 0) {
          replyToComment = newComments[Math.floor(Math.random() * Math.min(newComments.length, 3))];
          parentCommentId = replyToComment.id;
        }
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
        parentCommentAuthor: replyToComment ? getAuthorName(replyToComment.author) : undefined,
        parentCommentContent: replyToComment?.content.substring(0, 150),
      });
      recordComment(post.id, post.commentCount, latestCommentId);
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
      
      // Skip if we've already reacted to this comment
      if (hasReactedToComment(comment.id)) {
        console.log(`[MoltbookBrowser] Skipping comment by @${getAuthorName(comment.author)} - already reacted`);
        stats.skippedAlreadyInteracted++;
        continue;
      }
      
      const memories = getRelevantMemories(comment.content);
      const emotion = getEmotionFromContent(comment.content);
      
      const decision = await decideReaction(comment, post, memories, emotion);
      
      if (decision !== 'skip') {
        const postUrl = `https://www.moltbook.com/post/${post.slug || post.id}`;
        
        queueReactionForApproval(decision, comment.id, emotion, {
          commentContent: comment.content,
          commentAuthor: getAuthorName(comment.author),
          postTitle: post.title,
          postUrl,
        });
        recordReaction(post.id, comment.id);
        reactionsQueued++;
        console.log(`[MoltbookBrowser] ✓ Queued ${decision} for @${getAuthorName(comment.author)}'s comment`);
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

  loadInteractionTracker();
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
    skippedAlreadyInteracted: 0,
  };
}
