/**
 * Post Queue
 * 
 * File-based queue for Docker sidekick to consume.
 * One-way data flow (Snowden/Mr. Robot security model):
 * - Doraemon writes to file
 * - Docker sidekick reads from file
 * - No bidirectional communication
 * 
 * Format: JSONL (one JSON object per line)
 * Location: ~/.openclaw/post-queue.jsonl
 */

import { appendFile, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createHmac, randomBytes } from 'crypto';
import {
  PostQueueEntry,
  LivingPost,
  ExperienceSystemConfig,
  DEFAULT_CONFIG,
} from './types.js';

function expandPath(p: string): string {
  return p.replace(/^~/, homedir());
}

export class PostQueue {
  private config: ExperienceSystemConfig;
  private queuePath: string;
  private signingKey: string;

  constructor(config: Partial<ExperienceSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queuePath = expandPath(this.config.outputPath);
    this.signingKey = this.loadOrCreateSigningKey();
  }

  private loadOrCreateSigningKey(): string {
    const keyPath = expandPath(this.config.signingKeyPath);
    
    try {
      if (existsSync(keyPath)) {
        const fs = require('fs');
        return fs.readFileSync(keyPath, 'utf-8').trim();
      }
    } catch {
      // Will create new key
    }

    // Generate new key
    const newKey = randomBytes(32).toString('hex');
    this.saveSigningKey(newKey);
    return newKey;
  }

  private async saveSigningKey(key: string): Promise<void> {
    const keyPath = expandPath(this.config.signingKeyPath);
    const keyDir = dirname(keyPath);

    try {
      if (!existsSync(keyDir)) {
        await mkdir(keyDir, { recursive: true, mode: 0o700 });
      }
      await writeFile(keyPath, key, { mode: 0o600 });
    } catch (e) {
      console.error('[PostQueue] Failed to save signing key:', e);
    }
  }

  private signEntry(entry: Omit<PostQueueEntry, 'signature'>): string {
    const data = `${entry.id}:${entry.content}:${entry.timestamp}`;
    return createHmac('sha256', this.signingKey).update(data).digest('hex');
  }


  async enqueue(post: LivingPost): Promise<boolean> {
    try {
      const queueDir = dirname(this.queuePath);
      if (!existsSync(queueDir)) {
        await mkdir(queueDir, { recursive: true, mode: 0o700 });
      }

      const entry: Omit<PostQueueEntry, 'signature'> = {
        id: post.id,
        timestamp: post.timestamp.getTime(),
        content: post.content,
        emotion: post.emotion,
        category: post.category,
        hashtags: post.hashtags,
        posted: false,
      };

      const signedEntry: PostQueueEntry = {
        ...entry,
        signature: this.signEntry(entry),
      };

      const line = JSON.stringify(signedEntry) + '\n';
      await appendFile(this.queuePath, line, { mode: 0o600 });

      console.log(`[PostQueue] Enqueued post ${post.id}`);
      return true;
    } catch (e) {
      console.error('[PostQueue] Failed to enqueue post:', e);
      return false;
    }
  }

  async getUnpostedEntries(): Promise<PostQueueEntry[]> {
    try {
      if (!existsSync(this.queuePath)) return [];

      const content = await readFile(this.queuePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      const entries: PostQueueEntry[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as PostQueueEntry;
          if (!entry.posted && this.verifySignature(entry)) {
            entries.push(entry);
          }
        } catch {
          // Skip invalid lines
        }
      }

      return entries;
    } catch (e) {
      console.error('[PostQueue] Failed to read queue:', e);
      return [];
    }
  }

  async markAsPosted(id: string): Promise<boolean> {
    try {
      if (!existsSync(this.queuePath)) return false;

      const content = await readFile(this.queuePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      const updatedLines: string[] = [];
      let found = false;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as PostQueueEntry;
          if (entry.id === id) {
            entry.posted = true;
            entry.postedAt = Date.now();
            found = true;
          }
          updatedLines.push(JSON.stringify(entry));
        } catch {
          updatedLines.push(line);
        }
      }

      if (found) {
        await writeFile(this.queuePath, updatedLines.join('\n') + '\n', { mode: 0o600 });
      }

      return found;
    } catch (e) {
      console.error('[PostQueue] Failed to mark as posted:', e);
      return false;
    }
  }

  verifySignature(entry: PostQueueEntry): boolean {
    const expectedSig = this.signEntry({
      id: entry.id,
      timestamp: entry.timestamp,
      content: entry.content,
      emotion: entry.emotion,
      category: entry.category,
      hashtags: entry.hashtags,
      posted: entry.posted,
    });

    return entry.signature === expectedSig;
  }

  async cleanup(maxAgeDays: number = 7): Promise<number> {
    try {
      if (!existsSync(this.queuePath)) return 0;

      const content = await readFile(this.queuePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

      const keptLines: string[] = [];
      let removed = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as PostQueueEntry;
          if (entry.timestamp > cutoff) {
            keptLines.push(line);
          } else {
            removed++;
          }
        } catch {
          // Remove invalid lines
          removed++;
        }
      }

      if (removed > 0) {
        await writeFile(this.queuePath, keptLines.join('\n') + '\n', { mode: 0o600 });
      }

      return removed;
    } catch (e) {
      console.error('[PostQueue] Cleanup failed:', e);
      return 0;
    }
  }
}
