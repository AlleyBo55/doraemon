import path from 'node:path';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { ProviderName, StoredChoice } from './types.js';

const FILE_NAME = 'llm-provider.json';
const TMP_SUFFIX = '.tmp';

const DEFAULT_CHOICE: StoredChoice = {
  provider: null,
  updatedAt: 0,
  autoFallback: false,
};

const VALID_PROVIDERS: ReadonlySet<ProviderName> = new Set([
  'kiro',
  'anthropic',
  'cloudflare',
  'offline',
]);

let userDataPathOverride: string | null = null;

export function setUserDataPathForTesting(p: string | null): void {
  userDataPathOverride = p;
}

async function getUserDataPath(): Promise<string> {
  if (userDataPathOverride) return userDataPathOverride;
  const { app } = await import('electron');
  return app.getPath('userData');
}

async function getStorePath(): Promise<string> {
  return path.join(await getUserDataPath(), FILE_NAME);
}

function isProviderName(value: unknown): value is ProviderName {
  return typeof value === 'string' && VALID_PROVIDERS.has(value as ProviderName);
}

function parseChoice(raw: string): StoredChoice {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('llm-provider.json is not an object');
  }
  const obj = parsed as Record<string, unknown>;

  const provider = obj['provider'];
  const choice: StoredChoice = {
    provider: isProviderName(provider) ? provider : provider === null ? null : null,
    updatedAt: typeof obj['updatedAt'] === 'number' ? obj['updatedAt'] : 0,
    autoFallback: obj['autoFallback'] === true,
  };
  if (typeof obj['kiroGatewayToken'] === 'string') {
    choice.kiroGatewayToken = obj['kiroGatewayToken'];
  }
  if (typeof obj['kiroGatewayPort'] === 'number') {
    choice.kiroGatewayPort = obj['kiroGatewayPort'];
  }
  return choice;
}

export async function getStoredChoice(): Promise<StoredChoice> {
  let storePath: string;
  try {
    storePath = await getStorePath();
  } catch (err) {
    console.warn('[LLMProviderStore] cannot resolve userData path:', err);
    return { ...DEFAULT_CHOICE };
  }

  let raw: string;
  try {
    raw = await fs.readFile(storePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_CHOICE };
    }
    console.warn('[LLMProviderStore] failed to read store:', err);
    return { ...DEFAULT_CHOICE };
  }

  try {
    return parseChoice(raw);
  } catch (err) {
    console.warn('[LLMProviderStore] corrupt JSON, returning default:', err);
    return { ...DEFAULT_CHOICE };
  }
}

async function writeAtomic(storePath: string, payload: StoredChoice): Promise<void> {
  const dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${storePath}${TMP_SUFFIX}`;
  const data = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tmp, data, 'utf-8');
  await fs.rename(tmp, storePath);
}

export async function setStoredChoice(
  provider: ProviderName,
  extras?: Partial<Pick<StoredChoice, 'autoFallback' | 'kiroGatewayToken' | 'kiroGatewayPort'>>,
): Promise<StoredChoice> {
  const current = await getStoredChoice();
  const next: StoredChoice = {
    ...current,
    ...extras,
    provider,
    updatedAt: Date.now(),
  };
  const storePath = await getStorePath();
  await writeAtomic(storePath, next);
  return next;
}

export async function updateStoredChoice(
  patch: Partial<StoredChoice>,
): Promise<StoredChoice> {
  const current = await getStoredChoice();
  const next: StoredChoice = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  const storePath = await getStorePath();
  await writeAtomic(storePath, next);
  return next;
}

export async function clearStoredChoice(): Promise<void> {
  const storePath = await getStorePath();
  try {
    await fs.unlink(storePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[LLMProviderStore] clear failed:', err);
    }
  }
}

export function generateGatewayToken(): string {
  return randomBytes(32).toString('hex');
}
