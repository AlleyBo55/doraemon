import { describe, it, expect } from 'vitest';
import { EmotionalMapper } from './emotional-mapper.js';
import type { SanitizedExperience } from './types.js';

function makeExperience(overrides: Partial<SanitizedExperience> = {}): SanitizedExperience {
  return {
    id: `exp-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date(),
    category: 'coding',
    activity: 'writing code',
    effort: 'medium',
    outcome: 'success',
    learnings: ['learned something'],
    duration_minutes: 30,
    sanitized: true,
    ...overrides,
  };
}

describe('EmotionalMapper', () => {
  const mapper = new EmotionalMapper();

  describe('mapExperiencesToEmotion', () => {
    it('returns neutral state for empty experiences', () => {
      const state = mapper.mapExperiencesToEmotion([]);
      expect(state.primary).toBe('calm');
      expect(state.intensity).toBeCloseTo(0.3);
      expect(state.valence).toBeCloseTo(0.1);
      expect(state.arousal).toBeCloseTo(0.2);
      expect(state.internalState.energyLevel).toBeCloseTo(0.8);
    });

    it('maps coding experiences to focus', () => {
      const exps = [makeExperience({ category: 'coding', duration_minutes: 60 })];
      const state = mapper.mapExperiencesToEmotion(exps);
      expect(state.primary).toBe('focus');
    });

    it('maps celebrating to joy with high valence', () => {
      const exps = [makeExperience({ category: 'celebrating', outcome: 'success', effort: 'low' })];
      const state = mapper.mapExperiencesToEmotion(exps);
      expect(state.valence).toBeGreaterThan(0.5);
    });

    it('maps struggling + failure to negative valence', () => {
      const exps = [
        makeExperience({ category: 'struggling', outcome: 'failure', effort: 'intense' }),
        makeExperience({ category: 'debugging', outcome: 'failure', effort: 'high' }),
      ];
      const state = mapper.mapExperiencesToEmotion(exps);
      expect(state.valence).toBeLessThan(0.2);
    });

    it('detects fatigue from long intense sessions', () => {
      const exps = Array.from({ length: 6 }, (_, i) =>
        makeExperience({ effort: 'intense', duration_minutes: 45, category: 'debugging' })
      );
      const state = mapper.mapExperiencesToEmotion(exps);
      expect(state.internalState.energyLevel).toBeLessThan(0.3);
    });

    it('detects high novelty from diverse categories', () => {
      const categories = ['coding', 'learning', 'exploring', 'creating', 'communicating', 'reflecting'] as const;
      const exps = categories.map(c => makeExperience({ category: c, learnings: [`${c}-insight`] }));
      const state = mapper.mapExperiencesToEmotion(exps);
      expect(state.internalState.noveltyScore).toBeGreaterThan(0.4);
    });

    it('detects high coherence from focused single-category work', () => {
      const exps = Array.from({ length: 4 }, () => makeExperience({ category: 'coding' }));
      const state = mapper.mapExperiencesToEmotion(exps);
      expect(state.internalState.coherenceScore).toBeGreaterThan(0.8);
    });

    it('keeps all values in valid ranges', () => {
      const exps = [
        makeExperience({ category: 'celebrating', outcome: 'success', effort: 'intense', duration_minutes: 120 }),
        makeExperience({ category: 'struggling', outcome: 'failure', effort: 'intense', duration_minutes: 90 }),
        makeExperience({ category: 'learning', outcome: 'partial', effort: 'low', learnings: ['a', 'b', 'c'] }),
      ];
      const state = mapper.mapExperiencesToEmotion(exps);

      expect(state.valence).toBeGreaterThanOrEqual(-1);
      expect(state.valence).toBeLessThanOrEqual(1);
      expect(state.arousal).toBeGreaterThanOrEqual(0);
      expect(state.arousal).toBeLessThanOrEqual(1);
      expect(state.intensity).toBeGreaterThanOrEqual(0);
      expect(state.intensity).toBeLessThanOrEqual(1);
      expect(state.internalState.energyLevel).toBeGreaterThanOrEqual(0);
      expect(state.internalState.energyLevel).toBeLessThanOrEqual(1);
    });
  });

  describe('describeEmotion', () => {
    it('describes high intensity positive state', () => {
      const state = mapper.mapExperiencesToEmotion([
        makeExperience({ category: 'celebrating', outcome: 'success', effort: 'high', duration_minutes: 60 }),
      ]);
      const desc = mapper.describeEmotion(state);
      expect(desc).toContain('positive');
    });

    it('describes neutral calm state', () => {
      const state = mapper.mapExperiencesToEmotion([]);
      const desc = mapper.describeEmotion(state);
      expect(desc).toContain('calm');
    });
  });
});
