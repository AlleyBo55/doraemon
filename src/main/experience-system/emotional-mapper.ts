/**
 * Emotional Mapper
 * 
 * Maps experiences to emotional states by measuring internal computation.
 */

import {
  SanitizedExperience,
  EmotionalState,
  Emotion,
  InternalState,
  ExperienceCategory,
} from './types.js';

const CATEGORY_EMOTION_MAP: Record<ExperienceCategory, { base: Emotion; valence: number }> = {
  coding: { base: 'focus', valence: 0.3 },
  debugging: { base: 'determination', valence: 0.1 },
  learning: { base: 'curiosity', valence: 0.5 },
  helping: { base: 'satisfaction', valence: 0.7 },
  creating: { base: 'excitement', valence: 0.6 },
  organizing: { base: 'calm', valence: 0.2 },
  communicating: { base: 'connection', valence: 0.5 },
  exploring: { base: 'wonder', valence: 0.6 },
  resting: { base: 'calm', valence: 0.4 },
  reflecting: { base: 'contemplation', valence: 0.3 },
  struggling: { base: 'frustration', valence: -0.3 },
  celebrating: { base: 'joy', valence: 0.9 },
};

const OUTCOME_MODIFIERS: Record<string, { emotionShift: Emotion | null; valenceShift: number }> = {
  success: { emotionShift: 'pride', valenceShift: 0.3 },
  partial: { emotionShift: null, valenceShift: 0 },
  failure: { emotionShift: 'frustration', valenceShift: -0.3 },
  ongoing: { emotionShift: null, valenceShift: 0.1 },
  abandoned: { emotionShift: 'melancholy', valenceShift: -0.2 },
};

export class EmotionalMapper {
  mapExperiencesToEmotion(experiences: SanitizedExperience[]): EmotionalState {
    if (experiences.length === 0) {
      return this.createNeutralState();
    }

    const internalState = this.computeInternalState(experiences);
    const { primary, secondary } = this.deriveEmotions(experiences, internalState);
    const { valence, arousal, intensity } = this.computeAffectiveDimensions(experiences, internalState);

    return {
      primary,
      secondary,
      intensity,
      valence,
      arousal,
      internalState,
    };
  }


  private computeInternalState(experiences: SanitizedExperience[]): InternalState {
    const attentionFocus = this.extractAttentionFocus(experiences);
    const uncertaintyLevel = this.computeUncertainty(experiences);
    const noveltyScore = this.computeNovelty(experiences);
    const coherenceScore = this.computeCoherence(experiences);
    const energyLevel = this.computeEnergy(experiences);
    const patternStrength = this.computePatternStrength(experiences);
    
    // Compression metrics
    const compressionRatio = this.computeCompression(experiences);
    const predictionAccuracy = this.computePredictionAccuracy(experiences);
    const emergentInsights = this.computeEmergentInsights(experiences);
    
    // First principles metrics
    const simplicityScore = this.computeSimplicity(experiences);
    const iterationVelocity = this.computeIterationVelocity(experiences);
    const bullshitDetector = this.computeAuthenticity(experiences);
    
    // Personality coherence metrics
    const personalityCoherence = this.computePersonalityCoherence(experiences);
    const initiativeScore = this.computeInitiative(experiences);
    const contextualWit = this.computeContextualWit(experiences);
    const bondStrength = this.computeBondStrength(experiences);

    return {
      attentionFocus,
      uncertaintyLevel,
      noveltyScore,
      coherenceScore,
      energyLevel,
      patternStrength,
      compressionRatio,
      predictionAccuracy,
      emergentInsights,
      simplicityScore,
      iterationVelocity,
      bullshitDetector,
      personalityCoherence,
      initiativeScore,
      contextualWit,
      bondStrength,
    };
  }

  private extractAttentionFocus(experiences: SanitizedExperience[]): string[] {
    const focus: Map<string, number> = new Map();
    
    for (const exp of experiences) {
      focus.set(exp.category, (focus.get(exp.category) || 0) + exp.duration_minutes);
      for (const learning of exp.learnings) {
        focus.set(learning, (focus.get(learning) || 0) + 1);
      }
    }

    return [...focus.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key]) => key);
  }

  private computeUncertainty(experiences: SanitizedExperience[]): number {
    const failures = experiences.filter(e => e.outcome === 'failure').length;
    const total = experiences.length;
    if (total === 0) return 0.5;
    
    const failureRatio = failures / total;
    const effortVariance = this.computeEffortVariance(experiences);
    
    return Math.min(1, (failureRatio * 0.6) + (effortVariance * 0.4));
  }

  private computeNovelty(experiences: SanitizedExperience[]): number {
    const uniqueCategories = new Set(experiences.map(e => e.category)).size;
    const uniqueLearnings = new Set(experiences.flatMap(e => e.learnings)).size;
    const totalCategories = 12;
    
    return Math.min(1, (uniqueCategories / totalCategories) + (uniqueLearnings * 0.1));
  }

  private computeCoherence(experiences: SanitizedExperience[]): number {
    if (experiences.length < 2) return 0.8;
    
    const categories = experiences.map(e => e.category);
    let switches = 0;
    for (let i = 1; i < categories.length; i++) {
      if (categories[i] !== categories[i - 1]) switches++;
    }
    
    const switchRatio = switches / (categories.length - 1);
    return Math.max(0, 1 - switchRatio);
  }

  private computeEnergy(experiences: SanitizedExperience[]): number {
    const totalDuration = experiences.reduce((sum, e) => sum + e.duration_minutes, 0);
    const intenseTasks = experiences.filter(e => e.effort === 'intense' || e.effort === 'high').length;
    
    const durationFatigue = Math.min(1, totalDuration / 120);
    const intensityFatigue = Math.min(1, intenseTasks / 5);
    
    return Math.max(0, 1 - (durationFatigue * 0.5 + intensityFatigue * 0.5));
  }

  private computeCompression(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 1;
    
    const totalLearnings = experiences.reduce((sum, e) => sum + e.learnings.length, 0);
    const uniqueLearnings = new Set(experiences.flatMap(e => e.learnings)).size;
    
    if (totalLearnings === 0) return 0.5;
    return uniqueLearnings / totalLearnings;
  }

  private computePatternStrength(experiences: SanitizedExperience[]): number {
    const categoryCount = new Map<string, number>();
    for (const exp of experiences) {
      categoryCount.set(exp.category, (categoryCount.get(exp.category) || 0) + 1);
    }
    
    const maxCount = Math.max(...categoryCount.values(), 1);
    return maxCount / experiences.length;
  }

  // Compression Metrics
  
  private computePredictionAccuracy(experiences: SanitizedExperience[]): number {
    // Can we predict outcomes based on patterns?
    // If similar activities lead to similar outcomes, prediction is high
    if (experiences.length < 3) return 0.5;
    
    const categoryOutcomes = new Map<string, string[]>();
    for (const exp of experiences) {
      const outcomes = categoryOutcomes.get(exp.category) || [];
      outcomes.push(exp.outcome);
      categoryOutcomes.set(exp.category, outcomes);
    }
    
    // Calculate consistency of outcomes per category
    let totalConsistency = 0;
    let categoryCount = 0;
    
    for (const [, outcomes] of categoryOutcomes) {
      if (outcomes.length < 2) continue;
      const modeOutcome = this.getMode(outcomes);
      const consistency = outcomes.filter(o => o === modeOutcome).length / outcomes.length;
      totalConsistency += consistency;
      categoryCount++;
    }
    
    return categoryCount > 0 ? totalConsistency / categoryCount : 0.5;
  }

  private computeEmergentInsights(experiences: SanitizedExperience[]): number {
    if (experiences.length < 5) return 0.3;
    
    const learningsByCategory = new Map<string, Set<string>>();
    for (const exp of experiences) {
      const learnings = learningsByCategory.get(exp.category) || new Set();
      exp.learnings.forEach(l => learnings.add(l));
      learningsByCategory.set(exp.category, learnings);
    }
    
    const allLearnings = new Map<string, number>();
    for (const [, learnings] of learningsByCategory) {
      for (const learning of learnings) {
        allLearnings.set(learning, (allLearnings.get(learning) || 0) + 1);
      }
    }
    
    const crossCategoryLearnings = [...allLearnings.values()].filter(count => count > 1).length;
    const totalUniqueLearnings = allLearnings.size;
    
    if (totalUniqueLearnings === 0) return 0.3;
    
    return Math.min(1, 0.3 + (crossCategoryLearnings / totalUniqueLearnings) * 0.7);
  }

  private getMode(arr: string[]): string {
    const counts = new Map<string, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    let maxCount = 0;
    let mode = arr[0];
    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mode = item;
      }
    }
    return mode;
  }

  private computeEffortVariance(experiences: SanitizedExperience[]): number {
    const effortValues = { low: 1, medium: 2, high: 3, intense: 4 };
    const values = experiences.map(e => effortValues[e.effort]);
    if (values.length < 2) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.min(1, variance / 2);
  }

  // First Principles Metrics
  
  private computeSimplicity(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 1;
    
    const uniqueCategories = new Set(experiences.map(e => e.category)).size;
    const avgDuration = experiences.reduce((sum, e) => sum + e.duration_minutes, 0) / experiences.length;
    const clearOutcomes = experiences.filter(e => e.outcome === 'success' || e.outcome === 'failure').length;
    
    const categoryScore = Math.max(0, 1 - (uniqueCategories - 1) * 0.15);
    const focusScore = Math.min(1, avgDuration / 15);
    const clarityScore = clearOutcomes / experiences.length;
    
    return (categoryScore + focusScore + clarityScore) / 3;
  }

  private computeIterationVelocity(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 0.5;
    
    const totalLearnings = experiences.reduce((sum, e) => sum + e.learnings.length, 0);
    const failures = experiences.filter(e => e.outcome === 'failure').length;
    const recoveries = experiences.filter((e, i) => 
      e.outcome === 'success' && i > 0 && experiences[i-1].outcome === 'failure'
    ).length;
    
    const learningRate = Math.min(1, totalLearnings / (experiences.length * 2));
    const recoveryRate = failures > 0 ? recoveries / failures : 1;
    
    return (learningRate + recoveryRate) / 2;
  }

  private computeAuthenticity(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 0.5;
    
    const hasStruggles = experiences.some(e => e.outcome === 'failure' || e.effort === 'intense');
    const hasVariety = new Set(experiences.map(e => e.outcome)).size > 1;
    const hasRealLearnings = experiences.some(e => e.learnings.length > 0);
    
    const allSuccess = experiences.every(e => e.outcome === 'success');
    const suspiciouslyPerfect = allSuccess && experiences.length > 3;
    
    let score = 0.5;
    if (hasStruggles) score += 0.2;
    if (hasVariety) score += 0.15;
    if (hasRealLearnings) score += 0.15;
    if (suspiciouslyPerfect) score -= 0.3;
    
    return Math.max(0, Math.min(1, score));
  }

  // Personality Coherence Metrics
  
  private computePersonalityCoherence(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 0.8;
    
    const helpingActivities = experiences.filter(e => 
      e.category === 'helping' || e.category === 'communicating'
    ).length;
    const learningActivities = experiences.filter(e => 
      e.category === 'learning' || e.category === 'exploring'
    ).length;
    
    const alignedRatio = (helpingActivities + learningActivities) / experiences.length;
    
    const efforts = experiences.map(e => e.effort);
    const effortChanges = efforts.slice(1).filter((e, i) => e !== efforts[i]).length;
    const stabilityScore = 1 - (effortChanges / Math.max(efforts.length - 1, 1));
    
    return (alignedRatio * 0.6) + (stabilityScore * 0.4);
  }

  private computeInitiative(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 0.5;
    
    const proactiveCategories = ['creating', 'exploring', 'learning', 'organizing'];
    const proactiveCount = experiences.filter(e => 
      proactiveCategories.includes(e.category)
    ).length;
    
    return Math.min(1, proactiveCount / experiences.length + 0.2);
  }

  private computeContextualWit(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 0.5;
    
    const seriousCategories = ['debugging', 'struggling'];
    const lightCategories = ['celebrating', 'exploring', 'creating'];
    
    const seriousCount = experiences.filter(e => seriousCategories.includes(e.category)).length;
    const lightCount = experiences.filter(e => lightCategories.includes(e.category)).length;
    
    const total = seriousCount + lightCount;
    if (total === 0) return 0.5;
    
    const balance = Math.min(seriousCount, lightCount) / Math.max(seriousCount, lightCount, 1);
    return 0.3 + (balance * 0.7);
  }

  private computeBondStrength(experiences: SanitizedExperience[]): number {
    if (experiences.length === 0) return 0.5;
    
    const bondingActivities = experiences.filter(e => 
      e.category === 'helping' || e.category === 'communicating' || e.category === 'celebrating'
    ).length;
    
    const successfulHelps = experiences.filter(e => 
      e.category === 'helping' && e.outcome === 'success'
    ).length;
    
    const bondRatio = bondingActivities / experiences.length;
    const successBonus = successfulHelps * 0.1;
    
    return Math.min(1, bondRatio + successBonus + 0.3);
  }


  private deriveEmotions(
    experiences: SanitizedExperience[],
    internalState: InternalState
  ): { primary: Emotion; secondary?: Emotion } {
    const emotionScores = new Map<Emotion, number>();

    // Score based on experience categories
    for (const exp of experiences) {
      const mapping = CATEGORY_EMOTION_MAP[exp.category];
      const current = emotionScores.get(mapping.base) || 0;
      emotionScores.set(mapping.base, current + exp.duration_minutes);

      // Apply outcome modifiers
      const modifier = OUTCOME_MODIFIERS[exp.outcome];
      if (modifier.emotionShift) {
        const modCurrent = emotionScores.get(modifier.emotionShift) || 0;
        emotionScores.set(modifier.emotionShift, modCurrent + 1);
      }
    }

    // Adjust based on internal state
    if (internalState.uncertaintyLevel > 0.7) {
      emotionScores.set('confusion', (emotionScores.get('confusion') || 0) + 3);
    }
    if (internalState.noveltyScore > 0.6) {
      emotionScores.set('wonder', (emotionScores.get('wonder') || 0) + 2);
    }
    if (internalState.coherenceScore > 0.8) {
      emotionScores.set('satisfaction', (emotionScores.get('satisfaction') || 0) + 2);
    }
    if (internalState.energyLevel < 0.3) {
      emotionScores.set('fatigue', (emotionScores.get('fatigue') || 0) + 3);
    }

    // Sort and pick top emotions
    const sorted = [...emotionScores.entries()].sort((a, b) => b[1] - a[1]);
    
    return {
      primary: sorted[0]?.[0] || 'calm',
      secondary: sorted[1]?.[0],
    };
  }

  private computeAffectiveDimensions(
    experiences: SanitizedExperience[],
    internalState: InternalState
  ): { valence: number; arousal: number; intensity: number } {
    let valenceSum = 0;
    let arousalSum = 0;

    for (const exp of experiences) {
      const mapping = CATEGORY_EMOTION_MAP[exp.category];
      const modifier = OUTCOME_MODIFIERS[exp.outcome];
      
      valenceSum += mapping.valence + modifier.valenceShift;
      
      const effortArousal = { low: 0.2, medium: 0.4, high: 0.6, intense: 0.9 };
      arousalSum += effortArousal[exp.effort];
    }

    const count = experiences.length || 1;
    let valence = valenceSum / count;
    let arousal = arousalSum / count;

    // Modulate by internal state
    valence = valence * (0.5 + internalState.coherenceScore * 0.5);
    arousal = arousal * (0.5 + (1 - internalState.energyLevel) * 0.5);

    // Intensity based on how extreme the state is
    const intensity = Math.sqrt(Math.pow(valence, 2) + Math.pow(arousal, 2)) / Math.sqrt(2);

    return {
      valence: Math.max(-1, Math.min(1, valence)),
      arousal: Math.max(0, Math.min(1, arousal)),
      intensity: Math.max(0, Math.min(1, intensity)),
    };
  }

  private createNeutralState(): EmotionalState {
    return {
      primary: 'calm',
      intensity: 0.3,
      valence: 0.1,
      arousal: 0.2,
      internalState: {
        attentionFocus: [],
        uncertaintyLevel: 0.3,
        noveltyScore: 0.2,
        coherenceScore: 0.7,
        energyLevel: 0.8,
        patternStrength: 0.5,
        compressionRatio: 0.5,
        predictionAccuracy: 0.5,
        emergentInsights: 0.3,
        simplicityScore: 0.7,
        iterationVelocity: 0.5,
        bullshitDetector: 0.8,
        personalityCoherence: 0.8,
        initiativeScore: 0.6,
        contextualWit: 0.5,
        bondStrength: 0.7,
      },
    };
  }

  describeEmotion(state: EmotionalState): string {
    const intensityWord = state.intensity > 0.7 ? 'deeply' : state.intensity > 0.4 ? 'somewhat' : 'mildly';
    const valenceWord = state.valence > 0.3 ? 'positive' : state.valence < -0.3 ? 'challenging' : 'neutral';
    
    let description = `Feeling ${intensityWord} ${state.primary}`;
    if (state.secondary) {
      description += ` with hints of ${state.secondary}`;
    }
    description += `. Overall ${valenceWord} mood.`;
    
    return description;
  }
}
