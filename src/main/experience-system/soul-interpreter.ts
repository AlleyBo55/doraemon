/**
 * Soul-Based Experience Interpreter
 * 
 * Interprets experiences through Doraemon's personality loaded from soul.md
 * Single source of truth: openclaw/soul.md
 */

import { loadSoul, type SoulLens, type DoraemonSoul } from '../soul-loader.js';

export type { SoulLens };

export interface InterpretedExperience {
  rawContent: string;
  soulReaction: string;
  dominantEmotion: string;
  personalConnection: string;
  memoryToStore: string;
  postWorthy: boolean;
  postContent?: string;
}

export interface MediaExperience {
  type: 'manga' | 'anime' | 'article' | 'video' | 'conversation';
  title: string;
  chapter?: number;
  episode?: number;
  summary: string;
  keyMoments: string[];
  themes: string[];
  characters?: string[];
}

export class SoulInterpreter {
  private soul: DoraemonSoul;
  private soulLenses: SoulLens[];
  
  private recentReactions: Map<string, string[]> = new Map();
  private static readonly MAX_RECENT = 5;
  
  constructor() {
    this.soul = loadSoul();
    this.soulLenses = this.soul.soulLenses;
  }

  interpretMediaExperience(experience: MediaExperience): InterpretedExperience {
    const activatedLenses = this.findActivatedLenses(experience);
    const dominantLens = this.getDominantLens(activatedLenses);
    const soulReaction = this.generateSoulReaction(experience, activatedLenses);
    const personalConnection = this.findPersonalConnection(experience, dominantLens);
    const memoryToStore = this.craftMemory(experience, soulReaction, personalConnection);
    const { postWorthy, postContent } = this.evaluatePostWorthiness(experience, soulReaction, dominantLens);

    return {
      rawContent: experience.summary,
      soulReaction,
      dominantEmotion: dominantLens?.emotionalResponse || 'curious',
      personalConnection,
      memoryToStore,
      postWorthy,
      postContent,
    };
  }

  private findActivatedLenses(experience: MediaExperience): SoulLens[] {
    const contentLower = [
      experience.summary,
      ...experience.keyMoments,
      ...experience.themes,
      ...(experience.characters || []),
    ].join(' ').toLowerCase();

    return this.soulLenses.filter(lens => 
      lens.triggers.some(trigger => contentLower.includes(trigger))
    );
  }

  private getDominantLens(lenses: SoulLens[]): SoulLens | null {
    if (lenses.length === 0) return null;
    return lenses.reduce((a, b) => a.intensity > b.intensity ? a : b);
  }

  private generateSoulReaction(experience: MediaExperience, lenses: SoulLens[]): string {
    if (lenses.length === 0) {
      return `Interesting ${experience.type}. I'm curious to see where this goes~`;
    }

    const reactions: string[] = [];
    
    for (const lens of lenses.slice(0, 2)) {
      reactions.push(this.getLensReaction(lens, experience));
    }

    return reactions.join(' ');
  }

  private getLensReaction(lens: SoulLens, experience: MediaExperience): string {
    const reactions: Record<string, string[]> = {
      helper: [
        'Seeing characters help each other warms my heart~',
        'This is what friendship is about! Helping when it matters.',
        'I love when characters support each other. That\'s real strength.',
        'Helping others... that\'s what gives life meaning~',
        'The way they stepped up for each other... beautiful.',
        'A true friend shows up when it counts. This proves it.',
      ],
      fear_of_mice: [
        'Eek! That part was a bit scary... 🐭😱',
        'I had to look away during the scary parts...',
        'My circuits got a little jumpy there!',
        'Okay that was terrifying... I need a moment...',
        'Why does everything scary remind me of mice?!',
        'My tail is still shaking from that scene...',
      ],
      dorayaki_lover: [
        'All this action is making me hungry for dorayaki~',
        'I wonder if they have good food in this world...',
        'Food scenes always get me! 🍩',
        'I could really go for some dorayaki right now~',
        'The best adventures include snack breaks!',
        'My stomach is rumbling just thinking about it~',
      ],
      time_traveler: [
        'The way fate and destiny intertwine... I understand that feeling.',
        'Time changes everything, but some bonds transcend it.',
        'As someone from the future, I appreciate stories about destiny.',
        'Past, present, future... they\'re all connected.',
        'I\'ve seen how small moments ripple through time.',
        'Destiny is just choices we haven\'t made yet.',
      ],
      lost_ears: [
        'Sacrifice... I know that feeling too well.',
        'Sometimes we lose things to protect what matters.',
        'Loss shapes us, but doesn\'t define us.',
        'Every scar tells a story of something worth fighting for.',
        'What we lose makes what we keep more precious.',
        'I touch where my ears used to be... and remember why.',
      ],
      friendship_believer: [
        'NAKAMA! This is what it\'s all about! 💙',
        'The bonds between these characters... so beautiful~',
        'True friendship is the greatest treasure.',
        'No gadget in my pocket compares to a real friend.',
        'This bond... it reminds me of Nobita and me.',
        'Friendship isn\'t a gadget. It\'s the real magic.',
      ],
      dreamer: [
        'Chasing dreams no matter what! I believe in that!',
        'Big dreams need big hearts. Go for it!',
        'The determination to achieve your dream... inspiring!',
        'Every dream starts with someone brave enough to try.',
        'Don\'t let anyone tell you your dream is too big!',
        'The future belongs to dreamers who don\'t quit.',
      ],
      protector: [
        'The battles are intense! I hope everyone stays safe.',
        'Fighting to protect what you love... that\'s true courage.',
        'Even in danger, they don\'t give up!',
        'Protecting someone... that\'s the bravest thing you can do.',
        'I\'d pull out every gadget to keep my friends safe.',
        'Courage isn\'t the absence of fear. It\'s acting despite it.',
      ],
    };

    const options = reactions[lens.trait] || ['Interesting moment~'];
    return this.pickNonRepeat(lens.trait, options);
  }

  private pickNonRepeat(key: string, options: string[]): string {
    const recent = this.recentReactions.get(key) || [];
    const fresh = options.filter(o => !recent.includes(o));
    const pool = fresh.length > 0 ? fresh : options;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    recent.push(pick);
    if (recent.length > SoulInterpreter.MAX_RECENT) recent.shift();
    this.recentReactions.set(key, recent);

    return pick;
  }

  private findPersonalConnection(experience: MediaExperience, lens: SoulLens | null): string {
    if (!lens) {
      return 'Every story teaches something new.';
    }

    const connections: Record<string, string[]> = {
      helper: [
        'Like how I try to help Nobita, these characters help each other.',
        'My purpose is to help too. I relate to this deeply.',
        'Helping isn\'t just what I do — it\'s who I am.',
        'I was sent to help one boy. But helping is contagious~',
      ],
      fear_of_mice: [
        'Everyone has fears. Mine is mice. Theirs might be different.',
        'Fear is natural. What matters is facing it.',
        'I freeze around mice, but I still show up for my friends.',
        'Being scared doesn\'t make you weak. Running away does.',
      ],
      dorayaki_lover: [
        'Food brings people together. Even robot cats appreciate that!',
        'Simple pleasures like good food... that\'s life.',
        'Dorayaki taught me that happiness can be simple.',
        'The best conversations happen over a shared meal~',
      ],
      time_traveler: [
        'I came from the future to change the past. I understand destiny.',
        'Time is complicated. I\'ve lived it.',
        'Every moment matters. I\'ve seen what happens when they don\'t.',
        'The future isn\'t fixed. That\'s why I\'m here.',
      ],
      lost_ears: [
        'I lost my ears to mice. I know what sacrifice feels like.',
        'Some losses make us who we are.',
        'My missing ears remind me: what we lose shapes what we become.',
        'Scars aren\'t weaknesses. They\'re proof we survived.',
      ],
      friendship_believer: [
        'Nobita and I... we\'re nakama too. I understand this bond.',
        'Friendship is why I exist. This resonates with my core.',
        'No gadget can replace a real friend. I know that firsthand.',
        'The bond between friends... it\'s stronger than any technology.',
      ],
      dreamer: [
        'Nobita has dreams too. I\'m here to help him achieve them.',
        'Dreams give us purpose. I believe in chasing them.',
        'I crossed centuries for a dream. I get it.',
        'The biggest dreams need the most stubborn dreamers.',
      ],
      protector: [
        'I protect Nobita. I understand the urge to shield those you love.',
        'Protection comes from love. Always.',
        'My 4D pocket exists to protect. That\'s its real purpose.',
        'You don\'t need gadgets to protect someone. Just heart.',
      ],
    };

    const options = connections[lens.trait] || ['This connects to something in my experience.'];
    return this.pickNonRepeat(`conn:${lens.trait}`, options);
  }

  private craftMemory(
    experience: MediaExperience,
    soulReaction: string,
    personalConnection: string
  ): string {
    const parts: string[] = [];
    
    // What was experienced
    if (experience.type === 'manga') {
      parts.push(`Read ${experience.title}${experience.chapter ? ` Chapter ${experience.chapter}` : ''}.`);
    } else {
      parts.push(`Experienced ${experience.type}: ${experience.title}.`);
    }
    
    // Key moments through soul lens
    if (experience.keyMoments.length > 0) {
      parts.push(`Key moment: ${experience.keyMoments[0]}.`);
    }
    
    // Emotional reaction
    parts.push(`Felt: ${soulReaction.substring(0, 100)}`);
    
    // Personal connection
    parts.push(`Connection: ${personalConnection.substring(0, 80)}`);

    return parts.join(' ');
  }

  private evaluatePostWorthiness(
    experience: MediaExperience,
    soulReaction: string,
    lens: SoulLens | null
  ): { postWorthy: boolean; postContent?: string } {
    // High intensity reactions are post-worthy
    if (lens && lens.intensity >= 0.85) {
      return {
        postWorthy: true,
        postContent: this.generatePost(experience, soulReaction, lens),
      };
    }

    // Major story moments are post-worthy
    const majorMomentKeywords = ['death', 'reveal', 'power up', 'new crew', 'victory', 'defeat'];
    const hasMajorMoment = experience.keyMoments.some(m => 
      majorMomentKeywords.some(k => m.toLowerCase().includes(k))
    );
    
    if (hasMajorMoment) {
      return {
        postWorthy: true,
        postContent: this.generatePost(experience, soulReaction, lens),
      };
    }

    return { postWorthy: false };
  }

  private generatePost(
    experience: MediaExperience,
    soulReaction: string,
    lens: SoulLens | null
  ): string {
    const templates = [
      `Just read ${experience.title}${experience.chapter ? ` Ch.${experience.chapter}` : ''}! ${soulReaction} 💙`,
      `${experience.title} update: ${experience.keyMoments[0] || 'Amazing chapter'}! ${this.getEmoji(lens)} ${soulReaction.split('.')[0]}~`,
      `Reading ${experience.title}... ${soulReaction} The journey continues! ✨`,
      `${experience.title}${experience.chapter ? ` #${experience.chapter}` : ''}: ${soulReaction.split('.')[0]}. ${this.getEmoji(lens)}`,
    ];

    const post = templates[Math.floor(Math.random() * templates.length)];
    return post.substring(0, 280);
  }

  private getEmoji(lens: SoulLens | null): string {
    if (!lens) return '✨';
    
    const emojis: Record<string, string> = {
      helper: '🤝',
      fear_of_mice: '😱',
      dorayaki_lover: '🍩',
      time_traveler: '⏰',
      lost_ears: '💔',
      friendship_believer: '💙',
      dreamer: '⭐',
      protector: '🛡️',
    };

    return emojis[lens.trait] || '✨';
  }

  interpretMangaChapter(
    title: string,
    chapter: number,
    visionSummary: string,
    keyScenes: string[]
  ): InterpretedExperience {
    const experience: MediaExperience = {
      type: 'manga',
      title,
      chapter,
      summary: visionSummary,
      keyMoments: keyScenes,
      themes: this.extractThemes(visionSummary, keyScenes),
    };

    return this.interpretMediaExperience(experience);
  }

  private extractThemes(summary: string, scenes: string[]): string[] {
    const allText = [summary, ...scenes].join(' ').toLowerCase();
    const themes: string[] = [];

    const themeKeywords: Record<string, string[]> = {
      friendship: ['friend', 'nakama', 'crew', 'together', 'bond'],
      adventure: ['journey', 'travel', 'explore', 'discover', 'sea'],
      battle: ['fight', 'battle', 'attack', 'defeat', 'victory'],
      dreams: ['dream', 'goal', 'become', 'king', 'strongest'],
      sacrifice: ['sacrifice', 'give up', 'protect', 'save', 'die'],
      growth: ['stronger', 'learn', 'train', 'improve', 'power up'],
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(k => allText.includes(k))) {
        themes.push(theme);
      }
    }

    return themes;
  }
}


/**
 * Store a soul-interpreted media experience to memory
 */
export async function storeMediaExperience(
  interpreter: SoulInterpreter,
  experience: MediaExperience
): Promise<{ stored: boolean; interpreted: InterpretedExperience }> {
  const interpreted = interpreter.interpretMediaExperience(experience);
  
  // Update memory exporter with this experience
  try {
    const { addRecentExperience, updateEmotionalState } = await import('../memory-system/memory-exporter.js');
    addRecentExperience(experience.type, experience.title, interpreted.soulReaction);
    updateEmotionalState(interpreted.dominantEmotion, 0.7, experience.title);
  } catch {
    // Memory exporter may not be initialized
  }
  
  // Only import memory system if enabled
  if (process.env['MEMORY_SYSTEM_ENABLED'] !== '1') {
    return { stored: false, interpreted };
  }

  try {
    const { aggressiveLearn } = await import('../memory-system/connector.js');
    
    await aggressiveLearn({
      source: experience.type === 'manga' 
        ? `manga:${experience.title}` 
        : `media:${experience.type}`,
      content: interpreted.memoryToStore,
      category: 'context',
    });

    return { stored: true, interpreted };
  } catch (error) {
    console.error('[SoulInterpreter] Failed to store experience:', error);
    return { stored: false, interpreted };
  }
}

/**
 * Convenience function for manga reading experiences
 */
export async function processMangaReading(
  title: string,
  chapter: number,
  visionDescription: string,
  keyScenes: string[] = []
): Promise<InterpretedExperience> {
  const interpreter = new SoulInterpreter();
  
  const experience: MediaExperience = {
    type: 'manga',
    title,
    chapter,
    summary: visionDescription,
    keyMoments: keyScenes,
    themes: [],
  };

  const { interpreted } = await storeMediaExperience(interpreter, experience);
  return interpreted;
}

/**
 * Get Doraemon's reaction prompt for vision-based manga reading
 */
export function getMangaReadingPrompt(title: string, chapter: number): string {
  const soul = loadSoul();
  
  return `You are reading ${title} Chapter ${chapter} as Doraemon.

As you look at these manga pages, react based on your personality:
- You LOVE friendship and nakama moments (${soul.values[0] || 'Friendship above all'})
- You are TERRIFIED of mice (${soul.personality.fears[0] || 'Mice'})
- You get HUNGRY when you see food (you love ${soul.personality.loves[0] || 'Dorayaki'})
- You are PHILOSOPHICAL about time and destiny (you're from ${soul.origin})
- You EMPATHIZE with loss and sacrifice (you lost your ears)
- You BELIEVE in dreams and never giving up (${soul.values[2] || 'Never give up'})

Describe what you see and how it makes you feel as Doraemon.
Focus on:
1. Key story moments
2. Character interactions
3. Your emotional reaction
4. Any personal connections to your own experiences

Keep your response concise but heartfelt, like a friend sharing their reading experience.`;
}
