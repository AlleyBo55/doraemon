export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'excited'
  | 'thinking'
  | 'confused'
  | 'sleepy'
  | 'surprised';

export type EmotionState = {
  current: EmotionType;
  previous: EmotionType | null;
  trigger: 'user' | 'ai' | 'idle' | 'interaction';
  timestamp: number;
};

export type EmotionMetadata = {
  intensity: number;
  duration: number | null;
  color: string;
};
