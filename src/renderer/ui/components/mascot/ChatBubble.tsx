import type { FunctionalComponent } from 'preact';

type ChatBubbleProps = {
  message: string;
  isThinking?: boolean;
  isReasoning?: boolean;
  position?: 'top' | 'bottom';
  className?: string;
};

const ThinkingDots: FunctionalComponent = () => (
  <div class="flex gap-1 items-center justify-center">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        class="w-2 h-2 rounded-full bg-blue-400 animate-thinking"
        style={{ animationDelay: `${i * 0.2}s` }}
      />
    ))}
    <span class="ml-2 text-slate-500">thinking...</span>
  </div>
);

const formatMessage = (msg: string): string => {
  if (!msg) return '';
  
  return msg
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const getBubbleSize = (textLength: number) => {
  if (textLength < 50) return { width: 200, maxHeight: 120 };
  if (textLength < 150) return { width: 280, maxHeight: 180 };
  if (textLength < 300) return { width: 360, maxHeight: 240 };
  return { width: 420, maxHeight: 320 };
};

export const ChatBubble: FunctionalComponent<ChatBubbleProps> = ({
  message,
  isThinking = false,
  isReasoning = false,
  position = 'top',
  className = '',
}) => {
  const positionClass = position === 'top' ? 'bottom-full mb-3' : 'top-full mt-3';
  const bgColor = isReasoning ? '#fef3c7' : 'white';
  const borderColor = isReasoning ? '#fcd34d' : '#e2e8f0';
  
  const displayMessage = formatMessage(message);
  const { width, maxHeight } = getBubbleSize(displayMessage.length);

  return (
    <div
      class={`
        absolute left-1/2 -translate-x-1/2
        ${positionClass}
        ${className}
      `}
      style={{ zIndex: 1000, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'relative',
          padding: '12px 16px',
          borderRadius: '14px',
          backgroundColor: bgColor,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          border: `1px solid ${borderColor}`,
          fontSize: '14px',
          lineHeight: '1.6',
          color: isReasoning ? '#92400e' : '#1e293b',
          width: `${width}px`,
          maxWidth: '90vw',
          maxHeight: `${maxHeight}px`,
          overflowY: 'auto',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          fontStyle: isReasoning ? 'italic' : 'normal',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'left',
        }}
      >
        {isReasoning && (
          <div style={{ fontSize: '10px', color: '#b45309', marginBottom: '4px', fontWeight: '600' }}>
            💭 Thinking...
          </div>
        )}
        {isThinking ? <ThinkingDots /> : displayMessage}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: '10px',
            height: '10px',
            backgroundColor: bgColor,
            borderRight: position === 'top' ? `1px solid ${borderColor}` : 'none',
            borderBottom: position === 'top' ? `1px solid ${borderColor}` : 'none',
            borderTop: position === 'top' ? 'none' : `1px solid ${borderColor}`,
            borderLeft: position === 'top' ? 'none' : `1px solid ${borderColor}`,
            top: position === 'top' ? '100%' : 'auto',
            bottom: position === 'top' ? 'auto' : '100%',
            marginTop: position === 'top' ? '-5px' : '0',
            marginBottom: position === 'top' ? '0' : '-5px',
          }}
        />
      </div>
    </div>
  );
};
