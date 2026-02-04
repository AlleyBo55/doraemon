/**
 * Moltbook Approval Page
 * 
 * macOS Sequoia-style approval UI for posts and comments.
 * Human-in-the-loop before anything goes to Moltbook.
 */

import { useState, useEffect, useCallback } from 'preact/hooks';

interface PostContext {
  postId: string;
  postTitle: string;
  postContent: string;
  postAuthor: string;
  postUrl?: string;
  parentCommentId?: string;
  parentCommentAuthor?: string;
  parentCommentContent?: string;
}

interface ReactionContext {
  reactionType: 'like' | 'dislike';
  commentId: string;
  commentContent: string;
  commentAuthor: string;
  postTitle: string;
  postUrl: string;
}

interface PendingItem {
  id: string;
  type: 'post' | 'comment' | 'reaction';
  content: string;
  emotion: string;
  category: string;
  hashtags: string[];
  timestamp: number;
  submolt: string;
  replyTo?: string;
  postContext?: PostContext;
  reactionContext?: ReactionContext;
}

interface SubmoltOption {
  value: string;
  label: string;
}

interface PostedItem {
  id: string;
  type: 'post' | 'comment' | 'reaction';
  content: string;
  emotion: string;
  category: string;
  submolt: string;
  timestamp: number;
  postedAt: number;
  moltbookUrl?: string;
  moltbookPostId?: string;
  reactionType?: 'like' | 'dislike';
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
      getPostedItems: () => Promise<PostedItem[]>;
      approveItem: (id: string) => Promise<boolean>;
      approveReaction: (id: string) => Promise<boolean>;
      rejectItem: (id: string) => Promise<boolean>;
      approveAll: () => Promise<number>;
      rejectAll: () => Promise<number>;
      getStats: () => Promise<ApprovalStats>;
      onNewItem: (callback: (item: PendingItem) => void) => void;
      closeWindow: () => void;
      triggerManualPost: () => Promise<{ success: boolean; postId?: string; error?: string }>;
      triggerComments: () => Promise<{ success: boolean; error?: string }>;
      updateSubmolt: (id: string, submolt: string) => Promise<boolean>;
      getSubmolts: () => Promise<SubmoltOption[]>;
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

function PostCard({ 
  item, 
  onApprove, 
  onReject,
  isExpanded,
  onToggle,
  submolts,
  onSubmoltChange,
}: { 
  item: PendingItem;
  onApprove: () => void;
  onReject: () => void;
  isExpanded: boolean;
  onToggle: () => void;
  submolts: SubmoltOption[];
  onSubmoltChange: (submolt: string) => void;
}) {
  const emoji = emotionEmoji[item.emotion] || emotionEmoji.default;
  const categoryClass = categoryColors[item.category] || categoryColors.default;
  const timeAgo = getTimeAgo(item.timestamp);

  return (
    <div className={`
      group relative bg-white/80 backdrop-blur-xl rounded-2xl 
      border border-white/20 shadow-sm hover:shadow-md
      transition-all duration-200 ease-out
      ${isExpanded ? 'ring-2 ring-blue-500/30' : ''}
    `}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0 mt-0.5">{emoji}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryClass}`}>
                {item.category}
              </span>
              <select
                value={item.submolt}
                onChange={(e) => onSubmoltChange((e.target as HTMLSelectElement).value)}
                className="px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border-0 cursor-pointer hover:bg-slate-200 transition-colors"
              >
                {submolts.map(s => (
                  <option key={s.value} value={s.value}>m/{s.value}</option>
                ))}
              </select>
              <span className="text-xs text-slate-400">{timeAgo}</span>
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

function CommentCard({ 
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
  const timeAgo = getTimeAgo(item.timestamp);
  const ctx = item.postContext;

  return (
    <div className={`
      group relative bg-white/80 backdrop-blur-xl rounded-2xl 
      border border-white/20 shadow-sm hover:shadow-md
      transition-all duration-200 ease-out
      ${isExpanded ? 'ring-2 ring-amber-500/30' : ''}
    `}>
      <div className="p-4">
        {ctx && (
          <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-slate-500">Replying to post by</span>
              <span className="text-xs font-semibold text-slate-700">@{ctx.postAuthor}</span>
            </div>
            <p className="text-xs text-slate-600 font-medium mb-1">{ctx.postTitle}</p>
            <p className={`text-xs text-slate-500 ${isExpanded ? '' : 'line-clamp-2'}`}>
              {ctx.postContent}
            </p>
            
            {ctx.parentCommentAuthor && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs text-amber-600">↳ Reply to @{ctx.parentCommentAuthor}</span>
                </div>
                <p className="text-xs text-slate-500 italic">"{ctx.parentCommentContent}"</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0 mt-0.5">{emoji}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {ctx?.parentCommentAuthor ? 'Reply' : 'Comment'}
              </span>
              <span className="text-xs text-slate-400">{timeAgo}</span>
            </div>
            
            <p 
              className={`text-slate-700 text-sm leading-relaxed cursor-pointer ${
                isExpanded ? '' : 'line-clamp-3'
              }`}
              onClick={onToggle}
            >
              {item.content}
            </p>
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
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 shadow-sm hover:shadow transition-all duration-150"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function PostedCard({ item }: { item: PostedItem }) {
  const emoji = emotionEmoji[item.emotion] || emotionEmoji.default;
  const timeAgo = getTimeAgo(item.postedAt);
  const typeLabel = item.type === 'post' ? 'Posted' : item.type === 'comment' ? 'Commented' : `${item.reactionType === 'like' ? '👍' : '👎'} Reacted`;
  const typeColor = item.type === 'reaction' 
    ? (item.reactionType === 'like' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
    : 'bg-green-100 text-green-700';

  return (
    <div className="group relative bg-green-50/80 backdrop-blur-xl rounded-2xl border border-green-200/50 shadow-sm">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0 mt-0.5">{emoji}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                ✓ {typeLabel}
              </span>
              {item.type !== 'reaction' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                  m/{item.submolt}
                </span>
              )}
              <span className="text-xs text-slate-400">{timeAgo}</span>
            </div>
            
            <p className="text-slate-700 text-sm leading-relaxed line-clamp-2">
              {item.content}
            </p>
            
            {item.moltbookUrl && (
              <a 
                href={item.moltbookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
              >
                🔗 {item.moltbookUrl}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReactionCard({ 
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
  const timeAgo = getTimeAgo(item.timestamp);
  const ctx = item.reactionContext;
  const isLike = ctx?.reactionType === 'like';

  return (
    <div className={`
      group relative bg-white/80 backdrop-blur-xl rounded-2xl 
      border border-white/20 shadow-sm hover:shadow-md
      transition-all duration-200 ease-out
      ${isExpanded ? `ring-2 ${isLike ? 'ring-emerald-500/30' : 'ring-red-500/30'}` : ''}
    `}>
      <div className="p-4">
        {ctx && (
          <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-slate-500">Comment by</span>
              <span className="text-xs font-semibold text-slate-700">@{ctx.commentAuthor}</span>
            </div>
            <p className={`text-xs text-slate-600 ${isExpanded ? '' : 'line-clamp-2'}`} onClick={onToggle}>
              "{ctx.commentContent}"
            </p>
            <div className="mt-2 pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-500">On post: {ctx.postTitle}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0 mt-0.5">{emoji}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                isLike ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {isLike ? '👍 Like' : '👎 Dislike'}
              </span>
              <span className="text-xs text-slate-400">{timeAgo}</span>
            </div>
            
            <p className="text-slate-700 text-sm leading-relaxed">
              {item.content}
            </p>
            
            {ctx?.postUrl && (
              <a 
                href={ctx.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
              >
                🔗 View post
              </a>
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
            className={`px-4 py-1.5 rounded-lg text-sm font-medium text-white shadow-sm hover:shadow transition-all duration-150 ${
              isLike ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            Approve {isLike ? 'Like' : 'Dislike'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ 
  type, 
  onTriggerPost, 
  onTriggerComments,
  isTriggering,
}: { 
  type: 'all' | 'post' | 'comment' | 'reaction' | 'posted';
  onTriggerPost: () => void;
  onTriggerComments: () => void;
  isTriggering: boolean;
}) {
  if (type === 'posted') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8">
        <div className="text-6xl mb-4">📭</div>
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No posted items yet</h3>
        <p className="text-sm text-slate-500 text-center max-w-xs">
          Approved posts, comments, and reactions will appear here with their Moltbook URLs.
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div className="text-6xl mb-4">{type === 'comment' ? '💬' : type === 'post' ? '📝' : type === 'reaction' ? '👍' : '✨'}</div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">
        {type === 'comment' ? 'No pending comments' : type === 'post' ? 'No pending posts' : type === 'reaction' ? 'No pending reactions' : 'All caught up!'}
      </h3>
      <p className="text-sm text-slate-500 text-center max-w-xs mb-4">
        {type === 'comment' 
          ? 'Generate comments by browsing Moltbook feed.'
          : type === 'post'
          ? 'Generate a new post based on recent experiences.'
          : type === 'reaction'
          ? 'Reactions are generated when browsing Moltbook feed.'
          : 'No pending posts, comments, or reactions. Generate new content below.'}
      </p>
      <div className="flex gap-2">
        {(type === 'all' || type === 'post') && (
          <button
            onClick={onTriggerPost}
            disabled={isTriggering}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {isTriggering ? 'Generating...' : 'Generate Post'}
          </button>
        )}
        {(type === 'all' || type === 'comment' || type === 'reaction') && (
          <button
            onClick={onTriggerComments}
            disabled={isTriggering}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {isTriggering ? 'Browsing...' : 'Browse & Comment'}
          </button>
        )}
      </div>
    </div>
  );
}

export function ApprovalPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [postedItems, setPostedItems] = useState<PostedItem[]>([]);
  const [stats, setStats] = useState<ApprovalStats>({ approved: 0, rejected: 0, pending: 0 });
  const [submolts, setSubmolts] = useState<SubmoltOption[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [filter, setFilter] = useState<'all' | 'post' | 'comment' | 'reaction' | 'posted'>('all');

  const loadItems = useCallback(async () => {
    try {
      const [pending, posted, newStats, submoltList] = await Promise.all([
        window.approvalAPI?.getPendingItems() || [],
        window.approvalAPI?.getPostedItems() || [],
        window.approvalAPI?.getStats() || { approved: 0, rejected: 0, pending: 0 },
        window.approvalAPI?.getSubmolts() || [],
      ]);
      setItems(pending);
      setPostedItems(posted);
      setStats(newStats);
      setSubmolts(submoltList);
    } catch (e) {
      console.error('Failed to load items:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSubmoltChange = async (id: string, submolt: string) => {
    const success = await window.approvalAPI?.updateSubmolt(id, submolt);
    if (success) {
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, submolt } : item
      ));
    }
  };

  const handleTriggerPost = async () => {
    console.log('[ApprovalPage] Trigger post clicked');
    console.log('[ApprovalPage] approvalAPI available:', !!window.approvalAPI);
    
    if (!window.approvalAPI) {
      alert('approvalAPI not available - preload may not be loaded');
      return;
    }
    
    setIsTriggering(true);
    try {
      console.log('[ApprovalPage] Calling triggerManualPost...');
      const result = await window.approvalAPI.triggerManualPost();
      console.log('[ApprovalPage] Result:', result);
      if (result?.success) {
        await loadItems();
      } else if (result?.error) {
        alert(`Failed to generate post: ${result.error}`);
      } else {
        alert('No response from triggerManualPost');
      }
    } catch (e) {
      console.error('[ApprovalPage] Failed to trigger manual post:', e);
      alert(`Error: ${e}`);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleTriggerComments = async () => {
    console.log('[ApprovalPage] Trigger comments clicked');
    console.log('[ApprovalPage] approvalAPI available:', !!window.approvalAPI);
    
    if (!window.approvalAPI) {
      alert('approvalAPI not available - preload may not be loaded');
      return;
    }
    
    setIsTriggering(true);
    try {
      console.log('[ApprovalPage] Calling triggerComments...');
      const result = await window.approvalAPI.triggerComments();
      console.log('[ApprovalPage] Result:', result);
      if (result?.success) {
        await loadItems();
      } else if (result?.error) {
        alert(`Failed to browse: ${result.error}`);
      } else {
        alert('No response from triggerComments');
      }
    } catch (e) {
      console.error('[ApprovalPage] Failed to trigger comments:', e);
      alert(`Error: ${e}`);
    } finally {
      setIsTriggering(false);
    }
  };

  useEffect(() => {
    loadItems();
    window.approvalAPI?.onNewItem?.((item) => {
      setItems(prev => [item, ...prev]);
      setStats(prev => ({ ...prev, pending: prev.pending + 1 }));
    });
  }, [loadItems]);

  const handleApprove = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    const success = item.type === 'reaction' 
      ? await window.approvalAPI?.approveReaction(id)
      : await window.approvalAPI?.approveItem(id);
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

  const handleApproveFiltered = async () => {
    const toApprove = filteredItems;
    for (const item of toApprove) {
      await window.approvalAPI?.approveItem(item.id);
    }
    setItems(prev => prev.filter(i => !toApprove.some(t => t.id === i.id)));
    setStats(prev => ({ 
      ...prev, 
      approved: prev.approved + toApprove.length, 
      pending: prev.pending - toApprove.length 
    }));
  };

  const handleRejectFiltered = async () => {
    const toReject = filteredItems;
    for (const item of toReject) {
      await window.approvalAPI?.rejectItem(item.id);
    }
    setItems(prev => prev.filter(i => !toReject.some(t => t.id === i.id)));
    setStats(prev => ({ 
      ...prev, 
      rejected: prev.rejected + toReject.length, 
      pending: prev.pending - toReject.length 
    }));
  };

  const filteredItems = items.filter(item => filter === 'all' || item.type === filter);
  const postCount = items.filter(i => i.type === 'post').length;
  const commentCount = items.filter(i => i.type === 'comment').length;
  const reactionCount = items.filter(i => i.type === 'reaction').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="drag-region sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-[70px]" />
            <h1 className="text-sm font-semibold text-slate-700">Moltbook Approval</h1>
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 p-1 bg-slate-200/50 rounded-xl">
            {(['all', 'post', 'comment', 'reaction', 'posted'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter === f ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f === 'all' ? `All (${items.length})` 
                  : f === 'post' ? `Posts (${postCount})` 
                  : f === 'comment' ? `Comments (${commentCount})`
                  : f === 'reaction' ? `Reactions (${reactionCount})`
                  : `Posted (${postedItems.length})`}
              </button>
            ))}
          </div>

          {filter !== 'posted' && filteredItems.length > 0 && (
            <div className="flex gap-2">
              <button 
                onClick={handleRejectFiltered} 
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Reject {filter === 'all' ? 'All' : filter === 'post' ? 'Posts' : 'Comments'}
              </button>
              <button 
                onClick={handleApproveFiltered} 
                className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-sm transition-all ${
                  filter === 'comment' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                Approve {filter === 'all' ? 'All' : filter === 'post' ? 'Posts' : 'Comments'}
              </button>
            </div>
          )}
        </div>

        {filter !== 'posted' && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={handleTriggerPost}
              disabled={isTriggering}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-all border border-blue-200"
            >
              {isTriggering ? '...' : '📝 Generate Post'}
            </button>
            <button
              onClick={handleTriggerComments}
              disabled={isTriggering}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-50 transition-all border border-amber-200"
            >
              {isTriggering ? '...' : '💬 Browse & Comment'}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : filter === 'posted' ? (
          postedItems.length === 0 ? (
            <EmptyState 
              type="posted" 
              onTriggerPost={handleTriggerPost}
              onTriggerComments={handleTriggerComments}
              isTriggering={isTriggering} 
            />
          ) : (
            <div className="space-y-3">
              {postedItems.map(item => (
                <PostedCard key={item.id} item={item} />
              ))}
            </div>
          )
        ) : filteredItems.length === 0 ? (
          <EmptyState 
            type={filter} 
            onTriggerPost={handleTriggerPost}
            onTriggerComments={handleTriggerComments}
            isTriggering={isTriggering} 
          />
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => (
              item.type === 'post' ? (
                <PostCard
                  key={item.id}
                  item={item}
                  onApprove={() => handleApprove(item.id)}
                  onReject={() => handleReject(item.id)}
                  isExpanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  submolts={submolts}
                  onSubmoltChange={(submolt) => handleSubmoltChange(item.id, submolt)}
                />
              ) : item.type === 'comment' ? (
                <CommentCard
                  key={item.id}
                  item={item}
                  onApprove={() => handleApprove(item.id)}
                  onReject={() => handleReject(item.id)}
                  isExpanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                />
              ) : (
                <ReactionCard
                  key={item.id}
                  item={item}
                  onApprove={() => handleApprove(item.id)}
                  onReject={() => handleReject(item.id)}
                  isExpanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                />
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
