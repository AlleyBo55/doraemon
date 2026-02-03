export { 
  startNotificationWatcher, 
  stopNotificationWatcher, 
  checkFullDiskAccess,
  requestFullDiskAccess,
  type NotificationInfo 
} from './notification-watcher.js';
export { 
  startEditorWatcher, 
  stopEditorWatcher, 
  getEditorThought,
  getStreakMessage,
  getBreakMessage,
  getDailySummary,
  getCodingStats,
  setStatsCallback,
  setBreakCallback,
  type EditorActivity,
  type CodingStats,
} from './editor-watcher.js';
