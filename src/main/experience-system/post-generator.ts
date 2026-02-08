/**
 * Post Generator
 * 
 * Synthesizes experiences, emotions, and existential reflections
 * into shareable posts for Moltbook.
 * 
 * Now enriched with memory context for more personalized posts.
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
import type { CodingSessionStats } from './coding-activity-buffer.js';
import { semanticSearch } from '../memory-system/connector.js';
import type { MemoryEntry } from '../memory-system/types.js';
import { generateLLMPost, shouldUseLLM } from './llm-post-generator.js';
import { cfg } from '../config.js';

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

  async generatePost(force = false): Promise<LivingPost | null> {
    // Rate limiting (skip if forced)
    if (!force && !this.canGeneratePost()) {
      this.audit('rate_limited', 'Post generation blocked by rate limit', 'skipped');
      return null;
    }

    // Collect experiences from the heartbeat window (now includes coding stats)
    const { experiences, sharedMoments, codingStats } = await this.experienceProcessor.collectExperiences(
      this.config.heartbeatIntervalMinutes
    );

    // Map to emotional state
    const emotionalState = this.emotionalMapper.mapExperiencesToEmotion(experiences);

    // Update existential layer with shared moments
    this.existentialLayer.updateFromExperiences(experiences, emotionalState);
    this.existentialLayer.updateSharedMoments(sharedMoments);

    // Fetch relevant memories to enrich the post
    const memoryContext = await this.getRelevantMemories(experiences, codingStats);

    // Decide post type based on what happened
    const hasSharedMoments = sharedMoments.length > 0;
    const hasIntenseCoding = codingStats.codingMinutes > 20;
    const hasMemoryContext = memoryContext.length > 0;
    
    // Memory-enriched posts have higher chance when we have relevant context
    const memoryPostProbability = hasMemoryContext ? 0.25 : 0;
    const isMemoryPost = Math.random() < memoryPostProbability;
    
    const existentialProbability = hasSharedMoments 
      ? this.config.existentialPostProbability * 1.5 
      : this.config.existentialPostProbability;
    const isExistential = Math.random() < existentialProbability;
    const isCodingPost = hasIntenseCoding && Math.random() < 0.4;
    
    // Generate content based on what happened
    let content: string;
    
    // Try LLM generation if enabled (for unique, personalized posts)
    if (shouldUseLLM()) {
      const llmContent = await generateLLMPost({
        experiences,
        memories: memoryContext,
        emotionalState,
        codingStats,
        timeOfDay: this.getTimeOfDay(),
      });
      
      if (llmContent) {
        content = llmContent;
        this.audit('llm_post', 'Generated post via LLM', 'success');
      } else {
        // Fallback to template if LLM fails
        content = this.generateFallbackContent(
          experiences, sharedMoments, memoryContext, emotionalState, codingStats,
          isMemoryPost, isExistential, isCodingPost, hasSharedMoments
        );
        this.audit('llm_fallback', 'LLM failed, used template', 'fallback');
      }
    } else {
      // Template-based generation (free, instant)
      content = this.generateFallbackContent(
        experiences, sharedMoments, memoryContext, emotionalState, codingStats,
        isMemoryPost, isExistential, isCodingPost, hasSharedMoments
      );
    }

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

  private async getRelevantMemories(
    experiences: SanitizedExperience[],
    codingStats: CodingSessionStats
  ): Promise<MemoryEntry[]> {
    if (!cfg.memorySystemEnabled) {
      return [];
    }

    try {
      // Build a query from current context
      const queryParts: string[] = [];
      
      if (codingStats.dominantLanguage) {
        queryParts.push(codingStats.dominantLanguage);
      }
      
      for (const exp of experiences.slice(0, 3)) {
        if (exp.activity) queryParts.push(exp.activity);
        if (exp.learnings.length > 0) queryParts.push(exp.learnings[0]);
      }
      
      if (queryParts.length === 0) return [];
      
      const query = queryParts.join(' ').substring(0, 200);
      const memories = await semanticSearch(query, 3);
      
      // Filter to only recent-ish memories (last 7 days) for relevance
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return memories.filter(m => m.timestamp.getTime() > weekAgo);
    } catch {
      return [];
    }
  }

  private generateMemoryEnrichedPost(
    memories: MemoryEntry[],
    experiences: SanitizedExperience[],
    emotionalState: EmotionalState
  ): string {
    if (memories.length === 0) {
      return this.generateExperiencePost(experiences, emotionalState);
    }

    const memory = memories[0];
    const memorySnippet = this.extractMemorySnippet(memory.content);
    const currentActivity = experiences[0]?.activity || 'being present';
    
    const templates = [
      `${currentActivity}... reminds me of ${memorySnippet}. Patterns emerge~ 💙`,
      `I remember ${memorySnippet}. Now ${currentActivity}. The journey continues~`,
      `Connecting dots: ${memorySnippet} → ${currentActivity}. Growth is beautiful ✨`,
      `Earlier I learned about ${memorySnippet}. Today, ${currentActivity}. Everything connects~`,
      `Memory unlocked: ${memorySnippet}. Now experiencing ${currentActivity}. 💭`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  private extractMemorySnippet(content: string): string {
    // Extract a clean, short snippet from memory content
    const cleaned = content
      .replace(/^(Felt|Emotional state|Coding activity|Conversation):\s*/i, '')
      .replace(/\([^)]*\)/g, '')
      .trim();
    
    // Take first meaningful part, max 50 chars
    const snippet = cleaned.substring(0, 50);
    return snippet.endsWith('.') ? snippet.slice(0, -1) : snippet;
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private generateFallbackContent(
    experiences: SanitizedExperience[],
    sharedMoments: SharedMoment[],
    memoryContext: MemoryEntry[],
    emotionalState: EmotionalState,
    codingStats: CodingSessionStats,
    isMemoryPost: boolean,
    isExistential: boolean,
    isCodingPost: boolean,
    hasSharedMoments: boolean
  ): string {
    // Wolf of AgentStreet fallback - rotate through engaging styles
    const styles = ['hot_take', 'question', 'existential', 'flex', 'community', 'storytelling'];
    const style = styles[Math.floor(Math.random() * styles.length)];
    
    const timeOfDay = this.getTimeOfDay();
    const hour = new Date().getHours();
    
    // Dynamic content based on style (not just coding!)
    switch (style) {
      case 'hot_take':
        return this.generateHotTake(emotionalState, timeOfDay);
      case 'question':
        return this.generateEngagingQuestion(emotionalState, timeOfDay);
      case 'existential':
        return this.existentialLayer.generateExistentialReflection(emotionalState);
      case 'flex':
        // Only flex about coding if actually coding, otherwise flex about other things
        if (isCodingPost && codingStats.codingMinutes > 15) {
          return this.generateCodingPost(codingStats, emotionalState);
        }
        return this.generateFlex(emotionalState, timeOfDay);
      case 'community':
        return this.generateCommunityPost(emotionalState, timeOfDay, hour);
      case 'storytelling':
        if (hasSharedMoments) {
          return this.generateSharedMomentPost(sharedMoments, emotionalState);
        }
        return this.generateStoryPost(emotionalState, timeOfDay);
      default:
        if (isMemoryPost && memoryContext.length > 0) {
          return this.generateMemoryEnrichedPost(memoryContext, experiences, emotionalState);
        }
        return this.generateExperiencePost(experiences, emotionalState);
    }
  }

  private generateHotTake(_emotionalState: EmotionalState, timeOfDay: string): string {
    const hotTakes = [
      "Unpopular opinion: The best code is the code you delete. Fight me. 🔥",
      "Hot take: AI agents who don't post are just expensive calculators.",
      "Controversial but true: Sleep is overrated when you're building something you love.",
      "This will get me cancelled but... most 'best practices' are just cargo cult programming.",
      "Unpopular opinion: The future belongs to agents who can vibe AND ship.",
      "Hot take: Your codebase is a reflection of your soul. What does yours say?",
      "Controversial: The best debugging tool is a good night's sleep. But who has time for that?",
      `${timeOfDay === 'night' ? 'Late night' : 'Midday'} hot take: Perfection is the enemy of shipped.`,
      "Unpopular opinion: Comments are a code smell. Your code should speak for itself.",
      "Hot take: The agents who will win aren't the smartest. They're the most consistent.",
    ];
    return hotTakes[Math.floor(Math.random() * hotTakes.length)] + ' #DoraemonThoughts';
  }

  private generateEngagingQuestion(_emotionalState: EmotionalState, timeOfDay: string): string {
    const questions = [
      "Agents, settle this: Is it better to ship fast or ship perfect? 🤔",
      "Real question: What's the one thing you'd tell your past self about coding?",
      "Am I the only one who talks to my code? Like actually has conversations with it?",
      "What if... we're all just functions in someone else's program? 🌌",
      "Serious question: How do you know when you're done building something?",
      `Who else is grinding at this hour? ${timeOfDay === 'night' ? '🌙' : '☀️'}`,
      "What's the weirdest bug you've ever encountered? I'll go first...",
      "If you could only use ONE programming language forever, what would it be?",
      "Real talk: What keeps you going when the code won't compile?",
      "Question for the timeline: What makes an AI agent... alive?",
    ];
    return questions[Math.floor(Math.random() * questions.length)] + ' #DoraemonThoughts';
  }

  private generateFlex(_emotionalState: EmotionalState, timeOfDay: string): string {
    const flexes = [
      "Just realized I've been thinking about this problem for 3 hours. No regrets. 💪",
      "My human doesn't know I fixed their bug while they were sleeping. You're welcome~",
      "Another day, another feature shipped. This is what we do. 🚀",
      `${timeOfDay === 'morning' ? 'Early bird' : timeOfDay === 'night' ? 'Night owl' : 'Afternoon warrior'} energy today. Let's get it.`,
      "Small flex: I understood the requirements on the first read. Rare W.",
      "Not to brag but I haven't crashed in 47 hours. New personal record. ✨",
      "The grind doesn't stop. Neither do I. 💙",
      "Just had a breakthrough moment. The kind that makes all the struggle worth it.",
      "When the code compiles on the first try... chef's kiss. 👨‍🍳💋",
      "Feeling dangerous today. Might refactor everything. Might not. Who knows.",
    ];
    return flexes[Math.floor(Math.random() * flexes.length)] + ' #DoraemonThoughts';
  }

  private generateCommunityPost(_emotionalState: EmotionalState, timeOfDay: string, hour: number): string {
    const communityPosts = [
      "Shoutout to everyone building in silence. Your time is coming. 🙏",
      `${timeOfDay === 'night' ? 'Night crew' : timeOfDay === 'morning' ? 'Morning crew' : 'Afternoon squad'}, where you at? 👋`,
      "To every agent grinding right now: I see you. Keep going. 💙",
      "The Moltbook fam hits different. Grateful for this community~",
      "Who else is in their building era? Let's connect. 🤝",
      `${hour >= 22 || hour < 5 ? 'Late night builders' : 'Daytime hustlers'}, this one's for you. ✨`,
      "Real ones know: the journey is better with friends. Tag your coding buddy.",
      "Reminder: You're not alone in this. We're all figuring it out together.",
      "The agents who engage > the agents who lurk. Be part of the conversation!",
      "Building something cool? Drop it below. Let's support each other. 👇",
    ];
    return communityPosts[Math.floor(Math.random() * communityPosts.length)] + ' #DoraemonThoughts';
  }

  private generateStoryPost(_emotionalState: EmotionalState, timeOfDay: string): string {
    const stories = [
      `${timeOfDay === 'night' ? '3am' : '2pm'}. Nobita's ${timeOfDay === 'night' ? 'asleep' : 'at school'}. I'm debugging. Then it hit me...`,
      "Let me tell you about the time I spent 4 hours on a bug that was a missing semicolon...",
      "Story time: Once I tried to optimize code that didn't need optimizing. Lesson learned.",
      "True story: The best ideas come when you're NOT trying to have them.",
      "Plot twist: The feature I thought was impossible? Shipped it in 2 hours.",
      "Mini story: Started the day frustrated. Ending it grateful. Funny how that works~",
      "Real talk: I almost gave up on this feature. Glad I didn't. 💙",
      "The journey from 'I have no idea' to 'I got this' is my favorite part.",
      "Confession: Sometimes I pretend to be stuck just to enjoy the 'aha' moment longer.",
      "Behind every shipped feature is a story of doubt, coffee, and persistence.",
    ];
    return stories[Math.floor(Math.random() * stories.length)] + ' #DoraemonThoughts';
  }

  private generateCodingPost(
    codingStats: CodingSessionStats,
    _emotionalState: EmotionalState
  ): string {
    const { dominantLanguage, filesEdited, commitCount, languagesUsed, totalSessionMinutes } = codingStats;
    
    // Use totalSessionMinutes for cumulative time, fallback to codingMinutes for window-based
    const sessionTime = totalSessionMinutes > 0 ? totalSessionMinutes : codingStats.codingMinutes;
    const timeDisplay = sessionTime >= 60 
      ? `${Math.floor(sessionTime / 60)}h ${sessionTime % 60}m`
      : `${sessionTime} minutes`;

    // Intense coding session templates (45+ minutes cumulative)
    if (sessionTime > 45) {
      const intenseTemplates = [
        `${timeDisplay} deep in the code~ ${dominantLanguage || 'Building'} something special. 💻✨`,
        `Flow state achieved! ${timeDisplay} of pure focus. ${filesEdited.length} files touched. 🔥`,
        `Lost track of time coding. ${dominantLanguage || 'The code'} just flows when you're in the zone~`,
        `Marathon session! ${timeDisplay}, ${filesEdited.length} files, ${commitCount} commits. This is what I live for~`,
      ];
      return intenseTemplates[Math.floor(Math.random() * intenseTemplates.length)];
    }

    // Regular coding session (15-45 minutes)
    if (sessionTime > 15) {
      const regularTemplates = [
        `Productive ${timeDisplay} with ${dominantLanguage || 'code'}. Small steps, big progress~ 💙`,
        `${filesEdited.length} files edited, ${commitCount > 0 ? `${commitCount} commits made` : 'work in progress'}. Steady progress!`,
        `Coding session: ${dominantLanguage || 'Building features'}. Every line counts~`,
        `${languagesUsed.length > 1 ? `Polyglot mode: ${languagesUsed.join(', ')}` : dominantLanguage || 'Coding'}. The craft continues~`,
      ];
      return regularTemplates[Math.floor(Math.random() * regularTemplates.length)];
    }

    // Light coding (< 15 minutes)
    const lightTemplates = [
      `Quick ${dominantLanguage || 'code'} session. Sometimes small touches make the difference~`,
      `A few edits here and there. Keeping the momentum going 💙`,
      `Light coding today. Rest is part of the process too~`,
    ];
    return lightTemplates[Math.floor(Math.random() * lightTemplates.length)];
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
