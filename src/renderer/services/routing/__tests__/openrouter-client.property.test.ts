import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { OpenRouterClient } from '../openrouter-client';
import { modelIdArb } from './generators';
import type { OpenRouterRequest } from '../types';

const messageRoleArb = fc.constantFrom<'user' | 'assistant' | 'system'>('user', 'assistant', 'system');

const messageArb = fc.record({
  role: messageRoleArb,
  content: fc.string({ minLength: 1, maxLength: 500 }),
});

const validRequestArb: fc.Arbitrary<OpenRouterRequest> = fc.record({
  model: modelIdArb,
  messages: fc.array(messageArb, { minLength: 1, maxLength: 10 }),
  max_tokens: fc.option(fc.integer({ min: 1, max: 4096 }), { nil: undefined }),
  temperature: fc.option(fc.double({ min: 0, max: 2 }), { nil: undefined }),
  stream: fc.option(fc.boolean(), { nil: undefined }),
});

describe('OpenRouterClient Property Tests', () => {
  /**
   * Property 23: OpenRouter Request Structure
   * For any request to OpenRouter, the request payload SHALL include
   * the model identifier and message array with correct structure.
   * **Validates: Requirements 10.2**
   */
  describe('Property 23: OpenRouter Request Structure', () => {
    it('valid requests pass validation', () => {
      const client = new OpenRouterClient();

      fc.assert(
        fc.property(validRequestArb, (request: OpenRouterRequest) => {
          const validation = client.validateRequest(request);
          expect(validation.valid).toBe(true);
          expect(validation.errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('requests without model fail validation', () => {
      const client = new OpenRouterClient();

      fc.assert(
        fc.property(
          fc.array(messageArb, { minLength: 1, maxLength: 5 }),
          (messages) => {
            const request: OpenRouterRequest = {
              model: '',
              messages,
            };
            const validation = client.validateRequest(request);
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Model is required');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('requests without messages fail validation', () => {
      const client = new OpenRouterClient();

      fc.assert(
        fc.property(modelIdArb, (model: string) => {
          const request: OpenRouterRequest = {
            model,
            messages: [],
          };
          const validation = client.validateRequest(request);
          expect(validation.valid).toBe(false);
          expect(validation.errors).toContain('Messages array is required');
        }),
        { numRuns: 50 }
      );
    });

    it('messages with invalid roles fail validation', () => {
      const client = new OpenRouterClient();

      const invalidRoleArb = fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => !['user', 'assistant', 'system'].includes(s));

      fc.assert(
        fc.property(
          modelIdArb,
          invalidRoleArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          (model, invalidRole, content) => {
            const request = {
              model,
              messages: [{ role: invalidRole as 'user', content }],
            };
            const validation = client.validateRequest(request);
            expect(validation.valid).toBe(false);
            expect(validation.errors.some(e => e.includes('Invalid role'))).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('messages with empty content fail validation', () => {
      const client = new OpenRouterClient();

      fc.assert(
        fc.property(
          modelIdArb,
          messageRoleArb,
          (model, role) => {
            const request: OpenRouterRequest = {
              model,
              messages: [{ role, content: '' }],
            };
            const validation = client.validateRequest(request);
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Message content is required');
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * Property 24: Rate Limit Backoff
   * For any rate-limited response from OpenRouter, the client SHALL retry
   * with exponential backoff (doubling delay each attempt, starting at 1 second).
   * **Validates: Requirements 10.3**
   */
  describe('Property 24: Rate Limit Backoff', () => {
    it('backoff doubles with each attempt', () => {
      const baseDelay = 1000;
      const client = new OpenRouterClient({ retryBaseDelay: baseDelay });

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          (attempt: number) => {
            const expectedDelay = baseDelay * Math.pow(2, attempt);
            const actualDelay = (client as any).calculateBackoff(attempt);
            expect(actualDelay).toBe(expectedDelay);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('backoff sequence is exponential', () => {
      const baseDelay = 1000;
      const client = new OpenRouterClient({ retryBaseDelay: baseDelay });

      const delays: number[] = [];
      for (let i = 0; i < 5; i++) {
        delays.push((client as any).calculateBackoff(i));
      }

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    });

    it('custom base delay is respected', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 0, max: 3 }),
          (baseDelay: number, attempt: number) => {
            const client = new OpenRouterClient({ retryBaseDelay: baseDelay });
            const expectedDelay = baseDelay * Math.pow(2, attempt);
            const actualDelay = (client as any).calculateBackoff(attempt);
            expect(actualDelay).toBe(expectedDelay);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('retry attempts configuration is respected', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (retryAttempts: number) => {
            const client = new OpenRouterClient({ retryAttempts });
            expect((client as any).retryAttempts).toBe(retryAttempts);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
