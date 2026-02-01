import { useCallback } from 'preact/hooks';
import { emotionStore } from '../stores';
import type { EmotionType, EmotionState } from '../core/types/emotion';

export const useEmotion = () => {
  const { current, previous, metadata } = emotionStore.state;

  const setEmotion = useCallback(
    (type: EmotionType, trigger: EmotionState['trigger'] = 'user') => {
      emotionStore.actions.setEmotion(type, trigger);
    },
    []
  );

  const reset = useCallback(() => {
    emotionStore.actions.reset();
  }, []);

  return {
    current: current.value,
    previous: previous.value,
    metadata: metadata.value,
    setEmotion,
    reset,
  };
};
