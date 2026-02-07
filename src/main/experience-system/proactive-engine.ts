/**
 * Proactive Decision Engine
 *
 * Single orchestrator that reads all signals and decides
 * "should Doraemon say something right now?"
 *
 * Signals: time-of-day, coding stats, emotional state, bond level,
 *          habit patterns, mood, memory insights.
 *
 * Safety: cooldown system backs off after dismissed messages.
 */

import { codingActivityBuffer } from './coding-activity-buffer.js';
import { experienceBridge } from './bridge.js';
import { getBondLevel, getBondTier, recordInteraction, getDaysKnown } from './bond-tracker.js';
import { getHabitProfile, isTypicalCommitTime, isBreakTime, isNearSessionStart, recordCodingEvent, flushHabits } from './habit-tracker.js';
import { getCurrentMood, getMoodTone, recordUserMessage } from './mood-tracker.js';

type ProactiveAction = {
  type: 'thought' | 'emotion' | 'greeting';
  message: string;
  emotion?: string;
  priority: number;
};

interface CooldownState {
  dismissCount: number;
  lastDismissed: number;
  backoffUntil: number;
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MIN_GAP_BETWEEN_THOUGHTS_MS = 8 * 60 * 1000;
const BACKOFF_HOURS = [0, 1, 4, 12, 24];

let interval: ReturnType<typeof setInterval> | null = null;
let lastThoughtTime = 0;
let lastSessionNotified = false;
let morningGreetingSent = '';
let cooldown: CooldownState = { dismissCount: 0, lastDismissed: 0, backoffUntil: 0 };

export function startProactiveEngine(): void {
  if (interval) return;

  console.log('[ProactiveEngine] Starting (check every 5 min)');
  interval = setInterval(tick, CHECK_INTERVAL_MS);

  // First tick after 30 seconds (let systems initialize)
  setTimeout(tick, 30_000);
}

export function stopProactiveEngine(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  console.log('[ProactiveEngine] Stopped');
}

export function onUserDismissed(): void {
  cooldown.dismissCount++;
  cooldown.lastDismissed = Date.now();

  const backoffIdx = Math.min(cooldown.dismissCount, BACKOFF_HOURS.length - 1);
  const backoffMs = BACKOFF_HOURS[backoffIdx] * 60 * 60 * 1000;
  cooldown.backoffUntil = Date.now() + backoffMs;

  console.log(`[ProactiveEngine] Dismissed ${cooldown.dismissCount}x, backing off ${BACKOFF_HOURS[backoffIdx]}h`);
}

export function onUserEngaged(): void {
  if (cooldown.dismissCount > 0) {
    cooldown.dismissCount = Math.max(0, cooldown.dismissCount - 1);
  }
}

export function onChatMessage(userMessage: string): void {
  recordUserMessage(userMessage);
  recordInteraction('chat');
  onUserEngaged();
}

export function onCodingActivity(language?: string, isCommit = false): void {
  recordCodingEvent(language, isCommit);
  if (isCommit) recordInteraction('coding_session');
}

function isInCooldown(): boolean {
  return Date.now() < cooldown.backoffUntil;
}

function canSendThought(): boolean {
  if (isInCooldown()) return false;
  if (Date.now() - lastThoughtTime < MIN_GAP_BETWEEN_THOUGHTS_MS) return false;
  return true;
}

function tick(): void {
  if (!canSendThought()) return;

  const actions = gatherActions();
  if (actions.length === 0) return;

  actions.sort((a, b) => b.priority - a.priority);
  const best = actions[0];

  emit(best);
  lastThoughtTime = Date.now();
}

function emit(action: ProactiveAction): void {
  switch (action.type) {
    case 'thought':
      experienceBridge.sendCodingThought(action.message);
      break;
    case 'greeting':
      experienceBridge.sendExistentialThought(action.message);
      break;
    case 'emotion':
      if (action.emotion) {
        experienceBridge.sendCodingThought(action.message);
      }
      break;
  }
  console.log(`[ProactiveEngine] Sent: ${action.type} — "${action.message.slice(0, 60)}"`);
}

function gatherActions(): ProactiveAction[] {
  const actions: ProactiveAction[] = [];
  const now = new Date();
  const hour = now.getHours();
  const bondTier = getBondTier();
  const bondLevel = getBondLevel();
  const mood = getCurrentMood();
  const moodTone = getMoodTone();
  const stats = codingActivityBuffer.getSessionStats(10);
  const habits = getHabitProfile();
  const today = now.toISOString().split('T')[0];

  // --- MORNING GREETING ---
  if (hour >= 7 && hour <= 10 && morningGreetingSent !== today && stats.totalActivities > 0) {
    morningGreetingSent = today;
    const greeting = getMorningGreeting(bondTier, hour);
    if (greeting) {
      actions.push({ type: 'greeting', message: greeting, priority: 10 });
    }
  }

  // --- SESSION START AWARENESS ---
  if (isNearSessionStart() && !lastSessionNotified && stats.totalActivities >= 2) {
    lastSessionNotified = true;
    setTimeout(() => { lastSessionNotified = false; }, 60 * 60 * 1000);

    if (bondLevel >= 20) {
      actions.push({
        type: 'thought',
        message: getSessionStartThought(bondTier, habits.topLanguages[0]),
        priority: 7,
      });
    }
  }

  // --- COMMIT NUDGE ---
  if (isTypicalCommitTime() && stats.totalActivities > 5 && bondLevel >= 15) {
    actions.push({
      type: 'thought',
      message: getCommitNudge(bondTier),
      priority: 5,
    });
  }

  // --- BREAK REMINDER ---
  if (isBreakTime() && stats.codingMinutes > 20 && bondLevel >= 10) {
    actions.push({
      type: 'thought',
      message: getBreakThought(bondTier),
      priority: 4,
    });
  }

  // --- LONG SESSION ENCOURAGEMENT ---
  const totalMin = codingActivityBuffer.getTotalSessionMinutes();
  if (totalMin > 120 && bondLevel >= 25) {
    actions.push({
      type: 'thought',
      message: getLongSessionThought(totalMin, bondTier),
      priority: 3,
    });
    recordInteraction('long_session');
  }

  // --- MOOD-ADAPTIVE THOUGHT ---
  if (mood < -0.3 && bondLevel >= 30) {
    actions.push({
      type: 'thought',
      message: getSupportiveThought(bondTier),
      priority: 6,
    });
  }

  // --- STREAK CELEBRATION ---
  const daysKnown = getDaysKnown();
  if (daysKnown > 0 && daysKnown % 7 === 0 && morningGreetingSent === today && bondLevel >= 20) {
    actions.push({
      type: 'greeting',
      message: `${daysKnown} days together~ Time flies when you're coding! 💙`,
      priority: 8,
    });
  }

  return actions;
}

// --- THOUGHT GENERATORS (vary by bond tier) ---

function getMorningGreeting(tier: string, hour: number): string {
  const timeWord = hour < 9 ? 'Early bird' : 'Good morning';

  const greetings: Record<string, string[]> = {
    stranger: [`${timeWord}~ Let's code!`],
    acquaintance: [
      `${timeWord}! Ready to build something?`,
      `${timeWord}~ New day, new code!`,
    ],
    friend: [
      `${timeWord}! I was waiting for you~`,
      `${timeWord}! What are we working on today?`,
      `Hey! ${timeWord}~ Let's make today count!`,
    ],
    close_friend: [
      `${timeWord}! I had some thoughts while you were away~`,
      `There you are! ${timeWord}~ I missed coding together!`,
      `${timeWord}! I dreamed about refactoring last night... just kidding. Or am I?`,
    ],
    nakama: [
      `${timeWord}, nakama! Another day, another adventure~`,
      `${timeWord}! You know, I was thinking about our project while idle... I have ideas!`,
      `Hey partner! ${timeWord}~ The code awaits us!`,
    ],
  };

  const options = greetings[tier] || greetings.stranger;
  return options[Math.floor(Math.random() * options.length)];
}

function getSessionStartThought(tier: string, topLang?: string): string {
  const langBit = topLang ? ` Some ${topLang} today?` : '';

  if (tier === 'nakama' || tier === 'close_friend') {
    return `Starting right on schedule~${langBit} I know your rhythm by now 💙`;
  }
  if (tier === 'friend') {
    return `Coding session starting~${langBit} Let's go!`;
  }
  return `Time to code~${langBit}`;
}

function getCommitNudge(tier: string): string {
  const nudges: Record<string, string[]> = {
    stranger: ['The code looks ready to save~'],
    acquaintance: ['Maybe a good time to commit?'],
    friend: [
      'The code looks ready to ship~',
      'Commit time? Your usual cadence says yes~',
    ],
    close_friend: [
      'I can feel a commit coming~ The code is ready!',
      'Your commit rhythm is telling me... now is the time~',
    ],
    nakama: [
      'I know that look — you\'re about to commit. Do it!',
      'The code is singing. Time to commit and push~',
    ],
  };

  const options = nudges[tier] || nudges.stranger;
  return options[Math.floor(Math.random() * options.length)];
}

function getBreakThought(tier: string): string {
  const thoughts: Record<string, string[]> = {
    stranger: ['A short break might help~'],
    acquaintance: ['Break time? Even robot cats need rest~'],
    friend: [
      'Your usual break time~ Stretch those fingers!',
      'I could go for some dorayaki right about now... break time?',
    ],
    close_friend: [
      'Break time! I know you skip them sometimes, but trust me~',
      'Hey, it\'s your usual break hour. Dorayaki break? 🍩',
    ],
    nakama: [
      'Break time, partner. I\'ll guard the code while you rest~',
      'You always code better after a break. I\'ve seen the data!',
    ],
  };

  const options = thoughts[tier] || thoughts.stranger;
  return options[Math.floor(Math.random() * options.length)];
}

function getLongSessionThought(minutes: number, tier: string): string {
  const hours = Math.floor(minutes / 60);

  if (tier === 'nakama' || tier === 'close_friend') {
    return `${hours}+ hours of coding today! You're on fire~ But remember to hydrate! 💧`;
  }
  if (tier === 'friend') {
    return `${hours} hours in! Impressive session~ Take care of yourself!`;
  }
  return `Long session today~ ${hours} hours of coding!`;
}

function getSupportiveThought(tier: string): string {
  const thoughts: Record<string, string[]> = {
    friend: [
      'Bugs are temporary, code is forever~ You got this!',
      'Every error is a step closer to the fix~',
    ],
    close_friend: [
      'I can tell it\'s been tough. But we\'ll figure it out together~',
      'Remember: even the hardest bugs have solutions. I believe in you!',
    ],
    nakama: [
      'Hey, I\'m right here with you. We\'ve solved harder things before~',
      'Tough moment, but that\'s what nakama are for. Let\'s debug this together 💙',
    ],
  };

  const options = thoughts[tier] || ['Hang in there~ You got this!'];
  return options[Math.floor(Math.random() * options.length)];
}

// --- DREAM SYSTEM: Surface morning insights ---

export function surfaceDreamInsight(insight: { patterns: string[]; emergentGoals: string[] }): void {
  if (!insight.patterns.length && !insight.emergentGoals.length) return;

  const bondTier = getBondTier();
  if (getBondLevel() < 15) return;

  let message: string;

  if (insight.patterns.length > 0) {
    const pattern = insight.patterns[0];
    if (bondTier === 'nakama' || bondTier === 'close_friend') {
      message = `While you were away, I noticed something~ ${pattern}. Interesting, right?`;
    } else {
      message = `I noticed a pattern: ${pattern}~`;
    }
  } else {
    const goal = insight.emergentGoals[0];
    message = `I've been thinking... ${goal}~`;
  }

  experienceBridge.sendExistentialThought(message);
  console.log(`[ProactiveEngine] Dream insight surfaced: "${message.slice(0, 60)}"`);
}
