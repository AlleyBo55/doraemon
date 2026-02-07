/**
 * Habit Tracker
 *
 * Builds a frequency model from coding activity buffer events.
 * Tracks: languages by hour, commit cadence, break patterns, session starts.
 * No LLM calls — pure local histogram.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface HourBucket {
  hour: number;
  activities: number;
  commits: number;
  languages: Record<string, number>;
}

export interface HabitProfile {
  hourly: HourBucket[];
  avgSessionStartHour: number;
  avgCommitIntervalMin: number;
  typicalBreakHour: number;
  topLanguages: string[];
  totalDaysTracked: number;
  lastUpdated: string;
}

interface RawEvent {
  hour: number;
  language?: string;
  isCommit: boolean;
  timestamp: number;
}

const HABIT_FILE = '.doraemon-habits.json';
const MAX_EVENTS = 5000;

let events: RawEvent[] = [];
let profile: HabitProfile | null = null;
let dirty = false;

function getHabitPath(): string {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return path.join(home, HABIT_FILE);
}

export function loadHabits(): HabitProfile {
  if (profile) return profile;

  try {
    const raw = JSON.parse(fs.readFileSync(getHabitPath(), 'utf-8'));
    events = raw.events || [];
    profile = raw.profile || buildProfile();
  } catch {
    events = [];
    profile = buildProfile();
  }

  return profile;
}

function saveHabits(): void {
  if (!dirty) return;
  try {
    fs.writeFileSync(getHabitPath(), JSON.stringify({ events: events.slice(-MAX_EVENTS), profile }, null, 2));
    dirty = false;
  } catch (err) {
    console.error('[HabitTracker] Failed to save:', err);
  }
}

export function recordCodingEvent(language?: string, isCommit = false): void {
  const now = new Date();
  events.push({
    hour: now.getHours(),
    language,
    isCommit,
    timestamp: Date.now(),
  });

  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS);
  }

  dirty = true;

  // Rebuild profile every 50 events
  if (events.length % 50 === 0) {
    profile = buildProfile();
    saveHabits();
  }
}

function buildProfile(): HabitProfile {
  const hourly: HourBucket[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    activities: 0,
    commits: 0,
    languages: {},
  }));

  const sessionStarts: number[] = [];
  let prevTimestamp = 0;
  const commitTimestamps: number[] = [];

  for (const ev of events) {
    const bucket = hourly[ev.hour];
    bucket.activities++;
    if (ev.isCommit) {
      bucket.commits++;
      commitTimestamps.push(ev.timestamp);
    }
    if (ev.language) {
      bucket.languages[ev.language] = (bucket.languages[ev.language] || 0) + 1;
    }

    // Detect session starts (gap > 30 min)
    if (prevTimestamp > 0 && ev.timestamp - prevTimestamp > 30 * 60 * 1000) {
      sessionStarts.push(ev.hour);
    }
    prevTimestamp = ev.timestamp;
  }

  // Average session start hour
  const avgSessionStartHour = sessionStarts.length > 0
    ? Math.round(sessionStarts.reduce((a, b) => a + b, 0) / sessionStarts.length)
    : 9;

  // Average commit interval
  let avgCommitIntervalMin = 120;
  if (commitTimestamps.length > 1) {
    const intervals: number[] = [];
    for (let i = 1; i < commitTimestamps.length; i++) {
      intervals.push((commitTimestamps[i] - commitTimestamps[i - 1]) / 60000);
    }
    avgCommitIntervalMin = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
  }

  // Find typical break hour (lowest activity in 10-18 range)
  const workHours = hourly.slice(10, 18);
  const minActivity = Math.min(...workHours.map(h => h.activities));
  const typicalBreakHour = workHours.find(h => h.activities === minActivity)?.hour || 12;

  // Top languages
  const langTotals = new Map<string, number>();
  for (const bucket of hourly) {
    for (const [lang, count] of Object.entries(bucket.languages)) {
      langTotals.set(lang, (langTotals.get(lang) || 0) + count);
    }
  }
  const topLanguages = [...langTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang);

  // Days tracked
  const uniqueDays = new Set(events.map(e => new Date(e.timestamp).toISOString().split('T')[0]));

  return {
    hourly,
    avgSessionStartHour,
    avgCommitIntervalMin,
    typicalBreakHour,
    topLanguages,
    totalDaysTracked: uniqueDays.size,
    lastUpdated: new Date().toISOString(),
  };
}

export function getHabitProfile(): HabitProfile {
  return loadHabits();
}

export function isTypicalCommitTime(): boolean {
  const p = loadHabits();
  if (p.avgCommitIntervalMin <= 0) return false;

  const lastCommit = [...events].reverse().find(e => e.isCommit);
  if (!lastCommit) return false;

  const minutesSinceCommit = (Date.now() - lastCommit.timestamp) / 60000;
  return minutesSinceCommit >= p.avgCommitIntervalMin * 0.9;
}

export function isNearSessionStart(): boolean {
  const p = loadHabits();
  const currentHour = new Date().getHours();
  return Math.abs(currentHour - p.avgSessionStartHour) <= 1;
}

export function isBreakTime(): boolean {
  const p = loadHabits();
  const currentHour = new Date().getHours();
  return currentHour === p.typicalBreakHour;
}

export function flushHabits(): void {
  profile = buildProfile();
  saveHabits();
}
