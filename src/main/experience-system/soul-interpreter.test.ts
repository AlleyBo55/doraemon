import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { getAppPath: () => '/mock' } }));

vi.mock('../soul-loader.js', () => ({
  loadSoul: () => ({
    name: 'Doraemon',
    nameJapanese: 'ドラえもん',
    species: 'Robot Cat',
    model: 'MS-903',
    origin: '22nd Century Tokyo',
    essence: 'I exist to help.',
    personality: {
      traits: ['Kind-hearted', 'Patient'],
      fears: ['Mice'],
      loves: ['Dorayaki'],
    },
    speechPatterns: { endingSuffix: '~', exclamations: { happy: 'Yatta~!' } },
    values: ['Everyone deserves help', 'Friendship transcends time', 'Never give up'],
    soulLenses: [
      { trait: 'helper', triggers: ['help', 'save', 'friend'], emotionalResponse: 'warm and inspired', intensity: 0.9 },
      { trait: 'fear_of_mice', triggers: ['mouse', 'mice', 'scary'], emotionalResponse: 'anxious', intensity: 0.95 },
      { trait: 'dorayaki_lover', triggers: ['food', 'eat', 'hungry'], emotionalResponse: 'hungry and happy', intensity: 0.7 },
      { trait: 'friendship_believer', triggers: ['nakama', 'bond', 'trust'], emotionalResponse: 'deeply moved', intensity: 0.95 },
      { trait: 'dreamer', triggers: ['dream', 'goal', 'ambition'], emotionalResponse: 'excited', intensity: 0.8 },
      { trait: 'protector', triggers: ['danger', 'fight', 'battle'], emotionalResponse: 'tense but hopeful', intensity: 0.75 },
    ],
  }),
}));

import { SoulInterpreter, type MediaExperience } from './soul-interpreter.js';

function makeMangaExperience(overrides: Partial<MediaExperience> = {}): MediaExperience {
  return {
    type: 'manga',
    title: 'One Piece',
    chapter: 1100,
    summary: 'The crew helps a friend in danger.',
    keyMoments: ['Luffy saves his nakama'],
    themes: ['friendship', 'adventure'],
    characters: ['Luffy', 'Zoro'],
    ...overrides,
  };
}

describe('SoulInterpreter', () => {
  let interpreter: SoulInterpreter;

  beforeEach(() => {
    interpreter = new SoulInterpreter();
  });

  describe('interpretMediaExperience', () => {
    it('returns a complete InterpretedExperience', () => {
      const result = interpreter.interpretMediaExperience(makeMangaExperience());
      expect(result).toHaveProperty('rawContent');
      expect(result).toHaveProperty('soulReaction');
      expect(result).toHaveProperty('dominantEmotion');
      expect(result).toHaveProperty('personalConnection');
      expect(result).toHaveProperty('memoryToStore');
      expect(typeof result.postWorthy).toBe('boolean');
    });

    it('activates helper lens for helping content', () => {
      const result = interpreter.interpretMediaExperience(
        makeMangaExperience({ summary: 'The hero helps save the village' })
      );
      expect(result.soulReaction.length).toBeGreaterThan(0);
      expect(result.dominantEmotion).toBeTruthy();
    });

    it('activates fear lens for scary content', () => {
      const result = interpreter.interpretMediaExperience(
        makeMangaExperience({ summary: 'A giant scary mouse appeared', themes: ['horror'] })
      );
      expect(result.soulReaction).toBeTruthy();
    });

    it('activates friendship lens for nakama content', () => {
      const result = interpreter.interpretMediaExperience(
        makeMangaExperience({ summary: 'The bond of trust between nakama', keyMoments: ['nakama forever'] })
      );
      expect(result.dominantEmotion).toBe('deeply moved');
    });

    it('returns neutral reaction when no lenses activate', () => {
      const result = interpreter.interpretMediaExperience(
        makeMangaExperience({ summary: 'A quiet day at the office', keyMoments: [], themes: [], characters: [] })
      );
      expect(result.soulReaction).toContain('curious');
    });

    it('marks high-intensity experiences as post-worthy', () => {
      const result = interpreter.interpretMediaExperience(
        makeMangaExperience({ summary: 'The nakama bond is unbreakable trust', keyMoments: ['trust forever'] })
      );
      expect(result.postWorthy).toBe(true);
      expect(result.postContent).toBeTruthy();
    });

    it('marks major story moments as post-worthy', () => {
      const result = interpreter.interpretMediaExperience(
        makeMangaExperience({ keyMoments: ['character death scene'] })
      );
      expect(result.postWorthy).toBe(true);
    });

    it('crafts memory with title and chapter', () => {
      const result = interpreter.interpretMediaExperience(
        makeMangaExperience({ title: 'Naruto', chapter: 700 })
      );
      expect(result.memoryToStore).toContain('Naruto');
      expect(result.memoryToStore).toContain('700');
    });
  });

  describe('non-repeat reactions', () => {
    it('avoids repeating the same reaction consecutively', () => {
      const reactions = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const result = interpreter.interpretMediaExperience(
          makeMangaExperience({ summary: `The hero helps save friend ${i}` })
        );
        reactions.add(result.soulReaction);
      }
      expect(reactions.size).toBeGreaterThan(1);
    });
  });

  describe('interpretMangaChapter', () => {
    it('creates experience from chapter data', () => {
      const result = interpreter.interpretMangaChapter(
        'Bleach', 686, 'Ichigo defeats the final enemy', ['Final battle']
      );
      expect(result.rawContent).toContain('Ichigo');
      expect(result.memoryToStore).toContain('Bleach');
      expect(result.memoryToStore).toContain('686');
    });
  });
});
