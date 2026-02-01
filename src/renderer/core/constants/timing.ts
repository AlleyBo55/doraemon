export const TIMING = {
  FAST: 120,
  NORMAL: 240,
  SLOW: 400,
  SPRING: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  EASE: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const IDLE_THRESHOLDS = {
  RELAXED: 60_000,
  BORED: 180_000,
  SLEEPY: 300_000,
  SLEEPING: 600_000,
} as const;
