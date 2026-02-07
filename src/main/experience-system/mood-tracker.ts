/**
 * Mood Tracker
 *
 * Tracks user emotional valence from chat messages over time.
 * One-directional: Doraemon adapts to user mood, never tries to change it.
 * Uses simple keyword-based sentiment (no LLM calls for tracking).
 */

const POSITIVE_WORDS = new Set([
  'thanks', 'thank', 'great', 'awesome', 'nice', 'love', 'cool', 'perfect',
  'amazing', 'good', 'yes', 'yay', 'happy', 'excited', 'wonderful', 'excellent',
  'fantastic', 'brilliant', 'sweet', 'beautiful', 'haha', 'lol', 'lmao',
  'works', 'fixed', 'solved', 'done', 'finally', 'yess', 'lets go',
]);

const NEGATIVE_WORDS = new Set([
  'error', 'bug', 'broken', 'fail', 'failed', 'wrong', 'bad', 'hate',
  'frustrated', 'annoying', 'annoyed', 'stuck', 'confused', 'ugh', 'damn',
  'shit', 'fuck', 'wtf', 'why', 'crash', 'crashed', 'sucks', 'terrible',
  'horrible', 'awful', 'impossible', 'help', 'urgent', 'broken',
]);

export interface MoodSnapshot {
  valence: number;
  timestamp: number;
}

export interface MoodState {
  current: number;
  rolling7Day: number;
  trend: 'improving' | 'stable' | 'declining';
  recentSnapshots: MoodSnapshot[];
}

const MAX_SNAPSHOTS = 200;
let snapshots: MoodSnapshot[] = [];

export function analyzeSentiment(message: string): number {
  const words = message.toLowerCase().split(/\s+/);
  let positive = 0;
  let negative = 0;

  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '');
    if (POSITIVE_WORDS.has(clean)) positive++;
    if (NEGATIVE_WORDS.has(clean)) negative++;
  }

  const total = positive + negative;
  if (total === 0) return 0;

  return (positive - negative) / total;
}

export function recordUserMessage(message: string): void {
  if (message.length < 5) return;

  const valence = analyzeSentiment(message);
  snapshots.push({ valence, timestamp: Date.now() });

  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(-MAX_SNAPSHOTS);
  }
}

export function getCurrentMood(): number {
  const recent = snapshots.filter(s => Date.now() - s.timestamp < 30 * 60 * 1000);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, s) => sum + s.valence, 0) / recent.length;
}

export function getRolling7DayMood(): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = snapshots.filter(s => s.timestamp > weekAgo);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, s) => sum + s.valence, 0) / recent.length;
}

export function getMoodTrend(): 'improving' | 'stable' | 'declining' {
  if (snapshots.length < 10) return 'stable';

  const mid = Math.floor(snapshots.length / 2);
  const firstHalf = snapshots.slice(0, mid);
  const secondHalf = snapshots.slice(mid);

  const avgFirst = firstHalf.reduce((s, v) => s + v.valence, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v.valence, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  if (diff > 0.15) return 'improving';
  if (diff < -0.15) return 'declining';
  return 'stable';
}

export function getMoodState(): MoodState {
  return {
    current: getCurrentMood(),
    rolling7Day: getRolling7DayMood(),
    trend: getMoodTrend(),
    recentSnapshots: snapshots.slice(-20),
  };
}

export function getMoodTone(): 'cheerful' | 'gentle' | 'neutral' | 'supportive' | 'encouraging' {
  const mood = getCurrentMood();
  if (mood > 0.3) return 'cheerful';
  if (mood > 0.1) return 'neutral';
  if (mood > -0.1) return 'gentle';
  if (mood > -0.3) return 'supportive';
  return 'encouraging';
}
