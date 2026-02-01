import type { FunctionalComponent } from 'preact';
import type { EmotionType } from '../../../core/types/emotion';

type EmotionIndicatorProps = {
  emotion: EmotionType;
  className?: string;
};

const EMOTION_COLORS: Record<EmotionType, string> = {
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
      ${EMOTION_COLORS[emotion]}
      ${className}
    `}
    title={emotion}
  />
);
