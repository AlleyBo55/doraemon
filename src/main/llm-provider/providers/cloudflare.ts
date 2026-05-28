import { cfg } from '../../config.js';
import type {
  ChatMessage,
  ChatOptions,
  Provider,
  ProviderInfo,
  ProviderStatus,
} from './base.js';

const HEAD_TIMEOUT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 25_000;

const INFO: ProviderInfo = {
  name: 'cloudflare',
  displayName: 'Cloudflare proxy',
  description:
    'Free shared proxy hosted on Cloudflare. Soul prompt is injected on the edge. Rate-limited per device.',
  costNote: 'rate-limited free',
};

function getProxyUrl(): string {
  return cfg.proxyUrl.replace(/\/+$/, '');
}

let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const { app } = await import('electron');
    cachedDeviceId = app.getPath('userData');
  } catch {
    cachedDeviceId = `${process.platform}-${process.arch}-${process.env['USER'] ?? 'anon'}`;
  }
  return cachedDeviceId;
}

interface CloudflareResponse {
  content?: string;
  error?: string;
  remaining?: number;
}

export const cloudflareProvider: Provider = {
  info: INFO,

  async detect(): Promise<ProviderStatus> {
    const url = getProxyUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);

    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      if (response.status >= 200 && response.status < 400) {
        return {
          info: INFO,
          available: true,
          metadata: { url },
        };
      }
      return {
        info: INFO,
        available: false,
        reason: `proxy returned HTTP ${response.status}`,
        metadata: { url },
      };
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'AbortError'
          ? 'proxy did not respond within 2s'
          : `unable to reach proxy: ${err instanceof Error ? err.message : 'unknown'}`;
      return {
        info: INFO,
        available: false,
        reason,
        metadata: { url },
      };
    } finally {
      clearTimeout(timer);
    }
  },

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const url = getProxyUrl();
    const deviceId = await getDeviceId();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${url}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          deviceId,
          ...(opts?.model ? { model: opts.model } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Cloudflare proxy ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = (await response.json()) as CloudflareResponse;
      if (data.error) {
        throw new Error(`Cloudflare proxy error: ${data.error}`);
      }
      return (data.content ?? '').trim();
    } finally {
      clearTimeout(timer);
    }
  },
};
