export type SpriteAnimation = {
  frames: string[];
  frameDelay: number;
  loop: boolean;
};

export const PHYSICS = {
  GRAVITY: 2,
  RESISTANCE_X: 0.05,
  RESISTANCE_Y: 0.1,
  BOUNCE: 0.3,
  MAX_VELOCITY: 15,
  DRAG_DAMPING: 0.95,
} as const;

export const SPRITE_ANIMATIONS: Record<string, SpriteAnimation> = {
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
  // RUNNING (shime15-17)
  // ═══════════════════════════════════════════════════════════════
  run: {
    frames: ['shime15.png', 'shime16.png', 'shime15.png', 'shime17.png'],
    frameDelay: 33,
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
  // SPECIAL ACTIONS (shime38-40)
  // ═══════════════════════════════════════════════════════════════
  pocket_search: {
    frames: ['shime38.png', 'shime38a.png', 'shime39.png', 'shime40.png'],
    frameDelay: 150,
    loop: true,
  },
  gadget_pull: {
    frames: ['shime38.png', 'shime38a.png', 'shime39.png', 'shime40.png', 'shime39.png'],
    frameDelay: 100,
    loop: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // PULL UP / HELPING (shime41, shime41a-n)
  // ═══════════════════════════════════════════════════════════════
  pull_up: {
    frames: [
      'shime41.png', 'shime41a.png', 'shime41b.png', 'shime41c.png',
      'shime41d.png', 'shime41e.png', 'shime41f.png', 'shime41g.png',
      'shime41h.png', 'shime41i.png', 'shime41j.png', 'shime41k.png',
      'shime41l.png', 'shime41m.png', 'shime41n.png',
    ],
    frameDelay: 100,
    loop: false,
  },
  helping: {
    frames: ['shime41.png', 'shime41a.png', 'shime41b.png', 'shime41c.png', 'shime41d.png'],
    frameDelay: 120,
    loop: true,
  },
  success: {
    frames: ['shime41l.png', 'shime41m.png', 'shime41n.png'],
    frameDelay: 150,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // WAVING/GREETING (shime42-45)
  // ═══════════════════════════════════════════════════════════════
  wave: {
    frames: ['shime42.png', 'shime43.png', 'shime44.png', 'shime45.png'],
    frameDelay: 100,
    loop: true,
  },
  greet: {
    frames: ['shime42.png', 'shime43.png', 'shime42.png', 'shime44.png', 'shime45.png'],
    frameDelay: 120,
    loop: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // CHEERING/CELEBRATING (shime46-50)
  // ═══════════════════════════════════════════════════════════════
  cheer: {
    frames: ['shime46.png', 'shime47.png', 'shime48.png', 'shime49.png', 'shime50.png'],
    frameDelay: 100,
    loop: true,
  },
  celebrate: {
    frames: ['shime46.png', 'shime47.png', 'shime48.png', 'shime49.png', 'shime50.png', 'shime49.png', 'shime48.png'],
    frameDelay: 80,
    loop: true,
  },
  victory: {
    frames: ['shime50.png', 'shime49.png', 'shime50.png'],
    frameDelay: 150,
    loop: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // EMOTION-SPECIFIC ANIMATIONS
  // ═══════════════════════════════════════════════════════════════
  
  // Neutral - calm standing/sitting
  idle: {
    frames: ['shime1.png', 'shime1.png', 'shime1a.png'],
    frameDelay: 300,
    loop: true,
  },
  neutral: {
    frames: ['shime1.png', 'shime1.png', 'shime1a.png'],
    frameDelay: 400,
    loop: true,
  },

  // Happy - jumping, waving
  happy: {
    frames: ['shime22.png', 'shime1.png', 'shime42.png', 'shime43.png', 'shime41n.png'],
    frameDelay: 150,
    loop: true,
  },

  // Sad - laying down, moping
  sad: {
    frames: ['shime20.png', 'shime20a.png', 'shime21.png', 'shime21a.png'],
    frameDelay: 400,
    loop: true,
  },

  // Excited - running, cheering
  excited: {
    frames: ['shime15.png', 'shime16.png', 'shime17.png', 'shime22.png', 'shime46.png', 'shime47.png'],
    frameDelay: 80,
    loop: true,
  },

  // Thinking - head spinning, looking up
  thinking: {
    frames: ['shime26.png', 'shime27.png', 'shime28.png', 'shime29.png', 'shime38.png', 'shime38a.png'],
    frameDelay: 200,
    loop: true,
  },

  // Confused - dizzy head spin, tripping
  confused: {
    frames: ['shime26.png', 'shime27.png', 'shime28.png', 'shime29.png', 'shime19.png', 'shime18.png'],
    frameDelay: 100,
    loop: true,
  },

  // Sleepy - laying, yawning
  sleepy: {
    frames: ['shime20.png', 'shime20a.png', 'shime20b.png', 'shime11.png', 'shime11d.png'],
    frameDelay: 500,
    loop: true,
  },

  // Surprised - jumping, falling
  surprised: {
    frames: ['shime4.png', 'shime22.png', 'shime18.png', 'shime19.png'],
    frameDelay: 100,
    loop: true,
  },

  // Working - carrying, walking with items
  working: {
    frames: ['shime34.png', 'shime35.png', 'shime36.png', 'shime32.png', 'shime33.png'],
    frameDelay: 120,
    loop: true,
  },

  // Frustrated - resisting, struggling
  frustrated: {
    frames: ['shime5.png', 'shime6.png', 'shime7.png', 'shime8.png', 'shime9.png', 'shime10.png'],
    frameDelay: 80,
    loop: true,
  },

  // Proud - success pose, victory
  proud: {
    frames: ['shime41n.png', 'shime50.png', 'shime49.png', 'shime48.png', 'shime41m.png'],
    frameDelay: 150,
    loop: true,
  },

  // Curious - looking around, searching pocket
  curious: {
    frames: ['shime26.png', 'shime38.png', 'shime38a.png', 'shime39.png', 'shime13.png', 'shime13a.png'],
    frameDelay: 150,
    loop: true,
  },

  // Playful - bouncing, waving, running
  playful: {
    frames: ['shime18.png', 'shime19.png', 'shime22.png', 'shime42.png', 'shime43.png', 'shime15.png', 'shime16.png'],
    frameDelay: 100,
    loop: true,
  },

  // Determined - focused walking, climbing
  determined: {
    frames: ['shime14.png', 'shime13.png', 'shime12.png', 'shime15.png', 'shime16.png', 'shime17.png'],
    frameDelay: 80,
    loop: true,
  },

  // Relaxed - sitting calmly, dangling legs
  relaxed: {
    frames: ['shime11.png', 'shime11a.png', 'shime30.png', 'shime31.png', 'shime26.png'],
    frameDelay: 300,
    loop: true,
  },

  // Anxious - fidgeting, looking around nervously
  anxious: {
    frames: ['shime26.png', 'shime27.png', 'shime1.png', 'shime1a.png', 'shime28.png', 'shime29.png', 'shime7.png'],
    frameDelay: 100,
    loop: true,
  },
};

export function getAnimation(name: string): SpriteAnimation | null {
  return SPRITE_ANIMATIONS[name] || null;
}
