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
  if (process.env['MEMORY_SYSTEM_ENABLED'] === '1') {
    try {
      const { learn } = await import('../memory-system/connector.js');
      await learn({
        source: `media-feed:${input.type}`,
        content: interpreted.memoryToStore,
        context: {
          type: input.type,
          title: input.title,
          chapter: input.chapter,
          episode: input.episode,
          url: input.url,
          emotion: interpreted.dominantEmotion,
        },
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

  return {
    interpreted,
    stored,
    reaction: interpreted.soulReaction,
    emotion: interpreted.dominantEmotion,
    shouldPost: interpreted.postWorthy,
    postContent: interpreted.postContent,
  };
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

function mapEmotionToType(emotion: string): string {
  const mapping: Record<string, string> = {
    'warm and inspired': 'happy',
    'anxious and uncomfortable': 'anxious',
    'hungry and happy': 'happy',
    'philosophical and contemplative': 'thinking',
    'melancholic but understanding': 'sad',
    'deeply moved and joyful': 'excited',
    'excited and supportive': 'excited',
    'tense but hopeful': 'determined',
    'curious': 'curious',
  };
  return mapping[emotion] || 'neutral';
}

function getValence(emotion: string): number {
  if (emotion.includes('joyful') || emotion.includes('happy') || emotion.includes('excited')) return 0.8;
  if (emotion.includes('anxious') || emotion.includes('uncomfortable')) return -0.3;
  if (emotion.includes('melancholic') || emotion.includes('sad')) return -0.2;
  if (emotion.includes('warm') || emotion.includes('inspired')) return 0.6;
  return 0.3;
}
