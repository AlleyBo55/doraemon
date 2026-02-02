import type { TaskType, ModelConfig } from './types';
import { DEFAULT_MODEL_REGISTRY } from './constants';

const VALID_PROVIDERS = ['anthropic', 'openrouter'] as const;
const KNOWN_MODELS = new Set([
  'anthropic/claude-haiku-4-5-20251001',
  'mistralai/mistral-7b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'mistralai/devstral-2:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'google/gemma-3-27b-it:free',
  'qwen/qwen-2.5-vl-7b-instruct:free',
  'nvidia/llama-3.1-nemotron-nano-12b-v1:free',
]);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ModelRegistry {
  private registry: Record<TaskType, ModelConfig>;

  constructor(customRegistry?: Partial<Record<TaskType, ModelConfig>>) {
    this.registry = { ...DEFAULT_MODEL_REGISTRY };
    
    if (customRegistry) {
      for (const [taskType, config] of Object.entries(customRegistry)) {
        if (config) {
          this.registry[taskType as TaskType] = config;
        }
      }
    }

    this.loadFromEnvironment();
  }

  private loadFromEnvironment(): void {
    const envOverrides: Partial<Record<TaskType, string>> = {
      weather: process.env.DORAEMON_MODEL_WEATHER,
      time: process.env.DORAEMON_MODEL_TIME,
      web_search: process.env.DORAEMON_MODEL_SEARCH,
      image_generation: process.env.DORAEMON_MODEL_IMAGE,
      ide_activity: process.env.DORAEMON_MODEL_IDE,
      notification: process.env.DORAEMON_MODEL_NOTIFICATION,
      task_management: process.env.DORAEMON_MODEL_TASKS,
      general_chat: process.env.DORAEMON_MODEL_CHAT,
    };

    for (const [taskType, modelId] of Object.entries(envOverrides)) {
      if (modelId) {
        const existing = this.registry[taskType as TaskType];
        this.registry[taskType as TaskType] = {
          ...existing,
          id: modelId,
        };
      }
    }
  }

  getModel(taskType: TaskType): ModelConfig {
    return this.registry[taskType];
  }

  setModel(taskType: TaskType, config: ModelConfig): void {
    this.registry[taskType] = config;
  }

  getFallback(taskType: TaskType): ModelConfig | null {
    const primary = this.registry[taskType];
    if (!primary.fallbackId) return null;

    return {
      id: primary.fallbackId,
      provider: 'openrouter',
      maxTokens: primary.maxTokens,
      temperature: primary.temperature,
    };
  }

  validateModels(): ValidationResult {
    const errors: string[] = [];

    for (const [taskType, config] of Object.entries(this.registry)) {
      if (!this.isValidModelId(config.id)) {
        errors.push(`Invalid model ID for ${taskType}: ${config.id}`);
      }

      if (!VALID_PROVIDERS.includes(config.provider)) {
        errors.push(`Invalid provider for ${taskType}: ${config.provider}`);
      }

      if (config.fallbackId && !this.isValidModelId(config.fallbackId)) {
        errors.push(`Invalid fallback model ID for ${taskType}: ${config.fallbackId}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  isValidModelId(modelId: string): boolean {
    if (!modelId || modelId.length === 0) return false;
    if (!modelId.includes('/')) return false;
    
    const parts = modelId.split('/');
    if (parts.length !== 2) return false;
    
    const [provider, model] = parts;
    if (!provider || provider.length === 0 || provider.trim().length === 0) return false;
    if (!model || model.length === 0 || model.trim().length === 0) return false;

    return true;
  }

  isKnownModel(modelId: string): boolean {
    return KNOWN_MODELS.has(modelId);
  }

  getAllTaskTypes(): TaskType[] {
    return Object.keys(this.registry) as TaskType[];
  }

  hasMapping(taskType: TaskType): boolean {
    return taskType in this.registry && !!this.registry[taskType].id;
  }

  hasFallback(taskType: TaskType): boolean {
    return taskType in this.registry && !!this.registry[taskType].fallbackId;
  }
}

export const modelRegistry = new ModelRegistry();
