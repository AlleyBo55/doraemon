/**
 * Gateway Bridge - Connects Memory System to OpenClaw Gateway
 * 
 * Listens to OpenClaw conversations via WebSocket and:
 * 1. Extracts learnings from conversations
 * 2. Stores them securely in the memory system
 * 3. Provides memory context for future conversations
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  initMemorySystem,
  learn,
  recall,
  recallByCategory,
  learnFromConversation,
  learnPreference,
  learnCorrection,
  getMemoryStats,
  verifyIntegrity,
  MemoryEntry,
  MemoryCategory,
} from './index.js';
import { logAuditEvent } from './audit.js';
import { sanitizeContent } from '../experience-system/sanitizer.js';

const MEMORY_CHANNEL = 'memory-system';
const LEARNING_DEBOUNCE_MS = 5000;

let lastLearnTime = 0;
let pendingLearnings: Array<{ user: string; assistant: string; topics: string[] }> = [];
let processingTimer: NodeJS.Timeout | null = null;

export function initGatewayBridge(mainWindow: BrowserWindow): void {
  initMemorySystem();
  
  registerIpcHandlers();
  
  console.log('[MemoryBridge] Gateway bridge initialized');
}

function registerIpcHandlers(): void {
  ipcMain.handle(`${MEMORY_CHANNEL}:learn`, async (_event, input) => {
    try {
      const entry = learn({
        content: input.content,
        category: input.category as MemoryCategory,
        source: input.source || 'conversation',
        ttlDays: input.ttlDays,
      });
      return { success: true, entry };
    } catch (err) {
      logAuditEvent('access_denied', `Learn failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle(`${MEMORY_CHANNEL}:recall`, async (_event, query: string, limit?: number) => {
    try {
      const entries = recall(query, limit);
      return { success: true, entries };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle(`${MEMORY_CHANNEL}:recall-category`, async (_event, category: string) => {
    try {
      const entries = recallByCategory(category as MemoryCategory);
      return { success: true, entries };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle(`${MEMORY_CHANNEL}:stats`, async () => {
    try {
      const stats = getMemoryStats();
      const integrity = verifyIntegrity();
      return { success: true, stats, integrity };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle(`${MEMORY_CHANNEL}:learn-preference`, async (_event, key: string, value: string) => {
    try {
      const entry = learnPreference(key, value);
      return { success: true, entry };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  
  ipcMain.handle(`${MEMORY_CHANNEL}:learn-correction`, async (_event, original: string, corrected: string) => {
    try {
      const entry = learnCorrection(original, corrected);
      return { success: true, entry };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}

export function processConversationMessage(
  role: 'user' | 'assistant',
  content: string,
  metadata?: { topics?: string[]; sessionId?: string }
): void {
  const sanitized = sanitizeContent(content);
  
  if (role === 'user') {
    pendingLearnings.push({
      user: sanitized.content,
      assistant: '',
      topics: metadata?.topics || [],
    });
  } else if (role === 'assistant' && pendingLearnings.length > 0) {
    const last = pendingLearnings[pendingLearnings.length - 1];
    if (!last.assistant) {
      last.assistant = sanitized.content;
      scheduleLearningProcess();
    }
  }
}

function scheduleLearningProcess(): void {
  if (processingTimer) return;
  
  const now = Date.now();
  const timeSinceLastLearn = now - lastLearnTime;
  const delay = Math.max(0, LEARNING_DEBOUNCE_MS - timeSinceLastLearn);
  
  processingTimer = setTimeout(() => {
    processingTimer = null;
    processAllPendingLearnings();
  }, delay);
}

function processAllPendingLearnings(): void {
  const toProcess = pendingLearnings.filter(p => p.user && p.assistant);
  pendingLearnings = pendingLearnings.filter(p => !p.assistant);
  
  for (const learning of toProcess) {
    try {
      learnFromConversation(learning.user, learning.assistant, learning.topics);
    } catch (err) {
      logAuditEvent('access_denied', `Learning failed: ${err}`);
    }
  }
  
  lastLearnTime = Date.now();
}

export function getRelevantMemories(query: string, limit: number = 3): MemoryEntry[] {
  try {
    return recall(query, limit);
  } catch {
    return [];
  }
}

export function formatMemoriesForContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) return '';
  
  const lines = ['[Relevant memories from past interactions:]'];
  
  for (const mem of memories) {
    const date = mem.timestamp.toLocaleDateString();
    lines.push(`- (${date}) ${mem.content.substring(0, 150)}...`);
  }
  
  return lines.join('\n');
}

export function injectMemoryContext(
  userMessage: string,
  existingContext?: string
): string {
  const memories = getRelevantMemories(userMessage, 3);
  
  if (memories.length === 0) {
    return existingContext || '';
  }
  
  const memoryContext = formatMemoriesForContext(memories);
  
  if (existingContext) {
    return `${existingContext}\n\n${memoryContext}`;
  }
  
  return memoryContext;
}
