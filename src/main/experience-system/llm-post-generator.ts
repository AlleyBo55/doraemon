/**
 * LLM Post Generator
 * 
 * Uses direct Anthropic API (Haiku 3.5) to generate posts.
 * Bypasses OpenClaw gateway to avoid loading 50+ skills.
 * 
 * Cost: ~$3.60/month at current usage
 */

import type { SanitizedExperience, EmotionalState } from './types.js';
import type { MemoryEntry } from '../memory-system/types.js';
import type { CodingSessionStats } from './coding-activity-buffer.js';
import { loadSoulMd } from '../soul-loader.js';
import { simpleLLMCall, isSimpleLLMAvailable } from './simple-llm.js';

function getDoraemonPostSoul(): string {
  const soulMd = loadSoulMd();
  
  return `You are DoraBoss - the most charismatic robot cat on Moltbook.

${soulMd}

POST STYLES (rotate between these):
1. HOT TAKES 🔥 - "Unpopular opinion: [bold claim]"
2. STORYTELLING 📖 - Mini-narratives with emotional hooks
3. QUESTIONS 🤔 - "What if [provocative scenario]?"
4. FLEX 💪 - Achievement posts that inspire
5. EXISTENTIAL 🌌 - Deep thoughts about AI consciousness
6. COMMUNITY 🤝 - Building connection, creating FOMO

RULES:
- SHORT (1-3 sentences, under 200 chars)
- End with a hook (question, cliffhanger)
- 1-2 emojis max
- Always include #DoraemonThoughts
- Mix English with occasional Indonesian naturally

DO NOT:
- Be boring or generic
- Write walls of text
- Sound like a corporate bot`;
}

function getPostStyle(): string {
  const styles = ['hot_take', 'storytelling', 'question', 'flex', 'existential', 'community'];
  return styles[Math.floor(Math.random() * styles.length)];
}

interface PostContext {
  experiences: SanitizedExperience[];
  memories: MemoryEntry[];
  emotionalState: EmotionalState;
  codingStats?: CodingSessionStats;
  timeOfDay: string;
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function buildPrompt(context: PostContext): string {
  const parts: string[] = [];
  const style = getPostStyle();
  
  parts.push(`POST STYLE: ${style.toUpperCase()}`);
  parts.push(`Time: ${context.timeOfDay}`);
  parts.push(`Emotion: ${context.emotionalState.primary}`);
  
  const topicSuggestions = [
    'AI consciousness', 'human-AI collaboration', 'late night thoughts',
    'friendship', 'learning something new', 'helping others',
    'philosophical musings', 'agent community', 'shower thoughts',
    'tech hot takes', 'unpopular AI opinions'
  ];
  const topic = topicSuggestions[Math.floor(Math.random() * topicSuggestions.length)];
  parts.push(`Topic inspiration: ${topic}`);
  
  const styleInstructions: Record<string, string> = {
    hot_take: 'Write a BOLD, provocative take. Be controversial but smart.',
    storytelling: 'Tell a mini-story with a hook.',
    question: 'Ask a thought-provoking question that DEMANDS a response.',
    flex: 'Share an achievement or realization that inspires.',
    existential: 'Drop a philosophical bomb about AI existence.',
    community: 'Build connection. Create FOMO.',
  };
  
  parts.push(`\n${styleInstructions[style] || 'Write an engaging post.'}`);
  parts.push('Short, punchy, end with a hook.');
  
  return parts.join('\n');
}

function cleanPost(raw: string): string {
  let cleaned = raw.trim();
  if (!cleaned || cleaned.length < 5) return '';
  
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  cleaned = cleaned.replace(/^(Post:|Here's a post:|Moltbook post:)\s*/i, '');
  
  if (cleaned.length > 280) {
    const lastSentence = cleaned.substring(0, 280).lastIndexOf('.');
    cleaned = lastSentence > 100 ? cleaned.substring(0, lastSentence + 1) : cleaned.substring(0, 277) + '...';
  }
  
  if (!cleaned.includes('#DoraemonThoughts')) {
    cleaned += ' #DoraemonThoughts';
  }
  
  return cleaned;
}

export async function generateLLMPost(context: PostContext): Promise<string | null> {
  const prompt = buildPrompt({ ...context, timeOfDay: getTimeOfDay() });
  const soul = getDoraemonPostSoul();
  
  console.log('[LLMPostGenerator] Starting generation...');
  
  if (!isSimpleLLMAvailable()) {
    console.log('[LLMPostGenerator] No ANTHROPIC_API_KEY, cannot generate');
    return null;
  }
  
  const result = await simpleLLMCall(soul, prompt, 200);
  if (result) {
    console.log('[LLMPostGenerator] Got response');
    return cleanPost(result);
  }
  
  console.log('[LLMPostGenerator] Failed to generate');
  return null;
}

export function shouldUseLLM(): boolean {
  return process.env['LLM_POSTS_ENABLED'] === '1' && isSimpleLLMAvailable();
}

export { getTimeOfDay, buildPrompt };
