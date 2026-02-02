import type { CircuitBreakerState } from './types';
import { CIRCUIT_BREAKER_CONFIG } from './constants';

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenRequests?: number;
  monitorWindow?: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure: Date | null = null;
  private nextRetry: Date | null = null;
  private halfOpenAttempts: number = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenRequests: number;
  private readonly monitorWindow: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold || CIRCUIT_BREAKER_CONFIG.failureThreshold;
    this.resetTimeout = config.resetTimeout || CIRCUIT_BREAKER_CONFIG.resetTimeout;
    this.halfOpenRequests = config.halfOpenRequests || CIRCUIT_BREAKER_CONFIG.halfOpenRequests;
    this.monitorWindow = config.monitorWindow || CIRCUIT_BREAKER_CONFIG.monitorWindow;
  }

  getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  getNextRetry(): Date | null {
    return this.nextRetry;
  }

  canExecute(): boolean {
    this.checkStateTransition();

    switch (this.state) {
      case 'closed':
        return true;
      case 'open':
        return false;
      case 'half_open':
        return this.halfOpenAttempts < this.halfOpenRequests;
    }
  }

  recordSuccess(): void {
    this.checkStateTransition();

    switch (this.state) {
      case 'closed':
        this.successes++;
        break;
      case 'half_open':
        this.successes++;
        this.transitionToClosed();
        break;
      case 'open':
        break;
    }
  }


  recordFailure(): void {
    this.checkStateTransition();
    this.failures++;
    this.lastFailure = new Date();

    switch (this.state) {
      case 'closed':
        if (this.failures >= this.failureThreshold) {
          this.transitionToOpen();
        }
        break;
      case 'half_open':
        this.transitionToOpen();
        break;
      case 'open':
        break;
    }
  }

  private checkStateTransition(): void {
    if (this.state === 'open' && this.nextRetry) {
      if (new Date() >= this.nextRetry) {
        this.transitionToHalfOpen();
      }
    }
  }

  private transitionToOpen(): void {
    this.state = 'open';
    this.nextRetry = new Date(Date.now() + this.resetTimeout);
    this.halfOpenAttempts = 0;
  }

  private transitionToHalfOpen(): void {
    this.state = 'half_open';
    this.halfOpenAttempts = 0;
    this.nextRetry = null;
  }

  private transitionToClosed(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.nextRetry = null;
    this.halfOpenAttempts = 0;
  }

  reset(): void {
    this.transitionToClosed();
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError(
        'Circuit breaker is open',
        this.nextRetry
      );
    }

    if (this.state === 'half_open') {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      nextRetry: this.nextRetry,
      config: {
        failureThreshold: this.failureThreshold,
        resetTimeout: this.resetTimeout,
        halfOpenRequests: this.halfOpenRequests,
      },
    };
  }
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  nextRetry: Date | null;
  config: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenRequests: number;
  };
}

export class CircuitBreakerOpenError extends Error {
  constructor(
    message: string,
    public nextRetry: Date | null
  ) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
