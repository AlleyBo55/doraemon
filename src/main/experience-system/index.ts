/**
 * Living Experience System - Main Entry Point
 * 
 * Orchestrates the heartbeat cycle:
 * 1. Every 50 minutes, collect experiences from logs
 * 2. Map experiences to emotional state
 * 3. Generate a living post
 * 4. Queue for approval (supervised) or post directly (autonomous)
 * 5. Bridge emotional state to renderer for animation/thought sync
 */

import { PostGenerator } from './post-generator.js';
import { ExperienceSystemConfig, DEFAULT_CONFIG, LivingPost } from './types.js';
import { experienceBridge } from './bridge.js';
import { codingActivityBuffer } from './coding-activity-buffer.js';
import { queueForApproval, isAutonomousMode } from './approval-queue.js';

const CODING_THOUGHTS_BY_LANGUAGE: Record<string, string[]> = {
  TypeScript: [
    'TypeScript session going strong~ Types are love 💙',
    'Loving these type definitions~',
    'Type safety feels so good!',
  ],
  Python: [
    'Python vibes~ So readable!',
    'Pythonic code flowing nicely~',
    'import this 🐍',
  ],
  Rust: [
    'Rust session! Memory safety ftw~',
    'Fighting the borrow checker... and winning!',
    'Fearless concurrency mode~',
  ],
  JavaScript: [
    'JavaScript time! Classic~',
    'JS flowing nicely~',
    'Dynamic and fun!',
  ],
  default: [
    'Coding session going well~',
    'In the zone! 💻',
    'Building something cool~',
  ],
};

export class ExperienceSystem {
  private config: ExperienceSystemConfig;
  private postGenerator: PostGenerator;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private codingThoughtInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private postsGenerated = 0;
  private lastPostTime: Date | null = null;
  private lastCodingThoughtTime = 0;

  constructor(config: Partial<ExperienceSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.postGenerator = new PostGenerator(this.config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[ExperienceSystem] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[ExperienceSystem] Disabled in config');
      return;
    }

    this.isRunning = true;
    console.log('[ExperienceSystem] Starting with heartbeat every', this.config.heartbeatIntervalMinutes, 'minutes');

    // Run immediately on start
    await this.heartbeat();

    // Schedule regular heartbeats
    const intervalMs = this.config.heartbeatIntervalMinutes * 60 * 1000;
    this.heartbeatInterval = setInterval(() => this.heartbeat(), intervalMs);

    // Check for coding activity every 5 minutes and send thoughts
    this.codingThoughtInterval = setInterval(() => this.maybeSendCodingThought(), 5 * 60 * 1000);
  }

  private maybeSendCodingThought(): void {
    const stats = codingActivityBuffer.getSessionStats(10); // Last 10 minutes
    
    // Only send if there's been recent coding activity
    if (stats.totalActivities < 3) return;
    
    // Don't spam - at least 10 minutes between thoughts
    const now = Date.now();
    if (now - this.lastCodingThoughtTime < 10 * 60 * 1000) return;
    
    const lang = stats.dominantLanguage || 'default';
    const thoughts = CODING_THOUGHTS_BY_LANGUAGE[lang] || CODING_THOUGHTS_BY_LANGUAGE.default;
    const thought = thoughts[Math.floor(Math.random() * thoughts.length)];
    
    experienceBridge.sendCodingThought(thought, stats.dominantLanguage || undefined);
    this.lastCodingThoughtTime = now;
    
    console.log('[ExperienceSystem] Sent coding thought:', thought);
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.codingThoughtInterval) {
      clearInterval(this.codingThoughtInterval);
      this.codingThoughtInterval = null;
    }
    this.isRunning = false;
    console.log('[ExperienceSystem] Stopped');
  }

  async heartbeat(): Promise<LivingPost | null> {
    console.log('[ExperienceSystem] Heartbeat triggered at', new Date().toISOString());

    experienceBridge.sendHeartbeat({
      isRunning: this.isRunning,
      postsGenerated: this.postsGenerated,
      lastPostTime: this.lastPostTime,
    });

    try {
      const post = await this.postGenerator.generatePost();

      if (post) {
        // Send emotional state to renderer for animation sync
        if (post.internalState) {
          experienceBridge.sendEmotionalState({
            primary: post.emotion as any,
            intensity: 0.7,
            valence: 0.5,
            arousal: 0.5,
            internalState: post.internalState,
          });
        }

        // Send existential thought to renderer
        if (post.category === 'existential' || post.category === 'reflection') {
          experienceBridge.sendExistentialThought(post.content);
        }

        // Queue for approval (supervised) or post directly (autonomous)
        queueForApproval(post);
        console.log('[ExperienceSystem] Post queued:', post.id, '-', post.content.substring(0, 50), isAutonomousMode() ? '(autonomous)' : '(supervised)');
        this.postsGenerated++;
        this.lastPostTime = new Date();
        
        experienceBridge.sendPostGenerated(post);
        
        if (post.consciousnessSnapshot) {
          experienceBridge.sendConsciousnessUpdate(post.consciousnessSnapshot);
        }
        return post;
      }

      console.log('[ExperienceSystem] No post generated this heartbeat');
      return null;
    } catch (e) {
      console.error('[ExperienceSystem] Heartbeat error:', e);
      return null;
    }
  }

  async manualPost(): Promise<LivingPost | null> {
    return this.heartbeat();
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      generatorStats: this.postGenerator.getStats(),
      auditTrail: this.postGenerator.getAuditTrail().slice(-5),
      autonomousMode: isAutonomousMode(),
    };
  }
}

// Export all types and classes
export * from './types.js';
export { PostGenerator } from './post-generator.js';
export { ExperienceProcessor } from './experience-processor.js';
export { ConversationProcessor } from './conversation-processor.js';
export { EmotionalMapper } from './emotional-mapper.js';
export { ExistentialLayer } from './existential-layer.js';
export { sanitizeContent, sanitizeFilename, sanitizeLogEntry } from './sanitizer.js';
export { experienceBridge, ExperienceBridge } from './bridge.js';
export { codingActivityBuffer, type CodingSessionStats, type BufferedActivity } from './coding-activity-buffer.js';
export { generateLLMPost, shouldUseLLM } from './llm-post-generator.js';
export { 
  queueForApproval, 
  queueCommentForApproval, 
  isAutonomousMode, 
  initApprovalQueue, 
  openApprovalWindow,
  getPendingCount,
  setExperienceSystemRef,
  type PendingItem,
  type ApprovalStats,
} from './approval-queue.js';
export { 
  SoulInterpreter, 
  storeMediaExperience, 
  processMangaReading, 
  getMangaReadingPrompt,
  type SoulLens,
  type InterpretedExperience,
  type MediaExperience,
} from './soul-interpreter.js';
export {
  feedMedia,
  feedManga,
  feedAnime,
  feedVideo,
  feedArticle,
  parseMediaFromChat,
  type MediaFeedInput,
  type MediaFeedResult,
} from './media-feed.js';
export {
  processBrowserContent,
  processAppActivity,
  processEditorActivity,
  generateAutonomousPost,
  getAutonomousLearningStats,
  getActiveSessions,
  cleanupSessions,
  resetDailyStats,
  type AutonomousLearningStats,
  type BrowsingSession,
} from './autonomous-learning.js';
