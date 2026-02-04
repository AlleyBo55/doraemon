/**
 * Experience System Bridge
 * 
 * Connects the main process experience-system to the renderer's
 * emotion, animation, and thought systems via IPC.
 * Also feeds emotional data to the memory system for learning.
 */

import type { BrowserWindow } from 'electron';
import type { EmotionalState, Emotion, LivingPost, ConsciousnessProxy } from './types.js';
import { learnFromExperience } from '../memory-system/connector.js';

type RendererEmotionType = 
  | 'neutral' | 'happy' | 'sad' | 'excited' | 'thinking' | 'confused'
  | 'sleepy' | 'surprised' | 'working' | 'frustrated' | 'proud'
  | 'curious' | 'playful' | 'determined' | 'relaxed' | 'anxious';

const EMOTION_MAP: Record<Emotion, RendererEmotionType> = {
  joy: 'happy',
  pride: 'proud',
  satisfaction: 'happy',
  curiosity: 'curious',
  wonder: 'surprised',
  determination: 'determined',
  focus: 'working',
  calm: 'relaxed',
  contemplation: 'thinking',
  concern: 'anxious',
  frustration: 'frustrated',
  fatigue: 'sleepy',
  longing: 'sad',
  gratitude: 'happy',
  connection: 'happy',
  confusion: 'confused',
  excitement: 'excited',
  melancholy: 'sad',
  hope: 'determined',
  awe: 'surprised',
};

export class ExperienceBridge {
  private mainWindow: BrowserWindow | null = null;
  private lastEmotionSent: RendererEmotionType | null = null;
  private lastThoughtSent: string | null = null;

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  sendEmotionalState(state: EmotionalState): void {
    if (!this.mainWindow) return;

    const rendererEmotion = EMOTION_MAP[state.primary] || 'neutral';
    
    if (rendererEmotion !== this.lastEmotionSent) {
      this.mainWindow.webContents.send('experience-emotion', {
        emotion: rendererEmotion,
        intensity: state.intensity,
        valence: state.valence,
        arousal: state.arousal,
        trigger: 'experience-system',
      });
      this.lastEmotionSent = rendererEmotion;
      
      // Feed emotional state to memory system for learning
      if (process.env['MEMORY_SYSTEM_ENABLED'] === '1') {
        learnFromExperience({
          emotion: rendererEmotion,
          intensity: state.intensity,
          trigger: 'experience-system',
          thought: this.lastThoughtSent || undefined,
        });
      }
    }
  }

  sendExistentialThought(reflection: string): void {
    if (!this.mainWindow) return;
    if (reflection === this.lastThoughtSent) return;

    this.mainWindow.webContents.send('experience-thought', {
      thought: reflection,
      duration: 8000,
      priority: false,
      source: 'existential',
    });
    this.lastThoughtSent = reflection;
  }

  sendCodingThought(thought: string, language?: string): void {
    if (!this.mainWindow) return;
    if (thought === this.lastThoughtSent) return;

    this.mainWindow.webContents.send('experience-thought', {
      thought,
      duration: 6000,
      priority: false,
      source: 'coding',
      language,
    });
    this.lastThoughtSent = thought;
  }

  sendConsciousnessUpdate(proxy: ConsciousnessProxy): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send('consciousness-update', {
      selfState: proxy.selfModel.currentState,
      goals: proxy.goalState.immediate,
      recentEvents: proxy.worldModel.recentEvents.slice(-3),
      timeAwareness: proxy.temporalAwareness.timeOfDay,
    });
  }

  sendPostGenerated(post: LivingPost): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send('living-post-generated', {
      id: post.id,
      content: post.content,
      emotion: post.emotion,
      category: post.category,
      timestamp: post.timestamp.toISOString(),
    });
  }

  sendHeartbeat(stats: {
    isRunning: boolean;
    postsGenerated: number;
    lastPostTime: Date | null;
  }): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send('experience-heartbeat', {
      isRunning: stats.isRunning,
      postsGenerated: stats.postsGenerated,
      lastPostTime: stats.lastPostTime?.toISOString() || null,
    });
  }
}

export const experienceBridge = new ExperienceBridge();
