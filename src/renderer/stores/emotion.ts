import { signal, computed } from '@preact/signals';
import type { EmotionType, EmotionState } from '../core/types/emotion';
import * as emotionService from '../services/emotion';

const emotionState = signal<EmotionState>(
  emotionService.createState('neutral', 'idle')
);

export const state = {
  emotion: computed(() => emotionState.value),
  current: computed(() => emotionState.value.current),
  previous: computed(() => emotionState.value.previous),
  metadata: computed(() =>
    emotionService.getMetadata(emotionState.value.current)
  ),
};

export const actions = {
  setEmotion: (type: EmotionType, trigger: EmotionState['trigger']) => {
    if (emotionService.shouldTransition(emotionState.value, type)) {
      emotionState.value = emotionService.transition(
        emotionState.value,
        type,
        trigger
      );
    }
  },

  updateFromIdle: (idleMs: number) => {
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
  },
};
