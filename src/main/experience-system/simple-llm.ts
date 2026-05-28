/**
 * Simple LLM Client
 *
 * Routes lightweight LLM calls through the user's selected provider
 * (chatWithCurrent), with a direct-Anthropic fallback when a key is set.
 * Logs every call so the console shows which backend served the request.
 */

import { cfg } from '../config.js';
import { chatWithCurrent, getCurrentProvider } from '../llm-provider/index.js';
import { logLLMCall } from '../llm-provider/logger.js';
import type { ProviderName } from '../llm-provider/types.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const FALLBACK_MODEL = 'claude-3-haiku-20240307';
const DEFAULT_MAX_TOKENS = 150;
const TIMEOUT_MS = 25_000;

function getAnthropicKey(): string | null {
  const fromEnv = process.env['ANTHROPIC_API_KEY'];
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  if (cfg.anthropicApiKey && cfg.anthropicApiKey.trim().length > 0) {
    return cfg.anthropicApiKey.trim();
  }
  return null;
}

async function callAnthropicDirect(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  callPath: string,
): Promise<string | null> {
  const apiKey = getAnthropicKey();
  if (!apiKey) return null;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: FALLBACK_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logLLMCall({
        provider: 'anthropic',
        model: FALLBACK_MODEL,
        path: callPath,
        durationMs: Date.now() - startedAt,
        ok: false,
        errorMessage: `HTTP ${response.status}: ${errorText.slice(0, 120)}`,
      });
      return null;
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message: string };
    };

    if (data.error) {
      logLLMCall({
        provider: 'anthropic',
        model: FALLBACK_MODEL,
        path: callPath,
        durationMs: Date.now() - startedAt,
        ok: false,
        errorMessage: data.error.message,
      });
      return null;
    }

    const textBlock = data.content?.find((c) => c.type === 'text');
    const text = (textBlock?.text ?? '').trim();

    logLLMCall({
      provider: 'anthropic',
      model: FALLBACK_MODEL,
      path: callPath,
      ...(typeof data.usage?.input_tokens === 'number'
        ? { inputTokens: data.usage.input_tokens }
        : {}),
      ...(typeof data.usage?.output_tokens === 'number'
        ? { outputTokens: data.usage.output_tokens }
        : {}),
      durationMs: Date.now() - startedAt,
      ok: text.length > 0,
    });

    return text || null;
  } catch (err) {
    logLLMCall({
      provider: 'anthropic',
      model: FALLBACK_MODEL,
      path: callPath,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callViaCurrentProvider(
  provider: ProviderName,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  callPath: string,
): Promise<string | null> {
  if (provider === 'offline') return null;

  const startedAt = Date.now();
  try {
    const text = await chatWithCurrent(
      [{ role: 'user', content: userPrompt }],
      {
        systemPrompt,
        maxTokens,
      },
    );

    logLLMCall({
      provider,
      path: callPath,
      durationMs: Date.now() - startedAt,
      ok: text.length > 0,
    });

    return text.length > 0 ? text : null;
  } catch (err) {
    logLLMCall({
      provider,
      path: callPath,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

export async function simpleLLMCall(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  callPath = 'experience-system/simple-llm',
): Promise<string | null> {
  const current = await getCurrentProvider();

  if (current && current !== 'offline') {
    const viaCurrent = await callViaCurrentProvider(
      current,
      systemPrompt,
      userPrompt,
      maxTokens,
      callPath,
    );
    if (viaCurrent) return viaCurrent;
  }

  // Anthropic fallback when the user has a direct key set.
  const fallback = await callAnthropicDirect(systemPrompt, userPrompt, maxTokens, callPath);
  return fallback;
}

export function isSimpleLLMAvailable(): boolean {
  return getAnthropicKey() !== null;
}
