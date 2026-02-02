import type { FunctionalComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { marked } from 'marked';

type ChatBubbleProps = {
  message: string;
  isThinking?: boolean;
  isReasoning?: boolean;
  position?: 'top' | 'bottom';
  className?: string;
};

marked.setOptions({
  breaks: true,
  gfm: true,
});

const ThinkingDots: FunctionalComponent = () => (
  <div class="flex gap-1 items-center justify-center py-2">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        class="w-2.5 h-2.5 rounded-full bg-blue-400 animate-thinking"
        style={{ animationDelay: `${i * 0.2}s` }}
      />
    ))}
    <span class="ml-2 text-slate-500 text-sm">thinking...</span>
  </div>
);

const getBubbleSize = (textLength: number) => {
  if (textLength < 50) return { width: 240, maxHeight: 160 };
  if (textLength < 150) return { width: 340, maxHeight: 240 };
  if (textLength < 300) return { width: 420, maxHeight: 320 };
  if (textLength < 500) return { width: 500, maxHeight: 400 };
  return { width: 560, maxHeight: 480 };
};

const markdownStyles = `
  .chat-markdown {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .chat-markdown p { margin: 0 0 0.6em 0; }
  .chat-markdown p:last-child { margin-bottom: 0; }
  .chat-markdown h1, .chat-markdown h2, .chat-markdown h3 {
    font-weight: 600;
    margin: 0.8em 0 0.4em 0;
    line-height: 1.3;
  }
  .chat-markdown h1 { font-size: 1.25em; }
  .chat-markdown h2 { font-size: 1.15em; }
  .chat-markdown h3 { font-size: 1.05em; }
  .chat-markdown strong { font-weight: 600; }
  .chat-markdown em { font-style: italic; }
  .chat-markdown code {
    background: rgba(0,0,0,0.06);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-family: "SF Mono", Monaco, Consolas, monospace;
    font-size: 0.88em;
  }
  .chat-markdown pre {
    background: rgba(0,0,0,0.05);
    padding: 0.75em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0.6em 0;
  }
  .chat-markdown pre code {
    background: none;
    padding: 0;
    font-size: 0.85em;
  }
  .chat-markdown ul, .chat-markdown ol {
    margin: 0.5em 0;
    padding-left: 1.4em;
  }
  .chat-markdown li { margin: 0.25em 0; }
  .chat-markdown blockquote {
    border-left: 3px solid #cbd5e1;
    margin: 0.6em 0;
    padding-left: 0.8em;
    color: #64748b;
    font-style: italic;
  }
  .chat-markdown a {
    color: #3b82f6;
    text-decoration: underline;
  }
  .chat-markdown hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 0.8em 0;
  }
  .chat-markdown table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.6em 0;
    font-size: 0.9em;
  }
  .chat-markdown th, .chat-markdown td {
    border: 1px solid #e2e8f0;
    padding: 0.4em 0.6em;
    text-align: left;
  }
  .chat-markdown th {
    background: rgba(0,0,0,0.03);
    font-weight: 600;
  }
  .chat-markdown-reasoning code {
    background: rgba(180,83,9,0.1);
  }
  .chat-markdown-reasoning pre {
    background: rgba(180,83,9,0.08);
  }
`;

export const ChatBubble: FunctionalComponent<ChatBubbleProps> = ({
  message,
  isThinking = false,
  isReasoning = false,
  position = 'top',
  className = '',
}) => {
  const positionClass = position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  const bgColor = isReasoning ? '#fef3c7' : 'white';
  const borderColor = isReasoning ? '#fcd34d' : '#e2e8f0';
  
  const { width, maxHeight } = getBubbleSize(message.length);
  const needsScroll = message.length > 300;

  const renderedMarkdown = useMemo(() => {
    if (!message || isThinking) return '';
    try {
      return marked.parse(message) as string;
    } catch {
      return message;
    }
  }, [message, isThinking]);

  return (
    <div
      class={`absolute left-1/2 -translate-x-1/2 ${positionClass} ${className}`}
      style={{ zIndex: 1000, pointerEvents: needsScroll ? 'auto' : 'none' }}
    >
      <style>{markdownStyles}</style>
      <div
        style={{
          position: 'relative',
          padding: '14px 18px',
          borderRadius: '16px',
          backgroundColor: bgColor,
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          border: `1.5px solid ${borderColor}`,
          fontSize: '15px',
          lineHeight: '1.65',
          color: isReasoning ? '#92400e' : '#1e293b',
          width: `${width}px`,
          maxWidth: '92vw',
          maxHeight: `${maxHeight}px`,
          overflowY: needsScroll ? 'auto' : 'hidden',
          overflowX: 'hidden',
          wordBreak: 'break-word',
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 transparent',
        }}
      >
        {isReasoning && (
          <div style={{ fontSize: '11px', color: '#b45309', marginBottom: '8px', fontWeight: '600' }}>
            💭 Thinking...
          </div>
        )}
        
        {isThinking && !message ? (
          <ThinkingDots />
        ) : (
          <div 
            class={`chat-markdown ${isReasoning ? 'chat-markdown-reasoning' : ''}`}
            dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
          />
        )}
        
        {needsScroll && (
          <div style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            height: '20px',
            background: `linear-gradient(transparent, ${bgColor})`,
            pointerEvents: 'none',
            marginTop: '-20px',
          }} />
        )}
        
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: '12px',
            height: '12px',
            backgroundColor: bgColor,
            borderRight: position === 'top' ? `1.5px solid ${borderColor}` : 'none',
            borderBottom: position === 'top' ? `1.5px solid ${borderColor}` : 'none',
            borderTop: position === 'top' ? 'none' : `1.5px solid ${borderColor}`,
            borderLeft: position === 'top' ? 'none' : `1.5px solid ${borderColor}`,
            top: position === 'top' ? '100%' : 'auto',
            bottom: position === 'top' ? 'auto' : '100%',
            marginTop: position === 'top' ? '-6px' : '0',
            marginBottom: position === 'top' ? '0' : '-6px',
          }}
        />
      </div>
    </div>
  );
};
