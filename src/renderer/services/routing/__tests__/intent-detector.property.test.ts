import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { IntentDetector } from '../intent-detector';
import { INTENT_CONFIDENCE_THRESHOLD } from '../constants';
import {
  weatherKeywordMessageArb,
  timeKeywordMessageArb,
  searchKeywordMessageArb,
  imageKeywordMessageArb,
  taskKeywordMessageArb,
  ambiguousMessageArb,
} from './generators';

describe('IntentDetector Property Tests', () => {
  const detector = new IntentDetector();

  // Feature: multi-model-agentic-routing, Property 1: Intent Classification Correctness
  describe('Property 1: Intent Classification Correctness', () => {
    it('should classify weather messages as weather intent', () => {
      fc.assert(
        fc.property(weatherKeywordMessageArb, (message) => {
          const result = detector.detect(message);
          return result.intent === 'weather' || result.confidence < INTENT_CONFIDENCE_THRESHOLD;
        }),
        { numRuns: 100 }
      );
    });

    it('should classify time messages as time intent', () => {
      fc.assert(
        fc.property(timeKeywordMessageArb, (message) => {
          const result = detector.detect(message);
          return result.intent === 'time' || result.confidence < INTENT_CONFIDENCE_THRESHOLD;
        }),
        { numRuns: 100 }
      );
    });

    it('should classify search messages as web_search intent', () => {
      fc.assert(
        fc.property(searchKeywordMessageArb, (message) => {
          const result = detector.detect(message);
          return result.intent === 'web_search' || result.confidence < INTENT_CONFIDENCE_THRESHOLD;
        }),
        { numRuns: 100 }
      );
    });

    it('should classify image messages as image_generation intent', () => {
      fc.assert(
        fc.property(imageKeywordMessageArb, (message) => {
          const result = detector.detect(message);
          return result.intent === 'image_generation' || result.confidence < INTENT_CONFIDENCE_THRESHOLD;
        }),
        { numRuns: 100 }
      );
    });

    it('should classify task messages as task_management intent', () => {
      fc.assert(
        fc.property(taskKeywordMessageArb, (message) => {
          const result = detector.detect(message);
          return result.intent === 'task_management' || result.confidence < INTENT_CONFIDENCE_THRESHOLD;
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: multi-model-agentic-routing, Property 2: Low Confidence Fallback
  describe('Property 2: Low Confidence Fallback', () => {
    it('should fallback to general_chat for ambiguous messages', () => {
      fc.assert(
        fc.property(ambiguousMessageArb, (message) => {
          const result = detector.detect(message);
          if (result.confidence < INTENT_CONFIDENCE_THRESHOLD) {
            return result.intent === 'general_chat';
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should always return confidence between 0 and 1', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (message) => {
          const result = detector.detect(message);
          return result.confidence >= 0 && result.confidence <= 1;
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: multi-model-agentic-routing, Property 3: Multi-Intent Ordering
  describe('Property 3: Multi-Intent Ordering', () => {
    it('should return intents sorted by confidence (highest first)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 5, maxLength: 100 }), (message) => {
          const results = detector.detectMultiple(message);
          for (let i = 1; i < results.length; i++) {
            if (results[i].confidence > results[i - 1].confidence) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should always return at least one intent result', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (message) => {
          const results = detector.detectMultiple(message);
          return results.length >= 1;
        }),
        { numRuns: 100 }
      );
    });
  });
});
