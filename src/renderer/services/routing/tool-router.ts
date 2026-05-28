import type { TaskType, IntentResult } from './types';
import type { EmotionType } from '../../core/types/emotion';
import { intentDetector } from './intent-detector';

type SkillMapping = {
  skills: string[];
  emotion: EmotionType;
};

const INTENT_TO_SKILL: Record<Exclude<TaskType, 'general_chat'>, SkillMapping> = {
  weather: { skills: ['weather'], emotion: 'curiosity' },
  time: { skills: ['time'], emotion: 'contemplation' },
  web_search: { skills: ['web-search', 'browser'], emotion: 'curiosity' },
  image_generation: { skills: ['image-gen'], emotion: 'excitement' },
  ide_activity: { skills: ['ide-bridge', 'coding-stats'], emotion: 'focus' },
  notification: { skills: ['whatsapp', 'telegram', 'slack', 'discord'], emotion: 'wonder' },
  task_management: { skills: ['tasks', 'reminders'], emotion: 'determination' },
  messaging: { skills: ['whatsapp', 'telegram', 'slack', 'discord'], emotion: 'connection' },
};

const TOOL_RESULT_EMOTIONS: Record<string, EmotionType> = {
  success: 'satisfaction',
  error: 'frustration',
  not_found: 'confusion',
  timeout: 'concern',
  partial: 'contemplation',
};

export interface RouteDecision {
  route: 'proxy' | 'openclaw';
  intent: IntentResult;
  skillFilter?: string[];
  fallbackEmotion: EmotionType;
}

export function routeMessage(message: string): RouteDecision {
  const intent = intentDetector.detect(message);

  if (intent.intent === 'general_chat') {
    return {
      route: 'proxy',
      intent,
      fallbackEmotion: 'calm',
    };
  }

  const mapping = INTENT_TO_SKILL[intent.intent];
  return {
    route: 'openclaw',
    intent,
    skillFilter: mapping.skills,
    fallbackEmotion: mapping.emotion,
  };
}

export function emotionFromToolResult(status: string): EmotionType {
  return TOOL_RESULT_EMOTIONS[status] ?? 'calm';
}

export function getSkillsForIntent(intent: TaskType): string[] | undefined {
  if (intent === 'general_chat') return undefined;
  return INTENT_TO_SKILL[intent]?.skills;
}
