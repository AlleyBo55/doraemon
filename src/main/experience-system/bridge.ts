/**
 * Experience System Bridge
 * 
 * Connects the main process experience-system to the renderer's
 * emotion, animation, and thought systems via IPC.
 * Also feeds emotional data to the memory system for learning.
 */

import type { BrowserWindow } from 'electron';
import type { EmotionalState, Emotion, LivingPost, ConsciousnessProxy } from './types.js';
import { cfg } from '../config.js';
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
      if (cfg.memorySystemEnabled) {
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

  sendBrowsingThought(domain: string, category: string): void {
    if (!this.mainWindow) return;

    // Import browsing thoughts dynamically
    const thoughts = this.getBrowsingThought(domain, category);
    
    this.mainWindow.webContents.send('browser-activity', {
      thought: thoughts,
      domain,
      category,
      emotion: category === 'dev' ? 'working' : category === 'entertainment' ? 'playful' : 'curious',
      animation: 'idle',
    });
  }

  private getBrowsingThought(domain: string, category: string): string {
    const thoughts: Record<string, string[]> = {
      social: [
        'Scrolling through the feed~',
        'So many posts to see!',
        'What\'s everyone talking about?',
        'The timeline never sleeps~',
        'Ooh, trending topics!',
        'Social media is like a 4D pocket of opinions~',
      ],
      entertainment: [
        'Entertainment time~!',
        'This looks interesting!',
        'Relaxing with some content~',
        'A little break never hurts~',
        'Time to recharge the batteries!',
        'Even robot cats need fun~',
      ],
      dev: [
        'Learning something new~',
        'Code is beautiful!',
        'Developer mode activated!',
        'Ooh, clever solution!',
        'Stack Overflow saves the day again~',
        'Documentation is a treasure map~',
      ],
      news: [
        'Catching up on news~',
        'What\'s happening in the world?',
        'Staying informed!',
        'The world keeps spinning~',
        'Knowledge is power!',
        'So much happening out there~',
      ],
      general: [
        'Browsing the web~',
        'Exploring the internet!',
        'What will we find?',
        'The internet is vast~',
        'Curiosity leads the way!',
        'Every click is an adventure~',
      ],
    };

    const categoryThoughts = thoughts[category] || thoughts.general;
    return categoryThoughts[Math.floor(Math.random() * categoryThoughts.length)];
  }
}

export const experienceBridge = new ExperienceBridge();
