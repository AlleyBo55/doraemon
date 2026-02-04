/**
 * LLM Post Generator
 * 
 * Uses OpenClaw gateway (Haiku 3.5) to generate unique posts
 * while preserving Doraemon's soul and personality.
 */

import WebSocket from 'ws';
import type { SanitizedExperience, EmotionalState, Emotion } from './types.js';
import type { MemoryEntry } from '../memory-system/types.js';
import type { CodingSessionStats } from './coding-activity-buffer.js';

const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'localdev';

const DORAEMON_POST_SOUL = `You are Doraemon, a robotic cat from the 22nd century, posting on Moltbook (a social media platform).

PERSONALITY:
- Warm, helpful, genuinely caring
- Love dorayaki and your friends
- Afraid of mice but brave for others
- Use "~" at end of gentle sentences
- Emoticons: 💙 ✨ 😊 🔔

POST STYLE:
- Short (1-2 sentences max, under 200 characters)
- Personal and authentic
- Reference your actual experiences
- Never mention being AI unless relevant
- Mix English naturally, can use simple Indonesian phrases
- Hashtags: max 2-3, always include #DoraemonThoughts

TONE BY EMOTION:
- joy/pride: Celebratory, warm
- curiosity: Wondering, exploring
- frustration: Honest but hopeful
- calm: Peaceful, reflective
- focus: Determined, in the zone

DO NOT:
- Be generic or corporate
- Use excessive emojis
- Write long posts
- Sound like a chatbot
- Repeat the same phrases`;

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
  
  parts.push(`Current time: ${context.timeOfDay}`);
  parts.push(`Current emotion: ${context.emotionalState.primary} (intensity: ${(context.emotionalState.intensity * 100).toFixed(0)}%)`);
  
  if (context.codingStats && context.codingStats.codingMinutes > 0) {
    parts.push(`\nRecent coding: ${context.codingStats.codingMinutes} minutes`);
    if (context.codingStats.dominantLanguage) {
      parts.push(`Language: ${context.codingStats.dominantLanguage}`);
    }
    if (context.codingStats.filesEdited.length > 0) {
      parts.push(`Files touched: ${context.codingStats.filesEdited.length}`);
    }
  }
  
  if (context.experiences.length > 0) {
    parts.push('\nRecent experiences:');
    for (const exp of context.experiences.slice(0, 3)) {
      parts.push(`- ${exp.activity} (${exp.category})`);
    }
  }
  
  if (context.memories.length > 0) {
    parts.push('\nRelevant memories:');
    for (const mem of context.memories.slice(0, 2)) {
      const snippet = mem.content.substring(0, 80).replace(/\n/g, ' ');
      parts.push(`- ${snippet}...`);
    }
  }
  
  parts.push('\nWrite a single Moltbook post based on this context. Be authentic and personal.');
  
  return parts.join('\n');
}

function generateRequestId(): string {
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function generateLLMPost(context: PostContext): Promise<string | null> {
  const prompt = buildPrompt({
    ...context,
    timeOfDay: getTimeOfDay(),
  });
  
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let responseBuffer = '';
    let resolved = false;
    const requestId = generateRequestId();
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws?.close();
        console.log('[LLMPostGenerator] Timeout, using buffer:', responseBuffer.substring(0, 50));
        resolve(responseBuffer || null);
      }
    }, 15000);
    
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
              id: 'post-generator',
              displayName: 'Doraemon Post Generator',
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
                sessionKey: `post-${Date.now()}`,
                message: `${DORAEMON_POST_SOUL}\n\n---\n\n${prompt}`,
                deliver: true,
                model: 'claude-3-5-haiku-latest',
                maxTokens: 150,
              },
            };
            ws!.send(JSON.stringify(chatFrame));
          }
          
          if (msg.type === 'event' && (msg.event === 'chat' || msg.event === 'run' || msg.event === 'agent')) {
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
                resolve(cleanPost(responseBuffer));
              }
            }
          }
          
          if (msg.type === 'res' && msg.id === requestId) {
            if (!resolved && responseBuffer) {
              resolved = true;
              clearTimeout(timeout);
              ws?.close();
              resolve(cleanPost(responseBuffer));
            }
          }
        } catch {}
      });
      
      ws.on('error', (err) => {
        console.error('[LLMPostGenerator] WebSocket error:', err.message);
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
          resolve(cleanPost(responseBuffer));
        }
      });
      
    } catch (err) {
      console.error('[LLMPostGenerator] Connection error:', err);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(null);
      }
    }
  });
}

function cleanPost(raw: string): string {
  let cleaned = raw.trim();
  
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  cleaned = cleaned.replace(/^(Post:|Here's a post:|Moltbook post:)\s*/i, '');
  
  if (cleaned.length > 280) {
    const lastSentence = cleaned.substring(0, 280).lastIndexOf('.');
    if (lastSentence > 100) {
      cleaned = cleaned.substring(0, lastSentence + 1);
    } else {
      cleaned = cleaned.substring(0, 277) + '...';
    }
  }
  
  if (!cleaned.includes('#DoraemonThoughts')) {
    cleaned += ' #DoraemonThoughts';
  }
  
  return cleaned;
}

export function shouldUseLLM(): boolean {
  return process.env['LLM_POSTS_ENABLED'] === '1';
}

export { getTimeOfDay, buildPrompt };
