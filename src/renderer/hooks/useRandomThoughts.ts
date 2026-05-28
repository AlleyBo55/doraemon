import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import thoughts from '../core/constants/thoughts.json';
import codingThoughts from '../core/constants/coding-thoughts.json';
import { DORAEMON_SOUL, getRandomGadget } from '../core/constants/soul';
import { animationStore } from '../stores';
import type { EmotionType } from '../core/types/emotion';

type ThoughtCategory = keyof typeof thoughts;
type CodingThoughtCategory = keyof typeof codingThoughts;

const THOUGHT_INTERVAL = 10000;
const THOUGHT_DISPLAY_DURATION = 6500;
const THOUGHTS_PER_CYCLE = 10;
const COOLDOWN_CYCLES = 3;
const CODING_MODE_COOLDOWN = 10000; // 10s delay after coding ends before random thoughts resume

const emotionToCategory: Partial<Record<EmotionType, ThoughtCategory>> = {
  joy: 'happy',
  pride: 'happy',
  satisfaction: 'idle',
  curiosity: 'curious',
  wonder: 'curious',
  determination: 'determined',
  focus: 'working',
  calm: 'idle',
  contemplation: 'thinking',
  concern: 'anxious',
  frustration: 'anxious',
  fatigue: 'sleepy',
  longing: 'nostalgic',
  gratitude: 'grateful',
  connection: 'greeting',
  confusion: 'thinking',
  excitement: 'excited',
  melancholy: 'sad',
  hope: 'determined',
  awe: 'excited',
  angry: 'anxious',
  hungry: 'hungry',
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

const emotionToAnimation: Partial<Record<EmotionType, string>> = {
  joy: 'emotion_joy',
  pride: 'emotion_pride',
  satisfaction: 'emotion_satisfaction',
  curiosity: 'emotion_curiosity',
  wonder: 'emotion_wonder',
  determination: 'emotion_determination',
  focus: 'emotion_focus',
  calm: 'emotion_calm',
  contemplation: 'emotion_contemplation',
  concern: 'emotion_concern',
  frustration: 'emotion_frustration',
  fatigue: 'emotion_fatigue',
  longing: 'emotion_longing',
  gratitude: 'emotion_gratitude',
  connection: 'emotion_connection',
  confusion: 'emotion_confusion',
  excitement: 'emotion_excitement',
  melancholy: 'emotion_melancholy',
  hope: 'emotion_hope',
  awe: 'emotion_awe',
  angry: 'action_angry',
  hungry: 'action_hungry',
  happy: 'emotion_joy',
  sad: 'emotion_melancholy',
  excited: 'emotion_excitement',
  thinking: 'emotion_contemplation',
  confused: 'emotion_confusion',
  sleepy: 'emotion_fatigue',
  surprised: 'emotion_wonder',
  working: 'emotion_focus',
  frustrated: 'emotion_frustration',
  proud: 'emotion_pride',
  curious: 'emotion_curiosity',
  playful: 'action_random_thought',
  determined: 'emotion_determination',
  relaxed: 'emotion_satisfaction',
  anxious: 'emotion_concern',
  neutral: 'emotion_calm',
};

const categoryToAnimation: Partial<Record<ThoughtCategory, string>> = {
  idle: 'action_random_thought',
  happy: 'emotion_joy',
  sad: 'emotion_melancholy',
  thinking: 'emotion_contemplation',
  excited: 'emotion_excitement',
  sleepy: 'emotion_fatigue',
  curious: 'action_gadget_search',
  working: 'emotion_focus',
  playful: 'action_random_thought',
  greeting: 'action_greeting',
  nostalgic: 'emotion_longing',
  hungry: 'action_hungry',
  protective: 'action_protect',
  philosophical: 'emotion_contemplation',
  mischievous: 'action_gadget_surprise',
  determined: 'emotion_determination',
  grateful: 'emotion_gratitude',
  anxious: 'emotion_concern',
};

const resolveCategoryAnimation = (category: ThoughtCategory, emotion: EmotionType): string => {
  if (category === 'hungry') return Math.random() > 0.45 ? 'action_hungry' : 'action_eating';
  if (category === 'sleepy') return Math.random() > 0.5 ? 'action_nap' : 'action_rest';
  if (category === 'curious') return Math.random() > 0.55 ? 'action_gadget_search' : 'action_explain_gadget';
  if (category === 'determined') return Math.random() > 0.55 ? 'emotion_determination' : 'action_walk';
  return categoryToAnimation[category] || emotionToAnimation[emotion] || 'action_random_thought';
};

const codingCategoryToAnimation: Partial<Record<CodingThoughtCategory, string>> = {
  general: 'action_coding_typing',
  debugging: 'action_coding_thinking',
  thinking: 'action_coding_thinking',
  progress: 'action_coding_typing',
  motivation: 'emotion_determination',
  humor: 'action_random_thought',
  languages: 'action_coding_thinking',
  tools: 'action_gadget_use',
};

interface ThoughtHistory {
  thought: string;
  cycleUsed: number;
}

export const useRandomThoughts = (currentEmotion: EmotionType, isConnected: boolean, isPaused = false, isCodingMode = false) => {
  const [thought, setThought] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const currentCycleRef = useRef<number>(0);
  const thoughtsInCycleRef = useRef<number>(0);
  const historyRef = useRef<ThoughtHistory[]>([]);
  const codingHistoryRef = useRef<ThoughtHistory[]>([]);
  const codingEndedAtRef = useRef<number | null>(null);
  const lastThoughtCategoryRef = useRef<ThoughtCategory>('idle');
  const lastThoughtAnimationRef = useRef<string | null>(null);
  
  // Use refs to avoid stale closures in setTimeout
  const isPausedRef = useRef(isPaused);
  const isConnectedRef = useRef(isConnected);
  const emotionRef = useRef(currentEmotion);
  const isCodingModeRef = useRef(isCodingMode);
  
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { emotionRef.current = currentEmotion; }, [currentEmotion]);
  useEffect(() => { 
    const wasCoding = isCodingModeRef.current;
    isCodingModeRef.current = isCodingMode;
    
    // Track when coding mode ends for cooldown
    if (wasCoding && !isCodingMode) {
      codingEndedAtRef.current = Date.now();
    } else if (isCodingMode) {
      codingEndedAtRef.current = null;
    }
  }, [isCodingMode]);

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

  const isCodingThoughtAvailable = useCallback((text: string): boolean => {
    const currentCycle = currentCycleRef.current;
    const entry = codingHistoryRef.current.find(h => h.thought === text);
    if (!entry) return true;
    return (currentCycle - entry.cycleUsed) >= COOLDOWN_CYCLES;
  }, []);

  const recordCodingThought = useCallback((text: string) => {
    const currentCycle = currentCycleRef.current;
    const existingIdx = codingHistoryRef.current.findIndex(h => h.thought === text);
    
    if (existingIdx >= 0) {
      codingHistoryRef.current[existingIdx].cycleUsed = currentCycle;
    } else {
      codingHistoryRef.current.push({ thought: text, cycleUsed: currentCycle });
    }

    if (codingHistoryRef.current.length > 200) {
      codingHistoryRef.current = codingHistoryRef.current.slice(-150);
    }
  }, []);

  const getRandomCodingThought = useCallback((): { text: string; animation: string } => {
    const categories: CodingThoughtCategory[] = ['general', 'debugging', 'thinking', 'progress', 'motivation', 'humor', 'languages', 'tools'];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const categoryThoughts = codingThoughts[category] || codingThoughts.general;
    
    const availableThoughts = categoryThoughts.filter(t => isCodingThoughtAvailable(t));
    
    if (availableThoughts.length > 0) {
      return {
        text: availableThoughts[Math.floor(Math.random() * availableThoughts.length)],
        animation: codingCategoryToAnimation[category] || 'action_coding_typing',
      };
    }
    return {
      text: categoryThoughts[Math.floor(Math.random() * categoryThoughts.length)],
      animation: codingCategoryToAnimation[category] || 'action_coding_typing',
    };
  }, [isCodingThoughtAvailable]);

  const getSoulEnhancedThought = useCallback((baseThought: string): string => {
    if (Math.random() < 0.1) {
      const gadget = getRandomGadget();
      lastThoughtAnimationRef.current =
        gadget.name === 'Take-copter'
          ? 'action_take_copter'
          : gadget.name === 'Time Machine'
            ? 'action_time_travel'
            : gadget.name === 'Anywhere Door'
              ? 'action_gadget_use'
              : 'action_explain_gadget';
      const gadgetThoughts = [
        `${gadget.emoji} Maybe I should use my ${gadget.name}~`,
        `The ${gadget.name} (${gadget.japanese}) could help here~`,
        `*checks 4D pocket* Ah, the ${gadget.name}!`,
      ];
      return gadgetThoughts[Math.floor(Math.random() * gadgetThoughts.length)];
    }

    if (Math.random() < 0.08) {
      lastThoughtAnimationRef.current = 'action_random_thought';
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
    lastThoughtAnimationRef.current = null;
    
    let category: ThoughtCategory;
    if (Math.random() < 0.15) {
      category = specialCategories[Math.floor(Math.random() * specialCategories.length)];
    } else {
      category = emotionToCategory[emotion] || 'idle';
    }
    lastThoughtCategoryRef.current = category;
    
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

  const showThought = useCallback((text: string, duration = THOUGHT_DISPLAY_DURATION, isCoding = false, animation?: string) => {
    setThought(text);
    if (animation) {
      animationStore.actions.trigger(animation, duration);
    }
    if (isCoding) {
      recordCodingThought(text);
    } else {
      recordThought(text);
    }
    
    if (displayTimeoutRef.current) clearTimeout(displayTimeoutRef.current);
    displayTimeoutRef.current = setTimeout(() => {
      setThought(null);
    }, duration);
  }, [recordThought, recordCodingThought]);

  const triggerRandomThought = useCallback(() => {
    // Check if we're in coding mode cooldown (10s after coding ends)
    const inCodingCooldown = codingEndedAtRef.current !== null && 
      (Date.now() - codingEndedAtRef.current) < CODING_MODE_COOLDOWN;
    
    // Show thoughts when not paused
    if (!isPausedRef.current) {
      if (isCodingModeRef.current) {
        // In coding mode - use coding thoughts
        const codingThought = getRandomCodingThought();
        showThought(codingThought.text, THOUGHT_DISPLAY_DURATION, true, codingThought.animation);
      } else if (!inCodingCooldown) {
        // Not in coding mode and cooldown passed - use regular thoughts
        const emotion = emotionRef.current;
        const randomThought = getRandomThought(emotion);
        const animation = lastThoughtAnimationRef.current || resolveCategoryAnimation(lastThoughtCategoryRef.current, emotion);
        showThought(randomThought, THOUGHT_DISPLAY_DURATION, false, animation);
        
        thoughtsInCycleRef.current++;
        if (thoughtsInCycleRef.current >= THOUGHTS_PER_CYCLE) {
          thoughtsInCycleRef.current = 0;
          currentCycleRef.current++;
        }
      }
      // If in cooldown, skip this cycle (no thought shown)
    }
    
    timeoutRef.current = setTimeout(triggerRandomThought, THOUGHT_INTERVAL);
  }, [getRandomThought, getRandomCodingThought, showThought]);

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
        const emotion = emotionRef.current;
        const newThought = getRandomThought(emotion);
        const animation = lastThoughtAnimationRef.current || resolveCategoryAnimation(lastThoughtCategoryRef.current, emotion);
        showThought(newThought, THOUGHT_DISPLAY_DURATION, false, animation);
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
