import { kiroProvider } from './providers/kiro.js';
import { anthropicProvider } from './providers/anthropic.js';
import { cloudflareProvider } from './providers/cloudflare.js';
import { offlineProvider } from './providers/offline.js';
import type { Provider } from './providers/base.js';
import type { ProviderName, ProviderStatus } from './types.js';

const CACHE_TTL_MS = 30_000;

const PROVIDERS: Record<ProviderName, Provider> = {
  kiro: kiroProvider,
  anthropic: anthropicProvider,
  cloudflare: cloudflareProvider,
  offline: offlineProvider,
};

interface CacheEntry {
  result: ProviderStatus;
  expiresAt: number;
}

const cache = new Map<ProviderName, CacheEntry>();

export function getProvider(name: ProviderName): Provider {
  return PROVIDERS[name];
}

export function listProviderNames(): ProviderName[] {
  return ['kiro', 'anthropic', 'cloudflare', 'offline'];
}

export function clearDetectionCache(): void {
  cache.clear();
}

async function detectOne(name: ProviderName): Promise<ProviderStatus> {
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  let result: ProviderStatus;
  try {
    result = await PROVIDERS[name].detect();
  } catch (err) {
    result = {
      info: PROVIDERS[name].info,
      available: false,
      reason: `detector threw: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
  cache.set(name, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function detectAll(): Promise<ProviderStatus[]> {
  return Promise.all(listProviderNames().map(detectOne));
}

export async function detectProvider(name: ProviderName): Promise<ProviderStatus> {
  return detectOne(name);
}
