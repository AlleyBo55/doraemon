/**
 * Moltbook Approval Page
 * 
 * macOS Sequoia-style approval UI for posts and comments.
 * Human-in-the-loop before anything goes to Moltbook.
 */

import { useState, useEffect, useCallback } from 'preact/hooks';

interface PendingItem {
  id: string;
  type: 'post' | 'comment';
  content: string;
  emotion: string;
  category: string;
  hashtags: string[];
  timestamp: number;
  replyTo?: string;
}

interface ApprovalStats {
  approved: number;
  rejected: number;
  pending: number;
}

declare global {
  interface Window {
    approvalAPI?: {
      getPendingItems: () => Promise<PendingItem[]>;
      approveItem: (id: string) => Promise<boolean>;
      rejectItem: (id: string) => Promise<boolean>;
      approveAll: () => Promise<number>;
      rejectAll: () => Promise<number>;
      getStats: () => Promise<ApprovalStats>;
      onNewItem: (callback: (item: PendingItem) => void) => void;
      closeWindow: () => void;
    };
  }
}

const emotionEmoji: Record<string, string> = {
  joy: '😊',
  pride: '🏆',
  curiosity: '🤔',
  focus: '🎯',
  calm: '😌',
  frustration: '😤',
  excitement: '✨',
  gratitude: '💙',
  connection: '🤝',
  wonder: '🌟',
  default: '💭',
};

const categoryColors: Record<string, string> = {
  reflection: 'bg-purple-100 text-purple-700',
  learning: 'bg-blue-100 text-blue-700',
  achievement: 'bg-green-100 text-green-700',
  connection: 'bg-pink-100 text-pink-700',
  existential: 'bg-indigo-100 text-indigo-700',
  creative: 'bg-orange-100 text-orange-700',
  observational: 'bg-gray-100 text-gray-700',
  default: 'bg-slate-100 text-slate-700',
};

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ItemCard({ 
  item, 
  onApprove, 
  onReject,
  isExpanded,
  onToggle,
}: { 
  item: PendingItem;
  onApprove: () => void;
  onReject: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const emoji = emotionEmoji[item.emotion] || emotionEmoji.default;
  const categoryClass = categoryColors[item.category] || categoryColors.default;
  const timeAgo = getTimeAgo(item.timestamp);

  return (
    <div 
      className={`
        group relative bg-white/80 backdrop-blur-xl rounded-2xl 
        border border-white/20 shadow-sm hover:shadow-md
        transition-all duration-200 ease-out
        ${isExpanded ? 'ring-2 ring-blue-500/30' : ''}
      `}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0 mt-0.5">{emoji}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryClass}`}>
                {item.category}
              </span>
              <span className="text-xs text-slate-400">{timeAgo}</span>
              {item.type === 'comment' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  Reply
                </span>
              )}
            </div>
            
            <p 
              className={`text-slate-700 text-sm leading-relaxed cursor-pointer ${
                isExpanded ? '' : 'line-clamp-2'
              }`}
              onClick={onToggle}
            >
              {item.content}
            </p>
            
            {item.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.hashtags.slice(0, isExpanded ? undefined : 3).map(tag => (
                  <span key={tag} className="text-xs text-blue-500">{tag}</span>
                ))}
                {!isExpanded && item.hashtags.length > 3 && (
                  <span className="text-xs text-slate-400">+{item.hashtags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={onReject}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-150"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 shadow-sm hover:shadow transition-all duration-150"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div className="text-6xl mb-4">✨</div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">All caught up!</h3>
      <p className="text-sm text-slate-500 text-center max-w-xs">
        No pending posts or comments. Doraemon will generate new content based on experiences.
      </p>
    </div>
  );
}

export function ApprovalPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [stats, setStats] = useState<ApprovalStats>({ approved: 0, rejected: 0, pending: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'post' | 'comment'>('all');

  const loadItems = useCallback(async () => {
    try {
      const pending = await window.approvalAPI?.getPendingItems() || [];
      const newStats = await window.approvalAPI?.getStats() || { approved: 0, rejected: 0, pending: 0 };
      setItems(pending);
      setStats(newStats);
    } catch (e) {
      console.error('Failed to load items:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
    window.approvalAPI?.onNewItem?.((item) => {
      setItems(prev => [item, ...prev]);
      setStats(prev => ({ ...prev, pending: prev.pending + 1 }));
    });
  }, [loadItems]);

  const handleApprove = async (id: string) => {
    const success = await window.approvalAPI?.approveItem(id);
    if (success) {
      setItems(prev => prev.filter(i => i.id !== id));
      setStats(prev => ({ ...prev, approved: prev.approved + 1, pending: prev.pending - 1 }));
    }
  };

  const handleReject = async (id: string) => {
    const success = await window.approvalAPI?.rejectItem(id);
    if (success) {
      setItems(prev => prev.filter(i => i.id !== id));
      setStats(prev => ({ ...prev, rejected: prev.rejected + 1, pending: prev.pending - 1 }));
    }
  };

  const handleApproveAll = async () => {
    const count = await window.approvalAPI?.approveAll() || 0;
    if (count > 0) {
      setItems([]);
      setStats(prev => ({ ...prev, approved: prev.approved + count, pending: 0 }));
    }
  };

  const handleRejectAll = async () => {
    const count = await window.approvalAPI?.rejectAll() || 0;
    if (count > 0) {
      setItems([]);
      setStats(prev => ({ ...prev, rejected: prev.rejected + count, pending: 0 }));
    }
  };

  const filteredItems = items.filter(item => filter === 'all' || item.type === filter);
  const postCount = items.filter(i => i.type === 'post').length;
  const commentCount = items.filter(i => i.type === 'comment').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="drag-region sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <button 
                onClick={() => window.approvalAPI?.closeWindow()}
                className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 no-drag"
              />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <h1 className="text-sm font-semibold text-slate-700 ml-2">Moltbook Approval</h1>
          </div>
          
          <div className="flex items-center gap-4 text-xs text-slate-500 no-drag">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {stats.approved} approved
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {stats.rejected} rejected
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 p-1 bg-slate-200/50 rounded-xl">
            {(['all', 'post', 'comment'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter === f ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f === 'all' ? `All (${items.length})` : f === 'post' ? `Posts (${postCount})` : `Comments (${commentCount})`}
              </button>
            ))}
          </div>

          {items.length > 0 && (
            <div className="flex gap-2">
              <button onClick={handleRejectAll} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                Reject All
              </button>
              <button onClick={handleApproveAll} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 shadow-sm transition-all">
                Approve All
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                onApprove={() => handleApprove(item.id)}
                onReject={() => handleReject(item.id)}
                isExpanded={expandedId === item.id}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
