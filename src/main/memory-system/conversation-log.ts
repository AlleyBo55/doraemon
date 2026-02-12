import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface TokenUsage {
  input: number;
  output: number;
  total: number;
  model?: string;
  durationMs?: number;
}

interface ConversationEntry {
  id: string;
  ts: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  channel: string;
  body: string;
  tokens?: TokenUsage;
}

const LOG_DIR = join(homedir(), '.doraemon');
const LOG_PATH = join(LOG_DIR, 'conversation-log.json');
const MAX_ENTRIES = 5000;

let entries: ConversationEntry[] = [];
let loaded = false;

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function load(): void {
  if (loaded) return;
  ensureDir();
  try {
    if (existsSync(LOG_PATH)) {
      entries = JSON.parse(readFileSync(LOG_PATH, 'utf-8'));
    }
  } catch {
    entries = [];
  }
  loaded = true;
}

function save(): void {
  ensureDir();
  writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

export function logConversation(entry: Omit<ConversationEntry, 'id' | 'ts'>): void {
  load();
  entries.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    ...entry,
  });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  save();
}

export function getConversationLog(limit?: number): ConversationEntry[] {
  load();
  return limit ? entries.slice(-limit) : [...entries];
}

export function exportConversationLog(): string {
  load();
  if (entries.length === 0) return '(no conversations logged)';
  return entries.map(e => {
    const arrow = e.direction === 'inbound' ? '←' : '→';
    const tokenStr = e.tokens
      ? ` [${e.tokens.input}in/${e.tokens.output}out=${e.tokens.total}tok${e.tokens.model ? ` ${e.tokens.model}` : ''}${e.tokens.durationMs ? ` ${e.tokens.durationMs}ms` : ''}]`
      : '';
    return `[${e.ts}] ${arrow} ${e.channel.toUpperCase()} | ${e.from} → ${e.to} | ${e.body}${tokenStr}`;
  }).join('\n');
}

export function clearConversationLog(): number {
  load();
  const count = entries.length;
  entries = [];
  save();
  return count;
}
