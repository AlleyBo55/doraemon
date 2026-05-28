import { cfg } from '../../config.js';
import type {
  ChatMessage,
  ChatOptions,
  Provider,
  ProviderInfo,
  ProviderStatus,
} from './base.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const DEFAULT_MAX_TOKENS = 300;
const REQUEST_TIMEOUT_MS = 25_000;

const INFO: ProviderInfo = {
  name: 'anthropic',
  displayName: 'Anthropic API',
  description:
    'Direct call to Anthropic from your machine using your own API key. Lowest latency, you pay per token.',
  costNote: 'pay-per-token',
};

function getApiKey(): string {
  const env = process.env['ANTHROPIC_API_KEY'];
  if (env && env.trim().length > 0) return env.trim();
  if (cfg.anthropicApiKey && cfg.anthropicApiKey.trim().length > 0) {
    return cfg.anthropicApiKey.trim();
  }
  return '';
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

export const anthropicProvider: Provider = {
  info: INFO,

  async detect(): Promise<ProviderStatus> {
    const key = getApiKey();
    if (!key) {
      return {
        info: INFO,
        available: false,
        reason: 'ANTHROPIC_API_KEY not set in env or ~/.doraemon/config.json',
      };
    }
    return {
      info: INFO,
      available: true,
      metadata: {
        keySource: process.env['ANTHROPIC_API_KEY'] ? 'env' : 'config',
        keyPreview: `${key.slice(0, 8)}…`,
      },
    };
  },

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Anthropic provider: no API key available');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: opts?.model ?? DEFAULT_MODEL,
        max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages,
      };
      if (opts?.systemPrompt) body['system'] = opts.systemPrompt;
      if (typeof opts?.temperature === 'number') body['temperature'] = opts.temperature;

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Anthropic API ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      if (data.error) {
        throw new Error(`Anthropic API error: ${data.error.message ?? 'unknown'}`);
      }
      const textBlock = data.content?.find((c) => c.type === 'text');
      return (textBlock?.text ?? '').trim();
    } finally {
      clearTimeout(timer);
    }
  },
};
