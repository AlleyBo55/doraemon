import type { EmotionType } from '../../../core/types/emotion';

type MenuItem = {
  label: string;
  icon: string;
  action: () => void;
  divider?: boolean;
};

type ContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onTriggerEmotion: (emotion: EmotionType) => void;
  onClearHistory: () => void;
  onToggleChat: () => void;
};

export const ContextMenu = ({
  x,
  y,
  onClose,
  onTriggerEmotion,
  onClearHistory,
  onToggleChat,
}: ContextMenuProps) => {
  const emotions: { emotion: EmotionType; icon: string; label: string }[] = [
    { emotion: 'happy', icon: '😊', label: 'Happy' },
    { emotion: 'excited', icon: '🎉', label: 'Excited' },
    { emotion: 'thinking', icon: '🤔', label: 'Thinking' },
    { emotion: 'sleepy', icon: '😴', label: 'Sleepy' },
    { emotion: 'playful', icon: '🎮', label: 'Playful' },
  ];

  const menuItems: MenuItem[] = [
    { label: 'Chat', icon: '💬', action: onToggleChat },
    { label: 'Clear History', icon: '🗑️', action: onClearHistory, divider: true },
  ];

  return (
    <>
      <div class="fixed inset-0 z-40" onClick={onClose} />
      <div
        class="fixed z-50 bg-white rounded-lg shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95"
        style={{ left: `${x}px`, top: `${y}px` }}
      >
        {menuItems.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => { item.action(); onClose(); }}
              class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
            {item.divider && <div class="border-t border-gray-100 my-1" />}
          </div>
        ))}
        
        <div class="px-3 py-1 text-xs text-gray-400 uppercase">Emotions</div>
        <div class="flex flex-wrap gap-1 px-2 pb-2">
          {emotions.map(({ emotion, icon, label }) => (
            <button
              key={emotion}
              onClick={() => { onTriggerEmotion(emotion); onClose(); }}
              class="p-1.5 hover:bg-gray-100 rounded text-lg"
              title={label}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
