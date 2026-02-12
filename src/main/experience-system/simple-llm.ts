/**
 * Simple LLM Client - Direct Anthropic API calls
 * 
 * Bypasses OpenClaw gateway to avoid loading 50+ skills into context.
 * Uses minimal tokens: just soul + prompt (~2k tokens vs 50k+)
 * 
 * Cost estimate (Haiku 3.5):
 * - Per call: ~2k input + ~100 output = ~$0.0005
 * - Per browse cycle (10 calls): ~$0.005
 * - Per day: ~$0.12
 * - Per month: ~$3.60
 */

import { cfg } from '../config.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-haiku-20240307';
const MAX_TOKENS = 150;
const TIMEOUT_MS = 25000;

function getApiKey(): string | null {
  const key = cfg.anthropicApiKey || null;
  if (key) {
    console.log('[SimpleLLM] API key found via config (' + key.substring(0, 12) + '...)');
  }
  return key;
}

export async function simpleLLMCall(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = MAX_TOKENS
): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[SimpleLLM] No ANTHROPIC_API_KEY found, falling back to gateway');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log(`[SimpleLLM] Calling Anthropic API (${MODEL})...`);
    
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SimpleLLM] API error ${response.status}:`, errorText.substring(0, 200));
      return null;
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message: string };
    };

    if (data.error) {
      console.error('[SimpleLLM] API returned error:', data.error.message);
      return null;
    }

    const textContent = data.content?.find(c => c.type === 'text');
    const text = textContent?.text?.trim() || '';
    
    if (text) {
      console.log(`[SimpleLLM] Got response: "${text.substring(0, 60)}..."`);
    } else {
      console.log('[SimpleLLM] Empty response from API');
    }

    return text || null;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('[SimpleLLM] Request timed out');
    } else {
      console.error('[SimpleLLM] Request failed:', err);
    }
    return null;
  }
}

export function isSimpleLLMAvailable(): boolean {
  return !!getApiKey();
}
