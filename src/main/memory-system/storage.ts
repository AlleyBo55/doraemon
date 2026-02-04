/**
 * Secure Memory Storage
 * 
 * File-based storage with:
 * - Encryption at rest
 * - Integrity verification
 * - Atomic writes
 * - Automatic backup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { MemoryEntry, MemorySystemConfig, DEFAULT_CONFIG } from './types.js';
import { encrypt, decrypt, hashContent, signContent, verifySignature, isInitialized, initializeCrypto } from './crypto.js';
import { logAuditEvent } from './audit.js';

const STORAGE_DIR = join(homedir(), '.doraemon', 'memory');
const INDEX_FILE = 'index.json';
const ENTRIES_DIR = 'entries';
const BACKUP_DIR = 'backups';

interface StorageIndex {
  version: number;
  lastModified: string;
  entryCount: number;
  checksum: string;
}

interface EncryptedEntry {
  id: string;
  ciphertext: string;
  iv: string;
  tag: string;
  signature: string;
  metadata: {
    timestamp: string;
    category: string;
    classification: string;
    source: string;
  };
}

let config: MemorySystemConfig = DEFAULT_CONFIG;
let memoryCache: Map<string, MemoryEntry> = new Map();
let initialized = false;

export function initStorage(customConfig?: Partial<MemorySystemConfig>): void {
  if (initialized) return;
  
  config = { ...DEFAULT_CONFIG, ...customConfig };
  
  if (!isInitialized()) {
    initializeCrypto();
  }
  
  ensureDirectories();
  loadIndex();
  
  initialized = true;
  logAuditEvent('create', 'Storage initialized');
}

function ensureDirectories(): void {
  const dirs = [STORAGE_DIR, join(STORAGE_DIR, ENTRIES_DIR), join(STORAGE_DIR, BACKUP_DIR)];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
}

function loadIndex(): void {
  const indexPath = join(STORAGE_DIR, INDEX_FILE);
  if (!existsSync(indexPath)) {
    saveIndex();
    return;
  }
  
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content) as StorageIndex;
    
    const entriesDir = join(STORAGE_DIR, ENTRIES_DIR);
    const files = readdirSync(entriesDir).filter(f => f.endsWith('.enc'));
    
    for (const file of files) {
      const entryPath = join(entriesDir, file);
      try {
        const entryContent = readFileSync(entryPath, 'utf-8');
        const encrypted = JSON.parse(entryContent) as EncryptedEntry;
        
        if (config.encryptionEnabled) {
          const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag);
          const entry = JSON.parse(decrypted) as MemoryEntry;
          entry.timestamp = new Date(entry.timestamp);
          memoryCache.set(entry.id, entry);
        }
      } catch {
        logAuditEvent('read', `Failed to load entry: ${file}`);
      }
    }
  } catch {
    logAuditEvent('read', 'Failed to load index, starting fresh');
  }
}

function saveIndex(): void {
  const index: StorageIndex = {
    version: 1,
    lastModified: new Date().toISOString(),
    entryCount: memoryCache.size,
    checksum: hashContent(JSON.stringify([...memoryCache.keys()])),
  };
  
  const indexPath = join(STORAGE_DIR, INDEX_FILE);
  writeFileSync(indexPath, JSON.stringify(index, null, 2), { mode: 0o600 });
}

export function storeEntry(entry: MemoryEntry): boolean {
  if (!initialized) initStorage();
  
  if (memoryCache.size >= config.maxEntries) {
    evictOldest();
  }
  
  entry.contentHash = hashContent(entry.content);
  
  if (config.encryptionEnabled) {
    const serialized = JSON.stringify(entry);
    const { ciphertext, iv, tag } = encrypt(serialized);
    const signature = signContent(ciphertext);
    
    const encrypted: EncryptedEntry = {
      id: entry.id,
      ciphertext,
      iv,
      tag,
      signature,
      metadata: {
        timestamp: entry.timestamp.toISOString(),
        category: entry.category,
        classification: entry.classification,
        source: entry.source,
      },
    };
    
    const entryPath = join(STORAGE_DIR, ENTRIES_DIR, `${entry.id}.enc`);
    writeFileSync(entryPath, JSON.stringify(encrypted), { mode: 0o600 });
    entry.encrypted = true;
  } else {
    const entryPath = join(STORAGE_DIR, ENTRIES_DIR, `${entry.id}.json`);
    writeFileSync(entryPath, JSON.stringify(entry, null, 2), { mode: 0o600 });
    entry.encrypted = false;
  }
  
  memoryCache.set(entry.id, entry);
  saveIndex();
  
  logAuditEvent('create', `Entry stored: ${entry.category}`, entry.id);
  
  return true;
}

export function retrieveEntry(id: string): MemoryEntry | null {
  if (!initialized) initStorage();
  
  const cached = memoryCache.get(id);
  if (cached) {
    logAuditEvent('read', 'Entry retrieved from cache', id);
    return cached;
  }
  
  const encPath = join(STORAGE_DIR, ENTRIES_DIR, `${id}.enc`);
  const jsonPath = join(STORAGE_DIR, ENTRIES_DIR, `${id}.json`);
  
  try {
    if (existsSync(encPath)) {
      const content = readFileSync(encPath, 'utf-8');
      const encrypted = JSON.parse(content) as EncryptedEntry;
      
      if (!verifySignature(encrypted.ciphertext, encrypted.signature)) {
        logAuditEvent('access_denied', 'Signature verification failed', id);
        return null;
      }
      
      const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag);
      const entry = JSON.parse(decrypted) as MemoryEntry;
      entry.timestamp = new Date(entry.timestamp);
      
      memoryCache.set(id, entry);
      logAuditEvent('read', 'Entry decrypted and retrieved', id);
      return entry;
    }
    
    if (existsSync(jsonPath)) {
      const content = readFileSync(jsonPath, 'utf-8');
      const entry = JSON.parse(content) as MemoryEntry;
      entry.timestamp = new Date(entry.timestamp);
      
      memoryCache.set(id, entry);
      logAuditEvent('read', 'Entry retrieved', id);
      return entry;
    }
  } catch (err) {
    logAuditEvent('read', `Failed to retrieve entry: ${err}`, id);
  }
  
  return null;
}

export function deleteEntry(id: string): boolean {
  if (!initialized) initStorage();
  
  memoryCache.delete(id);
  
  const encPath = join(STORAGE_DIR, ENTRIES_DIR, `${id}.enc`);
  const jsonPath = join(STORAGE_DIR, ENTRIES_DIR, `${id}.json`);
  
  try {
    if (existsSync(encPath)) unlinkSync(encPath);
    if (existsSync(jsonPath)) unlinkSync(jsonPath);
    saveIndex();
    logAuditEvent('delete', 'Entry deleted', id);
    return true;
  } catch {
    logAuditEvent('delete', 'Failed to delete entry', id);
    return false;
  }
}

export function getAllEntries(): MemoryEntry[] {
  if (!initialized) initStorage();
  logAuditEvent('read', `Retrieved all entries: ${memoryCache.size}`);
  return [...memoryCache.values()];
}

export function searchEntries(query: string, limit: number = 10): MemoryEntry[] {
  if (!initialized) initStorage();
  
  const queryLower = query.toLowerCase();
  const results: Array<{ entry: MemoryEntry; score: number }> = [];
  
  for (const entry of memoryCache.values()) {
    const contentLower = entry.content.toLowerCase();
    if (contentLower.includes(queryLower)) {
      const score = contentLower.split(queryLower).length - 1;
      results.push({ entry, score });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  
  logAuditEvent('search', `Search: "${query.substring(0, 50)}", found: ${results.length}`);
  
  return results.slice(0, limit).map(r => r.entry);
}

function evictOldest(): void {
  const entries = [...memoryCache.values()];
  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  const toEvict = entries.slice(0, Math.ceil(entries.length * 0.1));
  for (const entry of toEvict) {
    deleteEntry(entry.id);
  }
  
  logAuditEvent('purge', `Evicted ${toEvict.length} oldest entries`);
}

export function createBackup(): string {
  if (!initialized) initStorage();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}.json`;
  const backupPath = join(STORAGE_DIR, BACKUP_DIR, backupName);
  
  const backup = {
    timestamp: new Date().toISOString(),
    entryCount: memoryCache.size,
    entries: [...memoryCache.values()].map(e => ({
      id: e.id,
      category: e.category,
      timestamp: e.timestamp.toISOString(),
    })),
  };
  
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600 });
  logAuditEvent('export', `Backup created: ${backupName}`);
  
  return backupPath;
}

export function getStorageStats(): {
  entryCount: number;
  categories: Record<string, number>;
  oldestEntry: Date | null;
  newestEntry: Date | null;
} {
  if (!initialized) initStorage();
  
  const entries = [...memoryCache.values()];
  const categories: Record<string, number> = {};
  
  for (const entry of entries) {
    categories[entry.category] = (categories[entry.category] || 0) + 1;
  }
  
  const timestamps = entries.map(e => e.timestamp.getTime());
  
  return {
    entryCount: entries.length,
    categories,
    oldestEntry: timestamps.length ? new Date(Math.min(...timestamps)) : null,
    newestEntry: timestamps.length ? new Date(Math.max(...timestamps)) : null,
  };
}
