import type { TaskType, ModelConfig } from './types';

export const DEFAULT_MODEL_REGISTRY: Record<TaskType, ModelConfig> = {
  general_chat: {
    id: 'anthropic/claude-haiku-4-5-20251001',
    provider: 'anthropic',
    maxTokens: 1024,
    temperature: 0.7,
    fallbackId: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  weather: {
    id: 'mistralai/mistral-7b-instruct:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.3,
    fallbackId: 'mistralai/mistral-small-3.1-24b-instruct:free'
  },
  time: {
    id: 'mistralai/mistral-7b-instruct:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.3,
    fallbackId: 'mistralai/mistral-small-3.1-24b-instruct:free'
  },
  web_search: {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    maxTokens: 512,
    temperature: 0.5,
    fallbackId: 'google/gemini-2.0-flash-exp:free'
  },
  image_generation: {
    id: 'google/gemini-2.0-flash-exp:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.7,
    fallbackId: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  ide_activity: {
    id: 'mistralai/devstral-2:free',
    provider: 'openrouter',
    maxTokens: 512,
    temperature: 0.5,
    fallbackId: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  notification: {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    provider: 'openrouter',
    maxTokens: 256,
    temperature: 0.5,
    fallbackId: 'mistralai/mistral-7b-instruct:free'
  },
  task_management: {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    maxTokens: 512,
    temperature: 0.5,
    fallbackId: 'mistralai/mistral-small-3.1-24b-instruct:free'
  }
};

export const INTENT_CONFIDENCE_THRESHOLD = 0.7;

export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 30_000,
  halfOpenRequests: 1,
  monitorWindow: 60_000,
};

export const OPENROUTER_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1',
  timeout: 30_000,
  retryAttempts: 3,
  retryBaseDelay: 1000,
};

export const CACHE_TTL = {
  weather: 10 * 60 * 1000,
  search: 5 * 60 * 1000,
};
