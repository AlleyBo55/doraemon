/**
 * Audit Logger - Immutable audit trail for memory operations
 * 
 * Features:
 * - Append-only log with hash chain (tamper-evident)
 * - Structured logging for forensic analysis
 * - Automatic rotation and retention
 */

import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { AuditLogEntry, AuditAction } from './types.js';

const AUDIT_DIR = join(homedir(), '.doraemon', 'audit');
const CURRENT_LOG = 'memory-audit.jsonl';
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const RETENTION_DAYS = 90;

let lastHash = '0'.repeat(64);
let initialized = false;

export function initAuditLog(): void {
  if (initialized) return;
  
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true, mode: 0o700 });
  }
  
  const logPath = join(AUDIT_DIR, CURRENT_LOG);
  if (existsSync(logPath)) {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length > 0) {
      try {
        const lastEntry = JSON.parse(lines[lines.length - 1]) as AuditLogEntry;
        lastHash = lastEntry.hash;
      } catch {
        lastHash = '0'.repeat(64);
      }
    }
  }
  
  initialized = true;
}

export function logAuditEvent(
  action: AuditAction,
  details: string,
  entryId?: string,
  actor: string = 'system'
): AuditLogEntry {
  initAuditLog();
  
  const entry: AuditLogEntry = {
    timestamp: new Date(),
    action,
    entryId,
    actor: sanitizeActor(actor),
    details: sanitizeDetails(details),
    hash: '',
  };
  
  const contentToHash = [
    lastHash,
    entry.timestamp.toISOString(),
    entry.action,
    entry.entryId || '',
    entry.actor,
    entry.details,
  ].join('|');
  
  entry.hash = createHash('sha256').update(contentToHash).digest('hex');
  lastHash = entry.hash;
  
  const logPath = join(AUDIT_DIR, CURRENT_LOG);
  appendFileSync(logPath, JSON.stringify(entry) + '\n', { mode: 0o600 });
  
  rotateIfNeeded();
  
  return entry;
}

function sanitizeActor(actor: string): string {
  return actor.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

function sanitizeDetails(details: string): string {
  return details
    .replace(/password[=:][^\s]+/gi, 'password=[REDACTED]')
    .replace(/token[=:][^\s]+/gi, 'token=[REDACTED]')
    .replace(/key[=:][^\s]+/gi, 'key=[REDACTED]')
    .substring(0, 500);
}

function rotateIfNeeded(): void {
  const logPath = join(AUDIT_DIR, CURRENT_LOG);
  try {
    const stats = require('fs').statSync(logPath);
    if (stats.size > MAX_LOG_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveName = `memory-audit-${timestamp}.jsonl`;
      require('fs').renameSync(logPath, join(AUDIT_DIR, archiveName));
      lastHash = '0'.repeat(64);
    }
  } catch {}
}

export function verifyAuditChain(): { valid: boolean; brokenAt?: number; error?: string } {
  initAuditLog();
  
  const logPath = join(AUDIT_DIR, CURRENT_LOG);
  if (!existsSync(logPath)) {
    return { valid: true };
  }
  
  const content = readFileSync(logPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  let prevHash = '0'.repeat(64);
  
  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]) as AuditLogEntry;
      
      const contentToHash = [
        prevHash,
        new Date(entry.timestamp).toISOString(),
        entry.action,
        entry.entryId || '',
        entry.actor,
        entry.details,
      ].join('|');
      
      const expectedHash = createHash('sha256').update(contentToHash).digest('hex');
      
      if (entry.hash !== expectedHash) {
        return {
          valid: false,
          brokenAt: i,
          error: `Hash mismatch at entry ${i}`,
        };
      }
      
      prevHash = entry.hash;
    } catch (err) {
      return {
        valid: false,
        brokenAt: i,
        error: `Parse error at entry ${i}: ${err}`,
      };
    }
  }
  
  return { valid: true };
}

export function getRecentAuditEntries(limit: number = 100): AuditLogEntry[] {
  initAuditLog();
  
  const logPath = join(AUDIT_DIR, CURRENT_LOG);
  if (!existsSync(logPath)) {
    return [];
  }
  
  const content = readFileSync(logPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  return lines
    .slice(-limit)
    .map(line => {
      try {
        return JSON.parse(line) as AuditLogEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is AuditLogEntry => entry !== null);
}

export function purgeOldAuditLogs(): number {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let purged = 0;
  
  try {
    const files = require('fs').readdirSync(AUDIT_DIR);
    for (const file of files) {
      if (file === CURRENT_LOG) continue;
      if (!file.startsWith('memory-audit-')) continue;
      
      const filePath = join(AUDIT_DIR, file);
      const stats = require('fs').statSync(filePath);
      
      if (stats.mtimeMs < cutoff) {
        require('fs').unlinkSync(filePath);
        purged++;
      }
    }
  } catch {}
  
  return purged;
}
