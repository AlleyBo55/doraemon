/**
 * Memory Decay System
 * 
 * Implements forgetting curve for:
 * - Harmful patterns (fast decay)
 * - Unused memories (gradual decay)
 * - Reinforced memories (slow decay)
 */

import { MemoryEntry } from './types.js';

interface DecayMetadata {
  entryId: string;
  baseStrength: number;
  currentStrength: number;
  accessCount: number;
  lastAccess: number;
  decayRate: number;
  createdAt: number;
}

const decayMetadata: Map<string, DecayMetadata> = new Map();

const BASE_DECAY_RATE = 0.95;
const HARMFUL_DECAY_RATE = 0.5;
const REINFORCED_DECAY_RATE = 0.99;
const MIN_STRENGTH = 0.1;
const DECAY_INTERVAL_HOURS = 24;

export function initializeDecay(entry: MemoryEntry, customDecayRate?: number): void {
  const decayRate = customDecayRate || getDefaultDecayRate(entry);
  
  decayMetadata.set(entry.id, {
    entryId: entry.id,
    baseStrength: 1.0,
    currentStrength: 1.0,
    accessCount: 0,
    lastAccess: Date.now(),
    decayRate,
    createdAt: Date.now(),
  });
}

function getDefaultDecayRate(entry: MemoryEntry): number {
  if (entry.classification === 'restricted') {
    return HARMFUL_DECAY_RATE;
  }
  
  if (entry.source === 'explicit_teaching') {
    return REINFORCED_DECAY_RATE;
  }
  
  const categoryRates: Record<string, number> = {
    preference: 0.99,
    skill: 0.98,
    correction: 0.97,
    learning: 0.95,
    interaction: 0.90,
    pattern: 0.85,
    context: 0.80,
  };
  
  return categoryRates[entry.category] || BASE_DECAY_RATE;
}

export function recordAccess(entryId: string): void {
  const meta = decayMetadata.get(entryId);
  if (!meta) return;
  
  meta.accessCount++;
  meta.lastAccess = Date.now();
  
  const reinforcement = Math.min(0.1, meta.accessCount * 0.01);
  meta.currentStrength = Math.min(1.0, meta.currentStrength + reinforcement);
  
  if (meta.accessCount > 5) {
    meta.decayRate = Math.min(REINFORCED_DECAY_RATE, meta.decayRate * 1.01);
  }
}

export function applyDecay(): { decayed: string[]; removed: string[] } {
  const now = Date.now();
  const decayed: string[] = [];
  const removed: string[] = [];
  
  for (const [entryId, meta] of decayMetadata.entries()) {
    const hoursSinceLastAccess = (now - meta.lastAccess) / (1000 * 60 * 60);
    const decayCycles = Math.floor(hoursSinceLastAccess / DECAY_INTERVAL_HOURS);
    
    if (decayCycles > 0) {
      const oldStrength = meta.currentStrength;
      meta.currentStrength *= Math.pow(meta.decayRate, decayCycles);
      
      if (meta.currentStrength < oldStrength) {
        decayed.push(entryId);
      }
      
      if (meta.currentStrength < MIN_STRENGTH) {
        removed.push(entryId);
        decayMetadata.delete(entryId);
      }
    }
  }
  
  return { decayed, removed };
}

export function getStrength(entryId: string): number {
  const meta = decayMetadata.get(entryId);
  return meta?.currentStrength || 0;
}

export function setDecayRate(entryId: string, rate: number): void {
  const meta = decayMetadata.get(entryId);
  if (meta) {
    meta.decayRate = Math.max(0.1, Math.min(1.0, rate));
  }
}

export function getDecayStats(): {
  totalTracked: number;
  avgStrength: number;
  weakMemories: number;
  strongMemories: number;
} {
  const entries = [...decayMetadata.values()];
  
  if (entries.length === 0) {
    return { totalTracked: 0, avgStrength: 0, weakMemories: 0, strongMemories: 0 };
  }
  
  const avgStrength = entries.reduce((sum, e) => sum + e.currentStrength, 0) / entries.length;
  const weakMemories = entries.filter(e => e.currentStrength < 0.3).length;
  const strongMemories = entries.filter(e => e.currentStrength > 0.8).length;
  
  return {
    totalTracked: entries.length,
    avgStrength,
    weakMemories,
    strongMemories,
  };
}

export function pruneWeakMemories(threshold: number = MIN_STRENGTH): string[] {
  const toRemove: string[] = [];
  
  for (const [entryId, meta] of decayMetadata.entries()) {
    if (meta.currentStrength < threshold) {
      toRemove.push(entryId);
      decayMetadata.delete(entryId);
    }
  }
  
  return toRemove;
}
