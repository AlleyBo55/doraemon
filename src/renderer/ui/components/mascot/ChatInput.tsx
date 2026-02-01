import { useState, useCallback, useEffect, useRef } from 'preact/hooks';

type ChatInputProps = {
  onSend: (message: string) => void;
  isThinking: boolean;
  onClose?: () => void;
  className?: string;
};

export const ChatInput = ({ onSend, isThinking, onClose, className = '' }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback((e: Event) => {
    e.preventDefault();
    if (input.trim() && !isThinking) {
      onSend(input.trim());
      setInput('');
    }
  }, [input, isThinking, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Escape') {
      onClose?.();
    }
  }, [handleSubmit, onClose]);

  return (
    <form
      onSubmit={handleSubmit}
      class={`
        bg-white rounded-lg shadow-xl p-2 flex gap-2
        ${className}
      `}
      style={{ width: '280px' }}
    >
      <input
        ref={inputRef}
        type="text"
        value={input}
        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        placeholder={isThinking ? 'Thinking...' : 'Ask Doraemon~'}
        disabled={isThinking}
        class="
          flex-1 px-3 py-1.5 text-sm rounded-md
          border border-gray-200 focus:border-blue-400
          focus:outline-none focus:ring-1 focus:ring-blue-400
          disabled:bg-gray-100 disabled:cursor-not-allowed
        "
      />
      <button
        type="submit"
        disabled={!input.trim() || isThinking}
        class="
          px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm
          hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed
          transition-colors
        "
      >
        {isThinking ? '...' : '→'}
      </button>
      <button
        type="button"
        onClick={onClose}
        class="px-2 text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </form>
  );
};
