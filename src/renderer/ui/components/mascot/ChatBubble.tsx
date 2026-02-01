import type { FunctionalComponent } from 'preact';

type ChatBubbleProps = {
  message: string;
  isThinking?: boolean;
  position?: 'top' | 'bottom';
  className?: string;
};

const ThinkingDots: FunctionalComponent = () => (
  <div class="flex gap-1">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-thinking"
        style={{ animationDelay: `${i * 0.2}s` }}
      />
    ))}
  </div>
);

export const ChatBubble: FunctionalComponent<ChatBubbleProps> = ({
  message,
  isThinking = false,
  position = 'top',
  className = '',
}) => {
  const positionClass = position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <div
      class={`
        absolute left-1/2 -translate-x-1/2
        ${positionClass}
        ${className}
      `}
    >
      <div
        class="
          relative px-4 py-2.5 rounded-xl
          bg-white/95 backdrop-blur-sm
          shadow-sm border border-slate-100
          text-sm text-slate-700
          min-w-40 max-w-md whitespace-pre-wrap
        "
      >
        {isThinking ? <ThinkingDots /> : message}
        <div
          class={`
            absolute left-1/2 -translate-x-1/2
            w-2 h-2 rotate-45
            bg-white border-slate-100
            ${position === 'top' ? 'top-full -mt-1 border-r border-b' : 'bottom-full -mb-1 border-l border-t'}
          `}
        />
      </div>
    </div>
  );
};
