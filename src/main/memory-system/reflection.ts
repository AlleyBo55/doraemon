/**
 * Self-Reflection System
 * 
 * Implements:
 * - Daily memory review
 * - Pattern recognition
 * - Self-model updates
 * - Predictive memory
 * - Emergent goal formation
 */

import { MemoryEntry, MemoryCategory } from './types.js';
import { getStrength } from './decay.js';

export interface SelfModel {
  strengths: string[];
  weaknesses: string[];
  frequentTopics: string[];
  learningVelocity: number;
  helpfulnessScore: number;
  lastUpdated: Date;
}

export interface DailyInsight {
  date: string;
  memoriesReviewed: number;
  topCategories: Array<{ category: string; count: number }>;
  patterns: string[];
  selfModelUpdates: string[];
  predictedNeeds: string[];
  emergentGoals: string[];
}

export interface PredictedNeed {
  topic: string;
  confidence: number;
  basedOn: string;
  suggestedAction: string;
}

let selfModel: SelfModel = {
  strengths: [],
  weaknesses: [],
  frequentTopics: [],
  learningVelocity: 0,
  helpfulnessScore: 0.5,
  lastUpdated: new Date(),
};

const dailyInsights: DailyInsight[] = [];
const MAX_INSIGHTS = 30;

export function runDailyReflection(memories: MemoryEntry[]): DailyInsight {
  const today = new Date().toISOString().split('T')[0];
  
  const todayMemories = memories.filter(m => 
    m.timestamp.toISOString().split('T')[0] === today
  );
  
  const categoryCount = new Map<string, number>();
  const topicWords = new Map<string, number>();
  
  for (const mem of todayMemories) {
    categoryCount.set(mem.category, (categoryCount.get(mem.category) || 0) + 1);
    
    const words = mem.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4) {
        topicWords.set(word, (topicWords.get(word) || 0) + 1);
      }
    }
  }
  
  const topCategories = [...categoryCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));
  
  const patterns = detectPatterns(todayMemories);
  const selfModelUpdates = updateSelfModel(todayMemories, topCategories);
  const predictedNeeds = predictUserNeeds(memories);
  const emergentGoals = formEmergentGoals(memories, patterns);
  
  const insight: DailyInsight = {
    date: today,
    memoriesReviewed: todayMemories.length,
    topCategories,
    patterns,
    selfModelUpdates,
    predictedNeeds: predictedNeeds.map(p => p.topic),
    emergentGoals,
  };
  
  dailyInsights.push(insight);
  if (dailyInsights.length > MAX_INSIGHTS) {
    dailyInsights.shift();
  }
  
  return insight;
}

function detectPatterns(memories: MemoryEntry[]): string[] {
  const patterns: string[] = [];
  
  const hourCounts = new Array(24).fill(0);
  for (const mem of memories) {
    hourCounts[mem.timestamp.getHours()]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  if (hourCounts[peakHour] > 3) {
    patterns.push(`Most active around ${peakHour}:00`);
  }
  
  const categorySequence = memories.map(m => m.category);
  const transitions = new Map<string, number>();
  for (let i = 0; i < categorySequence.length - 1; i++) {
    const key = `${categorySequence[i]}->${categorySequence[i + 1]}`;
    transitions.set(key, (transitions.get(key) || 0) + 1);
  }
  const topTransition = [...transitions.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topTransition && topTransition[1] > 2) {
    patterns.push(`Common flow: ${topTransition[0].replace('->', ' → ')}`);
  }
  
  const strongMemories = memories.filter(m => getStrength(m.id) > 0.8);
  if (strongMemories.length > 0) {
    const strongCategories = [...new Set(strongMemories.map(m => m.category))];
    patterns.push(`Strong retention in: ${strongCategories.join(', ')}`);
  }
  
  return patterns;
}

function updateSelfModel(
  memories: MemoryEntry[],
  topCategories: Array<{ category: string; count: number }>
): string[] {
  const updates: string[] = [];
  
  if (topCategories.length > 0) {
    const topCategory = topCategories[0].category;
    if (!selfModel.strengths.includes(topCategory)) {
      selfModel.strengths.push(topCategory);
      updates.push(`Added "${topCategory}" to strengths`);
    }
  }
  
  const successRate = memories.filter(m => 
    m.content.toLowerCase().includes('success') ||
    m.content.toLowerCase().includes('helped') ||
    m.content.toLowerCase().includes('solved')
  ).length / Math.max(1, memories.length);
  
  selfModel.helpfulnessScore = selfModel.helpfulnessScore * 0.9 + successRate * 0.1;
  
  const previousVelocity = selfModel.learningVelocity;
  selfModel.learningVelocity = memories.length;
  
  if (selfModel.learningVelocity > previousVelocity * 1.5) {
    updates.push('Learning velocity increased significantly');
  }
  
  const frequentWords = new Map<string, number>();
  for (const mem of memories) {
    const words = mem.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 5) {
        frequentWords.set(word, (frequentWords.get(word) || 0) + 1);
      }
    }
  }
  
  const newTopics = [...frequentWords.entries()]
    .filter(([, count]) => count > 3)
    .map(([word]) => word)
    .filter(word => !selfModel.frequentTopics.includes(word));
  
  if (newTopics.length > 0) {
    selfModel.frequentTopics.push(...newTopics.slice(0, 3));
    updates.push(`New frequent topics: ${newTopics.slice(0, 3).join(', ')}`);
  }
  
  selfModel.lastUpdated = new Date();
  
  return updates;
}

export function predictUserNeeds(memories: MemoryEntry[]): PredictedNeed[] {
  const predictions: PredictedNeed[] = [];
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  
  const sameTimeMemories = memories.filter(m => {
    const memHour = m.timestamp.getHours();
    const memDay = m.timestamp.getDay();
    return Math.abs(memHour - currentHour) <= 1 && memDay === currentDay;
  });
  
  if (sameTimeMemories.length > 0) {
    const topicCounts = new Map<string, number>();
    for (const mem of sameTimeMemories) {
      topicCounts.set(mem.category, (topicCounts.get(mem.category) || 0) + 1);
    }
    
    const topTopic = [...topicCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topTopic && topTopic[1] > 2) {
      predictions.push({
        topic: topTopic[0],
        confidence: Math.min(0.9, topTopic[1] / sameTimeMemories.length),
        basedOn: `${topTopic[1]} similar activities at this time`,
        suggestedAction: `Prepare ${topTopic[0]} context`,
      });
    }
  }
  
  const recentCategories = memories
    .slice(-20)
    .map(m => m.category);
  
  const categorySequence = recentCategories.join(',');
  if (categorySequence.includes('learning,learning,learning')) {
    predictions.push({
      topic: 'break',
      confidence: 0.7,
      basedOn: 'Extended learning session detected',
      suggestedAction: 'Suggest a break or topic change',
    });
  }
  
  return predictions;
}

function formEmergentGoals(memories: MemoryEntry[], patterns: string[]): string[] {
  const goals: string[] = [];
  
  const weakCategories = ['skill', 'learning', 'pattern'].filter(cat => {
    const catMemories = memories.filter(m => m.category === cat);
    return catMemories.length < 5;
  });
  
  if (weakCategories.length > 0) {
    goals.push(`Improve knowledge in: ${weakCategories.join(', ')}`);
  }
  
  const correctionCount = memories.filter(m => m.category === 'correction').length;
  if (correctionCount > 5) {
    goals.push('Reduce errors by learning from corrections');
  }
  
  if (selfModel.helpfulnessScore < 0.5) {
    goals.push('Focus on being more helpful in interactions');
  }
  
  if (patterns.some(p => p.includes('Most active'))) {
    goals.push('Optimize responses during peak activity hours');
  }
  
  return goals;
}

export function getSelfModel(): SelfModel {
  return { ...selfModel };
}

export function getRecentInsights(days: number = 7): DailyInsight[] {
  return dailyInsights.slice(-days);
}

export function getEmergentGoals(): string[] {
  const recent = dailyInsights.slice(-7);
  const allGoals = recent.flatMap(i => i.emergentGoals);
  
  const goalCounts = new Map<string, number>();
  for (const goal of allGoals) {
    goalCounts.set(goal, (goalCounts.get(goal) || 0) + 1);
  }
  
  return [...goalCounts.entries()]
    .filter(([, count]) => count > 2)
    .sort((a, b) => b[1] - a[1])
    .map(([goal]) => goal);
}
