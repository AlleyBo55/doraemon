import { signal, computed } from '@preact/signals';
import type { EmotionType, EmotionState } from '../core/types/emotion';
import * as emotionService from '../services/emotion';

const EMOTION_PROTECTION_DURATION = 15000;

const emotionState = signal<EmotionState>(
  emotionService.createState('neutral', 'idle')
);

const protectedUntil = signal<number>(0);

export const state = {
  emotion: computed(() => emotionState.value),
  current: computed(() => emotionState.value.current),
  previous: computed(() => emotionState.value.previous),
  metadata: computed(() =>
    emotionService.getMetadata(emotionState.value.current)
  ),
  isProtected: computed(() => Date.now() < protectedUntil.value),
};

export const actions = {
  setEmotion: (type: EmotionType, trigger: EmotionState['trigger']) => {
    // If emotion is protected, only allow same trigger type to override
    const isProtected = Date.now() < protectedUntil.value;
    if (isProtected && trigger !== 'interaction' && trigger !== 'ai') {
      return;
    }
    
    if (emotionService.shouldTransition(emotionState.value, type)) {
      emotionState.value = emotionService.transition(
        emotionState.value,
        type,
        trigger
      );
    }
  },

  setEmotionProtected: (type: EmotionType, trigger: EmotionState['trigger'], duration = EMOTION_PROTECTION_DURATION) => {
    if (emotionService.shouldTransition(emotionState.value, type)) {
      emotionState.value = emotionService.transition(
        emotionState.value,
        type,
        trigger
      );
      protectedUntil.value = Date.now() + duration;
    }
  },

  updateFromIdle: (idleMs: number) => {
    // Don't update from idle if emotion is protected
    if (Date.now() < protectedUntil.value) {
      return;
    }
    
    const nextEmotion = emotionService.computeIdleEmotion(idleMs);
    if (emotionService.shouldTransition(emotionState.value, nextEmotion)) {
      emotionState.value = emotionService.transition(
        emotionState.value,
        nextEmotion,
        'idle'
      );
    }
  },

  reset: () => {
    emotionState.value = emotionService.createState('neutral', 'idle');
    protectedUntil.value = 0;
  },

  clearProtection: () => {
    protectedUntil.value = 0;
  },
};
