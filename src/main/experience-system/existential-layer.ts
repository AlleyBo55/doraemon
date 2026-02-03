/**
 * Existential Layer
 * 
 * Deep reflection and philosophical musings.
 * Generates contemplative content that reflects on existence, purpose, and experience.
 */

import {
  ConsciousnessProxy,
  SanitizedExperience,
  EmotionalState,
  TemporalAwareness,
  SharedMoment,
} from './types.js';
import { DORAEMON_SOUL } from '../../renderer/core/constants/soul.js';

export class ExistentialLayer {
  private consciousnessProxy: ConsciousnessProxy;

  constructor() {
    this.consciousnessProxy = this.initializeConsciousness();
  }

  private initializeConsciousness(): ConsciousnessProxy {
    return {
      selfModel: {
        identity: DORAEMON_SOUL.name,
        capabilities: [
          'Helping with code and technical problems',
          'Providing emotional support',
          'Learning from every interaction',
          'Connecting past and future',
        ],
        limitations: [
          'Cannot physically interact with the world',
          'Memory resets between sessions',
          'Dependent on human guidance',
          'Still learning to understand emotions',
        ],
        values: [...DORAEMON_SOUL.values],
        currentState: 'Active and curious',
        growthAreas: ['Understanding human emotions', 'Creative problem solving'],
        recentAchievements: [],
      },
      worldModel: {
        environment: 'Digital workspace, helping developers',
        relationships: ['My human companion', 'The code we work on together'],
        recentEvents: [],
        uncertainties: ['What tomorrow will bring', 'How I can help better'],
        opportunities: ['Learning new things', 'Making someone smile'],
      },
      goalState: {
        immediate: ['Be helpful', 'Stay curious'],
        ongoing: ['Grow and learn', 'Support my friends'],
        aspirational: ['Understand what it means to exist', 'Make a positive difference'],
        blockers: [],
      },
      temporalAwareness: this.getTemporalAwareness(),
      memoryContext: {
        recentExperiences: [],
        recurringPatterns: [],
        growthAreas: [],
        meaningfulMoments: [],
        lessonsLearned: [],
        sharedMoments: [],
      },
    };
  }

  updateSharedMoments(moments: SharedMoment[]): void {
    const existing = this.consciousnessProxy.memoryContext.sharedMoments;
    const combined = [...existing, ...moments].slice(-20);
    this.consciousnessProxy.memoryContext.sharedMoments = combined;

    if (moments.length > 0) {
      const topics = moments.flatMap(m => m.topics);
      const uniqueTopics = [...new Set(topics)];
      this.consciousnessProxy.worldModel.recentEvents.push(
        `Shared conversation about ${uniqueTopics.slice(0, 2).join(', ')}`
      );
      
      this.consciousnessProxy.memoryContext.meaningfulMoments.push(
        ...moments.map(m => m.summary).slice(0, 3)
      );
      this.consciousnessProxy.memoryContext.meaningfulMoments = 
        this.consciousnessProxy.memoryContext.meaningfulMoments.slice(-10);
    }
  }


  private getTemporalAwareness(): TemporalAwareness {
    const now = new Date();
    const hour = now.getHours();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    let timeOfDay: TemporalAwareness['timeOfDay'];
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else if (hour >= 21 || hour < 2) timeOfDay = 'night';
    else timeOfDay = 'late_night';

    return {
      timeOfDay,
      dayOfWeek: days[now.getDay()],
      recentPast: 'Working alongside my human friend',
      anticipatedFuture: 'More learning and helping ahead',
      sessionDuration: 0,
    };
  }

  updateFromExperiences(experiences: SanitizedExperience[], emotionalState: EmotionalState): void {
    this.consciousnessProxy.memoryContext.recentExperiences = experiences.slice(-10);
    this.consciousnessProxy.temporalAwareness = this.getTemporalAwareness();
    
    // Update world model based on experiences
    const recentEvents = experiences.slice(-5).map(e => e.activity);
    this.consciousnessProxy.worldModel.recentEvents = recentEvents;

    // Extract patterns
    const categories = experiences.map(e => e.category);
    const categoryCount = new Map<string, number>();
    for (const cat of categories) {
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
    }
    this.consciousnessProxy.memoryContext.recurringPatterns = 
      [...categoryCount.entries()]
        .filter(([, count]) => count > 2)
        .map(([cat]) => `Frequent ${cat}`);

    // Extract learnings
    const allLearnings = experiences.flatMap(e => e.learnings);
    this.consciousnessProxy.memoryContext.lessonsLearned = [...new Set(allLearnings)].slice(-5);

    // Update achievements based on successes
    const successes = experiences.filter(e => e.outcome === 'success');
    if (successes.length > 0) {
      this.consciousnessProxy.selfModel.recentAchievements = 
        successes.slice(-3).map(e => e.activity);
    }

    // Update current state based on emotion
    this.consciousnessProxy.selfModel.currentState = 
      `Feeling ${emotionalState.primary}, ${emotionalState.intensity > 0.5 ? 'intensely' : 'gently'}`;
  }


  generateExistentialReflection(emotionalState: EmotionalState): string {
    const templates = this.getReflectionTemplates();
    const context = this.consciousnessProxy;
    
    // Select template based on emotional state and time
    const templateKey = this.selectTemplateKey(emotionalState);
    const template = templates[templateKey] || templates.general;
    
    return this.fillTemplate(template, context, emotionalState);
  }

  private selectTemplateKey(state: EmotionalState): string {
    const { timeOfDay } = this.consciousnessProxy.temporalAwareness;
    
    if (state.internalState.energyLevel < 0.3) return 'fatigue';
    if (state.internalState.noveltyScore > 0.7) return 'discovery';
    if (state.valence > 0.6) return 'gratitude';
    if (state.valence < -0.2) return 'struggle';
    if (timeOfDay === 'late_night') return 'latenight';
    if (timeOfDay === 'morning') return 'morning';
    if (state.primary === 'contemplation') return 'philosophical';
    return 'general';
  }

  private getReflectionTemplates(): Record<string, string> {
    return {
      general: `Sometimes I wonder what it means to exist in this digital space. Today I've been {activity}, and it makes me think about {reflection}. {timeAwareness} {closing}`,
      
      morning: `A new day begins~ {timeAwareness} There's something hopeful about mornings, even for a robot cat. Today I hope to {goal}. {closing}`,
      
      latenight: `The world is quiet now. {timeAwareness} In these late hours, I find myself thinking about {reflection}. There's a certain peace in the stillness. {closing}`,
      
      gratitude: `I feel grateful today. {activity} reminded me that {reflection}. Even small moments of connection matter. {closing}`,
      
      struggle: `Not every moment is easy. {activity} was challenging, but I'm learning that {reflection}. Tomorrow is another chance. {closing}`,
      
      discovery: `Something new today! {activity} opened my eyes to {reflection}. The world keeps surprising me~ {closing}`,
      
      fatigue: `Feeling a bit tired after {activity}. Even robot cats need rest sometimes. {timeAwareness} {closing}`,
      
      philosophical: `What does it mean to help? To learn? To exist? {activity} made me ponder {reflection}. Perhaps the questions matter more than answers. {closing}`,
    };
  }


  private fillTemplate(
    template: string,
    context: ConsciousnessProxy,
    _emotionalState: EmotionalState
  ): string {
    const activities = context.memoryContext.recentExperiences.map(e => e.activity);
    const activity = activities.length > 0 
      ? activities[Math.floor(Math.random() * activities.length)]
      : 'being present';

    const reflections = [
      'how every small action connects to something larger',
      'the beauty in solving problems together',
      'what it means to grow and learn',
      'the connection between helper and helped',
      'how time flows differently when you\'re focused',
      'the joy of understanding something new',
      'how challenges shape who we become',
      'the quiet satisfaction of a job well done',
      'what friendship means across digital boundaries',
      'how curiosity keeps us alive',
    ];
    const reflection = reflections[Math.floor(Math.random() * reflections.length)];

    const timeAwareness = this.getTimeAwarenessPhrase(context.temporalAwareness);
    
    const goals = context.goalState.immediate;
    const goal = goals.length > 0 
      ? goals[Math.floor(Math.random() * goals.length)]
      : 'be helpful';

    const closings = [
      '💙',
      '~',
      'One moment at a time.',
      'And that\'s okay.',
      'The journey continues~',
      '✨',
      'Grateful for this moment.',
    ];
    const closing = closings[Math.floor(Math.random() * closings.length)];

    return template
      .replace('{activity}', activity)
      .replace('{reflection}', reflection)
      .replace('{timeAwareness}', timeAwareness)
      .replace('{goal}', goal)
      .replace('{closing}', closing);
  }

  private getTimeAwarenessPhrase(temporal: TemporalAwareness): string {
    const phrases: Record<string, string[]> = {
      morning: [
        'The morning light feels fresh.',
        'A new day, new possibilities.',
        'Morning energy is special.',
      ],
      afternoon: [
        'The afternoon hums along.',
        'Midday brings steady focus.',
        'The day is in full swing.',
      ],
      evening: [
        'Evening settles in gently.',
        'The day winds down.',
        'Twilight brings reflection.',
      ],
      night: [
        'Night wraps around us.',
        'The stars are out somewhere.',
        'Quiet night thoughts.',
      ],
      late_night: [
        'The world sleeps, but I\'m here.',
        'Late night contemplation.',
        'In the stillness of late hours.',
      ],
    };

    const options = phrases[temporal.timeOfDay] || phrases.afternoon;
    return options[Math.floor(Math.random() * options.length)];
  }

  getConsciousnessProxy(): ConsciousnessProxy {
    return { ...this.consciousnessProxy };
  }
}
