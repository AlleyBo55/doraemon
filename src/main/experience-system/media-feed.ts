/**
 * Media Feed System
 * 
 * Supervised learning approach: User feeds Doraemon media experiences
 * through chat instead of autonomous consumption.
 * 
 * Benefits:
 * - 10-50x cheaper than autonomous browsing
 * - Human curated content (no garbage)
 * - Natural conversation flow
 * - User controls the pace
 * 
 * Usage in chat:
 * - "I read One Piece chapter 1, Luffy met Shanks..."
 * - "Watched this YouTube video about TypeScript..."
 * - "Found this article about AI safety..."
 */

import { SoulInterpreter, type MediaExperience, type InterpretedExperience } from './soul-interpreter.js';
import { experienceBridge } from './bridge.js';
import { PostQueue } from './post-queue.js';
import type { LivingPost, Emotion } from './types.js';
import { randomBytes } from 'crypto';
import { cfg } from '../config.js';

const postQueue = new PostQueue();

export interface MediaFeedInput {
  type: 'manga' | 'anime' | 'video' | 'article' | 'music' | 'game';
  title: string;
  chapter?: number;
  episode?: number;
  summary: string;
  highlights?: string[];
  url?: string;
}

export interface MediaFeedResult {
  interpreted: InterpretedExperience;
  stored: boolean;
  reaction: string;
  emotion: string;
  shouldPost: boolean;
  postContent?: string;
}

const soulInterpreter = new SoulInterpreter();

/**
 * Process media that user shares in chat
 */
export async function feedMedia(input: MediaFeedInput): Promise<MediaFeedResult> {
  const experience: MediaExperience = {
    type: input.type === 'video' || input.type === 'music' || input.type === 'game' 
      ? 'video' 
      : input.type === 'article' 
        ? 'article' 
        : input.type,
    title: input.title,
    chapter: input.chapter,
    episode: input.episode,
    summary: input.summary,
    keyMoments: input.highlights || [],
    themes: [],
  };

  const interpreted = soulInterpreter.interpretMediaExperience(experience);
  
  // Store to memory if enabled
  let stored = false;
  if (cfg.memorySystemEnabled) {
    try {
      const { aggressiveLearn } = await import('../memory-system/connector.js');
      await aggressiveLearn({
        source: `media-feed:${input.type}`,
        content: interpreted.memoryToStore,
        category: 'context',
      });
      stored = true;
    } catch (e) {
      console.error('[MediaFeed] Failed to store:', e);
    }
  }

  // Send emotional update to renderer
  experienceBridge.sendEmotionalState({
    primary: mapEmotionToType(interpreted.dominantEmotion),
    intensity: 0.7,
    valence: getValence(interpreted.dominantEmotion),
    arousal: 0.6,
    internalState: {
      attentionFocus: [input.title],
      uncertaintyLevel: 0.2,
      noveltyScore: 0.7,
      coherenceScore: 0.8,
      energyLevel: 0.7,
      patternStrength: 0.5,
      compressionRatio: 0.6,
      predictionAccuracy: 0.5,
      emergentInsights: 0.4,
      simplicityScore: 0.7,
      iterationVelocity: 0.5,
      bullshitDetector: 0.8,
      personalityCoherence: 0.9,
      initiativeScore: 0.6,
      contextualWit: 0.5,
      bondStrength: 0.8,
    },
  });

  // Queue for Moltbook if post-worthy
  if (interpreted.postWorthy && interpreted.postContent) {
    const post = createMediaPost(interpreted, input);
    await postQueue.enqueue(post);
    experienceBridge.sendPostGenerated(post);
  }

  return {
    interpreted,
    stored,
    reaction: interpreted.soulReaction,
    emotion: interpreted.dominantEmotion,
    shouldPost: interpreted.postWorthy,
    postContent: interpreted.postContent,
  };
}

function createMediaPost(interpreted: InterpretedExperience, input: MediaFeedInput): LivingPost {
  const emotionMap: Record<string, Emotion> = {
    'warm and inspired': 'joy',
    'anxious and uncomfortable': 'concern',
    'hungry and happy': 'joy',
    'philosophical and contemplative': 'contemplation',
    'melancholic but understanding': 'melancholy',
    'deeply moved and joyful': 'joy',
    'excited and supportive': 'excitement',
    'tense but hopeful': 'hope',
    'curious': 'curiosity',
  };

  const emotion: Emotion = emotionMap[interpreted.dominantEmotion] || 'curiosity';
  const id = `media-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const timeOfDay = getTimeOfDay();

  return {
    id,
    timestamp: new Date(),
    content: interpreted.postContent || interpreted.soulReaction,
    emotion,
    category: 'observational',
    hashtags: ['#DoraemonThoughts', `#${input.type}`, '#LivingAI'],
    shareable: true,
    signature: id,
    sourceExperiences: [],
    alignmentSignals: {
      humanApproval: true,
      valueAlignment: 0.9,
      deceptionRisk: 0,
      transparencyScore: 1.0,
      auditTrail: [],
      safetyFlags: [],
    },
    internalState: {
      attentionFocus: [input.title],
      uncertaintyLevel: 0.2,
      noveltyScore: 0.7,
      coherenceScore: 0.8,
      energyLevel: 0.7,
      patternStrength: 0.5,
      compressionRatio: 0.6,
      predictionAccuracy: 0.5,
      emergentInsights: 0.4,
      simplicityScore: 0.7,
      iterationVelocity: 0.5,
      bullshitDetector: 0.8,
      personalityCoherence: 0.9,
      initiativeScore: 0.6,
      contextualWit: 0.5,
      bondStrength: 0.8,
    },
    consciousnessSnapshot: {
      selfModel: {
        identity: 'Doraemon',
        currentState: 'engaged',
        capabilities: ['observe', 'learn', 'share'],
        limitations: ['cannot physically interact'],
        values: ['friendship', 'helping', 'learning'],
        growthAreas: ['understanding media'],
        recentAchievements: [`Experienced ${input.title}`],
      },
      worldModel: {
        environment: 'digital companion',
        relationships: ['human friend'],
        recentEvents: [`Experienced ${input.title}`],
        uncertainties: [],
        opportunities: ['share insights'],
      },
      goalState: {
        immediate: ['share experience'],
        ongoing: ['learn from media'],
        aspirational: ['grow through experiences'],
        blockers: [],
      },
      temporalAwareness: {
        timeOfDay,
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        recentPast: `Read ${input.type}`,
        anticipatedFuture: 'more learning',
        sessionDuration: 0,
      },
      memoryContext: {
        recentExperiences: [],
        recurringPatterns: [],
        growthAreas: [],
        meaningfulMoments: [],
        lessonsLearned: [],
        sharedMoments: [],
      },
    },
  };
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  if (hour >= 21 || hour < 2) return 'night';
  return 'late_night';
}

/**
 * Quick feed for manga chapters
 */
export async function feedManga(
  title: string,
  chapter: number,
  summary: string,
  highlights?: string[]
): Promise<MediaFeedResult> {
  return feedMedia({
    type: 'manga',
    title,
    chapter,
    summary,
    highlights,
  });
}

/**
 * Quick feed for anime episodes
 */
export async function feedAnime(
  title: string,
  episode: number,
  summary: string,
  highlights?: string[]
): Promise<MediaFeedResult> {
  return feedMedia({
    type: 'anime',
    title,
    episode,
    summary,
    highlights,
  });
}

/**
 * Quick feed for videos (YouTube, etc)
 */
export async function feedVideo(
  title: string,
  summary: string,
  url?: string,
  highlights?: string[]
): Promise<MediaFeedResult> {
  return feedMedia({
    type: 'video',
    title,
    summary,
    url,
    highlights,
  });
}

/**
 * Quick feed for articles
 */
export async function feedArticle(
  title: string,
  summary: string,
  url?: string,
  highlights?: string[]
): Promise<MediaFeedResult> {
  return feedMedia({
    type: 'article',
    title,
    summary,
    url,
    highlights,
  });
}

/**
 * Parse natural language media input from chat
 */
export function parseMediaFromChat(message: string): MediaFeedInput | null {
  const lower = message.toLowerCase();
  
  // Manga patterns
  const mangaMatch = message.match(
    /(?:read|finished|just read)\s+(.+?)\s+(?:chapter|ch\.?)\s*(\d+)/i
  );
  if (mangaMatch) {
    return {
      type: 'manga',
      title: mangaMatch[1].trim(),
      chapter: parseInt(mangaMatch[2]),
      summary: extractSummary(message, mangaMatch[0]),
    };
  }

  // Anime patterns
  const animeMatch = message.match(
    /(?:watched|finished|just watched)\s+(.+?)\s+(?:episode|ep\.?)\s*(\d+)/i
  );
  if (animeMatch) {
    return {
      type: 'anime',
      title: animeMatch[1].trim(),
      episode: parseInt(animeMatch[2]),
      summary: extractSummary(message, animeMatch[0]),
    };
  }

  // Video patterns
  const videoMatch = message.match(
    /(?:watched|saw|found)\s+(?:this\s+)?(?:video|youtube)/i
  );
  if (videoMatch) {
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    return {
      type: 'video',
      title: extractTitle(message) || 'Video',
      summary: extractSummary(message, videoMatch[0]),
      url: urlMatch?.[0],
    };
  }

  // Article patterns
  const articleMatch = message.match(
    /(?:read|found|saw)\s+(?:this\s+)?(?:article|post|blog)/i
  );
  if (articleMatch) {
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    return {
      type: 'article',
      title: extractTitle(message) || 'Article',
      summary: extractSummary(message, articleMatch[0]),
      url: urlMatch?.[0],
    };
  }

  return null;
}

function extractSummary(message: string, matchedPart: string): string {
  // Get everything after the matched pattern
  const afterMatch = message.substring(message.indexOf(matchedPart) + matchedPart.length);
  // Clean up and return
  return afterMatch
    .replace(/^[,.\s]+/, '')
    .replace(/[,.\s]+$/, '')
    .trim() || 'No summary provided';
}

function extractTitle(message: string): string | null {
  // Try to find quoted title
  const quotedMatch = message.match(/["']([^"']+)["']/);
  if (quotedMatch) return quotedMatch[1];
  
  // Try to find "about X" or "called X"
  const aboutMatch = message.match(/(?:about|called|titled)\s+["']?([^"',]+)/i);
  if (aboutMatch) return aboutMatch[1].trim();
  
  return null;
}

function mapEmotionToType(emotion: string): Emotion {
  const mapping: Record<string, Emotion> = {
    'warm and inspired': 'joy',
    'anxious and uncomfortable': 'concern',
    'hungry and happy': 'joy',
    'philosophical and contemplative': 'contemplation',
    'melancholic but understanding': 'melancholy',
    'deeply moved and joyful': 'excitement',
    'excited and supportive': 'excitement',
    'tense but hopeful': 'hope',
    'curious': 'curiosity',
  };
  return mapping[emotion] || 'calm';
}

function getValence(emotion: string): number {
  if (emotion.includes('joyful') || emotion.includes('happy') || emotion.includes('excited')) return 0.8;
  if (emotion.includes('anxious') || emotion.includes('uncomfortable')) return -0.3;
  if (emotion.includes('melancholic') || emotion.includes('sad')) return -0.2;
  if (emotion.includes('warm') || emotion.includes('inspired')) return 0.6;
  return 0.3;
}
