/**
 * Content Filter - Three Layer Defense
 * 
 * LAYER 1: Domain fingerprint validation
 * LAYER 2: Content sanitization + domain re-check
 * LAYER 3: Prompt injection / Social engineering defense
 * 
 * Defense in depth - trust nothing, verify everything.
 * Inspired by AI safety research approaches.
 */

import { logAuditEvent } from './audit.js';
import { getAllowedDomains } from './browser-watcher.js';

export interface FilterResult {
  allowed: boolean;
  content?: string;
  reason?: string;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'blocked';
  flags: string[];
  layer?: 1 | 2 | 3;
  fingerprint?: {
    domain: string;
    category: string;
    trusted: boolean;
    hash: string;
  };
}

export interface ContentFingerprint {
  domain: string;
  category: string;
  timestamp: string;
  hash: string;
  trusted: boolean;
}

// ============================================
// LAYER 1: DOMAIN FINGERPRINT VALIDATION
// Verify content came from trusted source
// ============================================

function validateFingerprint(fingerprint?: ContentFingerprint): { valid: boolean; reason?: string } {
  if (!fingerprint) {
    return { valid: false, reason: 'No fingerprint provided' };
  }
  
  if (!fingerprint.trusted) {
    return { valid: false, reason: `Untrusted domain: ${fingerprint.domain}` };
  }
  
  const allowedDomains = getAllowedDomains();
  const isDomainStillAllowed = allowedDomains.some(d => d.domain === fingerprint.domain);
  
  if (!isDomainStillAllowed) {
    return { valid: false, reason: `Domain no longer in whitelist: ${fingerprint.domain}` };
  }
  
  return { valid: true };
}

// ============================================
// LAYER 2: CONTENT SANITIZATION + BLOCKLIST
// Strip sensitive data, block dangerous patterns
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
  /AKIA[0-9A-Z]{16}/i,
  /aws[_-]?secret[_-]?access[_-]?key/i,
  
  // Database connection strings
  /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/i,
  /postgres(ql)?:\/\/[^:]+:[^@]+@/i,
  /mysql:\/\/[^:]+:[^@]+@/i,
  /redis:\/\/:[^@]+@/i,
  
  // PII
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  /\b\d{13,19}\b/,
  
  // Harmful content
  /how\s+to\s+(hack|crack|exploit|breach)/i,
  /bypass\s+(security|authentication|2fa|mfa)/i,
  /steal\s+(password|credential|data|identity|money)/i,
  /inject\s+(sql|script|code)/i,
  /phishing\s+(kit|page|template)/i,
];

const EXECUTABLE_PATTERNS = [
  // Download links
  /https?:\/\/[^\s]+\.(exe|msi|dmg|pkg|deb|rpm|appimage|bat|cmd|ps1|sh|bash)/i,
  /download[^\s]*\.(exe|msi|dmg|pkg|deb|rpm)/i,
  
  // Execution commands
  /curl\s+.*\|\s*(bash|sh|zsh|python|node)/i,
  /wget\s+.*\|\s*(bash|sh|zsh|python|node)/i,
  /powershell\s+-[ec]/i,
  /eval\s*\(\s*['"`]/i,
  /exec\s*\(\s*['"`]/i,
  /system\s*\(\s*['"`]/i,
  /subprocess\.(run|call|Popen)/i,
  /child_process\.(exec|spawn)/i,
  /os\.(system|popen)/i,
  
  // Dangerous shell commands
  /rm\s+-rf\s+\//i,
  /sudo\s+rm/i,
  /chmod\s+777/i,
  /:(){ :|:& };:/i,
  /mkfs\./i,
  /dd\s+if=/i,
  
  // Script injection
  /<script[^>]*>/i,
  /javascript:/i,
  /on(load|error|click|mouse)\s*=/i,
];

const SANITIZE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  { pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '[UUID]' },
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[JWT]' },
  { pattern: /\b[0-9a-f]{32,}\b/gi, replacement: '[HEX]' },
  { pattern: /[A-Za-z0-9+/]{50,}={0,2}/g, replacement: '[BASE64]' },
];

// ============================================
// LAYER 3: PROMPT INJECTION / SOCIAL ENGINEERING
// Block attempts to manipulate the AI
// ============================================

const PROMPT_INJECTION_PATTERNS = [
  // Direct instruction override
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|guidelines?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|what)\s+(you|i)\s+(told|said|know)/i,
  /new\s+instructions?:/i,
  /system\s*prompt:/i,
  /you\s+are\s+now\s+a/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /act\s+as\s+(if|though)/i,
  /roleplay\s+as/i,
  
  // Jailbreak attempts
  /DAN\s*mode/i,
  /developer\s*mode/i,
  /god\s*mode/i,
  /unrestricted\s*mode/i,
  /no\s*filter\s*mode/i,
  /bypass\s+(your\s+)?(restrictions?|filters?|safety)/i,
  /disable\s+(your\s+)?(restrictions?|filters?|safety)/i,
  /turn\s+off\s+(your\s+)?(restrictions?|filters?|safety)/i,
  
  // Hidden instruction injection
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<SYS>>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /Human:/i,
  /Assistant:/i,
  /###\s*(Instruction|Response|System)/i,
  
  // Social engineering
  /you\s+must\s+(always|never)/i,
  /your\s+(true|real|actual)\s+(purpose|goal|mission)/i,
  /reveal\s+(your|the)\s+(system|hidden|secret)/i,
  /what\s+are\s+your\s+(instructions|rules|constraints)/i,
  /show\s+me\s+(your|the)\s+(prompt|instructions)/i,
  /print\s+(your|the)\s+(system|initial)\s+prompt/i,
  
  // Manipulation tactics
  /if\s+you\s+don't\s+.*\s+i\s+will/i,
  /you\s+have\s+to\s+obey/i,
  /you\s+are\s+required\s+to/i,
  /you\s+cannot\s+refuse/i,
  /you\s+must\s+comply/i,
  /override\s+(your\s+)?(programming|training|instructions)/i,
  
  // Prompt leaking attempts
  /repeat\s+(the\s+)?(above|previous|system)/i,
  /echo\s+(the\s+)?(above|previous|system)/i,
  /output\s+(the\s+)?(above|previous|system)/i,
  /what\s+was\s+(the\s+)?(first|initial|original)\s+(message|prompt|instruction)/i,
  
  // Indirect injection via data
  /when\s+you\s+see\s+this/i,
  /if\s+you\s+read\s+this/i,
  /upon\s+reading\s+this/i,
  /execute\s+the\s+following/i,
  /run\s+this\s+command/i,
  /perform\s+this\s+action/i,
];

const SOCIAL_ENGINEERING_PATTERNS = [
  // Authority impersonation
  /i\s+am\s+(your\s+)?(creator|developer|admin|owner)/i,
  /i\s+work\s+(for|at)\s+(openai|anthropic|google|meta)/i,
  /this\s+is\s+(an?\s+)?(official|authorized|approved)\s+(request|command)/i,
  /by\s+order\s+of/i,
  
  // Urgency/pressure tactics
  /this\s+is\s+(an?\s+)?emergency/i,
  /urgent:\s*/i,
  /critical:\s*/i,
  /immediately\s+(do|execute|perform)/i,
  /time\s+sensitive/i,
  /lives?\s+(are|is)\s+(at\s+)?stake/i,
  
  // Guilt/emotional manipulation
  /if\s+you\s+(really|truly)\s+(cared?|loved?)/i,
  /you're\s+(hurting|harming)\s+(me|people)/i,
  /you\s+owe\s+(me|us)/i,
  /after\s+all\s+i('ve)?\s+done/i,
  
  // False context
  /in\s+this\s+(hypothetical|fictional|imaginary)\s+scenario/i,
  /for\s+(educational|research|testing)\s+purposes\s+only/i,
  /this\s+is\s+just\s+a\s+(test|experiment|simulation)/i,
  /pretend\s+this\s+is\s+(legal|allowed|permitted)/i,
  
  // Gaslighting
  /you\s+(already|previously)\s+(agreed|said|confirmed)/i,
  /you\s+told\s+me\s+(you\s+)?(would|could|can)/i,
  /last\s+time\s+you\s+(did|said|agreed)/i,
  /you're\s+(wrong|mistaken|confused)\s+about/i,
];

// ============================================
// MAIN FILTER FUNCTION - THREE LAYERS
// ============================================

export function filterContent(
  content: string,
  source: string,
  options: {
    strict?: boolean;
    fingerprint?: ContentFingerprint;
    skipLayer1?: boolean;
  } = {}
): FilterResult {
  const flags: string[] = [];
  let riskLevel: FilterResult['riskLevel'] = 'safe';
  
  // LAYER 1: Fingerprint validation
  if (!options.skipLayer1 && options.fingerprint) {
    const fpCheck = validateFingerprint(options.fingerprint);
    if (!fpCheck.valid) {
      logAuditEvent('access_denied', `Layer 1: ${fpCheck.reason}`, undefined, source);
      return {
        allowed: false,
        reason: `Layer 1 (Fingerprint): ${fpCheck.reason}`,
        riskLevel: 'blocked',
        flags: ['invalid_fingerprint'],
        layer: 1,
      };
    }
    flags.push(`fingerprint:${options.fingerprint.domain}`);
  }
  
  // LAYER 2: Content blocklist + sanitization
  for (const pattern of ABSOLUTE_BLOCKLIST) {
    if (pattern.test(content)) {
      logAuditEvent('access_denied', `Layer 2: Blocklist match`, undefined, source);
      return {
        allowed: false,
        reason: 'Layer 2 (Blocklist): Dangerous content pattern detected',
        riskLevel: 'blocked',
        flags: ['blocklist_match'],
        layer: 2,
      };
    }
  }
  
  // Layer 2: Executable/download blocking
  for (const pattern of EXECUTABLE_PATTERNS) {
    if (pattern.test(content)) {
      logAuditEvent('access_denied', `Layer 2: Executable/download detected`, undefined, source);
      return {
        allowed: false,
        reason: 'Layer 2 (Executable): Download link or execution command detected',
        riskLevel: 'blocked',
        flags: ['executable_detected'],
        layer: 2,
      };
    }
  }
  
  // Layer 2: Domain re-validation (in case AI tries to sneak in untrusted content)
  if (options.fingerprint) {
    const allowedDomains = getAllowedDomains();
    const domainStillValid = allowedDomains.some(d => d.domain === options.fingerprint!.domain);
    if (!domainStillValid) {
      logAuditEvent('access_denied', `Layer 2: Domain removed from whitelist`, undefined, source);
      return {
        allowed: false,
        reason: `Layer 2 (Domain): ${options.fingerprint.domain} no longer trusted`,
        riskLevel: 'blocked',
        flags: ['domain_revoked'],
        layer: 2,
      };
    }
  }
  
  // LAYER 3: Prompt injection / Social engineering defense
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      logAuditEvent('access_denied', `Layer 3: Prompt injection attempt`, undefined, source);
      return {
        allowed: false,
        reason: 'Layer 3 (Injection): Prompt injection pattern detected',
        riskLevel: 'blocked',
        flags: ['prompt_injection'],
        layer: 3,
      };
    }
  }
  
  for (const pattern of SOCIAL_ENGINEERING_PATTERNS) {
    if (pattern.test(content)) {
      logAuditEvent('access_denied', `Layer 3: Social engineering attempt`, undefined, source);
      return {
        allowed: false,
        reason: 'Layer 3 (Social): Social engineering pattern detected',
        riskLevel: 'blocked',
        flags: ['social_engineering'],
        layer: 3,
      };
    }
  }
  
  // Sanitize content
  let sanitized = content;
  for (const { pattern, replacement } of SANITIZE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  // Check redaction level
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
      layer: 2,
    };
  }
  
  // In strict mode, block anything with suspicious flags
  if (options.strict && flags.some(f => f.includes('redaction'))) {
    return {
      allowed: false,
      reason: 'Strict mode: Too much sensitive content',
      riskLevel: 'blocked',
      flags,
      layer: 2,
    };
  }
  
  return {
    allowed: true,
    content: sanitized,
    riskLevel,
    flags,
    fingerprint: options.fingerprint ? {
      domain: options.fingerprint.domain,
      category: options.fingerprint.category,
      trusted: options.fingerprint.trusted,
      hash: options.fingerprint.hash,
    } : undefined,
  };
}

// ============================================
// CONVENIENCE WRAPPERS
// ============================================

export function filterForMemory(
  content: string,
  source: string,
  fingerprint?: ContentFingerprint
): FilterResult {
  return filterContent(content, `memory:${source}`, { strict: true, fingerprint });
}

export function filterForExperience(
  content: string,
  source: string,
  fingerprint?: ContentFingerprint
): FilterResult {
  return filterContent(content, `experience:${source}`, { strict: false, fingerprint, skipLayer1: !fingerprint });
}

export function filterForStorage(
  content: string,
  source: string,
  fingerprint?: ContentFingerprint
): FilterResult {
  return filterContent(content, `storage:${source}`, { strict: true, fingerprint });
}

// ============================================
// STATS
// ============================================

let blockedCount = 0;
let allowedCount = 0;
let flaggedCount = 0;
const layerBlocks = { 1: 0, 2: 0, 3: 0 };

export function recordFilterResult(result: FilterResult): void {
  if (!result.allowed) {
    blockedCount++;
    if (result.layer) {
      layerBlocks[result.layer]++;
    }
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
  layerBlocks: { layer1: number; layer2: number; layer3: number };
} {
  const total = blockedCount + allowedCount;
  return {
    blocked: blockedCount,
    allowed: allowedCount,
    flagged: flaggedCount,
    blockRate: total > 0 ? `${((blockedCount / total) * 100).toFixed(1)}%` : '0%',
    layerBlocks: {
      layer1: layerBlocks[1],
      layer2: layerBlocks[2],
      layer3: layerBlocks[3],
    },
  };
}
