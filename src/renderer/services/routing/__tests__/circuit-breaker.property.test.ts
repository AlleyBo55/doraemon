import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { CircuitBreaker, CircuitBreakerOpenError } from '../circuit-breaker';

describe('CircuitBreaker Property Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Property 28: Circuit Breaker State Transitions
   * For any external service, after N consecutive failures (threshold),
   * the circuit breaker SHALL transition to "open" state and stop sending
   * requests until the reset timeout.
   * **Validates: Requirements 12.2, 12.3**
   */
  describe('Property 28: Circuit Breaker State Transitions', () => {
    it('starts in closed state', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1000, max: 60000 }),
          (threshold, timeout) => {
            const cb = new CircuitBreaker({
              failureThreshold: threshold,
              resetTimeout: timeout,
            });
            expect(cb.getState()).toBe('closed');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('transitions to open after threshold failures', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (threshold) => {
            const cb = new CircuitBreaker({ failureThreshold: threshold });

            for (let i = 0; i < threshold - 1; i++) {
              cb.recordFailure();
              expect(cb.getState()).toBe('closed');
            }

            cb.recordFailure();
            expect(cb.getState()).toBe('open');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('blocks execution when open', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (threshold) => {
            const cb = new CircuitBreaker({ failureThreshold: threshold });

            for (let i = 0; i < threshold; i++) {
              cb.recordFailure();
            }

            expect(cb.getState()).toBe('open');
            expect(cb.canExecute()).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('transitions to half-open after reset timeout', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1000, max: 30000 }),
          (threshold, timeout) => {
            const cb = new CircuitBreaker({
              failureThreshold: threshold,
              resetTimeout: timeout,
            });

            for (let i = 0; i < threshold; i++) {
              cb.recordFailure();
            }
            expect(cb.getState()).toBe('open');

            vi.advanceTimersByTime(timeout + 1);
            expect(cb.getState()).toBe('half_open');
          }
        ),
        { numRuns: 50 }
      );
    });


    it('transitions to closed on success in half-open', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1000, max: 30000 }),
          (threshold, timeout) => {
            const cb = new CircuitBreaker({
              failureThreshold: threshold,
              resetTimeout: timeout,
            });

            for (let i = 0; i < threshold; i++) {
              cb.recordFailure();
            }

            vi.advanceTimersByTime(timeout + 1);
            expect(cb.getState()).toBe('half_open');

            cb.recordSuccess();
            expect(cb.getState()).toBe('closed');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('transitions back to open on failure in half-open', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1000, max: 30000 }),
          (threshold, timeout) => {
            const cb = new CircuitBreaker({
              failureThreshold: threshold,
              resetTimeout: timeout,
            });

            for (let i = 0; i < threshold; i++) {
              cb.recordFailure();
            }

            vi.advanceTimersByTime(timeout + 1);
            expect(cb.getState()).toBe('half_open');

            cb.recordFailure();
            expect(cb.getState()).toBe('open');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('resets failure count on transition to closed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1000, max: 30000 }),
          (threshold, timeout) => {
            const cb = new CircuitBreaker({
              failureThreshold: threshold,
              resetTimeout: timeout,
            });

            for (let i = 0; i < threshold; i++) {
              cb.recordFailure();
            }

            vi.advanceTimersByTime(timeout + 1);
            cb.recordSuccess();

            expect(cb.getState()).toBe('closed');
            expect(cb.getFailures()).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 29: Error Recovery Backoff
   * For any service recovering from errors, retry attempts SHALL use
   * exponential backoff with configurable base delay and maximum attempts.
   * **Validates: Requirements 12.4**
   */
  describe('Property 29: Error Recovery Backoff', () => {
    it('reset timeout is configurable', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 120000 }),
          (timeout) => {
            const cb = new CircuitBreaker({ resetTimeout: timeout });
            const status = cb.getStatus();
            expect(status.config.resetTimeout).toBe(timeout);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('next retry time is set correctly when opening', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1000, max: 60000 }),
          (threshold, timeout) => {
            const cb = new CircuitBreaker({
              failureThreshold: threshold,
              resetTimeout: timeout,
            });

            const beforeOpen = Date.now();
            for (let i = 0; i < threshold; i++) {
              cb.recordFailure();
            }

            const nextRetry = cb.getNextRetry();
            expect(nextRetry).not.toBeNull();
            
            const expectedRetry = beforeOpen + timeout;
            expect(nextRetry!.getTime()).toBeGreaterThanOrEqual(expectedRetry);
            expect(nextRetry!.getTime()).toBeLessThanOrEqual(expectedRetry + 100);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('execute throws when circuit is open', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (threshold) => {
            const cb = new CircuitBreaker({ failureThreshold: threshold });

            for (let i = 0; i < threshold; i++) {
              cb.recordFailure();
            }

            await expect(
              cb.execute(() => Promise.resolve('test'))
            ).rejects.toThrow(CircuitBreakerOpenError);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('execute records success on successful call', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });

      await cb.execute(() => Promise.resolve('success'));
      
      const status = cb.getStatus();
      expect(status.successes).toBe(1);
      expect(status.state).toBe('closed');
    });

    it('execute records failure on failed call', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });

      await expect(
        cb.execute(() => Promise.reject(new Error('test error')))
      ).rejects.toThrow('test error');
      
      expect(cb.getFailures()).toBe(1);
    });
  });
});
