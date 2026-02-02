import type { OpenRouterRequest, OpenRouterResponse } from './types';
import { OPENROUTER_CONFIG } from './constants';

export interface OpenRouterClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryBaseDelay?: number;
}

export class OpenRouterClient {
  private baseUrl: string;
  private timeout: number;
  private apiKey: string | null;
  private retryAttempts: number;
  private retryBaseDelay: number;

  constructor(config: OpenRouterClientConfig = {}) {
    this.baseUrl = config.baseUrl || OPENROUTER_CONFIG.baseUrl;
    this.timeout = config.timeout || OPENROUTER_CONFIG.timeout;
    this.apiKey = config.apiKey || null;
    this.retryAttempts = config.retryAttempts || OPENROUTER_CONFIG.retryAttempts;
    this.retryBaseDelay = config.retryBaseDelay || OPENROUTER_CONFIG.retryBaseDelay;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateBackoff(attempt: number): number {
    return this.retryBaseDelay * Math.pow(2, attempt);
  }

  async chat(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    let lastError: OpenRouterError | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.chatOnce(request);
      } catch (error) {
        if (error instanceof OpenRouterError) {
          lastError = error;
          
          if (!error.retryable || attempt === this.retryAttempts) {
            throw error;
          }

          const backoffMs = this.calculateBackoff(attempt);
          await this.delay(backoffMs);
        } else {
          throw error;
        }
      }
    }

    throw lastError || new OpenRouterError('Max retries exceeded', 500, false);
  }

  private async chatOnce(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new OpenRouterError(
          errorData.error?.message || `HTTP ${response.status}`,
          response.status,
          response.status === 429 || response.status >= 500
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof OpenRouterError) throw error;
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenRouterError('Request timeout', 408, true);
      }

      throw new OpenRouterError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        true
      );
    }
  }


  async *chatStream(request: OpenRouterRequest): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new OpenRouterError(
          errorData.error?.message || `HTTP ${response.status}`,
          response.status,
          response.status === 429
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new OpenRouterError('No response body', 500, false);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof OpenRouterError) throw error;
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenRouterError('Request timeout', 408, true);
      }

      throw new OpenRouterError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        true
      );
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.buildHeaders(),
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.data?.map((m: { id: string }) => m.id) || [];
    } catch {
      return [];
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    headers['HTTP-Referer'] = 'https://github.com/AlleyBo55/doraemon';
    headers['X-Title'] = 'Doraemon Desktop Mascot';

    return headers;
  }

  validateRequest(request: OpenRouterRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.model || request.model.length === 0) {
      errors.push('Model is required');
    }

    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages array is required');
    }

    for (const msg of request.messages || []) {
      if (!['user', 'assistant', 'system'].includes(msg.role)) {
        errors.push(`Invalid role: ${msg.role}`);
      }
      if (!msg.content || msg.content.length === 0) {
        errors.push('Message content is required');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export const openRouterClient = new OpenRouterClient();
