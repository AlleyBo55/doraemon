/**
 * Conversation Processor
 * 
 * Processes OpenClaw conversation logs to extract shared experiences.
 * This captures the "talking together" part - the meaningful exchanges
 * that form the basis of genuine companionship.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  SanitizedExperience,
  SharedMoment,
  Emotion,
  ExperienceSystemConfig,
  DEFAULT_CONFIG,
} from './types.js';
import { sanitizeContent } from './sanitizer.js';

function expandPath(p: string): string {
  return p.replace(/^~/, homedir());
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface ConversationLog {
  id: string;
  startTime: string;
  messages: ConversationMessage[];
  metadata?: {
    topics?: string[];
    sharedLinks?: string[];
  };
}

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const TOPIC_KEYWORDS: Record<string, string[]> = {
  coding: ['code', 'function', 'bug', 'error', 'implement', 'refactor'],
  learning: ['how', 'what', 'why', 'explain', 'understand', 'learn'],
  debugging: ['fix', 'broken', 'issue', 'problem', 'debug', 'error'],
  creating: ['create', 'build', 'make', 'new', 'design', 'generate'],
  celebrating: ['thanks', 'awesome', 'great', 'perfect', 'love', 'amazing'],
  struggling: ['stuck', 'help', 'confused', 'frustrated', "can't", 'difficult'],
};

export class ConversationProcessor {
  private config: ExperienceSystemConfig;

  constructor(config: Partial<ExperienceSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async collectConversationExperiences(windowMinutes: number = 50): Promise<{
    experiences: SanitizedExperience[];
    sharedMoments: SharedMoment[];
  }> {
    const experiences: SanitizedExperience[] = [];
    const sharedMoments: SharedMoment[] = [];
    const cutoffTime = Date.now() - (windowMinutes * 60 * 1000);

    const conversationPath = expandPath(this.config.logPaths.openclaw);
    if (!existsSync(conversationPath)) {
      return { experiences, sharedMoments };
    }

    try {
      const files = await readdir(conversationPath);
      const logFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));

      for (const file of logFiles.slice(-10)) {
        const filePath = join(conversationPath, file);
        const fileStat = await stat(filePath);
        if (fileStat.mtimeMs < cutoffTime) continue;

        const content = await readFile(filePath, 'utf-8');
        const parsed = this.parseConversationFile(content, cutoffTime);
        
        experiences.push(...parsed.experiences);
        sharedMoments.push(...parsed.sharedMoments);
      }
    } catch (e) {
      console.error('[ConversationProcessor] Error reading conversations:', e);
    }

    return { experiences, sharedMoments };
  }

  private parseConversationFile(content: string, cutoffTime: number): {
    experiences: SanitizedExperience[];
    sharedMoments: SharedMoment[];
  } {
    const experiences: SanitizedExperience[] = [];
    const sharedMoments: SharedMoment[] = [];

    try {
      if (content.trim().startsWith('[')) {
        const logs: ConversationLog[] = JSON.parse(content);
        for (const log of logs) {
          const parsed = this.processConversation(log, cutoffTime);
          experiences.push(...parsed.experiences);
          sharedMoments.push(...parsed.sharedMoments);
        }
      } else {
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const log: ConversationLog = JSON.parse(line);
            const parsed = this.processConversation(log, cutoffTime);
            experiences.push(...parsed.experiences);
            sharedMoments.push(...parsed.sharedMoments);
          } catch { /* skip invalid lines */ }
        }
      }
    } catch { /* skip invalid files */ }

    return { experiences, sharedMoments };
  }

  private processConversation(log: ConversationLog, cutoffTime: number): {
    experiences: SanitizedExperience[];
    sharedMoments: SharedMoment[];
  } {
    const experiences: SanitizedExperience[] = [];
    const sharedMoments: SharedMoment[] = [];

    const startTime = new Date(log.startTime);
    if (startTime.getTime() < cutoffTime) {
      return { experiences, sharedMoments };
    }

    const topics = this.extractTopics(log.messages);
    const sharedLinks = this.extractSharedLinks(log.messages);
    const emotionalTone = this.analyzeEmotionalTone(log.messages);
    const category = this.categorizeConversation(log.messages);

    experiences.push({
      id: `conv-${log.id || startTime.getTime()}`,
      timestamp: startTime,
      category,
      activity: this.summarizeConversation(log.messages, topics),
      effort: this.estimateConversationEffort(log.messages),
      outcome: this.determineOutcome(log.messages),
      learnings: topics.slice(0, 3),
      duration_minutes: this.estimateDuration(log.messages),
      sanitized: true,
    });

    if (log.messages.length >= 2) {
      sharedMoments.push({
        id: `moment-${log.id || startTime.getTime()}`,
        timestamp: startTime,
        type: sharedLinks.length > 0 ? 'shared_link' : 'conversation',
        summary: this.createMomentSummary(log.messages, topics),
        emotionalTone,
        topics,
        humanInitiated: true,
      });
    }

    for (const link of sharedLinks) {
      sharedMoments.push({
        id: `link-${startTime.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: startTime,
        type: 'shared_link',
        summary: `Shared: ${sanitizeContent(link).substring(0, 100)}`,
        emotionalTone: 'curiosity',
        topics: ['shared content'],
        humanInitiated: true,
      });
    }

    return { experiences, sharedMoments };
  }

  private extractTopics(messages: ConversationMessage[]): string[] {
    const topics = new Set<string>();
    const allText = messages.map(m => m.content.toLowerCase()).join(' ');

    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some(kw => allText.includes(kw))) {
        topics.add(topic);
      }
    }

    return Array.from(topics);
  }

  private extractSharedLinks(messages: ConversationMessage[]): string[] {
    const links: string[] = [];
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        const found = msg.content.match(URL_PATTERN);
        if (found) links.push(...found);
      }
    }

    return [...new Set(links)];
  }

  private analyzeEmotionalTone(messages: ConversationMessage[]): Emotion {
    const userMessages = messages.filter(m => m.role === 'user');
    const text = userMessages.map(m => m.content.toLowerCase()).join(' ');

    if (/thank|awesome|great|perfect|love|amazing/.test(text)) return 'gratitude';
    if (/stuck|help|confused|frustrated|can't/.test(text)) return 'concern';
    if (/how|what|why|explain|understand/.test(text)) return 'curiosity';
    if (/bug|error|fix|broken/.test(text)) return 'determination';
    if (/create|build|make|new/.test(text)) return 'excitement';
    
    return 'connection';
  }

  private categorizeConversation(messages: ConversationMessage[]): SanitizedExperience['category'] {
    const topics = this.extractTopics(messages);
    
    if (topics.includes('celebrating')) return 'celebrating';
    if (topics.includes('struggling')) return 'struggling';
    if (topics.includes('debugging')) return 'debugging';
    if (topics.includes('creating')) return 'creating';
    if (topics.includes('learning')) return 'learning';
    if (topics.includes('coding')) return 'coding';
    
    return 'communicating';
  }

  private summarizeConversation(messages: ConversationMessage[], topics: string[]): string {
    const msgCount = messages.length;
    const topicStr = topics.length > 0 ? topics.slice(0, 2).join(', ') : 'general';
    
    return `Conversation about ${topicStr} (${msgCount} messages)`;
  }

  private createMomentSummary(messages: ConversationMessage[], topics: string[]): string {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const sanitized = sanitizeContent(firstUserMsg.content);
      return sanitized.substring(0, 80) + (sanitized.length > 80 ? '...' : '');
    }
    return `Discussion about ${topics[0] || 'various topics'}`;
  }

  private estimateConversationEffort(messages: ConversationMessage[]): SanitizedExperience['effort'] {
    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    
    if (totalLength > 5000 || messages.length > 20) return 'intense';
    if (totalLength > 2000 || messages.length > 10) return 'high';
    if (totalLength > 500 || messages.length > 4) return 'medium';
    return 'low';
  }

  private determineOutcome(messages: ConversationMessage[]): SanitizedExperience['outcome'] {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return 'ongoing';

    const text = lastUserMsg.content.toLowerCase();
    if (/thank|perfect|great|works|solved/.test(text)) return 'success';
    if (/still|not working|doesn't|failed/.test(text)) return 'partial';
    
    return 'ongoing';
  }

  private estimateDuration(messages: ConversationMessage[]): number {
    return Math.max(1, Math.ceil(messages.length * 1.5));
  }
}
