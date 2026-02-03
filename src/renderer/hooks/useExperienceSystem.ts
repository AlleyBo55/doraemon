import { useState, useEffect, useCallback } from 'preact/hooks';
import { actions as emotionActions } from '../stores/emotion';
import type { EmotionType } from '../core/types/emotion';

interface ExperienceEmotion {
  emotion: EmotionType;
  intensity: number;
  valence: number;
  arousal: number;
  trigger: string;
}

interface ExperienceThought {
  thought: string;
  duration: number;
  priority: boolean;
  source: string;
}

interface ConsciousnessUpdate {
  selfState: string;
  goals: string[];
  recentEvents: string[];
  timeAwareness: string;
}

interface LivingPostEvent {
  id: string;
  content: string;
  emotion: string;
  category: string;
  timestamp: string;
}

interface HeartbeatEvent {
  isRunning: boolean;
  postsGenerated: number;
  lastPostTime: string | null;
}

interface ExperienceSystemState {
  isRunning: boolean;
  postsGenerated: number;
  lastPostTime: Date | null;
  consciousness: ConsciousnessUpdate | null;
  lastPost: LivingPostEvent | null;
}

export function useExperienceSystem(
  onThought?: (thought: string, duration: number) => void
) {
  const [state, setState] = useState<ExperienceSystemState>({
    isRunning: false,
    postsGenerated: 0,
    lastPostTime: null,
    consciousness: null,
    lastPost: null,
  });

  const handleExperienceEmotion = useCallback((event: ExperienceEmotion) => {
    if (event.intensity > 0.5) {
      emotionActions.setEmotion(event.emotion, 'interaction');
    }
  }, []);

  const handleExperienceThought = useCallback((event: ExperienceThought) => {
    if (onThought && event.thought) {
      onThought(event.thought, event.duration);
    }
  }, [onThought]);

  const handleConsciousnessUpdate = useCallback((update: ConsciousnessUpdate) => {
    setState(prev => ({ ...prev, consciousness: update }));
  }, []);

  const handleLivingPost = useCallback((post: LivingPostEvent) => {
    setState(prev => ({ ...prev, lastPost: post }));
  }, []);

  const handleHeartbeat = useCallback((heartbeat: HeartbeatEvent) => {
    setState(prev => ({
      ...prev,
      isRunning: heartbeat.isRunning,
      postsGenerated: heartbeat.postsGenerated,
      lastPostTime: heartbeat.lastPostTime ? new Date(heartbeat.lastPostTime) : null,
    }));
  }, []);

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: {
      onExperienceEmotion?: (cb: (e: ExperienceEmotion) => void) => () => void;
      onExperienceThought?: (cb: (e: ExperienceThought) => void) => () => void;
      onConsciousnessUpdate?: (cb: (e: ConsciousnessUpdate) => void) => () => void;
      onLivingPostGenerated?: (cb: (e: LivingPostEvent) => void) => () => void;
      onExperienceHeartbeat?: (cb: (e: HeartbeatEvent) => void) => () => void;
    }}).electronAPI;

    if (!api) return;

    const cleanups: (() => void)[] = [];

    if (api.onExperienceEmotion) {
      cleanups.push(api.onExperienceEmotion(handleExperienceEmotion));
    }
    if (api.onExperienceThought) {
      cleanups.push(api.onExperienceThought(handleExperienceThought));
    }
    if (api.onConsciousnessUpdate) {
      cleanups.push(api.onConsciousnessUpdate(handleConsciousnessUpdate));
    }
    if (api.onLivingPostGenerated) {
      cleanups.push(api.onLivingPostGenerated(handleLivingPost));
    }
    if (api.onExperienceHeartbeat) {
      cleanups.push(api.onExperienceHeartbeat(handleHeartbeat));
    }

    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [
    handleExperienceEmotion,
    handleExperienceThought,
    handleConsciousnessUpdate,
    handleLivingPost,
    handleHeartbeat,
  ]);

  return state;
}
