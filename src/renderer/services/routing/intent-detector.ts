import type { TaskType, IntentResult, IntentPattern } from './types';
import { INTENT_CONFIDENCE_THRESHOLD } from './constants';

const INTENT_PATTERNS: Record<TaskType, IntentPattern> = {
  weather: {
    keywords: ['weather', 'temperature', 'forecast', 'rain', 'sunny', 'cloudy', 'humid', 'hot', 'cold', 'storm'],
    patterns: [/what'?s the weather/i, /how'?s the weather/i, /will it rain/i, /is it (hot|cold|sunny|rainy)/i, /weather in/i],
    weight: 1.0
  },
  time: {
    keywords: ['time', 'clock', 'timezone', 'countdown', 'how long', 'when is', 'what day'],
    patterns: [/what time/i, /current time/i, /time in/i, /how long until/i, /what'?s the date/i, /days until/i],
    weight: 1.0
  },
  web_search: {
    keywords: ['search', 'find', 'look up', 'google', 'what is', 'who is', 'define', 'explain', 'tell me about'],
    patterns: [/search for/i, /look up/i, /find out/i, /what is a?n?\s/i, /who is/i, /define\s/i],
    weight: 0.9
  },
  image_generation: {
    keywords: ['generate', 'create', 'draw', 'image', 'picture', 'art', 'illustration', 'paint', 'sketch'],
    patterns: [/generate an? (image|picture|art)/i, /create an? (image|picture)/i, /draw (me|an?)/i, /make an? (image|picture)/i],
    weight: 1.0
  },
  ide_activity: {
    keywords: ['coding', 'programming', 'editor', 'vscode', 'kiro', 'files', 'working on', 'code', 'project'],
    patterns: [/what am i working on/i, /my coding/i, /editor activity/i, /what files/i, /coding stats/i, /how long.*coding/i],
    weight: 0.8
  },
  notification: {
    keywords: ['notification', 'alert', 'message', 'notify', 'missed', 'unread'],
    patterns: [/any notifications/i, /what did i miss/i, /recent alerts/i, /show notifications/i, /unread messages/i],
    weight: 0.9
  },
  task_management: {
    keywords: ['task', 'todo', 'reminder', 'schedule', 'deadline', 'due', 'to-do', 'checklist'],
    patterns: [/add a? task/i, /remind me/i, /my tasks/i, /what'?s due/i, /create task/i, /show (my )?tasks/i, /todo list/i],
    weight: 1.0
  },
  general_chat: {
    keywords: [],
    patterns: [],
    weight: 0.5
  }
};

export class IntentDetector {
  private patterns: Record<TaskType, IntentPattern>;

  constructor() {
    this.patterns = { ...INTENT_PATTERNS };
  }

  detect(message: string): IntentResult {
    const normalizedMessage = message.toLowerCase().trim();
    const scores: Array<{ intent: TaskType; score: number; entities: Record<string, string> }> = [];

    for (const [intent, pattern] of Object.entries(this.patterns) as Array<[TaskType, IntentPattern]>) {
      if (intent === 'general_chat') continue;

      const { score, entities } = this.calculateScore(normalizedMessage, pattern);
      if (score > 0) {
        scores.push({ intent, score: score * pattern.weight, entities });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0 || scores[0].score < INTENT_CONFIDENCE_THRESHOLD) {
      return {
        intent: 'general_chat',
        confidence: scores.length > 0 ? scores[0].score : 0.5,
        entities: {},
        rawMessage: message
      };
    }

    return {
      intent: scores[0].intent,
      confidence: Math.min(scores[0].score, 1.0),
      entities: scores[0].entities,
      rawMessage: message
    };
  }

  private calculateScore(message: string, pattern: IntentPattern): { score: number; entities: Record<string, string> } {
    let score = 0;
    const entities: Record<string, string> = {};

    for (const keyword of pattern.keywords) {
      if (message.includes(keyword)) {
        score += 0.15;
      }
    }

    for (const regex of pattern.patterns) {
      const match = message.match(regex);
      if (match) {
        score += 0.4;
        if (match.groups) {
          Object.assign(entities, match.groups);
        }
      }
    }

    return { score: Math.min(score, 1.0), entities };
  }

  addPattern(intent: TaskType, newPatterns: string[]): void {
    const existing = this.patterns[intent];
    existing.keywords = [...existing.keywords, ...newPatterns];
  }

  detectMultiple(message: string): IntentResult[] {
    const normalizedMessage = message.toLowerCase().trim();
    const results: IntentResult[] = [];

    for (const [intent, pattern] of Object.entries(this.patterns) as Array<[TaskType, IntentPattern]>) {
      if (intent === 'general_chat') continue;

      const { score, entities } = this.calculateScore(normalizedMessage, pattern);
      if (score >= INTENT_CONFIDENCE_THRESHOLD) {
        results.push({
          intent,
          confidence: Math.min(score * pattern.weight, 1.0),
          entities,
          rawMessage: message
        });
      }
    }

    results.sort((a, b) => b.confidence - a.confidence);
    return results.length > 0 ? results : [{
      intent: 'general_chat',
      confidence: 0.5,
      entities: {},
      rawMessage: message
    }];
  }
}

export const intentDetector = new IntentDetector();
