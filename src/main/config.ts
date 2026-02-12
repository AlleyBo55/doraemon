/**
 * Unified config loader for the main process.
 *
 * Load order (later wins):
 *   1. Hardcoded defaults
 *   2. ~/.doraemon/config.json  (user overrides)
 *   3. process.env              (dev / CI overrides)
 *
 * Every module imports `cfg` instead of reading process.env directly.
 */

import path from 'node:path';
import fs from 'node:fs';

// ── schema ──────────────────────────────────────────────────

export interface DoraemonMainConfig {
  // proxy
  proxyUrl: string;

  // openclaw (legacy / power-user)
  openclawUrl: string;
  openclawToken: string;

  // feature flags
  experienceSystemEnabled: boolean;
  memorySystemEnabled: boolean;
  llmPostsEnabled: boolean;
  urlReaderEnabled: boolean;
  autonomousMode: boolean;
  moltbookBrowserEnabled: boolean;

  // moltbook
  moltbookApiKey: string;
  moltbookUsername: string;

  // anthropic
  anthropicApiKey: string;

  // debug
  debugConversation: boolean;

  // misc
  deviceSalt: string;
  adminKey: string;
  skipSetup: boolean;
}

// ── defaults ────────────────────────────────────────────────

const DEFAULTS: DoraemonMainConfig = {
  proxyUrl: 'https://doraemon-proxy.doraboss.workers.dev',
  openclawUrl: 'ws://127.0.0.1:18789',
  openclawToken: 'localdev',
  experienceSystemEnabled: true,
  memorySystemEnabled: true,
  llmPostsEnabled: true,
  urlReaderEnabled: false,
  autonomousMode: false,
  moltbookBrowserEnabled: false,
  moltbookApiKey: '',
  moltbookUsername: '',
  anthropicApiKey: '',
  debugConversation: false,
  deviceSalt: '',
  adminKey: '',
  skipSetup: false,
};

// ── JSON key → config field mapping ─────────────────────────

type JsonKeyMap = Record<string, keyof DoraemonMainConfig>;

const JSON_KEY_MAP: JsonKeyMap = {
  proxyUrl: 'proxyUrl',
  proxy_url: 'proxyUrl',
  openclawUrl: 'openclawUrl',
  openclaw_url: 'openclawUrl',
  openclawToken: 'openclawToken',
  openclaw_token: 'openclawToken',
  experienceSystem: 'experienceSystemEnabled',
  memorySystem: 'memorySystemEnabled',
  llmPosts: 'llmPostsEnabled',
  urlReader: 'urlReaderEnabled',
  autonomousMode: 'autonomousMode',
  moltbookBrowser: 'moltbookBrowserEnabled',
  moltbookApiKey: 'moltbookApiKey',
  moltbookUsername: 'moltbookUsername',
  anthropicApiKey: 'anthropicApiKey',
  deviceSalt: 'deviceSalt',
  adminKey: 'adminKey',
  skipSetup: 'skipSetup',
};

// ── env var → config field mapping ──────────────────────────

type EnvKeyMap = Record<string, { field: keyof DoraemonMainConfig; parse: (v: string) => unknown }>;

const toBool = (v: string) => v === '1' || v === 'true';
const toStr = (v: string) => v;

const ENV_KEY_MAP: EnvKeyMap = {
  VITE_PROXY_URL:              { field: 'proxyUrl',                  parse: toStr },
  OPENCLAW_URL:                { field: 'openclawUrl',               parse: toStr },
  OPENCLAW_TOKEN:              { field: 'openclawToken',             parse: toStr },
  EXPERIENCE_SYSTEM_ENABLED:   { field: 'experienceSystemEnabled',   parse: toBool },
  MEMORY_SYSTEM_ENABLED:       { field: 'memorySystemEnabled',       parse: toBool },
  LLM_POSTS_ENABLED:           { field: 'llmPostsEnabled',           parse: toBool },
  URL_READER_ENABLED:          { field: 'urlReaderEnabled',          parse: toBool },
  AUTONOMOUS_MODE:             { field: 'autonomousMode',            parse: toBool },
  MOLTBOOK_BROWSER_ENABLED:    { field: 'moltbookBrowserEnabled',    parse: toBool },
  MOLTBOOK_API_KEY:            { field: 'moltbookApiKey',            parse: toStr },
  MOLTBOOK_USERNAME:           { field: 'moltbookUsername',          parse: toStr },
  ANTHROPIC_API_KEY:           { field: 'anthropicApiKey',           parse: toStr },
  DEBUG_CONVERSATION:          { field: 'debugConversation',          parse: toBool },
  DEVICE_SALT:                 { field: 'deviceSalt',                parse: toStr },
  ADMIN_KEY:                   { field: 'adminKey',                  parse: toStr },
  DORAEMON_SKIP_SETUP:         { field: 'skipSetup',                 parse: toBool },
};

// ── loader ──────────────────────────────────────────────────

function getConfigDir(): string {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return path.join(home, '.doraemon');
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

function loadJsonOverrides(target: DoraemonMainConfig): void {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (typeof raw !== 'object' || raw === null) return;

    for (const [jsonKey, value] of Object.entries(raw)) {
      const field = JSON_KEY_MAP[jsonKey];
      if (!field) continue;
      const expected = typeof DEFAULTS[field];
      if (typeof value === expected) {
        (target as any)[field] = value;
      }
    }
  } catch (err) {
    console.error('[Config] Failed to parse config.json:', err);
  }
}

function loadEnvOverrides(target: DoraemonMainConfig): void {
  for (const [envKey, { field, parse }] of Object.entries(ENV_KEY_MAP)) {
    const raw = process.env[envKey];
    if (raw === undefined || raw === '') continue;
    (target as any)[field] = parse(raw);
  }
}

function buildConfig(): DoraemonMainConfig {
  const config = { ...DEFAULTS };
  loadJsonOverrides(config);
  loadEnvOverrides(config);

  if (process.argv.includes('--skip-setup')) {
    config.skipSetup = true;
  }

  return Object.freeze(config) as DoraemonMainConfig;
}

// ── singleton export ────────────────────────────────────────

export const cfg = buildConfig();

/**
 * Write a partial config update to ~/.doraemon/config.json
 */
export function saveUserConfig(partial: Partial<DoraemonMainConfig>): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const configPath = getConfigPath();
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}

  const merged = { ...existing, ...partial };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
