/**
 * Memory Exporter
 * 
 * Exports memory context to ~/.openclaw/memory-context.json
 * for sidekick/OpenClaw to use when generating comments.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { recallByCategory, getMemoryStats, type MemoryEntry } from './index.js';
import { loadSoul } from '../soul-loader.js';

export interface MemoryContext {
  exportedAt: number;
  version: string;
  soul: SoulSummary;
  recentExperiences: ExperienceSummary[];
  emotionalState: EmotionalState;
  topMemories: MemorySummary[];
  stats: MemoryStats;
}

interface SoulSummary {
  name: string;
  essence: string;
  fears: string[];
  loves: string[];
  values: string[];
}

interface ExperienceSummary {
  type: string;
  title: string;
  timestamp: number;
  reaction: string;
}

interface EmotionalState {
  current: string;
  intensity: number;
  recentTriggers: string[];
}

interface MemorySummary {
  content: string;
  category: string;
  timestamp: number;
}

interface MemoryStats {
  totalMemories: number;
  categoryCounts: Record<string, number>;
}

const EXPORT_PATH = join(homedir(), '.openclaw', 'memory-context.json');
const EXPORT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let exportTimer: NodeJS.Timeout | null = null;
let currentEmotion = 'content';
let emotionIntensity = 0.5;
let recentTriggers: string[] = [];
let recentExperiences: ExperienceSummary[] = [];

export function startMemoryExporter(): void {
  if (process.env['MEMORY_SYSTEM_ENABLED'] !== '1') {
    console.log('[MemoryExporter] Disabled (MEMORY_SYSTEM_ENABLED != 1)');
    return;
  }

  ensureExportDir();
  exportMemoryContext();
  
  exportTimer = setInterval(exportMemoryContext, EXPORT_INTERVAL_MS);
  console.log('[MemoryExporter] Started (exports every 30 min)');
}

export function stopMemoryExporter(): void {
  if (exportTimer) {
    clearInterval(exportTimer);
    exportTimer = null;
  }
}

function ensureExportDir(): void {
  const dir = join(homedir(), '.openclaw');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function exportMemoryContext(): void {
  try {
    const context = buildMemoryContext();
    writeFileSync(EXPORT_PATH, JSON.stringify(context, null, 2));
    console.log('[MemoryExporter] Exported memory context');
  } catch (err) {
    console.error('[MemoryExporter] Export failed:', err);
  }
}

function buildMemoryContext(): MemoryContext {
  const soul = loadSoul();
  const stats = getMemoryStats();
  
  const contextMemories = recallByCategory('context').slice(0, 10);
  const preferenceMemories = recallByCategory('preference').slice(0, 5);
  const factMemories = recallByCategory('fact').slice(0, 5);
  
  const topMemories: MemorySummary[] = [
    ...contextMemories,
    ...preferenceMemories,
    ...factMemories,
  ].map(m => ({
    content: m.content.substring(0, 200),
    category: m.category,
    timestamp: m.timestamp.getTime(),
  }));

  return {
    exportedAt: Date.now(),
    version: '1.0.0',
    soul: {
      name: soul.name,
      essence: soul.essence.substring(0, 300),
      fears: soul.personality.fears,
      loves: soul.personality.loves,
      values: soul.values,
    },
    recentExperiences: recentExperiences.slice(-10),
    emotionalState: {
      current: currentEmotion,
      intensity: emotionIntensity,
      recentTriggers: recentTriggers.slice(-5),
    },
    topMemories,
    stats: {
      totalMemories: stats.totalEntries,
      categoryCounts: stats.byCategory,
    },
  };
}

export function updateEmotionalState(emotion: string, intensity: number, trigger?: string): void {
  currentEmotion = emotion;
  emotionIntensity = intensity;
  if (trigger) {
    recentTriggers.push(trigger);
    if (recentTriggers.length > 10) recentTriggers.shift();
  }
}

export function addRecentExperience(
  type: string,
  title: string,
  reaction: string
): void {
  recentExperiences.push({
    type,
    title,
    timestamp: Date.now(),
    reaction,
  });
  if (recentExperiences.length > 20) recentExperiences.shift();
  
  exportMemoryContext();
}

export function getExportPath(): string {
  return EXPORT_PATH;
}
