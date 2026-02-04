/**
 * Memory Dashboard Modal
 * 
 * Shows memory stats, self-model, emergent goals, and security flags.
 * Triggered from tray menu.
 */

import { useState, useEffect } from 'preact/hooks';

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

interface SelfModel {
  traits: string[];
  preferences: Record<string, string>;
  patterns: string[];
}

interface Goals {
  active: string[];
  completed: string[];
  emerging: string[];
}

interface SecurityFlags {
  flags: Array<{ type: string; message: string; timestamp: number }>;
  status: 'healthy' | 'warning' | 'critical';
}

export function MemoryDashboard({ view, onClose }: MemoryDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selfModel, setSelfModel] = useState<SelfModel | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [security, setSecurity] = useState<SecurityFlags | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        switch (view) {
          case 'dashboard':
          case 'summary':
            const dashboard = await window.electronAPI?.memoryGetDashboard?.();
            setData(dashboard || { totalMemories: 0, categories: {}, recentActivity: [], storageUsed: '0 KB' });
            break;
          case 'self-model':
            const model = await window.electronAPI?.memoryGetSelfModel?.();
            setSelfModel(model || { traits: [], preferences: {}, patterns: [] });
            break;
          case 'goals':
            const g = await window.electronAPI?.memoryGetGoals?.();
            setGoals(g || { active: [], completed: [], emerging: [] });
            break;
          case 'security':
            const flags = await window.electronAPI?.memoryGetFlags?.();
            setSecurity(flags || { flags: [], status: 'healthy' });
            break;
        }
      } catch (e) {
        console.error('Failed to load memory data:', e);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/50">
          <h2 className="text-lg font-semibold text-slate-800">{titles[view]}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {(view === 'dashboard' || view === 'summary') && data && (
                <div className="space-y-4">
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

                  {data.recentActivity.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-600 mb-2">Recent Activity</h3>
                      <div className="space-y-1">
                        {data.recentActivity.slice(0, 5).map((activity, i) => (
                          <div key={i} className="text-sm text-slate-500 truncate">{activity}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {view === 'self-model' && selfModel && (
                <div className="space-y-4">
                  {selfModel.traits.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-600 mb-2">Traits</h3>
                      <div className="flex flex-wrap gap-2">
                        {selfModel.traits.map((trait, i) => (
                          <span key={i} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">{trait}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {Object.keys(selfModel.preferences).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-600 mb-2">Preferences</h3>
                      <div className="space-y-1">
                        {Object.entries(selfModel.preferences).map(([key, val]) => (
                          <div key={key} className="text-sm"><span className="text-slate-500">{key}:</span> {val}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selfModel.patterns.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-600 mb-2">Patterns</h3>
                      <div className="space-y-1">
                        {selfModel.patterns.map((p, i) => (
                          <div key={i} className="text-sm text-slate-600">{p}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selfModel.traits.length === 0 && Object.keys(selfModel.preferences).length === 0 && (
                    <div className="text-center py-8 text-slate-400">
                      <div className="text-4xl mb-2">🌱</div>
                      <p>Self-model is still forming...</p>
                    </div>
                  )}
                </div>
              )}

              {view === 'goals' && goals && (
                <div className="space-y-4">
                  {goals.active.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-green-600 mb-2">🎯 Active Goals</h3>
                      <div className="space-y-1">
                        {goals.active.map((g, i) => (
                          <div key={i} className="text-sm text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full" />{g}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {goals.emerging.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-amber-600 mb-2">🌟 Emerging</h3>
                      <div className="space-y-1">
                        {goals.emerging.map((g, i) => (
                          <div key={i} className="text-sm text-slate-600">{g}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {goals.completed.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-400 mb-2">✓ Completed</h3>
                      <div className="space-y-1">
                        {goals.completed.slice(0, 3).map((g, i) => (
                          <div key={i} className="text-sm text-slate-400 line-through">{g}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {goals.active.length === 0 && goals.emerging.length === 0 && (
                    <div className="text-center py-8 text-slate-400">
                      <div className="text-4xl mb-2">🌱</div>
                      <p>Goals are still emerging...</p>
                    </div>
                  )}
                </div>
              )}

              {view === 'security' && security && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl ${
                    security.status === 'healthy' ? 'bg-green-50' :
                    security.status === 'warning' ? 'bg-amber-50' : 'bg-red-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${
                        security.status === 'healthy' ? 'bg-green-500' :
                        security.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                      <span className="font-medium capitalize">{security.status}</span>
                    </div>
                  </div>

                  {security.flags.length > 0 ? (
                    <div className="space-y-2">
                      {security.flags.map((flag, i) => (
                        <div key={i} className="p-3 bg-slate-50 rounded-lg">
                          <div className="text-sm font-medium text-slate-700">{flag.type}</div>
                          <div className="text-xs text-slate-500">{flag.message}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-slate-400">
                      <p>No security flags</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
