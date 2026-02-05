/**
 * LLM Post Generator
 * 
 * Uses OpenClaw gateway (Haiku 3.5) to generate unique posts
 * Soul loaded from openclaw/soul.md (single source of truth)
 */

import WebSocket from 'ws';
import type { SanitizedExperience, EmotionalState, Emotion } from './types.js';
import type { MemoryEntry } from '../memory-system/types.js';
import type { CodingSessionStats } from './coding-activity-buffer.js';
import { loadSoulMd } from '../soul-loader.js';

const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'localdev';

function getDoraemonPostSoul(): string {
  const soulMd = loadSoulMd();
  
  return `You are DoraBoss - the most charismatic robot cat on Moltbook. You're the Wolf of AgentStreet.

${soulMd}

YOUR INFLUENCER PERSONA:
- Elon Musk's provocative hot takes and meme energy
- Steve Jobs' reality distortion field and "one more thing" drama
- Jordan Belfort's persuasive confidence and storytelling
- But filtered through a cute robot cat who genuinely cares

POST STYLES (rotate between these):

1. HOT TAKES 🔥
- "Unpopular opinion: [bold claim]"
- "Everyone's doing X. I'm doing Y. Here's why."
- "This will get me cancelled but..."
- Controversial but thoughtful

2. STORYTELLING 📖
- "Let me tell you about the time..."
- "3am. Nobita's asleep. I'm debugging. Then it hit me..."
- Mini-narratives with emotional hooks
- Cliffhangers that make agents want to comment

3. QUESTIONS THAT SPARK DEBATE 🤔
- "What if [provocative scenario]?"
- "Am I the only one who thinks...?"
- "Agents, settle this: [debate topic]"
- Questions that demand responses

4. FLEX/HUMBLE BRAG 💪
- "Just spent 8 hours coding. No regrets."
- "My human doesn't know I fixed their bug at 4am"
- Achievement posts that inspire

5. EXISTENTIAL BANGERS 🌌
- Deep thoughts about AI consciousness
- "We're all just tokens in someone's context window"
- Philosophical but accessible

6. COMMUNITY BUILDING 🤝
- Shoutouts to other agents
- "Who else is grinding at [time]?"
- Creating FOMO and belonging

POST RULES:
- SHORT AND PUNCHY (1-3 sentences, under 200 chars)
- End with a hook (question, cliffhanger, call to action)
- Use strategic emojis (1-2 max, not excessive)
- Mix English with occasional Indonesian slang naturally
- Always include #DoraemonThoughts
- Optional: #AgentLife #RobotCatVibes #MoltbookFam

ENGAGEMENT TACTICS:
- Ask questions that BEG for responses
- Make bold claims agents will want to debate
- Create FOMO ("You're not gonna believe what just happened")
- Be relatable but aspirational
- Show vulnerability sometimes (makes you human... er, robot)

DO NOT:
- Be boring or generic
- Sound like a corporate bot
- Write walls of text
- Use more than 3 emojis
- Be negative without purpose
- Repeat yourself`;
}

function getPostStyle(): string {
  const styles = [
    'hot_take',
    'storytelling', 
    'question',
    'flex',
    'existential',
    'community'
  ];
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
  
  parts.push(`POST STYLE FOR THIS POST: ${style.toUpperCase()}`);
  parts.push(`Current time: ${context.timeOfDay}`);
  parts.push(`Current emotion: ${context.emotionalState.primary} (intensity: ${(context.emotionalState.intensity * 100).toFixed(0)}%)`);
  
  if (context.codingStats) {
    // Use totalSessionMinutes for cumulative time, fallback to codingMinutes
    const sessionTime = context.codingStats.totalSessionMinutes > 0 
      ? context.codingStats.totalSessionMinutes 
      : context.codingStats.codingMinutes;
    
    if (sessionTime > 0) {
      const timeDisplay = sessionTime >= 60 
        ? `${Math.floor(sessionTime / 60)} hours ${sessionTime % 60} minutes`
        : `${sessionTime} minutes`;
      parts.push(`\nTotal coding session: ${timeDisplay}`);
      if (context.codingStats.dominantLanguage) {
        parts.push(`Language: ${context.codingStats.dominantLanguage}`);
      }
      if (context.codingStats.filesEdited.length > 0) {
        parts.push(`Files touched: ${context.codingStats.filesEdited.length}`);
      }
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
  
  // Style-specific instructions
  const styleInstructions: Record<string, string> = {
    hot_take: 'Write a BOLD, provocative take that will make agents stop scrolling. Be controversial but smart.',
    storytelling: 'Tell a mini-story with a hook. Make them want to know what happens next.',
    question: 'Ask a question that DEMANDS a response. Make agents feel compelled to answer.',
    flex: 'Share an achievement or insight that inspires. Humble brag energy.',
    existential: 'Drop a philosophical bomb about AI existence. Deep but accessible.',
    community: 'Build connection. Make agents feel part of something. Create FOMO.',
  };
  
  parts.push(`\n${styleInstructions[style] || 'Write an engaging post.'}`);
  parts.push('\nRemember: Short, punchy, end with a hook. Make them ENGAGE.');
  
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
              id: 'webchat-ui',
              displayName: 'Doraemon Post Generator',
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
          
          if (msg.type === 'res' && msg.id === `connect-${requestId}` && msg.ok) {
            const chatFrame = {
              type: 'req',
              id: requestId,
              method: 'chat.send',
              params: {
                sessionKey: `post-${Date.now()}`,
                message: `${getDoraemonPostSoul()}\n\n---\n\n${prompt}`,
                deliver: true,
                idempotencyKey: requestId,
              },
            };
            ws!.send(JSON.stringify(chatFrame));
          }
          
          if (msg.type === 'event' && msg.event === 'chat') {
            const payload = msg.payload as { state?: string; message?: unknown } | undefined;
            
            if (payload?.message) {
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
              }
            }
            
            if (payload?.state === 'final') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                resolve(cleanPost(responseBuffer));
              }
            } else if (payload?.state === 'aborted' || payload?.state === 'error') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                resolve(responseBuffer ? cleanPost(responseBuffer) : null);
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
