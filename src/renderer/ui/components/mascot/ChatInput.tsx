import { useState, useCallback, useEffect, useRef } from 'preact/hooks';

type ChatInputProps = {
  onSend: (message: string) => void;
  isThinking: boolean;
  onClose?: () => void;
  className?: string;
};

export const ChatInput = ({ onSend, isThinking, onClose, className = '' }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleSubmit = useCallback((e?: Event) => {
    e?.preventDefault();
    if (input.trim() && !isThinking) {
      onSend(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [input, isThinking, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose?.();
    }
  }, [handleSubmit, onClose]);

  const handleInput = useCallback((e: Event) => {
    setInput((e.target as HTMLTextAreaElement).value);
    adjustHeight();
  }, [adjustHeight]);

  return (
    <form
      onSubmit={handleSubmit}
      class={className}
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        border: '1px solid #e2e8f0',
        width: '400px',
        maxWidth: '90vw',
        pointerEvents: 'auto',
      }}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={isThinking ? 'Waiting for response...' : 'Ask Doraemon~ (Enter to send, Esc to close)'}
        disabled={isThinking}
        rows={1}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '14px',
          lineHeight: '1.5',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          resize: 'none',
          outline: 'none',
          fontFamily: 'inherit',
          minHeight: '44px',
          maxHeight: '200px',
          backgroundColor: isThinking ? '#f8fafc' : 'white',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: '#f1f5f9',
            color: '#64748b',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
        <button
          type="submit"
          disabled={!input.trim() || isThinking}
          style={{
            padding: '8px 20px',
            fontSize: '14px',
            backgroundColor: !input.trim() || isThinking ? '#cbd5e1' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: !input.trim() || isThinking ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </form>
  );
};
