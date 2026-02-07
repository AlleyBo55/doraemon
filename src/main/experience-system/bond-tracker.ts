/**
 * Bond Tracker
 *
 * Persists relationship strength between Doraemon and the user.
 * Bond level increases with interactions and decays slightly with inactivity.
 * Behavior changes subtly at thresholds — no number shown to user.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface BondState {
  level: number;
  totalInteractions: number;
  totalCodingSessions: number;
  totalChats: number;
  totalSharedLinks: number;
  lastInteraction: string;
  firstMet: string;
  streakDays: number;
  lastActiveDate: string;
}

const BOND_FILE = '.doraemon-bond.json';
const MAX_LEVEL = 100;
const DECAY_PER_IDLE_HOUR = 0.05;
const MAX_DAILY_GAIN = 8;

const INTERACTION_WEIGHTS: Record<string, number> = {
  chat: 0.5,
  coding_session: 0.3,
  shared_link: 0.4,
  notification_reaction: 0.1,
  media_feed: 0.6,
  long_session: 0.8,
  comeback: 1.5,
};

let state: BondState | null = null;
let dailyGain = 0;
let lastDailyReset = '';

function getBondPath(): string {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return path.join(home, BOND_FILE);
}

function createDefault(): BondState {
  const now = new Date().toISOString();
  return {
    level: 1,
    totalInteractions: 0,
    totalCodingSessions: 0,
    totalChats: 0,
    totalSharedLinks: 0,
    lastInteraction: now,
    firstMet: now,
    streakDays: 1,
    lastActiveDate: now.split('T')[0],
  };
}

export function loadBond(): BondState {
  if (state) return state;

  try {
    const raw = fs.readFileSync(getBondPath(), 'utf-8');
    state = JSON.parse(raw) as BondState;
    applyIdleDecay();
    updateStreak();
  } catch {
    state = createDefault();
  }

  return state;
}

function save(): void {
  if (!state) return;
  try {
    fs.writeFileSync(getBondPath(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[BondTracker] Failed to save:', err);
  }
}

function applyIdleDecay(): void {
  if (!state) return;
  const lastTime = new Date(state.lastInteraction).getTime();
  const hoursIdle = (Date.now() - lastTime) / (1000 * 60 * 60);

  if (hoursIdle > 12) {
    const decay = Math.min(hoursIdle * DECAY_PER_IDLE_HOUR, 3);
    state.level = Math.max(1, state.level - decay);
  }
}

function updateStreak(): void {
  if (!state) return;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (state.lastActiveDate === today) return;

  if (state.lastActiveDate === yesterday) {
    state.streakDays++;
  } else if (state.lastActiveDate !== today) {
    state.streakDays = 1;
  }

  state.lastActiveDate = today;
}

function checkDailyReset(): void {
  const today = new Date().toISOString().split('T')[0];
  if (lastDailyReset !== today) {
    dailyGain = 0;
    lastDailyReset = today;
  }
}

export function recordInteraction(type: keyof typeof INTERACTION_WEIGHTS): void {
  const s = loadBond();
  checkDailyReset();

  const weight = INTERACTION_WEIGHTS[type] || 0.2;
  if (dailyGain < MAX_DAILY_GAIN) {
    const gain = Math.min(weight, MAX_DAILY_GAIN - dailyGain);
    s.level = Math.min(MAX_LEVEL, s.level + gain);
    dailyGain += gain;
  }

  s.totalInteractions++;
  if (type === 'chat') s.totalChats++;
  if (type === 'coding_session') s.totalCodingSessions++;
  if (type === 'shared_link') s.totalSharedLinks++;

  s.lastInteraction = new Date().toISOString();
  updateStreak();
  save();
}

export function getBondLevel(): number {
  return loadBond().level;
}

export function getBondTier(): 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'nakama' {
  const level = getBondLevel();
  if (level < 10) return 'stranger';
  if (level < 30) return 'acquaintance';
  if (level < 60) return 'friend';
  if (level < 85) return 'close_friend';
  return 'nakama';
}

export function getDaysKnown(): number {
  const s = loadBond();
  const first = new Date(s.firstMet).getTime();
  return Math.max(1, Math.floor((Date.now() - first) / 86400000));
}

export function getBondStats(): BondState & { tier: string; daysKnown: number } {
  const s = loadBond();
  return { ...s, tier: getBondTier(), daysKnown: getDaysKnown() };
}
