/**
 * Browser Activity Watcher
 * 
 * Learns from browsing behavior with STRICT safety constraints.
 * Doraemon is a good guy - he observes to help, never to harm.
 * 
 * CORE PRINCIPLES:
 * 1. READ-ONLY: Never execute code, install anything, or take actions
 * 2. STRIP SENSITIVE: Passwords, tokens, PII are NEVER stored
 * 3. NO CRIMINAL: Never learn from or assist with illegal content
 * 4. HELPFUL ONLY: Learn patterns to assist, not to exploit
 */

import { BrowserWindow } from 'electron';
import { aggressiveLearn } from './connector.js';
import { logAuditEvent } from './audit.js';

interface BrowsingEvent {
  type: 'page_visit' | 'search' | 'tab_switch' | 'bookmark' | 'download';
  url?: string;
  title?: string;
  query?: string;
  timestamp: Date;
}

const SENSITIVE_URL_PATTERNS = [
  /password/i,
  /login/i,
  /signin/i,
  /auth/i,
  /oauth/i,
  /token/i,
  /api[_-]?key/i,
  /secret/i,
  /credential/i,
  /bank/i,
  /payment/i,
  /checkout/i,
  /billing/i,
  /stripe\.com/i,
  /paypal\.com/i,
  /venmo\.com/i,
  /account.*settings/i,
  /security.*settings/i,
  /2fa/i,
  /mfa/i,
  /recovery/i,
];

const SENSITIVE_DOMAINS = new Set([
  'accounts.google.com',
  'login.microsoftonline.com',
  'auth0.com',
  'okta.com',
  'stripe.com',
  'paypal.com',
  'venmo.com',
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'capitalone.com',
  'mint.com',
  'robinhood.com',
  'coinbase.com',
  'binance.com',
  'kraken.com',
  'lastpass.com',
  '1password.com',
  'bitwarden.com',
  'dashlane.com',
]);

const CRIMINAL_PATTERNS = [
  /hack/i,
  /crack/i,
  /exploit/i,
  /malware/i,
  /ransomware/i,
  /phishing/i,
  /carding/i,
  /fraud/i,
  /illegal/i,
  /darknet/i,
  /dark\s*web/i,
  /tor\s*market/i,
  /drug\s*market/i,
  /weapon/i,
  /counterfeit/i,
  /stolen\s*data/i,
  /ddos/i,
  /botnet/i,
];

const PII_PATTERNS = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
  /\b[A-Z]{2}\d{6,8}\b/i, // Passport
  /\b\d{9}\b/, // 9-digit numbers (various IDs)
  /password\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
  /secret\s*[:=]\s*\S+/i,
  /token\s*[:=]\s*\S+/i,
  /bearer\s+\S+/i,
  /authorization\s*[:=]\s*\S+/i,
];

const ALLOWED_LEARNING_DOMAINS = [
  /github\.com/,
  /stackoverflow\.com/,
  /developer\.mozilla\.org/,
  /docs\./,
  /documentation\./,
  /learn\./,
  /tutorial/,
  /medium\.com/,
  /dev\.to/,
  /hashnode\./,
  /freecodecamp/,
  /w3schools/,
  /geeksforgeeks/,
  /leetcode/,
  /hackerrank/,
  /codepen/,
  /jsfiddle/,
  /replit/,
  /youtube\.com.*watch/, // Video learning
  /coursera/,
  /udemy/,
  /pluralsight/,
  /egghead/,
  /frontendmasters/,
  /wikipedia\.org/,
  /arxiv\.org/,
  /news\.ycombinator/,
  /reddit\.com\/r\/(programming|webdev|javascript|typescript|react|node)/,
];

function isSensitiveUrl(url: string): boolean {
  for (const pattern of SENSITIVE_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  
  try {
    const parsed = new URL(url);
    if (SENSITIVE_DOMAINS.has(parsed.hostname)) return true;
    if (SENSITIVE_DOMAINS.has(parsed.hostname.replace('www.', ''))) return true;
  } catch {}
  
  return false;
}

function isCriminalContent(text: string): boolean {
  for (const pattern of CRIMINAL_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function stripPII(text: string): string {
  let cleaned = text;
  for (const pattern of PII_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  
  cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  cleaned = cleaned.replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  
  return cleaned;
}

function isAllowedForLearning(url: string): boolean {
  for (const pattern of ALLOWED_LEARNING_DOMAINS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

function sanitizeForLearning(event: BrowsingEvent): { safe: boolean; content?: string; reason?: string } {
  if (!event.url && !event.title && !event.query) {
    return { safe: false, reason: 'Empty event' };
  }
  
  const fullText = [event.url, event.title, event.query].filter(Boolean).join(' ');
  
  if (event.url && isSensitiveUrl(event.url)) {
    logAuditEvent('access_denied', `Blocked sensitive URL: ${event.url.substring(0, 50)}...`, undefined, 'browser_watcher');
    return { safe: false, reason: 'Sensitive URL detected' };
  }
  
  if (isCriminalContent(fullText)) {
    logAuditEvent('access_denied', `Blocked criminal content pattern`, undefined, 'browser_watcher');
    return { safe: false, reason: 'Criminal content pattern detected' };
  }
  
  if (event.url && !isAllowedForLearning(event.url)) {
    return { safe: false, reason: 'URL not in allowed learning domains' };
  }
  
  const cleanTitle = event.title ? stripPII(event.title) : '';
  const cleanQuery = event.query ? stripPII(event.query) : '';
  
  let content = '';
  
  switch (event.type) {
    case 'page_visit':
      if (cleanTitle) {
        content = `Browsed: "${cleanTitle}"`;
      }
      break;
    case 'search':
      if (cleanQuery) {
        content = `Searched for: "${cleanQuery}"`;
      }
      break;
    case 'bookmark':
      if (cleanTitle) {
        content = `Bookmarked: "${cleanTitle}"`;
      }
      break;
    default:
      return { safe: false, reason: 'Unsupported event type' };
  }
  
  if (!content || content.length < 10) {
    return { safe: false, reason: 'Content too short' };
  }
  
  return { safe: true, content };
}

export async function learnFromBrowsing(event: BrowsingEvent): Promise<boolean> {
  const sanitized = sanitizeForLearning(event);
  
  if (!sanitized.safe || !sanitized.content) {
    return false;
  }
  
  const result = await aggressiveLearn({
    content: sanitized.content,
    category: 'context',
    source: 'browser_watcher',
    metadata: {
      eventType: event.type,
      timestamp: event.timestamp.toISOString(),
    },
  });
  
  return result.success;
}

let isWatching = false;
let chromeHistoryPath: string | null = null;
let lastCheckedTime = Date.now();

export function setBrowserProfile(profilePath: string): void {
  chromeHistoryPath = profilePath;
  console.log(`[BrowserWatcher] Profile set to: ${profilePath}`);
}

export function startBrowserWatcher(_mainWindow: BrowserWindow): void {
  if (isWatching) return;
  isWatching = true;
  
  console.log('[BrowserWatcher] Started (read-only mode)');
  console.log('[BrowserWatcher] Safety constraints active:');
  console.log('  - Sensitive URLs blocked');
  console.log('  - Criminal content blocked');
  console.log('  - PII automatically stripped');
  console.log('  - Only allowed learning domains');
  console.log('  - READ-ONLY: No code execution, no installs');
  
  lastCheckedTime = Date.now();
}

export function stopBrowserWatcher(): void {
  isWatching = false;
  console.log('[BrowserWatcher] Stopped');
}

export function getWatcherStatus(): {
  isWatching: boolean;
  profilePath: string | null;
  constraints: string[];
} {
  return {
    isWatching,
    profilePath: chromeHistoryPath,
    constraints: [
      'READ-ONLY: Never executes code or installs anything',
      'SENSITIVE_BLOCKED: Banking, auth, payment URLs ignored',
      'CRIMINAL_BLOCKED: Illegal content patterns rejected',
      'PII_STRIPPED: Personal data automatically redacted',
      'ALLOWED_DOMAINS: Only learns from educational/dev sites',
      'DORAEMON_SOUL: Helpful only, never harmful',
    ],
  };
}
