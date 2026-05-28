import type { FunctionalComponent } from 'preact';
import type { EmotionType } from '../../../core/types/emotion';

type EmotionIndicatorProps = {
  emotion: EmotionType;
  className?: string;
};

const EMOTION_COLORS: Partial<Record<EmotionType, string>> = {
  joy: 'bg-amber-400',
  pride: 'bg-yellow-500',
  satisfaction: 'bg-green-500',
  curiosity: 'bg-violet-500',
  wonder: 'bg-emerald-400',
  determination: 'bg-orange-500',
  focus: 'bg-blue-500',
  calm: 'bg-teal-400',
  contemplation: 'bg-purple-400',
  concern: 'bg-amber-500',
  frustration: 'bg-red-500',
  fatigue: 'bg-slate-500',
  longing: 'bg-blue-400',
  gratitude: 'bg-emerald-500',
  connection: 'bg-cyan-400',
  confusion: 'bg-orange-400',
  excitement: 'bg-pink-400',
  melancholy: 'bg-indigo-400',
  hope: 'bg-lime-400',
  awe: 'bg-sky-400',
  angry: 'bg-red-600',
  hungry: 'bg-orange-500',
  neutral: 'bg-slate-400',
  happy: 'bg-amber-400',
  sad: 'bg-blue-400',
  excited: 'bg-pink-400',
  thinking: 'bg-violet-400',
  confused: 'bg-orange-400',
  sleepy: 'bg-slate-500',
  surprised: 'bg-emerald-400',
};

export const EmotionIndicator: FunctionalComponent<EmotionIndicatorProps> = ({
  emotion,
  className = '',
}) => (
  <div
    class={`
      w-2 h-2 rounded-full
      transition-colors duration-300
      ${EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral}
      ${className}
    `}
    title={emotion}
  />
);
