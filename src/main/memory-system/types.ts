/**
 * Secure Memory System - Type Definitions
 * 
 * Security model inspired by:
 * - CIA triad (Confidentiality, Integrity, Availability)
 * - Defense in depth
 * - Zero-trust architecture
 */

export interface MemoryEntry {
  id: string;
  timestamp: Date;
  category: MemoryCategory;
  content: string;
  contentHash: string;
  classification: SecurityClassification;
  source: MemorySource;
  ttl?: number;
  encrypted: boolean;
  signature?: string;
}

export type MemoryCategory =
  | 'learning'
  | 'preference'
  | 'context'
  | 'interaction'
  | 'skill'
  | 'correction'
  | 'pattern';

export type SecurityClassification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

export type MemorySource =
  | 'conversation'
  | 'observation'
  | 'explicit_teaching'
  | 'inference'
  | 'system';

export interface MemoryQuery {
  categories?: MemoryCategory[];
  maxAge?: number;
  limit?: number;
  minRelevance?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  relevance: number;
  decrypted: boolean;
}

export interface AuditLogEntry {
  timestamp: Date;
  action: AuditAction;
  entryId?: string;
  actor: string;
  details: string;
  hash: string;
}

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'search'
  | 'export'
  | 'purge'
  | 'access_denied';

export interface MemorySystemConfig {
  enabled: boolean;
  storagePath: string;
  encryptionEnabled: boolean;
  maxEntries: number;
  defaultTtlDays: number;
  auditEnabled: boolean;
  autoSanitize: boolean;
  classificationRules: ClassificationRule[];
}

export interface ClassificationRule {
  pattern: RegExp;
  classification: SecurityClassification;
  action: 'redact' | 'encrypt' | 'block';
}

export const DEFAULT_CONFIG: MemorySystemConfig = {
  enabled: true,
  storagePath: '~/.doraemon/memory',
  encryptionEnabled: true,
  maxEntries: 10000,
  defaultTtlDays: 365,
  auditEnabled: true,
  autoSanitize: true,
  classificationRules: [],
};
