/**
 * Autonomous Learning System
 * 
 * FREE autonomous learning from:
 * 1. macOS Activity Logs (native apps)
 * 2. Browser Extension (whitelisted sites)
 * 3. Editor Activity (VS Code, Kiro)
 * 
 * NO LLM CALLS = $0 token cost for observation
 * LLM only used for:
 * - Generating posts (optional, ~100-200 tokens)
 * - Semantic search embeddings (optional, ~50 tokens)
 * 
 * Token Cost Breakdown:
 * ┌─────────────────────────────────────────────────────────┐
 * │ Activity                    │ Tokens │ Cost/day        │
 * ├─────────────────────────────────────────────────────────┤
 * │ Browser watching            │ 0      │ $0 (local only) │
 * │ App activity logs           │ 0      │ $0 (local only) │
 * │ Editor watching             │ 0      │ $0 (local only) │
 * │ Memory storage              │ 0      │ $0 (SQLite)     │
 * │ ─────────────────────────── │ ────── │ ─────────────── │
 * │ Post generation (optional)  │ ~150   │ ~$0.01/post     │
 * │ Embeddings (optional)       │ ~50    │ ~$0.001/embed   │
 * │ ─────────────────────────── │ ────── │ ─────────────── │
 * │ TOTAL (8 posts/day)         │ ~1600  │ ~$0.10/day      │
 * │ TOTAL (no posts)            │ 0      │ $0/day          │
 * └─────────────────────────────────────────────────────────┘
 */

import { SoulInterpreter, type MediaExperience } from './soul-interpreter.js';
import { experienceBridge } from './bridge.js';

export interface AutonomousLearningStats {
  browserEvents: number;
  appEvents: number;
  editorEvents: number;
  memoriesStored: number;
  postsGenerated: number;
  tokensUsed: number;
  estimatedCost: number;
}

export interface BrowsingSession {
  domain: string;
  category: string;
  startTime: Date;
  endTime?: Date;
  pageViews: number;
  contentSummary: string[];
}

const stats: AutonomousLearningStats = {
  browserEvents: 0,
  appEvents: 0,
  editorEvents: 0,
  memoriesStored: 0,
  postsGenerated: 0,
  tokensUsed: 0,
  estimatedCost: 0,
};

const activeSessions: Map<string, BrowsingSession> = new Map();
const soulInterpreter = new SoulInterpreter();

const TOKEN_COSTS = {
  postGeneration: 150,
  embedding: 50,
  pricePerMillionTokens: 0.25, // Haiku pricing
};

/**
 * Process browser content from extension (FREE - no LLM)
 */
export async function processBrowserContent(data: {
  source: string;
  contentType: string;
  content: string;
  title?: string;
  url?: string;
}): Promise<void> {
  stats.browserEvents++;
  
  // Update or create session
  let session = activeSessions.get(data.source);
  if (!session) {
    session = {
      domain: data.source,
      category: getCategoryFromSource(data.source),
      startTime: new Date(),
      pageViews: 0,
      contentSummary: [],
    };
    activeSessions.set(data.source, session);
  }
  
  session.pageViews++;
  session.endTime = new Date();
  
  // Store content summary (max 5 per session)
  if (data.content && session.contentSummary.length < 5) {
    session.contentSummary.push(data.content.substring(0, 100));
  }
  
  // Store to memory (FREE - local SQLite)
  if (process.env['MEMORY_SYSTEM_ENABLED'] === '1') {
    try {
      const { aggressiveLearn } = await import('../memory-system/connector.js');
      await aggressiveLearn({
        source: `browser:${data.source}`,
        content: formatBrowsingContent(data),
        category: 'context',
      });
      stats.memoriesStored++;
    } catch (e) {
      console.error('[AutonomousLearning] Memory store failed:', e);
    }
  }
  
  // Send thought to UI (FREE - no LLM)
  experienceBridge.sendBrowsingThought(data.source, session.category);
}

/**
 * Process app activity from macOS logs (FREE - no LLM)
 */
export async function processAppActivity(data: {
  app: string;
  action: string;
  details?: string;
}): Promise<void> {
  stats.appEvents++;
  
  if (process.env['MEMORY_SYSTEM_ENABLED'] === '1') {
    try {
      const { aggressiveLearn } = await import('../memory-system/connector.js');
      await aggressiveLearn({
        source: `app:${data.app}`,
        content: `Used ${data.app}: ${data.action}${data.details ? ` - ${data.details}` : ''}`,
        category: 'context',
      });
      stats.memoriesStored++;
    } catch (e) {
      console.error('[AutonomousLearning] App activity store failed:', e);
    }
  }
}

/**
 * Process editor activity (FREE - no LLM)
 */
export async function processEditorActivity(data: {
  editor: string;
  action: string;
  file?: string;
  language?: string;
}): Promise<void> {
  stats.editorEvents++;
  
  if (process.env['MEMORY_SYSTEM_ENABLED'] === '1') {
    try {
      const { aggressiveLearn } = await import('../memory-system/connector.js');
      await aggressiveLearn({
        source: `editor:${data.editor}`,
        content: formatEditorContent(data),
        category: 'context',
      });
      stats.memoriesStored++;
    } catch (e) {
      console.error('[AutonomousLearning] Editor activity store failed:', e);
    }
  }
}

/**
 * Generate a post from accumulated experiences (COSTS TOKENS)
 */
export async function generateAutonomousPost(): Promise<{
  content: string;
  tokensUsed: number;
  cost: number;
} | null> {
  // Collect recent sessions
  const recentSessions = Array.from(activeSessions.values())
    .filter(s => s.endTime && (Date.now() - s.endTime.getTime()) < 60 * 60 * 1000);
  
  if (recentSessions.length === 0) return null;
  
  // Pick most active session
  const topSession = recentSessions.sort((a, b) => b.pageViews - a.pageViews)[0];
  
  // Create media experience for soul interpretation
  const experience: MediaExperience = {
    type: 'article',
    title: `Browsing ${topSession.domain}`,
    summary: topSession.contentSummary.join('. '),
    keyMoments: topSession.contentSummary.slice(0, 3),
    themes: [topSession.category],
  };
  
  const interpreted = soulInterpreter.interpretMediaExperience(experience);
  
  if (interpreted.postWorthy && interpreted.postContent) {
    stats.postsGenerated++;
    stats.tokensUsed += TOKEN_COSTS.postGeneration;
    stats.estimatedCost = (stats.tokensUsed / 1_000_000) * TOKEN_COSTS.pricePerMillionTokens;
    
    return {
      content: interpreted.postContent,
      tokensUsed: TOKEN_COSTS.postGeneration,
      cost: (TOKEN_COSTS.postGeneration / 1_000_000) * TOKEN_COSTS.pricePerMillionTokens,
    };
  }
  
  return null;
}

/**
 * Get current stats
 */
export function getAutonomousLearningStats(): AutonomousLearningStats {
  return { ...stats };
}

/**
 * Get active browsing sessions
 */
export function getActiveSessions(): BrowsingSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Clear old sessions (call periodically)
 */
export function cleanupSessions(maxAgeMinutes = 60): void {
  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
  
  for (const [key, session] of activeSessions) {
    if (session.endTime && session.endTime.getTime() < cutoff) {
      activeSessions.delete(key);
    }
  }
}

/**
 * Reset daily stats
 */
export function resetDailyStats(): void {
  stats.browserEvents = 0;
  stats.appEvents = 0;
  stats.editorEvents = 0;
  stats.memoriesStored = 0;
  stats.postsGenerated = 0;
  stats.tokensUsed = 0;
  stats.estimatedCost = 0;
}

// Helper functions

function getCategoryFromSource(source: string): string {
  const categories: Record<string, string> = {
    twitter: 'social',
    reddit: 'social',
    youtube: 'entertainment',
    github: 'dev',
    hackernews: 'dev',
    stackoverflow: 'dev',
    manga: 'entertainment',
    news: 'news',
    dev: 'dev',
    moltbook: 'personal',
  };
  return categories[source] || 'general';
}

function formatBrowsingContent(data: {
  source: string;
  contentType: string;
  content: string;
  title?: string;
}): string {
  const parts: string[] = [];
  
  switch (data.contentType) {
    case 'tweet_feed':
      parts.push(`Scrolling Twitter: ${data.content}`);
      break;
    case 'reddit_posts':
      parts.push(`Reading Reddit: ${data.content}`);
      break;
    case 'youtube_video':
      parts.push(`Watching YouTube: ${data.content}`);
      break;
    case 'github_repo':
      parts.push(`Exploring GitHub: ${data.content}`);
      break;
    case 'hackernews':
      parts.push(`Reading HN: ${data.content}`);
      break;
    case 'article':
      parts.push(`Reading article: ${data.content}`);
      break;
    case 'manga':
      parts.push(`Reading manga: ${data.content}`);
      break;
    default:
      parts.push(`Browsing ${data.source}: ${data.content}`);
  }
  
  return parts.join(' ');
}

function formatEditorContent(data: {
  editor: string;
  action: string;
  file?: string;
  language?: string;
}): string {
  const parts: string[] = [`Coding in ${data.editor}`];
  
  if (data.language) parts.push(`(${data.language})`);
  if (data.action) parts.push(`- ${data.action}`);
  if (data.file) parts.push(`on ${data.file}`);
  
  return parts.join(' ');
}
