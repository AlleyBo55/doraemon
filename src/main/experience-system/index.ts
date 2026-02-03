/**
 * Living Experience System - Main Entry Point
 * 
 * Orchestrates the heartbeat cycle:
 * 1. Every 50 minutes, collect experiences from logs
 * 2. Map experiences to emotional state
 * 3. Generate a living post
 * 4. Queue for Docker sidekick to post to Moltbook
 * 5. Bridge emotional state to renderer for animation/thought sync
 */

import { PostGenerator } from './post-generator.js';
import { PostQueue } from './post-queue.js';
import { ExperienceSystemConfig, DEFAULT_CONFIG, LivingPost } from './types.js';
import { experienceBridge } from './bridge.js';

export class ExperienceSystem {
  private config: ExperienceSystemConfig;
  private postGenerator: PostGenerator;
  private postQueue: PostQueue;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private postsGenerated = 0;
  private lastPostTime: Date | null = null;

  constructor(config: Partial<ExperienceSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.postGenerator = new PostGenerator(this.config);
    this.postQueue = new PostQueue(this.config);
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
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
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
        const queued = await this.postQueue.enqueue(post);
        if (queued) {
          console.log('[ExperienceSystem] Post queued:', post.id, '-', post.content.substring(0, 50));
          this.postsGenerated++;
          this.lastPostTime = new Date();
          
          experienceBridge.sendPostGenerated(post);
          
          if (post.consciousnessSnapshot) {
            experienceBridge.sendConsciousnessUpdate(post.consciousnessSnapshot);
          }
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
    };
  }

  async getQueuedPosts() {
    return this.postQueue.getUnpostedEntries();
  }

  async cleanupOldPosts(maxAgeDays = 7) {
    return this.postQueue.cleanup(maxAgeDays);
  }
}

// Export all types and classes
export * from './types.js';
export { PostGenerator } from './post-generator.js';
export { PostQueue } from './post-queue.js';
export { ExperienceProcessor } from './experience-processor.js';
export { ConversationProcessor } from './conversation-processor.js';
export { EmotionalMapper } from './emotional-mapper.js';
export { ExistentialLayer } from './existential-layer.js';
export { sanitizeContent, sanitizeFilename, sanitizeLogEntry } from './sanitizer.js';
export { experienceBridge, ExperienceBridge } from './bridge.js';
