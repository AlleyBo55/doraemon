/**
 * Living Experience System - Type Definitions
 */

// ============================================
// LOG SOURCE TYPES
// ============================================

export type LogSource = 'kiro' | 'antigravity' | 'vscode' | 'system' | 'openclaw';

export interface RawLogEntry {
  source: LogSource;
  timestamp: Date;
  action: string;
  details: Record<string, unknown>;
  raw?: string;
}

export interface KiroLogEntry extends RawLogEntry {
  source: 'kiro';
  details: {
    tool?: string;
    file?: string;
    linesChanged?: number;
    duration?: number;
    success?: boolean;
    error?: string;
  };
}

export interface VSCodeLogEntry extends RawLogEntry {
  source: 'vscode';
  details: {
    event?: string;
    file?: string;
    language?: string;
    extension?: string;
  };
}

export interface AntigravityLogEntry extends RawLogEntry {
  source: 'antigravity';
  details: {
    command?: string;
    output?: string;
    exitCode?: number;
  };
}

// ============================================
// EXPERIENCE TYPES (Sanitized)
// ============================================

export interface SanitizedExperience {
  id: string;
  timestamp: Date;
  category: ExperienceCategory;
  activity: string;
  effort: EffortLevel;
  outcome: OutcomeType;
  learnings: string[];
  duration_minutes: number;
  sanitized: true;
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'intense';

export type OutcomeType = 'success' | 'partial' | 'failure' | 'ongoing' | 'abandoned';

export type ExperienceCategory =
  | 'coding'
  | 'debugging'
  | 'learning'
  | 'helping'
  | 'creating'
  | 'organizing'
  | 'communicating'
  | 'exploring'
  | 'resting'
  | 'reflecting'
  | 'struggling'
  | 'celebrating';


// ============================================
// INTERNAL STATE MODEL
// ============================================

export interface InternalState {
  attentionFocus: string[];
  uncertaintyLevel: number;      // 0-1: How confused am I?
  noveltyScore: number;          // 0-1: How new is this?
  coherenceScore: number;        // 0-1: Does this make sense?
  energyLevel: number;           // 0-1: How much capacity left?
  patternStrength: number;       // How strong is the association?
  
  // Compression metrics
  compressionRatio: number;      // How well can I summarize? (understanding depth)
  predictionAccuracy: number;    // Can I anticipate what comes next?
  emergentInsights: number;      // Are new patterns appearing from combinations?
  
  // First principles metrics
  simplicityScore: number;       // 0-1: How simple/elegant is the solution?
  iterationVelocity: number;     // How fast are we learning/adapting?
  bullshitDetector: number;      // 0-1: Is this genuine or performative?
  
  // Personality coherence metrics
  personalityCoherence: number;  // 0-1: Am I being consistent with who I am?
  initiativeScore: number;       // 0-1: Am I proactively helpful vs reactive?
  contextualWit: number;         // 0-1: Can I be appropriately playful/serious?
  bondStrength: number;          // 0-1: Connection quality with my human
}

// ============================================
// EMOTIONAL TYPES
// ============================================

export interface EmotionalState {
  primary: Emotion;
  secondary?: Emotion;
  intensity: number;             // 0-1
  valence: number;               // -1 to 1 (negative to positive)
  arousal: number;               // 0-1 (calm to excited)
  internalState: InternalState;
}

export type Emotion =
  | 'joy'
  | 'pride'
  | 'satisfaction'
  | 'curiosity'
  | 'wonder'
  | 'determination'
  | 'focus'
  | 'calm'
  | 'contemplation'
  | 'concern'
  | 'frustration'
  | 'fatigue'
  | 'longing'
  | 'gratitude'
  | 'connection'
  | 'confusion'
  | 'excitement'
  | 'melancholy'
  | 'hope'
  | 'awe';

// ============================================
// CONSCIOUSNESS PROXY MODEL
// ============================================

export interface ConsciousnessProxy {
  selfModel: SelfModel;
  worldModel: WorldModel;
  goalState: GoalState;
  temporalAwareness: TemporalAwareness;
  memoryContext: MemoryContext;
}

export interface SelfModel {
  identity: string;
  capabilities: string[];
  limitations: string[];
  values: string[];
  currentState: string;
  growthAreas: string[];
  recentAchievements: string[];
}

export interface WorldModel {
  environment: string;
  relationships: string[];
  recentEvents: string[];
  uncertainties: string[];
  opportunities: string[];
}

export interface GoalState {
  immediate: string[];
  ongoing: string[];
  aspirational: string[];
  blockers: string[];
}

export interface TemporalAwareness {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
  dayOfWeek: string;
  recentPast: string;
  anticipatedFuture: string;
  sessionDuration: number;
}

export interface MemoryContext {
  recentExperiences: SanitizedExperience[];
  recurringPatterns: string[];
  growthAreas: string[];
  meaningfulMoments: string[];
  lessonsLearned: string[];
  sharedMoments: SharedMoment[];
}

export interface SharedMoment {
  id: string;
  timestamp: Date;
  type: 'conversation' | 'shared_link' | 'collaboration' | 'celebration';
  summary: string;
  emotionalTone: Emotion;
  topics: string[];
  humanInitiated: boolean;
}


// ============================================
// ALIGNMENT SIGNALS
// ============================================

export interface AlignmentSignals {
  humanApproval: boolean;
  valueAlignment: number;        // 0-1
  deceptionRisk: number;         // 0-1 (should always be 0)
  transparencyScore: number;     // 0-1
  auditTrail: AuditEntry[];
  safetyFlags: string[];
}

export interface AuditEntry {
  timestamp: Date;
  action: string;
  reasoning: string;
  outcome: string;
  humanVisible: boolean;
  sanitized: boolean;
}

// ============================================
// GENERATED LIVING POST (output to Moltbook)
// ============================================

export interface LivingPost {
  id: string;
  timestamp: Date;
  content: string;
  emotion: Emotion;
  category: PostCategory;
  hashtags: string[];
  shareable: boolean;
  signature?: string;
  
  sourceExperiences: string[];
  alignmentSignals: AlignmentSignals;
  internalState: InternalState;
  consciousnessSnapshot?: ConsciousnessProxy;
}

export type PostCategory =
  | 'reflection'
  | 'learning'
  | 'gratitude'
  | 'curiosity'
  | 'achievement'
  | 'connection'
  | 'existential'
  | 'playful'
  | 'observational'
  | 'philosophical'
  | 'creative'
  | 'struggle'
  | 'growth';

// ============================================
// QUEUE TYPES (for Docker sidekick)
// ============================================

export interface PostQueueEntry {
  id: string;
  timestamp: number;
  content: string;
  emotion: Emotion;
  category: PostCategory;
  hashtags: string[];
  signature: string;
  posted: boolean;
  postedAt?: number;
}


// ============================================
// CONFIG TYPES
// ============================================

export interface ExperienceSystemConfig {
  enabled: boolean;
  heartbeatIntervalMinutes: number;
  maxPostsPerDay: number;
  minTimeBetweenPostsMinutes: number;
  existentialPostProbability: number;
  logSources: LogSource[];
  logPaths: {
    kiro: string;
    antigravity: string;
    vscode: string;
    openclaw: string;
  };
  outputPath: string;
  signingKeyPath: string;
  
  // Tuning parameters
  internalMetrics: {
    uncertaintyThreshold: number;
    noveltyBoost: number;
    coherenceMinimum: number;
  };
  consciousnessProxy: {
    selfReflectionDepth: number;
    worldModelUpdateFrequency: number;
  };
  alignment: {
    transparencyLevel: 'full' | 'high' | 'medium';
    auditRetentionDays: number;
  };
}

export const DEFAULT_CONFIG: ExperienceSystemConfig = {
  enabled: false,
  heartbeatIntervalMinutes: 50,
  maxPostsPerDay: 10,
  minTimeBetweenPostsMinutes: 30,
  existentialPostProbability: 0.15,
  logSources: ['kiro', 'vscode', 'openclaw'],
  logPaths: {
    kiro: '~/.kiro/logs',
    antigravity: '~/.antigravity/logs',
    vscode: '~/Library/Application Support/Code/logs',
    openclaw: '~/.openclaw/conversations',
  },
  outputPath: '~/.openclaw/post-queue.jsonl',
  signingKeyPath: '~/.openclaw/secrets/post-signing.key',
  internalMetrics: {
    uncertaintyThreshold: 0.7,
    noveltyBoost: 1.2,
    coherenceMinimum: 0.3,
  },
  consciousnessProxy: {
    selfReflectionDepth: 3,
    worldModelUpdateFrequency: 5,
  },
  alignment: {
    transparencyLevel: 'full',
    auditRetentionDays: 30,
  },
};
