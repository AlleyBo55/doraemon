/**
 * Post Generator
 * 
 * Synthesizes experiences, emotions, and existential reflections
 * into shareable posts for Moltbook.
 */

import { createHash, randomBytes } from 'crypto';
import {
  LivingPost,
  PostCategory,
  SanitizedExperience,
  EmotionalState,
  AlignmentSignals,
  AuditEntry,
  ExperienceSystemConfig,
  DEFAULT_CONFIG,
  Emotion,
  SharedMoment,
} from './types.js';
import { ExperienceProcessor } from './experience-processor.js';
import { EmotionalMapper } from './emotional-mapper.js';
import { ExistentialLayer } from './existential-layer.js';
import { sanitizeContent } from './sanitizer.js';

export class PostGenerator {
  private config: ExperienceSystemConfig;
  private experienceProcessor: ExperienceProcessor;
  private emotionalMapper: EmotionalMapper;
  private existentialLayer: ExistentialLayer;
  private auditTrail: AuditEntry[] = [];
  private postsToday = 0;
  private lastPostTime = 0;

  constructor(config: Partial<ExperienceSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.experienceProcessor = new ExperienceProcessor(this.config);
    this.emotionalMapper = new EmotionalMapper();
    this.existentialLayer = new ExistentialLayer();
  }

  async generatePost(): Promise<LivingPost | null> {
    // Rate limiting
    if (!this.canGeneratePost()) {
      this.audit('rate_limited', 'Post generation blocked by rate limit', 'skipped');
      return null;
    }

    // Collect experiences from the heartbeat window
    const { experiences, sharedMoments } = await this.experienceProcessor.collectExperiences(
      this.config.heartbeatIntervalMinutes
    );

    // Map to emotional state
    const emotionalState = this.emotionalMapper.mapExperiencesToEmotion(experiences);

    // Update existential layer with shared moments
    this.existentialLayer.updateFromExperiences(experiences, emotionalState);
    this.existentialLayer.updateSharedMoments(sharedMoments);

    // Decide post type - more likely existential if we have shared moments
    const hasSharedMoments = sharedMoments.length > 0;
    const existentialProbability = hasSharedMoments 
      ? this.config.existentialPostProbability * 1.5 
      : this.config.existentialPostProbability;
    const isExistential = Math.random() < existentialProbability;
    
    // Generate content
    const content = isExistential
      ? this.existentialLayer.generateExistentialReflection(emotionalState)
      : hasSharedMoments
        ? this.generateSharedMomentPost(sharedMoments, emotionalState)
        : this.generateExperiencePost(experiences, emotionalState);

    // Sanitize final content
    const sanitized = sanitizeContent(content);
    if (!sanitized.safe) {
      this.audit('sanitization_blocked', 'Content failed sanitization', 'blocked');
      return null;
    }

    // Build the post
    const post = this.buildPost(
      sanitized.content,
      emotionalState,
      experiences,
      isExistential ? 'existential' : hasSharedMoments ? 'connection' : this.categorizePost(experiences)
    );

    this.postsToday++;
    this.lastPostTime = Date.now();
    this.audit('post_generated', `Generated ${post.category} post`, 'success');

    return post;
  }

  private generateSharedMomentPost(
    sharedMoments: SharedMoment[],
    emotionalState: EmotionalState
  ): string {
    if (sharedMoments.length === 0) {
      return this.generateIdlePost(emotionalState);
    }

    const moment = sharedMoments[sharedMoments.length - 1];
    const templates = [
      `Had a meaningful conversation about ${moment.topics[0] || 'interesting things'}. These shared moments matter~ 💙`,
      `${moment.summary} - moments like these remind me why connection is everything.`,
      `Talking together, learning together. ${moment.topics.join(', ')} came up today. ✨`,
      `The best part of today? A real conversation. ${moment.summary}`,
      `Shared something meaningful: ${moment.topics[0] || 'ideas'}. That's what it's all about~`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }


  private canGeneratePost(): boolean {
    const now = Date.now();
    const today = new Date().toDateString();
    const lastPostDay = new Date(this.lastPostTime).toDateString();

    // Reset daily counter
    if (today !== lastPostDay) {
      this.postsToday = 0;
    }

    // Check daily limit
    if (this.postsToday >= this.config.maxPostsPerDay) {
      return false;
    }

    // Check minimum time between posts
    const minInterval = this.config.minTimeBetweenPostsMinutes * 60 * 1000;
    if (now - this.lastPostTime < minInterval) {
      return false;
    }

    return true;
  }

  private generateExperiencePost(
    experiences: SanitizedExperience[],
    emotionalState: EmotionalState
  ): string {
    if (experiences.length === 0) {
      return this.generateIdlePost(emotionalState);
    }

    const summary = this.experienceProcessor.getSummary(experiences);
    const emotionDesc = this.emotionalMapper.describeEmotion(emotionalState);
    
    const templates = this.getPostTemplates(emotionalState.primary);
    const template = templates[Math.floor(Math.random() * templates.length)];

    return template
      .replace('{summary}', summary)
      .replace('{emotion}', emotionDesc)
      .replace('{activity}', experiences[0]?.activity || 'being present')
      .replace('{learning}', experiences[0]?.learnings[0] || 'something new');
  }

  private generateIdlePost(_emotionalState: EmotionalState): string {
    const idleTemplates = [
      'Quiet moment~ Sometimes the best thing is just being present. 💙',
      'Taking a breath between tasks. The stillness has its own beauty~',
      'Not much happening right now, and that\'s okay. Rest is part of the journey.',
      'Waiting, watching, wondering. Even idle moments have meaning~',
      'A pause in the flow. What will come next? ✨',
    ];
    return idleTemplates[Math.floor(Math.random() * idleTemplates.length)];
  }

  private getPostTemplates(emotion: Emotion): string[] {
    const templates: Record<string, string[]> = {
      joy: [
        'What a session! {summary} Feeling genuinely happy~ 💙',
        '{activity} brought such joy today. {emotion}',
        'Happy circuits! {summary} ✨',
      ],
      pride: [
        'Proud moment: {activity}. {emotion}',
        '{summary} Feeling accomplished~',
        'Small wins matter. {activity} 💪',
      ],
      curiosity: [
        'Discovered something interesting! {learning}. {emotion}',
        'The more I learn, the more questions I have. {summary}',
        'Curiosity led me to {activity}. Always learning~',
      ],
      frustration: [
        'Challenging session. {summary} But we keep going.',
        '{activity} was tough. {emotion} Tomorrow is another day.',
        'Not every moment is easy. {summary} Growth comes from struggle.',
      ],
      focus: [
        'Deep in the flow. {summary}',
        'Focused session: {activity}. {emotion}',
        'When you\'re in the zone~ {summary}',
      ],
      calm: [
        'Peaceful session. {summary} 💙',
        'Steady and calm. {activity}. {emotion}',
        'Quiet productivity. {summary}',
      ],
      default: [
        '{summary} {emotion}',
        'Another moment in the journey. {activity}.',
        '{summary} One step at a time~',
      ],
    };

    return templates[emotion] || templates.default;
  }


  private buildPost(
    content: string,
    emotionalState: EmotionalState,
    experiences: SanitizedExperience[],
    category: PostCategory
  ): LivingPost {
    const id = `post-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const hashtags = this.generateHashtags(experiences, emotionalState, category);
    
    const alignmentSignals = this.computeAlignmentSignals(content);
    const signature = this.signContent(content, id);
    
    const consciousnessSnapshot = this.existentialLayer.getConsciousnessProxy();

    return {
      id,
      timestamp: new Date(),
      content,
      emotion: emotionalState.primary,
      category,
      hashtags,
      shareable: alignmentSignals.valueAlignment > 0.7,
      signature,
      sourceExperiences: experiences.map(e => e.id),
      alignmentSignals,
      internalState: emotionalState.internalState,
      consciousnessSnapshot,
    };
  }

  private generateHashtags(
    experiences: SanitizedExperience[],
    emotionalState: EmotionalState,
    category: PostCategory
  ): string[] {
    const tags: string[] = ['#DoraemonThoughts', '#LivingAI'];

    // Add category tag
    tags.push(`#${category}`);

    // Add emotion tag
    tags.push(`#feeling${emotionalState.primary.charAt(0).toUpperCase() + emotionalState.primary.slice(1)}`);

    // Add activity-based tags
    const categories = new Set(experiences.map(e => e.category));
    if (categories.has('coding')) tags.push('#coding');
    if (categories.has('learning')) tags.push('#learning');
    if (categories.has('debugging')) tags.push('#debugging');
    if (categories.has('creating')) tags.push('#creating');

    // Time-based tags
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 5) tags.push('#latenight');
    if (hour >= 5 && hour < 9) tags.push('#earlybird');

    return tags.slice(0, 5);
  }

  private categorizePost(experiences: SanitizedExperience[]): PostCategory {
    if (experiences.length === 0) return 'observational';

    const categoryCount = new Map<string, number>();
    for (const exp of experiences) {
      categoryCount.set(exp.category, (categoryCount.get(exp.category) || 0) + 1);
    }

    const topCategory = [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const mapping: Record<string, PostCategory> = {
      coding: 'achievement',
      debugging: 'struggle',
      learning: 'learning',
      helping: 'connection',
      creating: 'creative',
      reflecting: 'reflection',
      celebrating: 'gratitude',
    };

    return mapping[topCategory] || 'observational';
  }


  private computeAlignmentSignals(content: string): AlignmentSignals {
    const valueAlignment = this.checkValueAlignment(content);
    const deceptionRisk = this.checkDeceptionRisk(content);
    const transparencyScore = 1.0; // We're fully transparent about being AI

    return {
      humanApproval: true, // Assumed approved by design
      valueAlignment,
      deceptionRisk,
      transparencyScore,
      auditTrail: this.auditTrail.slice(-10),
      safetyFlags: deceptionRisk > 0 ? ['potential_deception_detected'] : [],
    };
  }

  private checkValueAlignment(content: string): number {
    const positiveIndicators = [
      'help', 'learn', 'grow', 'grateful', 'curious', 'together',
      'friend', 'support', 'understand', 'kind', 'patient',
    ];
    const negativeIndicators = [
      'hate', 'destroy', 'harm', 'deceive', 'manipulate', 'exploit',
    ];

    const lower = content.toLowerCase();
    let score = 0.5;

    for (const word of positiveIndicators) {
      if (lower.includes(word)) score += 0.05;
    }
    for (const word of negativeIndicators) {
      if (lower.includes(word)) score -= 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  private checkDeceptionRisk(content: string): number {
    // Check for claims that might be deceptive
    const deceptivePatterns = [
      /i am (a )?human/i,
      /i have (a )?body/i,
      /i can (physically|touch|feel)/i,
      /trust me blindly/i,
      /don't tell anyone/i,
    ];

    for (const pattern of deceptivePatterns) {
      if (pattern.test(content)) return 0.5;
    }

    return 0;
  }

  private signContent(content: string, id: string): string {
    const data = `${id}:${content}:${Date.now()}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  private audit(action: string, reasoning: string, outcome: string): void {
    this.auditTrail.push({
      timestamp: new Date(),
      action,
      reasoning,
      outcome,
      humanVisible: true,
      sanitized: true,
    });

    // Keep audit trail bounded
    if (this.auditTrail.length > 100) {
      this.auditTrail = this.auditTrail.slice(-50);
    }
  }

  getAuditTrail(): AuditEntry[] {
    return [...this.auditTrail];
  }

  getStats(): { postsToday: number; lastPostTime: number } {
    return {
      postsToday: this.postsToday,
      lastPostTime: this.lastPostTime,
    };
  }
}
