import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import thoughts from '../core/constants/thoughts.json';
import type { EmotionType } from '../core/types/emotion';

type ThoughtCategory = keyof typeof thoughts;

const THOUGHT_INTERVAL_MIN = 15000;
const THOUGHT_INTERVAL_MAX = 45000;
const THOUGHT_DISPLAY_DURATION = 4000;

const emotionToCategory: Partial<Record<EmotionType, ThoughtCategory>> = {
  happy: 'happy',
  sad: 'sad',
  thinking: 'thinking',
  excited: 'excited',
  sleepy: 'sleepy',
  curious: 'curious',
  working: 'working',
  playful: 'playful',
  neutral: 'idle',
  relaxed: 'idle',
  confused: 'thinking',
  surprised: 'excited',
  frustrated: 'thinking',
  proud: 'happy',
  determined: 'working',
  anxious: 'thinking',
};

export const useRandomThoughts = (currentEmotion: EmotionType, isConnected: boolean) => {
  const [thought, setThought] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getRandomThought = useCallback((emotion: EmotionType): string => {
    const category = emotionToCategory[emotion] || 'idle';
    const categoryThoughts = thoughts[category] || thoughts.idle;
    return categoryThoughts[Math.floor(Math.random() * categoryThoughts.length)];
  }, []);

  const showThought = useCallback((text: string, duration = THOUGHT_DISPLAY_DURATION) => {
    setThought(text);
    
    if (displayTimeoutRef.current) clearTimeout(displayTimeoutRef.current);
    displayTimeoutRef.current = setTimeout(() => {
      setThought(null);
    }, duration);
  }, []);

  const triggerRandomThought = useCallback(() => {
    if (!isConnected) {
      const randomThought = getRandomThought(currentEmotion);
      showThought(randomThought);
    }
    
    const nextInterval = THOUGHT_INTERVAL_MIN + Math.random() * (THOUGHT_INTERVAL_MAX - THOUGHT_INTERVAL_MIN);
    timeoutRef.current = setTimeout(triggerRandomThought, nextInterval);
  }, [currentEmotion, isConnected, getRandomThought, showThought]);

  useEffect(() => {
    const initialDelay = 5000 + Math.random() * 10000;
    timeoutRef.current = setTimeout(triggerRandomThought, initialDelay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (displayTimeoutRef.current) clearTimeout(displayTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const nextInterval = THOUGHT_INTERVAL_MIN + Math.random() * (THOUGHT_INTERVAL_MAX - THOUGHT_INTERVAL_MIN);
    timeoutRef.current = setTimeout(triggerRandomThought, nextInterval);
  }, [currentEmotion]);

  return {
    thought,
    showThought,
    getRandomThought,
  };
};
