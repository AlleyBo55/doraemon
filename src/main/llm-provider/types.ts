export type ProviderName = 'kiro' | 'anthropic' | 'cloudflare' | 'offline';

export interface ProviderInfo {
  name: ProviderName;
  displayName: string;
  description: string;
  costNote: string;
}

export interface ProviderStatus {
  info: ProviderInfo;
  available: boolean;
  reason?: string;
  metadata?: Record<string, string>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  systemPrompt?: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
}

export interface StoredChoice {
  provider: ProviderName | null;
  updatedAt: number;
  autoFallback: boolean;
  kiroGatewayToken?: string;
  kiroGatewayPort?: number;
}

export type IpcResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
