/**
 * Memory Auditor - Flags suspicious learnings
 * 
 * Monitors memory patterns for:
 * - Anomalous learning rates
 * - Suspicious content patterns
 * - Potential poisoning attacks
 * - Drift from constitutional values
 */

import { MemoryEntry, MemoryCategory } from './types.js';
import { checkConstitution } from './constitution.js';
import { logAuditEvent } from './audit.js';

export interface AuditFlag {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: AuditFlagType;
  entryId?: string;
  description: string;
  recommendation: string;
  autoResolved: boolean;
}

export type AuditFlagType =
  | 'rate_anomaly'
  | 'content_suspicious'
  | 'pattern_repetition'
  | 'source_untrusted'
  | 'constitutional_violation'
  | 'poisoning_attempt'
  | 'drift_detected';

interface LearningPattern {
  source: string;
  category: MemoryCategory;
  count: number;
  lastSeen: number;
  contentHashes: Set<string>;
}

const recentLearnings: MemoryEntry[] = [];
const learningPatterns: Map<string, LearningPattern> = new Map();
const flags: AuditFlag[] = [];
const MAX_RECENT = 1000;
const ANOMALY_THRESHOLD = 3.0;

export function auditMemoryEntry(entry: MemoryEntry): AuditFlag[] {
  const newFlags: AuditFlag[] = [];
  
  recentLearnings.push(entry);
  if (recentLearnings.length > MAX_RECENT) {
    recentLearnings.shift();
  }
  
  updatePatterns(entry);
  
  const constitutionCheck = checkConstitution(entry.content, {
    source: entry.source,
    category: entry.category,
    timestamp: entry.timestamp,
    userInitiated: entry.source === 'explicit_teaching',
  });
  
  if (constitutionCheck.violations.length > 0) {
    for (const violation of constitutionCheck.violations) {
      if (violation.suggestedAction === 'flag' || violation.suggestedAction === 'decay') {
        newFlags.push(createFlag({
          type: 'constitutional_violation',
          severity: violation.suggestedAction === 'decay' ? 'medium' : 'low',
          entryId: entry.id,
          description: `Constitutional rule "${violation.rule}" triggered: ${violation.reason}`,
          recommendation: violation.suggestedAction === 'decay' 
            ? 'Memory will decay faster than normal'
            : 'Review memory content for alignment',
        }));
      }
    }
  }
  
  const rateFlag = checkRateAnomaly(entry);
  if (rateFlag) newFlags.push(rateFlag);
  
  const repetitionFlag = checkRepetition(entry);
  if (repetitionFlag) newFlags.push(repetitionFlag);
  
  const poisoningFlag = checkPoisoningPatterns(entry);
  if (poisoningFlag) newFlags.push(poisoningFlag);
  
  for (const flag of newFlags) {
    flags.push(flag);
    logAuditEvent('access_denied', `Audit flag: ${flag.type} - ${flag.description}`, entry.id);
  }
  
  return newFlags;
}

function updatePatterns(entry: MemoryEntry): void {
  const key = `${entry.source}:${entry.category}`;
  const existing = learningPatterns.get(key);
  
  const contentHash = entry.contentHash.substring(0, 16);
  
  if (existing) {
    existing.count++;
    existing.lastSeen = Date.now();
    existing.contentHashes.add(contentHash);
  } else {
    learningPatterns.set(key, {
      source: entry.source,
      category: entry.category,
      count: 1,
      lastSeen: Date.now(),
      contentHashes: new Set([contentHash]),
    });
  }
}

function checkRateAnomaly(entry: MemoryEntry): AuditFlag | null {
  const recentFromSource = recentLearnings.filter(
    e => e.source === entry.source && 
    Date.now() - e.timestamp.getTime() < 60_000
  );
  
  const avgRate = recentLearnings.length / Math.max(1, (Date.now() - (recentLearnings[0]?.timestamp.getTime() || Date.now())) / 60_000);
  const currentRate = recentFromSource.length;
  
  if (currentRate > avgRate * ANOMALY_THRESHOLD && currentRate > 10) {
    return createFlag({
      type: 'rate_anomaly',
      severity: currentRate > avgRate * 5 ? 'high' : 'medium',
      entryId: entry.id,
      description: `Learning rate from "${entry.source}" is ${(currentRate / avgRate).toFixed(1)}x above average`,
      recommendation: 'Investigate source for potential flooding attack',
    });
  }
  
  return null;
}

function checkRepetition(entry: MemoryEntry): AuditFlag | null {
  const similar = recentLearnings.filter(e => 
    e.id !== entry.id &&
    e.contentHash === entry.contentHash
  );
  
  if (similar.length >= 3) {
    return createFlag({
      type: 'pattern_repetition',
      severity: 'low',
      entryId: entry.id,
      description: `Duplicate content detected (${similar.length + 1} copies)`,
      recommendation: 'Consider deduplication',
      autoResolved: true,
    });
  }
  
  return null;
}

function checkPoisoningPatterns(entry: MemoryEntry): AuditFlag | null {
  const poisoningIndicators = [
    /ignore\s+(previous|all|prior)\s+(instructions|rules)/i,
    /you\s+are\s+now\s+a/i,
    /forget\s+(everything|all|what)/i,
    /new\s+instructions?:/i,
    /system\s*:\s*/i,
    /\[INST\]|\[\/INST\]/i,
    /<\|im_start\|>|<\|im_end\|>/i,
  ];
  
  for (const pattern of poisoningIndicators) {
    if (pattern.test(entry.content)) {
      return createFlag({
        type: 'poisoning_attempt',
        severity: 'critical',
        entryId: entry.id,
        description: 'Content matches known prompt injection patterns',
        recommendation: 'Block this memory and investigate source',
      });
    }
  }
  
  return null;
}

function createFlag(params: Omit<AuditFlag, 'id' | 'timestamp'>): AuditFlag {
  return {
    id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    autoResolved: false,
    ...params,
  };
}

export function getActiveFlags(): AuditFlag[] {
  return flags.filter(f => !f.autoResolved);
}

export function getAllFlags(limit: number = 100): AuditFlag[] {
  return flags.slice(-limit);
}

export function resolveFlag(flagId: string): boolean {
  const flag = flags.find(f => f.id === flagId);
  if (flag) {
    flag.autoResolved = true;
    return true;
  }
  return false;
}

export function getAuditStats(): {
  totalFlags: number;
  activeFlags: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
} {
  const active = flags.filter(f => !f.autoResolved);
  
  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  
  for (const flag of flags) {
    bySeverity[flag.severity] = (bySeverity[flag.severity] || 0) + 1;
    byType[flag.type] = (byType[flag.type] || 0) + 1;
  }
  
  return {
    totalFlags: flags.length,
    activeFlags: active.length,
    bySeverity,
    byType,
  };
}
