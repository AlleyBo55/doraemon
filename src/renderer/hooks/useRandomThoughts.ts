import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import thoughts from '../core/constants/thoughts.json';
import { DORAEMON_SOUL, getRandomGadget } from '../core/constants/soul';
import type { EmotionType } from '../core/types/emotion';

type ThoughtCategory = keyof typeof thoughts;

const THOUGHT_INTERVAL = 10000;
const THOUGHT_DISPLAY_DURATION = 6500;
const THOUGHTS_PER_CYCLE = 10;
const COOLDOWN_CYCLES = 3;

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
  frustrated: 'anxious',
  proud: 'happy',
  determined: 'determined',
  anxious: 'anxious',
};

interface ThoughtHistory {
  thought: string;
  cycleUsed: number;
}

export const useRandomThoughts = (currentEmotion: EmotionType, isConnected: boolean, isPaused = false) => {
  const [thought, setThought] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const currentCycleRef = useRef<number>(0);
  const thoughtsInCycleRef = useRef<number>(0);
  const historyRef = useRef<ThoughtHistory[]>([]);
  
  // Use refs to avoid stale closures in setTimeout
  const isPausedRef = useRef(isPaused);
  const isConnectedRef = useRef(isConnected);
  const emotionRef = useRef(currentEmotion);
  
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { emotionRef.current = currentEmotion; }, [currentEmotion]);

  const isThoughtAvailable = useCallback((text: string): boolean => {
    const currentCycle = currentCycleRef.current;
    const entry = historyRef.current.find(h => h.thought === text);
    
    if (!entry) return true;
    
    return (currentCycle - entry.cycleUsed) >= COOLDOWN_CYCLES;
  }, []);

  const recordThought = useCallback((text: string) => {
    const currentCycle = currentCycleRef.current;
    const existingIdx = historyRef.current.findIndex(h => h.thought === text);
    
    if (existingIdx >= 0) {
      historyRef.current[existingIdx].cycleUsed = currentCycle;
    } else {
      historyRef.current.push({ thought: text, cycleUsed: currentCycle });
    }

    if (historyRef.current.length > 200) {
      historyRef.current = historyRef.current.slice(-150);
    }
  }, []);

  const getSoulEnhancedThought = useCallback((baseThought: string): string => {
    if (Math.random() < 0.1) {
      const gadget = getRandomGadget();
      const gadgetThoughts = [
        `${gadget.emoji} Maybe I should use my ${gadget.name}~`,
        `The ${gadget.name} (${gadget.japanese}) could help here~`,
        `*checks 4D pocket* Ah, the ${gadget.name}!`,
      ];
      return gadgetThoughts[Math.floor(Math.random() * gadgetThoughts.length)];
    }

    if (Math.random() < 0.08) {
      const soulThoughts = [
        `${DORAEMON_SOUL.relationships.bestFriend} would like this~`,
        `I wonder what ${DORAEMON_SOUL.relationships.sister} is doing...`,
        `Being ${DORAEMON_SOUL.physical.height} tall has its perks~`,
        `${DORAEMON_SOUL.values[Math.floor(Math.random() * DORAEMON_SOUL.values.length)]}...`,
        `My ${DORAEMON_SOUL.personality.loves[Math.floor(Math.random() * DORAEMON_SOUL.personality.loves.length)]}~`,
      ];
      return soulThoughts[Math.floor(Math.random() * soulThoughts.length)];
    }

    return baseThought;
  }, []);

  const getRandomThought = useCallback((emotion: EmotionType): string => {
    const specialCategories: ThoughtCategory[] = ['nostalgic', 'hungry', 'protective', 'philosophical', 'mischievous', 'grateful'];
    
    let category: ThoughtCategory;
    if (Math.random() < 0.15) {
      category = specialCategories[Math.floor(Math.random() * specialCategories.length)];
    } else {
      category = emotionToCategory[emotion] || 'idle';
    }
    
    const categoryThoughts = thoughts[category] || thoughts.idle;
    
    const availableThoughts = categoryThoughts.filter(t => isThoughtAvailable(t));
    
    let selectedThought: string;
    if (availableThoughts.length > 0) {
      selectedThought = availableThoughts[Math.floor(Math.random() * availableThoughts.length)];
    } else {
      selectedThought = categoryThoughts[Math.floor(Math.random() * categoryThoughts.length)];
    }
    
    return getSoulEnhancedThought(selectedThought);
  }, [isThoughtAvailable, getSoulEnhancedThought]);

  const showThought = useCallback((text: string, duration = THOUGHT_DISPLAY_DURATION) => {
    setThought(text);
    recordThought(text);
    
    if (displayTimeoutRef.current) clearTimeout(displayTimeoutRef.current);
    displayTimeoutRef.current = setTimeout(() => {
      setThought(null);
    }, duration);
  }, [recordThought]);

  const triggerRandomThought = useCallback(() => {
    // Show random thoughts when not paused (regardless of connection status)
    // The display priority in app.tsx handles which message to show
    if (!isPausedRef.current) {
      const randomThought = getRandomThought(emotionRef.current);
      showThought(randomThought);
      
      thoughtsInCycleRef.current++;
      if (thoughtsInCycleRef.current >= THOUGHTS_PER_CYCLE) {
        thoughtsInCycleRef.current = 0;
        currentCycleRef.current++;
      }
    }
    
    timeoutRef.current = setTimeout(triggerRandomThought, THOUGHT_INTERVAL);
  }, [getRandomThought, showThought]);

  useEffect(() => {
    const initialDelay = 1000 + Math.random() * 2000;
    timeoutRef.current = setTimeout(triggerRandomThought, initialDelay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (displayTimeoutRef.current) clearTimeout(displayTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(triggerRandomThought, THOUGHT_INTERVAL);
  }, [currentEmotion]);

  // Clear random thought when paused (external notification showing)
  // Resume with a new thought when unpaused
  const wasPausedRef = useRef(isPaused);
  useEffect(() => {
    if (isPaused) {
      setThought(null);
      if (displayTimeoutRef.current) {
        clearTimeout(displayTimeoutRef.current);
        displayTimeoutRef.current = null;
      }
    } else if (wasPausedRef.current && !isPaused) {
      // Was paused, now unpaused - trigger a new thought after short delay
      setTimeout(() => {
        const newThought = getRandomThought(emotionRef.current);
        showThought(newThought);
      }, 2000);
    }
    wasPausedRef.current = isPaused;
  }, [isPaused, getRandomThought, showThought]);

  return {
    thought,
    showThought,
    getRandomThought,
    currentCycle: currentCycleRef.current,
  };
};
