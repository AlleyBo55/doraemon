/**
 * Content Sanitizer for Living Experience System
 * 
 * Security-first approach (Snowden/Mr. Robot mindset):
 * - Never leak credentials, paths, or sensitive data
 * - Assume all input is potentially dangerous
 * - Defense in depth: multiple layers of filtering
 */

import { createHash } from 'crypto';

const CREDENTIAL_PATTERNS = [
  /api[_-]?key\s*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}/gi,
  /password\s*[=:]\s*['"]?[^\s'"]+/gi,
  /secret\s*[=:]\s*['"]?[a-zA-Z0-9_-]{10,}/gi,
  /token\s*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}/gi,
  /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
  /sk-ant-api\d{2}-[a-zA-Z0-9_-]{20,}/g,
  /sk-proj-[a-zA-Z0-9_-]{20,}/g,
  /sk-[a-zA-Z0-9]{32,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END/gi,
  /npm_[a-zA-Z0-9]{36}/g,
];

const PATH_PATTERNS = [
  /\/Users\/[^\/\s]+/g,
  /\/home\/[^\/\s]+/g,
  /C:\\Users\\[^\\]+/gi,
  /~\/[^\s]+/g,
  /\/etc\/(passwd|shadow|sudoers)/gi,
  /\/root\//g,
  /\.ssh\//g,
  /\.aws\//g,
  /\.env/g,
  /\.kube\/config/g,
];

const SENSITIVE_WORDS = [
  'password', 'passwd', 'secret', 'credential', 'private_key',
  'api_key', 'apikey', 'auth_token', 'access_token', 'refresh_token',
  'client_secret', 'database_url', 'connection_string',
];

export interface SanitizeResult {
  safe: boolean;
  content: string;
  redactedCount: number;
  warnings: string[];
}


export function sanitizeContent(content: string): SanitizeResult {
  let sanitized = content;
  let redactedCount = 0;
  const warnings: string[] = [];

  // 1. Remove credentials
  for (const pattern of CREDENTIAL_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      redactedCount += matches.length;
      warnings.push(`Redacted ${matches.length} credential pattern(s)`);
    }
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // 2. Anonymize paths
  for (const pattern of PATH_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      redactedCount += matches.length;
    }
    sanitized = sanitized.replace(pattern, '[PATH]');
  }

  // 3. Check for sensitive words in context
  for (const word of SENSITIVE_WORDS) {
    const regex = new RegExp(`${word}\\s*[=:]\\s*[^\\s]+`, 'gi');
    const matches = sanitized.match(regex);
    if (matches) {
      redactedCount += matches.length;
      warnings.push(`Redacted sensitive word: ${word}`);
    }
    sanitized = sanitized.replace(regex, `${word}=[REDACTED]`);
  }

  // 4. Remove high-entropy strings (potential secrets)
  sanitized = redactHighEntropyStrings(sanitized);

  // 5. Remove IP addresses
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

  // 6. Remove email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // 7. Remove UUIDs (might be session IDs)
  sanitized = sanitized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '[UUID]'
  );

  return {
    safe: redactedCount === 0,
    content: sanitized,
    redactedCount,
    warnings,
  };
}

function calculateEntropy(str: string): number {
  if (str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function redactHighEntropyStrings(content: string): string {
  const ENTROPY_THRESHOLD = 4.5;
  const MIN_LENGTH = 20;
  
  return content.replace(/[a-zA-Z0-9_-]{20,}/g, (match) => {
    const entropy = calculateEntropy(match);
    if (entropy > ENTROPY_THRESHOLD && match.length >= MIN_LENGTH) {
      return '[HIGH_ENTROPY]';
    }
    return match;
  });
}

export function hashForAudit(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split('/').pop() || filename.split('\\').pop() || filename;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
}

export function sanitizeLogEntry(entry: string): string {
  const result = sanitizeContent(entry);
  return result.content.substring(0, 500);
}
