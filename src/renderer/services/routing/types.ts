import type { EmotionType } from '../../core/types/emotion';

export type TaskType =
  | 'general_chat'
  | 'weather'
  | 'time'
  | 'web_search'
  | 'image_generation'
  | 'ide_activity'
  | 'notification'
  | 'task_management';

export interface IntentResult {
  intent: TaskType;
  confidence: number;
  entities: Record<string, string>;
  rawMessage: string;
}

export interface ModelConfig {
  id: string;
  provider: 'anthropic' | 'openrouter';
  maxTokens: number;
  temperature: number;
  fallbackId?: string;
}

export interface RouterResult {
  response: string;
  emotion: EmotionType;
  metadata?: {
    model: string;
    taskType: TaskType;
    latency: number;
    cached: boolean;
  };
}

export interface RouterStatus {
  isOnline: boolean;
  activeServices: TaskType[];
  circuitBreakers: Record<string, CircuitBreakerState>;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreaker {
  state: CircuitBreakerState;
  failures: number;
  lastFailure?: Date;
  nextRetry?: Date;
  threshold: number;
  resetTimeout: number;
}


// Service Input/Output interfaces

export interface WeatherInput {
  location?: string;
  units?: 'metric' | 'imperial';
}

export interface WeatherOutput {
  location: string;
  temperature: number;
  conditions: string;
  humidity: number;
  forecast: string;
}

export interface SearchInput {
  query: string;
  maxResults?: number;
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface SearchOutput {
  results: SearchResult[];
  summary: string;
}

export interface ImageInput {
  prompt: string;
  style?: 'realistic' | 'cartoon' | 'sketch' | 'anime';
}

export interface ImageOutput {
  imageUrl: string;
  enhancedPrompt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

export interface TaskFilter {
  status?: Task['status'];
  priority?: Task['priority'];
  dueBefore?: Date;
  dueAfter?: Date;
  search?: string;
}

export interface TaskInput {
  action: 'create' | 'list' | 'update' | 'delete' | 'complete';
  task?: Partial<Task>;
  filter?: TaskFilter;
}

export interface TaskOutput {
  tasks: Task[];
  message: string;
}

export interface CodingSession {
  startTime: Date;
  endTime?: Date;
  files: FileActivity[];
  totalEdits: number;
  languages: Record<string, number>;
}

export interface FileActivity {
  path: string;
  language: string;
  openedAt: Date;
  savedAt?: Date;
  editCount: number;
}

export interface ActivitySummary {
  todayMinutes: number;
  filesEdited: number;
  topLanguages: string[];
  currentStreak: number;
  suggestion?: string;
}

export interface NotificationItem {
  id: string;
  app: string;
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export interface NotificationFilter {
  app?: string;
  since?: Date;
  until?: Date;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface FormatterInput {
  content: string;
  taskType: TaskType;
  emotion?: EmotionType;
}

export interface FormatterOutput {
  text: string;
  emotion: EmotionType;
  truncated: boolean;
  fullText?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    suggestion?: string;
    retryable: boolean;
  };
  emotion: 'confused' | 'sad' | 'frustrated';
}

export interface IntentPattern {
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}
