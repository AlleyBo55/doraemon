/**
 * Browser Activity Watcher
 * 
 * STRICT DOMAIN WHITELIST - Only learns from explicitly allowed domains.
 * Two-layer filtering: Domain check → Content sanitization → Memory
 * 
 * Doraemon is a good guy - he only watches what you explicitly allow.
 */

import { BrowserWindow } from 'electron';
import { logAuditEvent } from './audit.js';

// Import browsing thoughts
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let BROWSING_THOUGHTS: Record<string, Record<string, string[]> | string[]>;
try {
  BROWSING_THOUGHTS = require('../../../renderer/core/constants/browsing-thoughts.json');
} catch {
  BROWSING_THOUGHTS = { general: ['Browsing the web~'] };
}

export interface BrowsingEvent {
  type: 'page_visit' | 'search' | 'tab_switch' | 'bookmark' | 'video_watch' | 'post_view';
  url?: string;
  domain?: string;
  title?: string;
  query?: string;
  timestamp: Date;
  extensionId?: string;
}

export interface FilteredContent {
  safe: boolean;
  content?: string;
  domain?: string;
  category?: 'social' | 'entertainment' | 'dev' | 'news' | 'learning' | 'personal';
  reason?: string;
  fingerprint?: ContentFingerprint;
}

export interface ContentFingerprint {
  domain: string;
  category: string;
  timestamp: string;
  hash: string;
  trusted: boolean;
}

// ============================================
// LAYER 1: STRICT DOMAIN WHITELIST
// Only these domains are allowed - everything else is rejected
// ============================================

const ALLOWED_DOMAINS: Map<string, { category: string; description: string }> = new Map([
  // Social Media
  ['twitter.com', { category: 'social', description: 'Twitter/X' }],
  ['x.com', { category: 'social', description: 'Twitter/X' }],
  ['reddit.com', { category: 'social', description: 'Reddit' }],
  ['instagram.com', { category: 'social', description: 'Instagram' }],
  ['tiktok.com', { category: 'social', description: 'TikTok' }],
  
  // Entertainment / Manga
  ['manhwaz.com', { category: 'entertainment', description: 'Manhwa reading' }],
  ['shinigami09.com', { category: 'entertainment', description: 'Manga/Anime' }],
  ['youtube.com', { category: 'entertainment', description: 'YouTube' }],
  ['youtu.be', { category: 'entertainment', description: 'YouTube short links' }],
  
  // Dev / Tech
  ['github.com', { category: 'dev', description: 'GitHub' }],
  ['stackoverflow.com', { category: 'dev', description: 'Stack Overflow' }],
  ['dev.to', { category: 'dev', description: 'Dev.to' }],
  ['hashnode.dev', { category: 'dev', description: 'Hashnode' }],
  ['medium.com', { category: 'dev', description: 'Medium' }],
  ['hackernews.com', { category: 'dev', description: 'Hacker News' }],
  ['news.ycombinator.com', { category: 'dev', description: 'Hacker News' }],
  ['developer.mozilla.org', { category: 'dev', description: 'MDN Docs' }],
  
  // News
  ['techcrunch.com', { category: 'news', description: 'TechCrunch' }],
  ['theverge.com', { category: 'news', description: 'The Verge' }],
  ['arstechnica.com', { category: 'news', description: 'Ars Technica' }],
  ['wired.com', { category: 'news', description: 'Wired' }],
  
  // Personal / Your Sites
  ['moltbook.com', { category: 'personal', description: 'Moltbook' }],
  ['www.moltbook.com', { category: 'personal', description: 'Moltbook' }],
]);

// Extensions that are allowed to send data
const ALLOWED_EXTENSIONS: Set<string> = new Set([
  'doraemon-browser-companion',
  'doraemon-watcher',
]);

// ============================================
// LAYER 2: CONTENT SANITIZATION
// Even from allowed domains, strip sensitive data
// ============================================

const SENSITIVE_PATTERNS = [
  /password/i,
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /authorization/i,
  /credit\s*card/i,
  /ssn/i,
  /social\s*security/i,
];

const PII_PATTERNS = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email
  /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // Phone
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
];

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isDomainAllowed(url: string): { allowed: boolean; domain?: string; info?: { category: string; description: string } } {
  const domain = extractDomain(url);
  if (!domain) return { allowed: false };
  
  // Check exact match
  if (ALLOWED_DOMAINS.has(domain)) {
    return { allowed: true, domain, info: ALLOWED_DOMAINS.get(domain) };
  }
  
  // Check with www prefix
  const withWww = `www.${domain}`;
  if (ALLOWED_DOMAINS.has(withWww)) {
    return { allowed: true, domain, info: ALLOWED_DOMAINS.get(withWww) };
  }
  
  // Check subdomain (e.g., old.reddit.com → reddit.com)
  const parts = domain.split('.');
  if (parts.length > 2) {
    const baseDomain = parts.slice(-2).join('.');
    if (ALLOWED_DOMAINS.has(baseDomain)) {
      return { allowed: true, domain: baseDomain, info: ALLOWED_DOMAINS.get(baseDomain) };
    }
  }
  
  return { allowed: false, domain };
}

function generateFingerprint(domain: string, category: string, content: string): ContentFingerprint {
  const timestamp = new Date().toISOString();
  const hashInput = `${domain}:${category}:${timestamp}:${content.substring(0, 50)}`;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return {
    domain,
    category,
    timestamp,
    hash: Math.abs(hash).toString(16).padStart(8, '0'),
    trusted: ALLOWED_DOMAINS.has(domain),
  };
}

function isExtensionAllowed(extensionId?: string): boolean {
  if (!extensionId) return true; // No extension = direct browser event
  return ALLOWED_EXTENSIONS.has(extensionId);
}

function sanitizeContent(text: string): string {
  let cleaned = text;
  
  // Remove PII
  for (const pattern of PII_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  
  // Check for sensitive keywords and redact surrounding context
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, '[SENSITIVE]');
    }
  }
  
  return cleaned.trim();
}

function hasSensitiveContent(text: string): boolean {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// ============================================
// MAIN FILTER FUNCTION - TWO LAYERS
// ============================================

export function filterBrowsingEvent(event: BrowsingEvent): FilteredContent {
  // LAYER 1: Extension check
  if (!isExtensionAllowed(event.extensionId)) {
    logAuditEvent('access_denied', `Blocked unknown extension: ${event.extensionId}`, undefined, 'browser_watcher');
    return { safe: false, reason: `Extension not in whitelist: ${event.extensionId}` };
  }
  
  // LAYER 1: Domain check
  if (event.url) {
    const domainCheck = isDomainAllowed(event.url);
    if (!domainCheck.allowed) {
      logAuditEvent('access_denied', `Blocked domain: ${domainCheck.domain}`, undefined, 'browser_watcher');
      return { safe: false, reason: `Domain not in whitelist: ${domainCheck.domain}` };
    }
    
    // LAYER 2: Content sanitization
    const rawContent = [event.title, event.query].filter(Boolean).join(' - ');
    
    if (!rawContent || rawContent.length < 5) {
      return { safe: false, reason: 'Content too short' };
    }
    
    // Check for sensitive content before sanitization
    if (hasSensitiveContent(rawContent)) {
      logAuditEvent('access_denied', `Blocked sensitive content from ${domainCheck.domain}`, undefined, 'browser_watcher');
      return { safe: false, reason: 'Contains sensitive data' };
    }
    
    const sanitized = sanitizeContent(rawContent);
    
    // Build final content
    let content = '';
    const category = domainCheck.info?.category as FilteredContent['category'];
    
    switch (event.type) {
      case 'page_visit':
        content = `Browsed ${domainCheck.info?.description || domainCheck.domain}: "${sanitized}"`;
        break;
      case 'search':
        content = `Searched on ${domainCheck.domain}: "${sanitized}"`;
        break;
      case 'video_watch':
        content = `Watched on ${domainCheck.domain}: "${sanitized}"`;
        break;
      case 'post_view':
        content = `Read on ${domainCheck.domain}: "${sanitized}"`;
        break;
      default:
        content = `Activity on ${domainCheck.domain}: "${sanitized}"`;
    }
    
    return {
      safe: true,
      content,
      domain: domainCheck.domain,
      category,
      fingerprint: generateFingerprint(
        domainCheck.domain || 'unknown',
        category || 'unknown',
        content
      ),
    };
  }
  
  return { safe: false, reason: 'No URL provided' };
}

// ============================================
// DOMAIN MANAGEMENT
// ============================================

export function addAllowedDomain(domain: string, category: string, description: string): void {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  ALLOWED_DOMAINS.set(cleanDomain, { category, description });
  console.log(`[BrowserWatcher] Added domain: ${cleanDomain} (${category})`);
}

export function removeAllowedDomain(domain: string): boolean {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  const removed = ALLOWED_DOMAINS.delete(cleanDomain);
  if (removed) {
    console.log(`[BrowserWatcher] Removed domain: ${cleanDomain}`);
  }
  return removed;
}

export function getAllowedDomains(): Array<{ domain: string; category: string; description: string }> {
  return Array.from(ALLOWED_DOMAINS.entries()).map(([domain, info]) => ({
    domain,
    ...info,
  }));
}

export function addAllowedExtension(extensionId: string): void {
  ALLOWED_EXTENSIONS.add(extensionId);
  console.log(`[BrowserWatcher] Added extension: ${extensionId}`);
}

// ============================================
// WATCHER STATE
// ============================================

let isWatching = false;
let mainWindowRef: BrowserWindow | null = null;

function getRandomThought(category: string, domain?: string): string {
  const thoughts = BROWSING_THOUGHTS as Record<string, Record<string, string[]> | string[]>;
  
  // Try domain-specific thoughts first
  if (domain) {
    const domainKey = domain.replace('.com', '').replace('www.', '');
    
    // Check social category
    if (thoughts.social && typeof thoughts.social === 'object' && !Array.isArray(thoughts.social)) {
      const socialThoughts = thoughts.social as Record<string, string[]>;
      if (socialThoughts[domainKey]) {
        const arr = socialThoughts[domainKey];
        return arr[Math.floor(Math.random() * arr.length)];
      }
    }
    
    // Check entertainment category
    if (thoughts.entertainment && typeof thoughts.entertainment === 'object' && !Array.isArray(thoughts.entertainment)) {
      const entThoughts = thoughts.entertainment as Record<string, string[]>;
      if (entThoughts[domainKey]) {
        const arr = entThoughts[domainKey];
        return arr[Math.floor(Math.random() * arr.length)];
      }
      // Check for manhwa/anime sites
      if (domain.includes('manhwa') || domain.includes('shinigami')) {
        const manhwaArr = entThoughts.manhwa || entThoughts.anime;
        if (manhwaArr) return manhwaArr[Math.floor(Math.random() * manhwaArr.length)];
      }
    }
    
    // Check dev category
    if (thoughts.dev && typeof thoughts.dev === 'object' && !Array.isArray(thoughts.dev)) {
      const devThoughts = thoughts.dev as Record<string, string[]>;
      if (devThoughts[domainKey]) {
        const arr = devThoughts[domainKey];
        return arr[Math.floor(Math.random() * arr.length)];
      }
      // Check for docs sites
      if (domain.includes('docs') || domain.includes('developer')) {
        const docsArr = devThoughts.docs;
        if (docsArr) return docsArr[Math.floor(Math.random() * docsArr.length)];
      }
    }
  }
  
  // Fall back to category-based thoughts
  if (category && thoughts[category]) {
    const catThoughts = thoughts[category];
    if (Array.isArray(catThoughts)) {
      return catThoughts[Math.floor(Math.random() * catThoughts.length)];
    }
  }
  
  // Fall back to general
  const general = thoughts.general;
  if (Array.isArray(general)) {
    return general[Math.floor(Math.random() * general.length)];
  }
  
  return 'Browsing the web~';
}

export function startBrowserWatcher(mainWindow: BrowserWindow): void {
  if (isWatching) return;
  isWatching = true;
  mainWindowRef = mainWindow;
  
  console.log('[BrowserWatcher] Started with STRICT domain whitelist');
  console.log('[BrowserWatcher] Allowed domains:', getAllowedDomains().length);
  console.log('[BrowserWatcher] Two-layer filtering active:');
  console.log('  Layer 1: Domain/Extension whitelist');
  console.log('  Layer 2: Content sanitization');
}

export function emitBrowserThought(domain: string, category: string): void {
  if (!mainWindowRef) return;
  
  const thought = getRandomThought(category, domain);
  
  mainWindowRef.webContents.send('browser-activity', {
    thought,
    domain,
    category,
    emotion: category === 'dev' ? 'working' : category === 'entertainment' ? 'playful' : 'curious',
    animation: 'idle',
  });
}

export function stopBrowserWatcher(): void {
  isWatching = false;
  mainWindowRef = null;
  console.log('[BrowserWatcher] Stopped');
}

export function getWatcherStatus(): {
  isWatching: boolean;
  allowedDomains: number;
  allowedExtensions: number;
  layers: string[];
} {
  return {
    isWatching,
    allowedDomains: ALLOWED_DOMAINS.size,
    allowedExtensions: ALLOWED_EXTENSIONS.size,
    layers: [
      'Layer 1: STRICT domain whitelist (only explicitly allowed domains)',
      'Layer 1: Extension whitelist (only trusted extensions)',
      'Layer 2: PII stripping (emails, phones, SSN, credit cards)',
      'Layer 2: Sensitive keyword blocking (passwords, tokens, keys)',
      'Layer 2: Content sanitization before storage',
    ],
  };
}
