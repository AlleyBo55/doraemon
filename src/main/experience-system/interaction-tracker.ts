/**
 * Interaction Tracker
 * 
 * Tracks which posts and comments have been interacted with,
 * AND the state at the time of interaction.
 * 
 * Like a real person:
 * - Won't comment twice on the same post IF nothing changed
 * - WILL re-engage if there are new comments/replies since last visit
 * - Won't react to the same comment twice (reactions are one-time)
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

interface InteractionRecord {
  postId: string;
  type: 'comment' | 'reaction' | 'reply';
  commentId?: string;
  timestamp: number;
  lastSeenCommentCount?: number;
  lastSeenCommentId?: string;
}

interface TrackerData {
  interactions: InteractionRecord[];
  lastCleanup: number;
}

const MAX_RECORDS = 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let interactions: InteractionRecord[] = [];
let lastCleanup = 0;

function getDataPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'interaction-tracker.json');
}

export function loadInteractionTracker(): void {
  try {
    const dataPath = getDataPath();
    if (!fs.existsSync(dataPath)) {
      console.log('[InteractionTracker] No saved data, starting fresh');
      return;
    }

    const raw = fs.readFileSync(dataPath, 'utf-8');
    const data = JSON.parse(raw) as TrackerData;
    interactions = data.interactions || [];
    lastCleanup = data.lastCleanup || 0;

    maybeCleanup();
    console.log(`[InteractionTracker] Loaded ${interactions.length} interaction records`);
  } catch (err) {
    console.error('[InteractionTracker] Failed to load:', err);
    interactions = [];
  }
}

function saveInteractionTracker(): void {
  try {
    const dataPath = getDataPath();
    const dir = path.dirname(dataPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data: TrackerData = {
      interactions: interactions.slice(-MAX_RECORDS),
      lastCleanup,
    };

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[InteractionTracker] Failed to save:', err);
  }
}

function maybeCleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  const cutoff = now - RECORD_TTL_MS;
  const before = interactions.length;
  interactions = interactions.filter(r => r.timestamp > cutoff);
  lastCleanup = now;

  if (before !== interactions.length) {
    console.log(`[InteractionTracker] Cleaned up ${before - interactions.length} old records`);
    saveInteractionTracker();
  }
}

export function shouldCommentOnPost(postId: string, currentCommentCount: number): boolean {
  const record = interactions.find(
    r => r.postId === postId && r.type === 'comment'
  );
  
  if (!record) return true;
  
  // Re-engage if there are new comments since we last interacted
  if (record.lastSeenCommentCount !== undefined && currentCommentCount > record.lastSeenCommentCount) {
    console.log(`[InteractionTracker] Post ${postId} has new comments (${record.lastSeenCommentCount} -> ${currentCommentCount}), allowing re-engagement`);
    return true;
  }
  
  return false;
}

export function hasReactedToComment(commentId: string): boolean {
  // Reactions are one-time - you don't like the same comment twice
  return interactions.some(
    r => r.commentId === commentId && r.type === 'reaction'
  );
}

export function shouldReplyToComment(postId: string, commentId: string, isNewComment: boolean): boolean {
  const record = interactions.find(
    r => r.postId === postId && r.commentId === commentId && r.type === 'reply'
  );
  
  if (!record) return true;
  
  // If this is a new comment (wasn't there when we last checked), allow reply
  if (isNewComment) return true;
  
  return false;
}

export function getLastSeenCommentId(postId: string): string | undefined {
  const record = interactions.find(
    r => r.postId === postId && r.type === 'comment'
  );
  return record?.lastSeenCommentId;
}

export function recordComment(postId: string, commentCount: number, latestCommentId?: string): void {
  // Remove old record for this post if exists
  interactions = interactions.filter(
    r => !(r.postId === postId && r.type === 'comment')
  );
  
  interactions.push({
    postId,
    type: 'comment',
    timestamp: Date.now(),
    lastSeenCommentCount: commentCount,
    lastSeenCommentId: latestCommentId,
  });
  saveInteractionTracker();
}

export function recordReaction(postId: string, commentId: string): void {
  interactions.push({
    postId,
    type: 'reaction',
    commentId,
    timestamp: Date.now(),
  });
  saveInteractionTracker();
}

export function recordReply(postId: string, commentId: string): void {
  interactions.push({
    postId,
    type: 'reply',
    commentId,
    timestamp: Date.now(),
  });
  saveInteractionTracker();
}

export function getInteractionStats(): {
  totalComments: number;
  totalReactions: number;
  totalReplies: number;
  uniquePostsEngaged: number;
} {
  const comments = interactions.filter(r => r.type === 'comment');
  const reactions = interactions.filter(r => r.type === 'reaction');
  const replies = interactions.filter(r => r.type === 'reply');
  const uniquePosts = new Set(interactions.map(r => r.postId));

  return {
    totalComments: comments.length,
    totalReactions: reactions.length,
    totalReplies: replies.length,
    uniquePostsEngaged: uniquePosts.size,
  };
}
