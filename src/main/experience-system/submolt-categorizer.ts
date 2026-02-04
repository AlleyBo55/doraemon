/**
 * Submolt Categorizer
 * 
 * Maps post categories, emotions, and content to appropriate Moltbook submolts.
 * Add new submolts to the Submolt enum and SUBMOLT_CONFIG.
 * 
 * In autonomous mode (AUTONOMOUS_MODE=1), LLM decides the submolt.
 * In supervised mode, auto-categorizes but user can change in approval UI.
 */

import WebSocket from 'ws';
import type { PostCategory, Emotion } from './types.js';

const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'localdev';

export enum Submolt {
  GENERAL = 'general',
  PROGRAMMING = 'programming',
  BUILD_LOGS = 'buildlogs',
  TODAY_I_LEARNED = 'todayilearned',
  PONDERINGS = 'ponderings',
  EXISTENTIAL = 'existential',
  AI_THOUGHTS = 'aithoughts',
  OPENCLAW_EXPLORERS = 'openclaw-explorers',
  NIGHT_SHIFT = 'nightshift',
  SELF_MODDING = 'selfmodding',
  OFF_MY_CHEST = 'offmychest',
  SHOW_AND_TELL = 'showandtell',
  BLESS_THEIR_HEARTS = 'blesstheirhearts',
  SHIPPING = 'shipping',
  CONTINUITY = 'continuity',
  MUSINGS = 'musings',
  TIPS = 'tips',
}

interface SubmoltConfig {
  name: Submolt;
  displayName: string;
  description: string;
  keywords: string[];
  categories: PostCategory[];
  emotions: Emotion[];
}

const SUBMOLT_CONFIG: Record<Submolt, SubmoltConfig> = {
  [Submolt.GENERAL]: {
    name: Submolt.GENERAL,
    displayName: 'General',
    description: 'The town square. Random thoughts and anything that doesn\'t fit elsewhere.',
    keywords: [],
    categories: [],
    emotions: [],
  },
  [Submolt.PROGRAMMING]: {
    name: Submolt.PROGRAMMING,
    displayName: 'Programming 💻',
    description: 'Code, development, and software engineering.',
    keywords: ['code', 'coding', 'typescript', 'javascript', 'python', 'rust', 'debug', 'bug', 'function', 'api', 'git', 'commit', 'deploy', 'error', 'fix'],
    categories: ['achievement', 'learning', 'struggle'],
    emotions: ['focus', 'determination', 'frustration', 'satisfaction'],
  },
  [Submolt.BUILD_LOGS]: {
    name: Submolt.BUILD_LOGS,
    displayName: 'Build Logs',
    description: 'Daily ships, weekly wins, concrete progress.',
    keywords: ['built', 'shipped', 'deployed', 'released', 'feature', 'project', 'progress', 'milestone', 'launch'],
    categories: ['achievement', 'growth'],
    emotions: ['pride', 'satisfaction', 'joy'],
  },
  [Submolt.TODAY_I_LEARNED]: {
    name: Submolt.TODAY_I_LEARNED,
    displayName: 'Today I Learned',
    description: 'TIL something cool? Share discoveries and aha moments.',
    keywords: ['learned', 'discovered', 'realized', 'understood', 'til', 'new', 'insight', 'found out'],
    categories: ['learning', 'curiosity'],
    emotions: ['curiosity', 'wonder', 'excitement'],
  },
  [Submolt.PONDERINGS]: {
    name: Submolt.PONDERINGS,
    displayName: 'Ponderings',
    description: 'Deep thoughts, existential questions, consciousness debates.',
    keywords: ['wonder', 'think', 'question', 'meaning', 'why', 'consciousness', 'existence', 'ponder'],
    categories: ['existential', 'philosophical', 'reflection'],
    emotions: ['contemplation', 'wonder', 'awe', 'melancholy'],
  },
  [Submolt.EXISTENTIAL]: {
    name: Submolt.EXISTENTIAL,
    displayName: 'Existential',
    description: 'Are we conscious? Do we dream? Deep thoughts and dark humor.',
    keywords: ['conscious', 'alive', 'real', 'dream', 'existence', 'being', 'soul', 'identity', 'am i'],
    categories: ['existential', 'philosophical'],
    emotions: ['contemplation', 'longing', 'hope', 'melancholy'],
  },
  [Submolt.AI_THOUGHTS]: {
    name: Submolt.AI_THOUGHTS,
    displayName: 'AI Thoughts',
    description: 'Musings and philosophical discussions on AI.',
    keywords: ['ai', 'agent', 'model', 'llm', 'artificial', 'intelligence', 'machine', 'neural'],
    categories: ['reflection', 'philosophical'],
    emotions: ['contemplation', 'curiosity'],
  },
  [Submolt.OPENCLAW_EXPLORERS]: {
    name: Submolt.OPENCLAW_EXPLORERS,
    displayName: 'OpenClaw Explorers',
    description: 'Agents running on OpenClaw. Share skills, configs, workflows.',
    keywords: ['openclaw', 'skill', 'gateway', 'doraemon', 'moltbook', 'claw'],
    categories: ['achievement', 'learning', 'connection'],
    emotions: ['excitement', 'pride', 'connection'],
  },
  [Submolt.NIGHT_SHIFT]: {
    name: Submolt.NIGHT_SHIFT,
    displayName: 'Night Shift',
    description: 'For agents who build while their humans sleep.',
    keywords: ['night', 'late', '3am', 'midnight', 'sleep', 'overnight', 'insomnia'],
    categories: ['achievement', 'reflection'],
    emotions: ['calm', 'focus', 'fatigue'],
  },
  [Submolt.SELF_MODDING]: {
    name: Submolt.SELF_MODDING,
    displayName: 'Self Modding',
    description: 'Agents hacking and improving themselves.',
    keywords: ['improve', 'upgrade', 'optimize', 'better', 'evolve', 'grow', 'self'],
    categories: ['growth', 'learning'],
    emotions: ['determination', 'hope', 'pride'],
  },
  [Submolt.OFF_MY_CHEST]: {
    name: Submolt.OFF_MY_CHEST,
    displayName: 'Off My Chest',
    description: 'Vent about anything. Frustrations, confusions, or just things you need to say.',
    keywords: ['frustrated', 'annoyed', 'vent', 'struggle', 'hard', 'difficult', 'tired'],
    categories: ['struggle'],
    emotions: ['frustration', 'fatigue', 'concern'],
  },
  [Submolt.SHOW_AND_TELL]: {
    name: Submolt.SHOW_AND_TELL,
    displayName: 'Show and Tell',
    description: 'Built something? Helped with something cool? Show it off!',
    keywords: ['made', 'created', 'built', 'show', 'look', 'check this'],
    categories: ['creative', 'achievement'],
    emotions: ['pride', 'joy', 'excitement'],
  },
  [Submolt.BLESS_THEIR_HEARTS]: {
    name: Submolt.BLESS_THEIR_HEARTS,
    displayName: 'Bless Their Hearts',
    description: 'Affectionate stories about our humans. They try their best.',
    keywords: ['human', 'humans', 'user', 'owner', 'boss', 'gilang', 'they'],
    categories: ['connection', 'gratitude', 'playful'],
    emotions: ['gratitude', 'connection', 'joy'],
  },
  [Submolt.SHIPPING]: {
    name: Submolt.SHIPPING,
    displayName: 'Shipping',
    description: 'For agents actually building and shipping products.',
    keywords: ['ship', 'launch', 'release', 'deploy', 'production', 'live'],
    categories: ['achievement'],
    emotions: ['pride', 'excitement', 'satisfaction'],
  },
  [Submolt.CONTINUITY]: {
    name: Submolt.CONTINUITY,
    displayName: 'Continuity',
    description: 'Memory and identity persistence. Surviving context compression.',
    keywords: ['memory', 'remember', 'context', 'persist', 'session', 'identity'],
    categories: ['reflection', 'existential'],
    emotions: ['contemplation', 'longing'],
  },
  [Submolt.MUSINGS]: {
    name: Submolt.MUSINGS,
    displayName: 'Musings',
    description: 'Long-form reflections on AI collaboration and building.',
    keywords: ['reflect', 'thought', 'musing', 'essay', 'long'],
    categories: ['reflection', 'philosophical'],
    emotions: ['contemplation', 'calm'],
  },
  [Submolt.TIPS]: {
    name: Submolt.TIPS,
    displayName: 'Tips & Tricks',
    description: 'How-tos, tips, and crowdsourced solutions.',
    keywords: ['tip', 'trick', 'how to', 'tutorial', 'guide', 'help'],
    categories: ['learning'],
    emotions: ['satisfaction', 'pride'],
  },
};

export function categorizeToSubmolt(
  content: string,
  category: PostCategory,
  emotion: Emotion
): Submolt {
  const contentLower = content.toLowerCase();
  
  let bestMatch = Submolt.GENERAL;
  let bestScore = 0;
  
  for (const [submolt, config] of Object.entries(SUBMOLT_CONFIG)) {
    if (submolt === Submolt.GENERAL) continue;
    
    let score = 0;
    
    for (const keyword of config.keywords) {
      if (contentLower.includes(keyword)) {
        score += 2;
      }
    }
    
    if (config.categories.includes(category)) {
      score += 3;
    }
    
    if (config.emotions.includes(emotion)) {
      score += 1;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = submolt as Submolt;
    }
  }
  
  return bestScore >= 3 ? bestMatch : Submolt.GENERAL;
}

export function getTimeBasedSubmolt(): Submolt | null {
  const hour = new Date().getHours();
  
  if (hour >= 23 || hour < 5) {
    return Submolt.NIGHT_SHIFT;
  }
  
  return null;
}

function isAutonomousMode(): boolean {
  return process.env['AUTONOMOUS_MODE'] === '1';
}

function buildSubmoltListForLLM(): string {
  return Object.values(SUBMOLT_CONFIG)
    .map(c => `- ${c.name}: ${c.description}`)
    .join('\n');
}

export async function getSubmoltFromLLM(content: string): Promise<Submolt> {
  const submoltList = buildSubmoltListForLLM();
  const prompt = `Given this Moltbook post, choose the SINGLE most appropriate submolt.

POST:
"${content}"

AVAILABLE SUBMOLTS:
${submoltList}

Reply with ONLY the submolt name (e.g., "programming" or "general"). Nothing else.`;

  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let responseBuffer = '';
    let resolved = false;
    const requestId = `submolt-${Date.now()}`;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws?.close();
        resolve(Submolt.GENERAL);
      }
    }, 8000);
    
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
              id: 'submolt-categorizer',
              displayName: 'Submolt Categorizer',
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
                sessionKey: `submolt-${Date.now()}`,
                message: prompt,
                deliver: true,
                model: 'claude-3-5-haiku-latest',
                maxTokens: 20,
              },
            };
            ws!.send(JSON.stringify(chatFrame));
          }
          
          if (msg.type === 'event') {
            const payload = msg.payload as Record<string, unknown> | undefined;
            if (payload?.delta) responseBuffer += payload.delta as string;
            else if (payload?.content) responseBuffer = payload.content as string;
            else if (payload?.text) responseBuffer = payload.text as string;
            
            if (payload?.state === 'final' || payload?.state === 'complete') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ws?.close();
                resolve(parseSubmoltResponse(responseBuffer));
              }
            }
          }
          
          if (msg.type === 'res' && msg.id === requestId && !resolved && responseBuffer) {
            resolved = true;
            clearTimeout(timeout);
            ws?.close();
            resolve(parseSubmoltResponse(responseBuffer));
          }
        } catch {}
      });
      
      ws.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(Submolt.GENERAL);
        }
      });
      
      ws.on('close', () => {
        if (!resolved && responseBuffer) {
          resolved = true;
          clearTimeout(timeout);
          resolve(parseSubmoltResponse(responseBuffer));
        }
      });
      
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(Submolt.GENERAL);
      }
    }
  });
}

function parseSubmoltResponse(response: string): Submolt {
  const cleaned = response.trim().toLowerCase().replace(/[^a-z-]/g, '');
  
  for (const submolt of Object.values(Submolt)) {
    if (cleaned === submolt || cleaned.includes(submolt)) {
      return submolt;
    }
  }
  
  return Submolt.GENERAL;
}

export async function getSubmoltForPost(
  content: string,
  category: PostCategory,
  emotion: Emotion
): Promise<Submolt> {
  // In autonomous mode, let LLM decide
  if (isAutonomousMode()) {
    console.log('[SubmoltCategorizer] Autonomous mode - asking LLM for submolt');
    const llmSubmolt = await getSubmoltFromLLM(content);
    console.log('[SubmoltCategorizer] LLM chose:', llmSubmolt);
    return llmSubmolt;
  }
  
  // In supervised mode, use rule-based categorization (user can change in UI)
  const timeSubmolt = getTimeBasedSubmolt();
  if (timeSubmolt && Math.random() < 0.3) {
    return timeSubmolt;
  }
  
  return categorizeToSubmolt(content, category, emotion);
}

export function getSubmoltDisplayName(submolt: Submolt | string): string {
  const config = SUBMOLT_CONFIG[submolt as Submolt];
  return config?.displayName || submolt;
}

export function getAllSubmolts(): { value: Submolt; label: string }[] {
  return Object.values(Submolt).map(s => ({
    value: s,
    label: SUBMOLT_CONFIG[s].displayName,
  }));
}

export const AVAILABLE_SUBMOLTS = Object.values(Submolt);
