export type SpriteAnimation = {
  frames: string[];
  frameDelay: number;
  loop: boolean;
  useNativeSize?: boolean;
};

export const PHYSICS = {
  GRAVITY: 2,
  RESISTANCE_X: 0.05,
  RESISTANCE_Y: 0.1,
  BOUNCE: 0.3,
  MAX_VELOCITY: 15,
  DRAG_DAMPING: 0.95,
} as const;

const EMOTION_FRAME_COUNTS: Record<string, number> = {
  awe: 3,
};

const emotionNames = [
  'joy',
  'pride',
  'satisfaction',
  'curiosity',
  'wonder',
  'determination',
  'focus',
  'calm',
  'contemplation',
  'concern',
  'frustration',
  'fatigue',
  'longing',
  'gratitude',
  'connection',
  'confusion',
  'excitement',
  'melancholy',
  'hope',
  'awe',
] as const;

const actionNames = [
  'angry',
  'chat_answer',
  'chat_question',
  'coding_thinking',
  'coding_typing',
  'eating',
  'explain_gadget',
  'gadget_search',
  'gadget_surprise',
  'gadget_use',
  'greeting',
  'hungry',
  'nap',
  'protect',
  'random_thought',
  'research',
  'rest',
  'take_copter',
  'time_travel',
  'walk',
] as const;

const spriteFrames = (prefix: 'emotion' | 'action', name: string, count: number): string[] =>
  Array.from({ length: count }, (_, idx) => `${prefix}-${name}-${String(idx + 1).padStart(2, '0')}.png`);

const pingPong = (frames: string[]): string[] =>
  frames.length > 2 ? [...frames, ...frames.slice(1, -1).reverse()] : frames;

const emotionFrames = (name: string): string[] =>
  pingPong(spriteFrames('emotion', name, EMOTION_FRAME_COUNTS[name] ?? 4));

const actionFrames = (name: string): string[] =>
  pingPong(spriteFrames('action', name, 3));

const createEmotionAnimations = (): Record<string, SpriteAnimation> =>
  Object.fromEntries(
    emotionNames.map(name => [
      `emotion_${name}`,
      {
        frames: emotionFrames(name),
        frameDelay: name === 'calm' || name === 'satisfaction' ? 180 : 120,
        loop: true,
      },
    ])
  );

const createActionAnimations = (): Record<string, SpriteAnimation> =>
  Object.fromEntries(
    actionNames.map(name => [
      `action_${name}`,
      {
        frames: actionFrames(name),
        frameDelay: name === 'rest' || name === 'nap' ? 220 : 120,
        loop: true,
      },
    ])
  );

const GENERATED_EMOTION_ANIMATIONS = createEmotionAnimations();
const GENERATED_ACTION_ANIMATIONS = createActionAnimations();

export const SPRITE_ANIMATIONS: Record<string, SpriteAnimation> = {
  ...GENERATED_EMOTION_ANIMATIONS,
  ...GENERATED_ACTION_ANIMATIONS,

  // ═══════════════════════════════════════════════════════════════
  // BASIC MOVEMENTS (shime1-3)
  // ═══════════════════════════════════════════════════════════════
  stand: {
    frames: ['shime1.png', 'shime1.png', 'shime1.png', 'shime1a.png'],
    frameDelay: 150,
    loop: true,
  },
  walk: {
    frames: ['shime1.png', 'shime2.png', 'shime1.png', 'shime3.png'],
    frameDelay: 100,
    loop: true,
  },
  dash: {
    frames: ['shime1.png', 'shime2.png', 'shime1.png', 'shime3.png'],
    frameDelay: 33,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // FALLING & JUMPING (shime4, shime18-19, shime22)
  // ═══════════════════════════════════════════════════════════════
  fall: {
    frames: ['shime4.png'],
    frameDelay: 250,
    loop: true,
  },
  jump: {
    frames: ['shime22.png'],
    frameDelay: 250,
    loop: false,
  },
  bounce: {
    frames: ['shime18.png', 'shime19.png'],
    frameDelay: 67,
    loop: false,
  },
  trip: {
    frames: ['shime19.png', 'shime18.png', 'shime20.png', 'shime20.png', 'shime19.png'],
    frameDelay: 100,
    loop: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // DRAGGING (shime5-10, shimeX, shimeXa)
  // ═══════════════════════════════════════════════════════════════
  drag: {
    frames: ['shimeX.png', 'shimeXa.png'],
    frameDelay: 67,
    loop: true,
  },
  drag_left_far: {
    frames: ['shime9.png'],
    frameDelay: 83,
    loop: true,
  },
  drag_left: {
    frames: ['shime7.png'],
    frameDelay: 83,
    loop: true,
  },
  drag_right: {
    frames: ['shime6.png'],
    frameDelay: 83,
    loop: true,
  },
  drag_right_far: {
    frames: ['shime8.png'],
    frameDelay: 83,
    loop: true,
  },
  drag_extreme: {
    frames: ['shime10.png'],
    frameDelay: 83,
    loop: true,
  },
  resist: {
    frames: [
      'shime5.png', 'shime6.png', 'shime5.png', 'shime6.png',
      'shimeX.png', 'shime5.png', 'shime6.png', 'shime5.png',
      'shime6.png', 'shime5.png', 'shime6.png', 'shime5.png',
      'shime6.png', 'shimeX.png', 'shime5.png', 'shime6.png',
    ],
    frameDelay: 83,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SITTING (shime11, shime11a-d, shime26-31)
  // ═══════════════════════════════════════════════════════════════
  sit: {
    frames: [
      'shime11.png', 'shime11a.png', 'shime11b.png', 'shime11c.png',
      'shime11b.png', 'shime11c.png', 'shime11b.png', 'shime11c.png',
      'shime11b.png', 'shime11c.png', 'shime11b.png', 'shime11c.png',
      'shime11b.png', 'shime11d.png', 'shime11.png',
    ],
    frameDelay: 67,
    loop: true,
  },
  sit_lookup: {
    frames: ['shime26.png'],
    frameDelay: 250,
    loop: true,
  },
  sit_spin_head: {
    frames: ['shime26.png', 'shime27.png', 'shime28.png', 'shime29.png'],
    frameDelay: 83,
    loop: true,
  },
  sit_dangle: {
    frames: ['shime30.png', 'shime31.png'],
    frameDelay: 67,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // WALL CLIMBING (shime12-14, shime13a)
  // ═══════════════════════════════════════════════════════════════
  grab_wall: {
    frames: ['shime13.png', 'shime13.png', 'shime13.png', 'shime13a.png'],
    frameDelay: 150,
    loop: true,
  },
  climb_wall: {
    frames: [
      'shime14.png', 'shime14.png', 'shime13.png', 'shime12.png',
      'shime12.png', 'shime12.png', 'shime13.png', 'shime14.png',
    ],
    frameDelay: 67,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // FLYING (shime15-17) - Doraemon with Take-copter
  // ═══════════════════════════════════════════════════════════════
  fly: {
    frames: ['shime15.png', 'shime16.png', 'shime15.png', 'shime17.png'],
    frameDelay: 100,
    loop: true,
  },
  run: {
    frames: ['shime1.png', 'shime2.png', 'shime1.png', 'shime3.png'],
    frameDelay: 50,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // LAYING/SLEEPING (shime20, shime20a-b, shime21, shime21a)
  // ═══════════════════════════════════════════════════════════════
  sprawl: {
    frames: [
      'shime20.png', 'shime20a.png', 'shime20.png', 'shime20a.png',
      'shime20.png', 'shime20a.png', 'shime20.png', 'shime20a.png',
      'shime20b.png', 'shime21.png', 'shime21a.png', 'shime21.png',
      'shime21a.png', 'shime20b.png', 'shime21.png', 'shime21a.png',
      'shime21.png', 'shime21a.png', 'shime20b.png',
    ],
    frameDelay: 400,
    loop: true,
  },
  sleep: {
    frames: ['shime20.png', 'shime20a.png', 'shime20b.png'],
    frameDelay: 800,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // CEILING (shime23, shime23a-c, shime24, shime25)
  // ═══════════════════════════════════════════════════════════════
  grab_ceiling: {
    frames: [
      'shime23.png', 'shime23a.png', 'shime23.png', 'shime23a.png',
      'shime23.png', 'shime23a.png', 'shime23.png', 'shime23a.png',
      'shime23.png', 'shime23a.png', 'shime23.png', 'shime23a.png',
      'shime23.png', 'shime23a.png', 'shime23b.png', 'shime23a.png',
    ],
    frameDelay: 67,
    loop: true,
  },
  climb_ceiling: {
    frames: ['shime23c.png', 'shime24.png', 'shime25.png'],
    frameDelay: 67,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // WORKING/CARRYING (shime32-37)
  // ═══════════════════════════════════════════════════════════════
  carry: {
    frames: ['shime32.png', 'shime33.png'],
    frameDelay: 150,
    loop: true,
  },
  work_walk: {
    frames: ['shime34.png', 'shime35.png', 'shime34.png', 'shime36.png'],
    frameDelay: 100,
    loop: true,
  },
  work_hold: {
    frames: ['shime36.png'],
    frameDelay: 250,
    loop: true,
  },
  work_throw: {
    frames: ['shime37.png'],
    frameDelay: 500,
    loop: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // GENERATED ACTION / EMOTION ALIASES
  // ═══════════════════════════════════════════════════════════════
  pocket_search: { ...GENERATED_ACTION_ANIMATIONS.action_gadget_search, frameDelay: 150 },
  gadget_pull: { ...GENERATED_ACTION_ANIMATIONS.action_gadget_use, frameDelay: 100 },
  pull_up: { ...GENERATED_ACTION_ANIMATIONS.action_protect, frameDelay: 100 },
  helping: { ...GENERATED_EMOTION_ANIMATIONS.emotion_gratitude, frameDelay: 120 },
  success: { ...GENERATED_EMOTION_ANIMATIONS.emotion_satisfaction, frameDelay: 150 },
  wave: { ...GENERATED_EMOTION_ANIMATIONS.emotion_connection, frameDelay: 100 },
  greet: { ...GENERATED_ACTION_ANIMATIONS.action_greeting, frameDelay: 120 },
  cheer: { ...GENERATED_EMOTION_ANIMATIONS.emotion_excitement, frameDelay: 100 },
  celebrate: { ...GENERATED_EMOTION_ANIMATIONS.emotion_excitement, frameDelay: 80 },
  victory: { ...GENERATED_EMOTION_ANIMATIONS.emotion_pride, frameDelay: 150 },
  idle: { ...GENERATED_EMOTION_ANIMATIONS.emotion_calm, frameDelay: 300 },
  neutral: { ...GENERATED_EMOTION_ANIMATIONS.emotion_calm, frameDelay: 400 },
  happy: { ...GENERATED_EMOTION_ANIMATIONS.emotion_joy, frameDelay: 150 },
  sad: { ...GENERATED_EMOTION_ANIMATIONS.emotion_melancholy, frameDelay: 400 },
  excited: { ...GENERATED_EMOTION_ANIMATIONS.emotion_excitement, frameDelay: 80 },
  thinking: { ...GENERATED_EMOTION_ANIMATIONS.emotion_contemplation, frameDelay: 200 },
  confused: { ...GENERATED_EMOTION_ANIMATIONS.emotion_confusion, frameDelay: 100 },
  sleepy: { ...GENERATED_EMOTION_ANIMATIONS.emotion_fatigue, frameDelay: 500 },
  surprised: { ...GENERATED_EMOTION_ANIMATIONS.emotion_wonder, frameDelay: 100 },
  working: { ...GENERATED_EMOTION_ANIMATIONS.emotion_focus, frameDelay: 120 },
  frustrated: { ...GENERATED_EMOTION_ANIMATIONS.emotion_frustration, frameDelay: 80 },
  proud: { ...GENERATED_EMOTION_ANIMATIONS.emotion_pride, frameDelay: 150 },
  curious: { ...GENERATED_EMOTION_ANIMATIONS.emotion_curiosity, frameDelay: 150 },
  playful: { ...GENERATED_ACTION_ANIMATIONS.action_random_thought, frameDelay: 100 },
  determined: { ...GENERATED_EMOTION_ANIMATIONS.emotion_determination, frameDelay: 80 },
  relaxed: { ...GENERATED_EMOTION_ANIMATIONS.emotion_satisfaction, frameDelay: 300 },
  anxious: { ...GENERATED_EMOTION_ANIMATIONS.emotion_concern, frameDelay: 100 },
  angry: { ...GENERATED_ACTION_ANIMATIONS.action_angry, frameDelay: 100 },
  hungry: { ...GENERATED_ACTION_ANIMATIONS.action_hungry, frameDelay: 160 },

  // ═══════════════════════════════════════════════════════════════
  // CODING ANIMATIONS - Special IDE integration
  // ═══════════════════════════════════════════════════════════════
  coding: {
    frames: [
      ...GENERATED_ACTION_ANIMATIONS.action_coding_typing.frames,
      ...GENERATED_ACTION_ANIMATIONS.action_coding_thinking.frames,
      ...GENERATED_EMOTION_ANIMATIONS.emotion_focus.frames,
    ],
    frameDelay: 200,
    loop: true,
  },
  coding_intense: {
    frames: [
      ...GENERATED_ACTION_ANIMATIONS.action_coding_typing.frames,
      ...GENERATED_EMOTION_ANIMATIONS.emotion_determination.frames,
      ...GENERATED_EMOTION_ANIMATIONS.emotion_focus.frames,
    ],
    frameDelay: 120,
    loop: true,
  },
  coding_focused: {
    frames: GENERATED_EMOTION_ANIMATIONS.emotion_focus.frames,
    frameDelay: 180,
    loop: true,
  },
  coding_typing: {
    frames: GENERATED_ACTION_ANIMATIONS.action_coding_typing.frames,
    frameDelay: 100,
    loop: true,
  },
  coding_thinking: {
    frames: GENERATED_ACTION_ANIMATIONS.action_coding_thinking.frames,
    frameDelay: 300,
    loop: true,
  },
  coding_celebrate: {
    frames: GENERATED_EMOTION_ANIMATIONS.emotion_pride.frames,
    frameDelay: 120,
    loop: true,
  },
  
  // Coding All Day - comprehensive coding animation
  coding_allday: {
    frames: [
      ...GENERATED_ACTION_ANIMATIONS.action_coding_typing.frames,
      ...GENERATED_ACTION_ANIMATIONS.action_coding_thinking.frames,
      ...GENERATED_EMOTION_ANIMATIONS.emotion_focus.frames,
      ...GENERATED_ACTION_ANIMATIONS.action_research.frames,
      ...GENERATED_EMOTION_ANIMATIONS.emotion_determination.frames,
      ...GENERATED_ACTION_ANIMATIONS.action_coding_typing.frames,
      ...GENERATED_ACTION_ANIMATIONS.action_rest.frames,
      ...GENERATED_ACTION_ANIMATIONS.action_coding_thinking.frames,
    ],
    frameDelay: 160,
    loop: true,
  },

  // Coding Celebrate - generated celebration sequence in the shared 128px frame box
  coding_celebrate_full: {
    frames: [
      ...GENERATED_EMOTION_ANIMATIONS.emotion_pride.frames,
      ...GENERATED_EMOTION_ANIMATIONS.emotion_excitement.frames,
      ...GENERATED_ACTION_ANIMATIONS.action_chat_answer.frames,
    ],
    frameDelay: 100,
    loop: true,
  },
};

export function getAnimation(name: string): SpriteAnimation | null {
  return SPRITE_ANIMATIONS[name] || null;
}
