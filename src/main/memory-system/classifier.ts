/**
 * Content Classifier - Determines security classification
 * 
 * Implements multi-layer classification:
 * 1. Pattern matching for known sensitive data
 * 2. Entropy analysis for potential secrets
 * 3. Context-aware classification
 */

import { SecurityClassification, ClassificationRule } from './types.js';

const RESTRICTED_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /private[_-]?key/i,
  /bearer\s+token/i,
  /authorization/i,
  /credential/i,
  /ssh[_-]?key/i,
  /-----BEGIN.*KEY-----/,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /AKIA[0-9A-Z]{16}/,
];

const CONFIDENTIAL_PATTERNS: RegExp[] = [
  /email/i,
  /phone/i,
  /address/i,
  /ssn|social\s*security/i,
  /credit\s*card/i,
  /bank\s*account/i,
  /medical/i,
  /health/i,
  /salary/i,
  /income/i,
];

const INTERNAL_PATTERNS: RegExp[] = [
  /internal/i,
  /private/i,
  /draft/i,
  /todo/i,
  /fixme/i,
  /hack/i,
  /workaround/i,
];

export interface ClassificationResult {
  classification: SecurityClassification;
  confidence: number;
  reasons: string[];
  shouldRedact: boolean;
  redactedContent?: string;
}

export function classifyContent(
  content: string,
  customRules: ClassificationRule[] = []
): ClassificationResult {
  const reasons: string[] = [];
  let classification: SecurityClassification = 'public';
  let confidence = 1.0;
  let shouldRedact = false;

  for (const rule of customRules) {
    if (rule.pattern.test(content)) {
      if (getClassificationLevel(rule.classification) > getClassificationLevel(classification)) {
        classification = rule.classification;
        reasons.push(`Custom rule matched: ${rule.pattern.source}`);
        if (rule.action === 'redact' || rule.action === 'block') {
          shouldRedact = true;
        }
      }
    }
  }

  for (const pattern of RESTRICTED_PATTERNS) {
    if (pattern.test(content)) {
      classification = 'restricted';
      reasons.push(`Restricted pattern: ${pattern.source}`);
      shouldRedact = true;
      break;
    }
  }

  if (classification !== 'restricted') {
    for (const pattern of CONFIDENTIAL_PATTERNS) {
      if (pattern.test(content)) {
        if (getClassificationLevel('confidential') > getClassificationLevel(classification)) {
          classification = 'confidential';
          reasons.push(`Confidential pattern: ${pattern.source}`);
        }
      }
    }
  }

  if (classification === 'public') {
    for (const pattern of INTERNAL_PATTERNS) {
      if (pattern.test(content)) {
        classification = 'internal';
        reasons.push(`Internal pattern: ${pattern.source}`);
        break;
      }
    }
  }

  const entropy = calculateEntropy(content);
  if (entropy > 4.5 && content.length > 20) {
    if (getClassificationLevel('confidential') > getClassificationLevel(classification)) {
      classification = 'confidential';
      reasons.push(`High entropy detected: ${entropy.toFixed(2)}`);
      confidence *= 0.8;
    }
  }

  return {
    classification,
    confidence,
    reasons,
    shouldRedact,
    redactedContent: shouldRedact ? redactSensitive(content) : undefined,
  };
}

function getClassificationLevel(c: SecurityClassification): number {
  const levels: Record<SecurityClassification, number> = {
    public: 0,
    internal: 1,
    confidential: 2,
    restricted: 3,
  };
  return levels[c];
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

function redactSensitive(content: string): string {
  let redacted = content;
  
  for (const pattern of RESTRICTED_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  
  redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  redacted = redacted.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  redacted = redacted.replace(/\/Users\/[^\/\s]+/g, '[USER_PATH]');
  redacted = redacted.replace(/\/home\/[^\/\s]+/g, '[USER_PATH]');
  redacted = redacted.replace(/C:\\Users\\[^\\]+/gi, '[USER_PATH]');
  
  return redacted;
}

export function isStorageSafe(content: string): boolean {
  const result = classifyContent(content);
  return result.classification !== 'restricted';
}
