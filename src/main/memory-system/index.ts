/**
 * Secure Memory System - Main Entry Point
 * 
 * Self-learning memory with security layers:
 * - AES-256-GCM encryption at rest
 * - HMAC signatures for integrity
 * - Hash-chain audit logs (tamper-evident)
 * - Content classification and auto-redaction
 * - Zero-trust: sanitize everything
 */

import { MemoryEntry, MemoryCategory, MemorySource, SecurityClassification, MemorySystemConfig } from './types.js';
import { initStorage, storeEntry, retrieveEntry, deleteEntry, getAllEntries, searchEntries, getStorageStats, createBackup, cleanupCorruptedEntries } from './storage.js';
import { classifyContent, isStorageSafe } from './classifier.js';
import { initializeCrypto, generateEntryId, hashContent } from './crypto.js';
import { initAuditLog, logAuditEvent, verifyAuditChain, getRecentAuditEntries } from './audit.js';
import { sanitizeContent } from '../experience-system/sanitizer.js';

let systemEnabled = false;

export function initMemorySystem(config?: Partial<MemorySystemConfig>): void {
  if (systemEnabled) return;
  
  initializeCrypto();
  initAuditLog();
  initStorage(config);
  
  systemEnabled = true;
  console.log('[MemorySystem] Initialized with encryption enabled');
}

export function isMemorySystemEnabled(): boolean {
  return systemEnabled;
}

export interface LearnInput {
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  ttlDays?: number;
}

export function learn(input: LearnInput): MemoryEntry | null {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  const sanitized = sanitizeContent(input.content);
  if (!sanitized.safe) {
    logAuditEvent('access_denied', `Blocked: ${sanitized.warnings.join(', ')}`);
  }
  
  const classification = classifyContent(sanitized.content);
  
  if (classification.classification === 'restricted') {
    logAuditEvent('access_denied', `Restricted content blocked: ${classification.reasons.join(', ')}`);
    return null;
  }
  
  const finalContent = classification.shouldRedact 
    ? classification.redactedContent! 
    : sanitized.content;
  
  if (!isStorageSafe(finalContent)) {
    logAuditEvent('access_denied', 'Content failed safety check');
    return null;
  }
  
  const entry: MemoryEntry = {
    id: generateEntryId(),
    timestamp: new Date(),
    category: input.category,
    content: finalContent,
    contentHash: hashContent(finalContent),
    classification: classification.classification,
    source: input.source,
    ttl: input.ttlDays ? input.ttlDays * 24 * 60 * 60 * 1000 : undefined,
    encrypted: true,
  };
  
  const stored = storeEntry(entry);
  
  if (stored) {
    return entry;
  }
  
  return null;
}

export function recall(query: string, limit: number = 5): MemoryEntry[] {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  const sanitizedQuery = sanitizeContent(query);
  return searchEntries(sanitizedQuery.content, limit);
}

export function recallById(id: string): MemoryEntry | null {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return retrieveEntry(id);
}

export function forget(id: string): boolean {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return deleteEntry(id);
}

export function recallAll(): MemoryEntry[] {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return getAllEntries();
}

export function recallByCategory(category: MemoryCategory): MemoryEntry[] {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return getAllEntries().filter(e => e.category === category);
}

export function getMemoryStats() {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return getStorageStats();
}

export function exportMemories(): string {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return createBackup();
}

export function verifyIntegrity(): { valid: boolean; error?: string } {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return verifyAuditChain();
}

export function getAuditLog(limit: number = 50) {
  if (!systemEnabled) {
    initMemorySystem();
  }
  
  return getRecentAuditEntries(limit);
}

export function learnFromConversation(
  userMessage: string,
  assistantResponse: string,
  topics: string[]
): MemoryEntry | null {
  const summary = extractLearning(userMessage, assistantResponse, topics);
  if (!summary) return null;
  
  return learn({
    content: summary,
    category: 'interaction',
    source: 'conversation',
  });
}

function extractLearning(user: string, assistant: string, topics: string[]): string | null {
  if (user.length < 10 || assistant.length < 20) return null;
  
  const skipPatterns = [
    /^(hi|hello|hey|thanks|ok|yes|no|bye)/i,
    /^(what|how|why|when|where|who)\s+(is|are|was|were|do|does|did)/i,
  ];
  
  for (const pattern of skipPatterns) {
    if (pattern.test(user.trim())) return null;
  }
  
  const topicStr = topics.length > 0 ? topics.slice(0, 3).join(', ') : 'general';
  
  return `Topic: ${topicStr}\nContext: User asked about ${user.substring(0, 100)}...\nKey insight: ${assistant.substring(0, 200)}...`;
}

export function learnPreference(key: string, value: string): MemoryEntry | null {
  return learn({
    content: `Preference: ${key} = ${value}`,
    category: 'preference',
    source: 'explicit_teaching',
  });
}

export function learnCorrection(original: string, corrected: string): MemoryEntry | null {
  return learn({
    content: `Correction: "${original}" should be "${corrected}"`,
    category: 'correction',
    source: 'explicit_teaching',
  });
}

export function learnSkill(skillName: string, description: string): MemoryEntry | null {
  return learn({
    content: `Skill: ${skillName}\n${description}`,
    category: 'skill',
    source: 'explicit_teaching',
  });
}

export function learnPattern(pattern: string, context: string): MemoryEntry | null {
  return learn({
    content: `Pattern observed: ${pattern}\nContext: ${context}`,
    category: 'pattern',
    source: 'inference',
  });
}

export function cleanupCorrupted(): { deleted: number; remaining: number } {
  if (!systemEnabled) {
    initMemorySystem();
  }
  return cleanupCorruptedEntries();
}

export * from './types.js';
