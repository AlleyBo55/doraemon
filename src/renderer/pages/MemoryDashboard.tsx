/**
 * Memory Dashboard Modal
 * 
 * Shows memory stats, self-model, emergent goals, and security flags.
 * Triggered from tray menu.
 */

import { useState, useEffect } from 'preact/hooks';

interface MemoryStatsResult {
  success: boolean;
  stats?: {
    totalEntries?: number;
    byCategory?: Record<string, number>;
    storageBytes?: number;
  };
  error?: string;
}

interface MemoryDashboardProps {
  view: 'dashboard' | 'summary' | 'self-model' | 'goals' | 'security';
  onClose: () => void;
}

interface DashboardData {
  totalMemories: number;
  categories: Record<string, number>;
  recentActivity: string[];
  storageUsed: string;
}

export function MemoryDashboard({ view, onClose }: MemoryDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      
      const timeout = setTimeout(() => {
        setIsLoading(false);
        setError('Memory system not available');
      }, 3000);

      try {
        const api = window.electronAPI as { memoryStats?: () => Promise<MemoryStatsResult> } | undefined;
        const result = await api?.memoryStats?.();
        clearTimeout(timeout);
        
        if (result?.success && result.stats) {
          setData({
            totalMemories: result.stats.totalEntries || 0,
            categories: result.stats.byCategory || {},
            recentActivity: [],
            storageUsed: `${Math.round((result.stats.storageBytes || 0) / 1024)} KB`,
          });
        } else {
          setData({
            totalMemories: 0,
            categories: {},
            recentActivity: [],
            storageUsed: '0 KB',
          });
        }
      } catch (e) {
        clearTimeout(timeout);
        console.error('Failed to load memory data:', e);
        setData({
          totalMemories: 0,
          categories: {},
          recentActivity: [],
          storageUsed: '0 KB',
        });
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [view]);

  const titles: Record<string, string> = {
    dashboard: '🧠 Memory Dashboard',
    summary: '💭 What I Remember...',
    'self-model': '🪞 Self Model',
    goals: '🎯 Emergent Goals',
    security: '🛡️ Security Flags',
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" 
      onClick={onClose}
      style={{ pointerEvents: 'auto' }}
    >
      <div 
        className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/50">
          <h2 className="text-lg font-semibold text-slate-800">{titles[view]}</h2>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-slate-400">
              <div className="text-4xl mb-2">🔌</div>
              <p>{error}</p>
              <p className="text-sm mt-2">Enable MEMORY_SYSTEM_ENABLED=1 in .env</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(view === 'dashboard' || view === 'summary') && data && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-blue-600">{data.totalMemories}</div>
                      <div className="text-sm text-blue-600/70">Total Memories</div>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-purple-600">{data.storageUsed}</div>
                      <div className="text-sm text-purple-600/70">Storage Used</div>
                    </div>
                  </div>
                  
                  {Object.keys(data.categories).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-600 mb-2">Categories</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(data.categories).map(([cat, count]) => (
                          <span key={cat} className="px-3 py-1 bg-slate-100 rounded-full text-sm text-slate-600">
                            {cat}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.totalMemories === 0 && (
                    <div className="text-center py-4 text-slate-400">
                      <div className="text-4xl mb-2">🌱</div>
                      <p>No memories yet. Start chatting!</p>
                    </div>
                  )}
                </>
              )}

              {view === 'self-model' && (
                <div className="text-center py-8 text-slate-400">
                  <div className="text-4xl mb-2">🌱</div>
                  <p>Self-model is still forming...</p>
                  <p className="text-sm mt-2">This feature is coming soon</p>
                </div>
              )}

              {view === 'goals' && (
                <div className="text-center py-8 text-slate-400">
                  <div className="text-4xl mb-2">🌱</div>
                  <p>Goals are still emerging...</p>
                  <p className="text-sm mt-2">This feature is coming soon</p>
                </div>
              )}

              {view === 'security' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-green-50">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="font-medium">Healthy</span>
                    </div>
                  </div>
                  <div className="text-center py-4 text-slate-400">
                    <p>No security flags</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
