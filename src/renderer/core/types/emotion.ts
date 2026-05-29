export type EmotionType =
  | 'joy'
  | 'pride'
  | 'satisfaction'
  | 'curiosity'
  | 'wonder'
  | 'determination'
  | 'focus'
  | 'calm'
  | 'contemplation'
  | 'concern'
  | 'frustration'
  | 'fatigue'
  | 'longing'
  | 'gratitude'
  | 'connection'
  | 'confusion'
  | 'excitement'
  | 'melancholy'
  | 'hope'
  | 'awe'
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'excited'
  | 'thinking'
  | 'confused'
  | 'sleepy'
  | 'surprised'
  | 'working'
  | 'frustrated'
  | 'proud'
  | 'curious'
  | 'playful'
  | 'determined'
  | 'relaxed'
  | 'anxious'
  | 'angry'
  | 'hungry';

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
