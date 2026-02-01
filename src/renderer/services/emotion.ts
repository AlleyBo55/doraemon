import type { EmotionType, EmotionState, EmotionMetadata } from '../core/types/emotion';
import { IDLE_THRESHOLDS } from '../core/constants/timing';

const EMOTION_METADATA: Record<EmotionType, EmotionMetadata> = {
  neutral: { intensity: 0.5, duration: null, color: '#94a3b8' },
  happy: { intensity: 0.8, duration: 5000, color: '#fbbf24' },
  sad: { intensity: 0.6, duration: 8000, color: '#60a5fa' },
  excited: { intensity: 1.0, duration: 3000, color: '#f472b6' },
  thinking: { intensity: 0.7, duration: null, color: '#a78bfa' },
  confused: { intensity: 0.6, duration: 4000, color: '#fb923c' },
  sleepy: { intensity: 0.3, duration: null, color: '#6b7280' },
  surprised: { intensity: 0.9, duration: 2000, color: '#34d399' },
  working: { intensity: 0.8, duration: null, color: '#3b82f6' },
  frustrated: { intensity: 0.7, duration: 4000, color: '#ef4444' },
  proud: { intensity: 0.9, duration: 5000, color: '#eab308' },
  curious: { intensity: 0.6, duration: 3000, color: '#8b5cf6' },
  playful: { intensity: 0.8, duration: 4000, color: '#ec4899' },
  determined: { intensity: 0.9, duration: null, color: '#f97316' },
  relaxed: { intensity: 0.4, duration: null, color: '#22c55e' },
  anxious: { intensity: 0.7, duration: 5000, color: '#f59e0b' },
};

export const getMetadata = (emotion: EmotionType): EmotionMetadata =>
  EMOTION_METADATA[emotion];

export const createState = (
  type: EmotionType,
  trigger: EmotionState['trigger'] = 'idle'
): EmotionState => ({
  current: type,
  previous: null,
  trigger,
  timestamp: Date.now(),
});

export const transition = (
  state: EmotionState,
  next: EmotionType,
  trigger: EmotionState['trigger']
): EmotionState => ({
  current: next,
  previous: state.current,
  trigger,
  timestamp: Date.now(),
});

export const computeIdleEmotion = (idleMs: number): EmotionType => {
  if (idleMs >= IDLE_THRESHOLDS.SLEEPING) return 'sleepy';
  if (idleMs >= IDLE_THRESHOLDS.SLEEPY) return 'relaxed';
  if (idleMs >= IDLE_THRESHOLDS.BORED) return 'curious';
  return 'neutral';
};

export const shouldTransition = (
  current: EmotionState,
  next: EmotionType
): boolean => {
  if (current.current === next) return false;

  const metadata = getMetadata(current.current);
  if (metadata.duration === null) return true;

  const elapsed = Date.now() - current.timestamp;
  return elapsed >= metadata.duration;
};
