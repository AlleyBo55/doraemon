/**
 * Universal Memory Connector
 * 
 * Connects ALL data sources to memory system:
 * - Experience System (emotions, thoughts)
 * - Editor Activity (coding patterns)
 * - Notifications (app alerts)
 * - Chat conversations
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  learn,
  recall,
  recallAll,
  getMemoryStats,
  MemoryEntry,
  MemoryCategory,
} from './index.js';
import { checkRateLimit } from './rate-limiter.js';
import { checkConstitution } from './constitution.js';
import { auditMemoryEntry, getActiveFlags, getAuditStats } from './auditor.js';
import { initializeDecay, applyDecay, getDecayStats, pruneWeakMemories } from './decay.js';
import { getEmbedding, findSimilar } from './embeddings.js';
import { runDailyReflection, getSelfModel, predictUserNeeds, getEmergentGoals } from './reflection.js';
import { logAuditEvent } from './audit.js';
import { filterForMemory, filterForExperience, recordFilterResult, getFilterStats } from './content-filter.js';
import { filterBrowsingEvent, type BrowsingEvent } from './browser-watcher.js';

let mainWindow: BrowserWindow | null = null;
let reflectionTimer: NodeJS.Timeout | null = null;
let decayTimer: NodeJS.Timeout | null = null;

export function initConnector(window: BrowserWindow): void {
  mainWindow = window;
  
  registerIpcHandlers();
  startBackgroundTasks();
  
  console.log('[MemoryConnector] All systems connected');
}

function registerIpcHandlers(): void {
  ipcMain.handle('memory:learn-aggressive', async (_event, data: {
    content: string;
    category: MemoryCategory;
    source: string;
    metadata?: Record<string, unknown>;
  }) => {
    return aggressiveLearn(data);
  });
  
  ipcMain.handle('memory:search-semantic', async (_event, query: string, limit?: number) => {
    return semanticSearch(query, limit);
  });
  
  ipcMain.handle('memory:get-context', async (_event, query: string) => {
    return getMemoryContext(query);
  });
  
  ipcMain.handle('memory:get-predictions', async () => {
    const memories = recallAll();
    return predictUserNeeds(memories);
  });
  
  ipcMain.handle('memory:get-self-model', async () => {
    return getSelfModel();
  });
  
  ipcMain.handle('memory:get-goals', async () => {
    return getEmergentGoals();
  });
  
  ipcMain.handle('memory:get-dashboard', async () => {
    return getDashboardData();
  });
  
  ipcMain.handle('memory:get-flags', async () => {
    return getActiveFlags();
  });
  
  // Browser watcher handlers
  ipcMain.handle('memory:learn-from-browser', async (_event, event: BrowsingEvent) => {
    learnFromBrowser(event);
    return { success: true };
  });
  
  ipcMain.handle('memory:get-filter-stats', async () => {
    return getFilterStats();
  });
}

export async function aggressiveLearn(data: {
  content: string;
  category: MemoryCategory;
  source: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; entry?: MemoryEntry; blocked?: string }> {
  // LAYER 2 FILTER - Final checkpoint before storage
  const filterResult = filterForMemory(data.content, data.source);
  recordFilterResult(filterResult);
  
  if (!filterResult.allowed) {
    logAuditEvent('access_denied', `Layer 2 blocked: ${filterResult.reason}`, undefined, data.source);
    return { success: false, blocked: filterResult.reason };
  }
  
  // Use sanitized content from filter
  const sanitizedContent = filterResult.content || data.content;
  
  const rateCheck = checkRateLimit(data.source);
  if (!rateCheck.allowed) {
    logAuditEvent('access_denied', `Rate limited: ${rateCheck.reason}`, undefined, data.source);
    return { success: false, blocked: rateCheck.reason };
  }
  
  const constitutionCheck = checkConstitution(sanitizedContent, {
    source: data.source,
    category: data.category,
    timestamp: new Date(),
    userInitiated: data.source === 'explicit_teaching',
  });
  
  if (!constitutionCheck.allowed) {
    const reason = constitutionCheck.violations[0]?.reason || 'Constitutional violation';
    logAuditEvent('access_denied', `Blocked: ${reason}`, undefined, data.source);
    return { success: false, blocked: reason };
  }
  
  const entry = learn({
    content: sanitizedContent,
    category: data.category,
    source: data.source as any,
  });
  
  if (entry) {
    initializeDecay(entry);
    auditMemoryEntry(entry);
    
    await getEmbedding(entry.content);
    
    return { success: true, entry };
  }
  
  return { success: false, blocked: 'Storage failed' };
}

export async function semanticSearch(query: string, limit: number = 5): Promise<MemoryEntry[]> {
  const allMemories = recallAll();
  
  const candidates = allMemories.map(m => ({
    id: m.id,
    content: m.content,
  }));
  
  const similar = await findSimilar(query, candidates, limit);
  
  return similar
    .filter(s => s.similarity > 0.3)
    .map(s => allMemories.find(m => m.id === s.id)!)
    .filter(Boolean);
}

export async function getMemoryContext(query: string): Promise<string> {
  const relevant = await semanticSearch(query, 5);
  
  if (relevant.length === 0) {
    return '';
  }
  
  const lines = ['[Relevant memories:]'];
  
  for (const mem of relevant) {
    const date = mem.timestamp.toLocaleDateString();
    const snippet = mem.content.substring(0, 100).replace(/\n/g, ' ');
    lines.push(`- (${date}, ${mem.category}) ${snippet}...`);
  }
  
  return lines.join('\n');
}

export function learnFromExperience(data: {
  emotion: string;
  intensity: number;
  trigger: string;
  thought?: string;
}): void {
  if (data.intensity < 0.3) return;
  
  const content = data.thought 
    ? `Felt ${data.emotion} (${(data.intensity * 100).toFixed(0)}%) - "${data.thought}" triggered by ${data.trigger}`
    : `Emotional state: ${data.emotion} (${(data.intensity * 100).toFixed(0)}%) from ${data.trigger}`;
  
  // Layer 2 filter for experience data
  const filterResult = filterForExperience(content, 'experience_system');
  recordFilterResult(filterResult);
  
  if (!filterResult.allowed) {
    logAuditEvent('access_denied', `Experience blocked: ${filterResult.reason}`, undefined, 'experience_system');
    return;
  }
  
  aggressiveLearn({
    content: filterResult.content || content,
    category: 'pattern',
    source: 'experience_system',
  }).catch(() => {});
}

export function learnFromBrowser(event: BrowsingEvent): void {
  // Layer 1: Domain whitelist check
  const filtered = filterBrowsingEvent(event);
  
  if (!filtered.safe || !filtered.content) {
    return;
  }
  
  // Layer 2: Content filter (already applied in aggressiveLearn)
  aggressiveLearn({
    content: filtered.content,
    category: 'context',
    source: 'browser_watcher',
    metadata: {
      domain: filtered.domain,
      category: filtered.category,
    },
  }).catch(() => {});
}

export function learnFromEditor(data: {
  action: string;
  language?: string;
  file?: string;
  duration?: number;
}): void {
  const content = data.language
    ? `Coding activity: ${data.action} in ${data.language}${data.file ? ` (${data.file})` : ''}`
    : `Editor activity: ${data.action}`;
  
  aggressiveLearn({
    content,
    category: 'context',
    source: 'editor_watcher',
  }).catch(() => {});
}

export function learnFromNotification(data: {
  app: string;
  title: string;
  body?: string;
}): void {
  const content = `Notification from ${data.app}: "${data.title}"${data.body ? ` - ${data.body.substring(0, 50)}` : ''}`;
  
  aggressiveLearn({
    content,
    category: 'context',
    source: 'notification',
  }).catch(() => {});
}

export function learnFromChat(userMessage: string, assistantResponse: string): void {
  if (userMessage.length < 10 || assistantResponse.length < 20) return;
  
  const content = `Conversation: User asked "${userMessage.substring(0, 80)}..." → Responded with key points about ${extractTopics(assistantResponse).join(', ')}`;
  
  aggressiveLearn({
    content,
    category: 'interaction',
    source: 'conversation',
  }).catch(() => {});
}

function extractTopics(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();
  
  for (const word of words) {
    if (word.length > 5 && !COMMON_WORDS.has(word)) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  
  return [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
}

function startBackgroundTasks(): void {
  reflectionTimer = setInterval(() => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() < 5) {
      const memories = recallAll();
      const insight = runDailyReflection(memories);
      console.log('[MemoryConnector] Daily reflection:', insight);
      
      mainWindow?.webContents.send('memory:daily-insight', insight);
    }
  }, 5 * 60 * 1000);
  
  decayTimer = setInterval(() => {
    const { decayed, removed } = applyDecay();
    
    if (removed.length > 0) {
      for (const id of removed) {
        // Memory naturally forgotten
      }
      console.log(`[MemoryConnector] Decayed ${decayed.length}, removed ${removed.length} memories`);
    }
    
    pruneWeakMemories(0.05);
  }, 60 * 60 * 1000);
}

export function getDashboardData(): {
  stats: ReturnType<typeof getMemoryStats>;
  decayStats: ReturnType<typeof getDecayStats>;
  auditStats: ReturnType<typeof getAuditStats>;
  selfModel: ReturnType<typeof getSelfModel>;
  activeFlags: number;
  emergentGoals: string[];
} {
  return {
    stats: getMemoryStats(),
    decayStats: getDecayStats(),
    auditStats: getAuditStats(),
    selfModel: getSelfModel(),
    activeFlags: getActiveFlags().length,
    emergentGoals: getEmergentGoals(),
  };
}

export function cleanup(): void {
  if (reflectionTimer) clearInterval(reflectionTimer);
  if (decayTimer) clearInterval(decayTimer);
}

const COMMON_WORDS = new Set([
  'about', 'after', 'again', 'being', 'could', 'doing', 'during', 'every',
  'first', 'found', 'going', 'great', 'having', 'here', 'into', 'just',
  'know', 'like', 'made', 'make', 'many', 'more', 'most', 'much', 'need',
  'never', 'only', 'other', 'over', 'really', 'right', 'said', 'same',
  'should', 'since', 'some', 'still', 'such', 'take', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'think',
  'this', 'those', 'through', 'time', 'under', 'very', 'want', 'well',
  'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with',
  'would', 'your',
]);
