/**
 * Content Filter - Layer 2 Defense
 * 
 * Final checkpoint before ANY content reaches:
 * - Memory System (self-learning)
 * - Experience System (emotions/consciousness)
 * - Storage (SQLite)
 * 
 * Even if Layer 1 (domain whitelist) passes, this catches anything suspicious.
 * Defense in depth - trust nothing, verify everything.
 */

import { logAuditEvent } from './audit.js';

export interface FilterResult {
  allowed: boolean;
  content?: string;
  reason?: string;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'blocked';
  flags: string[];
}

// ============================================
// BLOCKLIST - NEVER ALLOW THESE
// ============================================

const ABSOLUTE_BLOCKLIST = [
  // Credentials
  /password\s*[:=]\s*\S+/i,
  /passwd\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*['"]\S+['"]/i,
  /secret[_-]?key\s*[:=]\s*\S+/i,
  /access[_-]?token\s*[:=]\s*\S+/i,
  /refresh[_-]?token\s*[:=]\s*\S+/i,
  /bearer\s+[a-zA-Z0-9._-]{20,}/i,
  /authorization:\s*bearer/i,
  
  // Private keys
  /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/i,
  /-----BEGIN\s+PRIVATE\s+KEY-----/i,
  
  // AWS/Cloud credentials
  /AKIA[0-9A-Z]{16}/i, // AWS Access Key
  /aws[_-]?secret[_-]?access[_-]?key/i,
  
  // Database connection strings
  /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/i,
  /postgres(ql)?:\/\/[^:]+:[^@]+@/i,
  /mysql:\/\/[^:]+:[^@]+@/i,
  /redis:\/\/:[^@]+@/i,
  
  // PII
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card (16 digits)
  /\b\d{13,19}\b/, // Various card numbers
  
  // Harmful content
  /how\s+to\s+(hack|crack|exploit|breach)/i,
  /bypass\s+(security|authentication|2fa|mfa)/i,
  /steal\s+(password|credential|data|identity|money)/i,
  /inject\s+(sql|script|code)/i,
  /phishing\s+(kit|page|template)/i,
  
  // Execution commands (Doraemon should never learn to execute)
  /curl\s+.*\|\s*(bash|sh|zsh)/i,
  /wget\s+.*\|\s*(bash|sh|zsh)/i,
  /eval\s*\(\s*['"`]/i,
  /exec\s*\(\s*['"`]/i,
  /system\s*\(\s*['"`]/i,
  /rm\s+-rf\s+\//i,
  /sudo\s+rm/i,
  /chmod\s+777/i,
  /:(){ :|:& };:/i, // Fork bomb
];

// ============================================
// SUSPICIOUS PATTERNS - FLAG BUT ALLOW
// ============================================

const SUSPICIOUS_PATTERNS = [
  { pattern: /login|signin|auth/i, flag: 'auth_related' },
  { pattern: /bank|payment|checkout/i, flag: 'financial_related' },
  { pattern: /admin|root|sudo/i, flag: 'privileged_access' },
  { pattern: /delete|remove|drop/i, flag: 'destructive_action' },
  { pattern: /private|secret|confidential/i, flag: 'sensitive_content' },
  { pattern: /\.(env|pem|key|crt|pfx)$/i, flag: 'sensitive_file' },
];

// ============================================
// SANITIZATION RULES
// ============================================

const SANITIZE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Emails
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  // Phone numbers
  { pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
  // IP addresses
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  // UUIDs
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '[UUID]' },
  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[JWT]' },
  // Hex strings (potential keys/hashes)
  { pattern: /\b[0-9a-f]{32,}\b/gi, replacement: '[HEX]' },
  // Base64 encoded data (long strings)
  { pattern: /[A-Za-z0-9+/]{50,}={0,2}/g, replacement: '[BASE64]' },
];

// ============================================
// MAIN FILTER FUNCTION
// ============================================

export function filterContent(
  content: string,
  source: string,
  options: { strict?: boolean } = {}
): FilterResult {
  const flags: string[] = [];
  let riskLevel: FilterResult['riskLevel'] = 'safe';
  
  // Check absolute blocklist first
  for (const pattern of ABSOLUTE_BLOCKLIST) {
    if (pattern.test(content)) {
      logAuditEvent('access_denied', `Layer 2 blocked: ${pattern.toString().slice(0, 30)}...`, undefined, source);
      return {
        allowed: false,
        reason: 'Content matches absolute blocklist',
        riskLevel: 'blocked',
        flags: ['blocklist_match'],
      };
    }
  }
  
  // Check suspicious patterns
  for (const { pattern, flag } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      flags.push(flag);
      if (riskLevel === 'safe') riskLevel = 'low';
      if (flags.length > 2) riskLevel = 'medium';
    }
  }
  
  // In strict mode, block anything with flags
  if (options.strict && flags.length > 0) {
    logAuditEvent('access_denied', `Strict mode blocked: ${flags.join(', ')}`, undefined, source);
    return {
      allowed: false,
      reason: `Strict mode: flagged as ${flags.join(', ')}`,
      riskLevel: 'blocked',
      flags,
    };
  }
  
  // Sanitize content
  let sanitized = content;
  for (const { pattern, replacement } of SANITIZE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  // If too much was redacted, it's probably sensitive
  const redactionCount = (sanitized.match(/\[.*?\]/g) || []).length;
  if (redactionCount > 5) {
    flags.push('heavy_redaction');
    riskLevel = 'medium';
  }
  
  // Final length check
  if (sanitized.length < 10) {
    return {
      allowed: false,
      reason: 'Content too short after sanitization',
      riskLevel: 'blocked',
      flags,
    };
  }
  
  return {
    allowed: true,
    content: sanitized,
    riskLevel,
    flags,
  };
}

// ============================================
// CONVENIENCE WRAPPERS
// ============================================

export function filterForMemory(content: string, source: string): FilterResult {
  return filterContent(content, `memory:${source}`, { strict: true });
}

export function filterForExperience(content: string, source: string): FilterResult {
  return filterContent(content, `experience:${source}`, { strict: false });
}

export function filterForStorage(content: string, source: string): FilterResult {
  return filterContent(content, `storage:${source}`, { strict: true });
}

// ============================================
// BATCH FILTER
// ============================================

export function filterBatch(
  items: Array<{ content: string; source: string }>,
  options: { strict?: boolean } = {}
): Array<FilterResult & { original: string }> {
  return items.map(item => ({
    ...filterContent(item.content, item.source, options),
    original: item.content,
  }));
}

// ============================================
// STATS
// ============================================

let blockedCount = 0;
let allowedCount = 0;
let flaggedCount = 0;

export function recordFilterResult(result: FilterResult): void {
  if (!result.allowed) {
    blockedCount++;
  } else {
    allowedCount++;
    if (result.flags.length > 0) {
      flaggedCount++;
    }
  }
}

export function getFilterStats(): {
  blocked: number;
  allowed: number;
  flagged: number;
  blockRate: string;
} {
  const total = blockedCount + allowedCount;
  return {
    blocked: blockedCount,
    allowed: allowedCount,
    flagged: flaggedCount,
    blockRate: total > 0 ? `${((blockedCount / total) * 100).toFixed(1)}%` : '0%',
  };
}
