/**
 * Sprite Configuration - Complete mapping of ALL 80 Shimeji sprites
 * Enhanced with rich emotions, dynamic animations, and special effects
 */

export type SpriteConfig = {
  actions: Record<string, SpriteAnimation>;
  emotions: Record<string, SpriteAnimation>;
  special: Record<string, SpriteAnimation>;
};

export type SpriteAnimation = {
  frames: string[];
  frameDelay: number;  // ms per frame
  loop: boolean;
};

/**
 * Complete sprite mapping - ALL 80 sprites used with rich animations!
 */
export const DORAEMON_SPRITES: SpriteConfig = {
  // ═══════════════════════════════════════════════════════════════
  // ACTIONS - Physical behaviors for the Shimeji engine
  // ═══════════════════════════════════════════════════════════════
  actions: {
    // Standing/Idle - gentle breathing animation
    idle: {
      frames: ['shime1.png', 'shime1.png', 'shime1.png', 'shime1a.png', 'shime1.png', 'shime1.png'],
      frameDelay: 300,
      loop: true,
    },
    
    // Walking - smooth walk cycle
    walk: {
      frames: ['shime1.png', 'shime2.png', 'shime1.png', 'shime3.png'],
      frameDelay: 120,
      loop: true,
    },
    
    // Running - fast run cycle
    run: {
      frames: ['shime15.png', 'shime16.png', 'shime15.png', 'shime17.png'],
      frameDelay: 80,
      loop: true,
    },
    
    // Falling
    fall: {
      frames: ['shime4.png'],
      frameDelay: 100,
      loop: true,
    },
    
    // Jumping
    jump: {
      frames: ['shime22.png'],
      frameDelay: 100,
      loop: false,
    },
    
    // Bouncing/Landing
    bounce: {
      frames: ['shime18.png', 'shime19.png', 'shime18.png'],
      frameDelay: 100,
      loop: false,
    },
    
    // Sitting - relaxed animation with occasional movement
    sit: {
      frames: [
        'shime11.png', 'shime11.png', 'shime11a.png', 'shime11b.png', 
        'shime11c.png', 'shime11b.png', 'shime11c.png', 'shime11d.png',
        'shime11.png', 'shime11.png'
      ],
      frameDelay: 200,
      loop: true,
    },
    
    // Sitting and looking up
    sit_lookup: {
      frames: ['shime26.png', 'shime27.png', 'shime28.png', 'shime29.png', 'shime28.png', 'shime27.png'],
      frameDelay: 150,
      loop: true,
    },
    
    // Sitting with dangling legs
    sit_legs: {
      frames: ['shime30.png', 'shime31.png'],
      frameDelay: 200,
      loop: true,
    },
    
    // Laying/Sprawl - breathing while laying
    lay: {
      frames: [
        'shime20.png', 'shime20a.png', 'shime20.png', 'shime20a.png',
        'shime20b.png', 'shime21.png', 'shime21a.png', 'shime21.png', 'shime21a.png',
        'shime20b.png'
      ],
      frameDelay: 300,
      loop: true,
    },
    
    // Wall grab
    wall_grab: {
      frames: ['shime13.png', 'shime13.png', 'shime13a.png', 'shime13.png'],
      frameDelay: 250,
      loop: true,
    },
    
    // Wall climb
    climb: {
      frames: ['shime14.png', 'shime13.png', 'shime12.png', 'shime12.png', 'shime13.png', 'shime14.png'],
      frameDelay: 120,
      loop: true,
    },
    
    // Ceiling grab
    ceiling: {
      frames: ['shime23.png', 'shime23a.png', 'shime23.png', 'shime23b.png'],
      frameDelay: 200,
      loop: true,
    },
    
    // Ceiling climb
    ceiling_climb: {
      frames: ['shime23c.png', 'shime24.png', 'shime25.png'],
      frameDelay: 120,
      loop: true,
    },
    
    // Dragged - wiggling
    drag: {
      frames: ['shimeX.png', 'shimeXa.png'],
      frameDelay: 100,
      loop: true,
    },
    
    // Dragged left
    drag_left: {
      frames: ['shime9.png', 'shime7.png', 'shime9.png'],
      frameDelay: 120,
      loop: true,
    },
    
    // Dragged right
    drag_right: {
      frames: ['shime6.png', 'shime8.png', 'shime10.png', 'shime8.png'],
      frameDelay: 120,
      loop: true,
    },
    
    // Resisting drag - struggling animation
    drag_resist: {
      frames: ['shime5.png', 'shime6.png', 'shime5.png', 'shime6.png', 'shimeX.png', 'shime5.png', 'shime6.png'],
      frameDelay: 80,
      loop: true,
    },
    
    // Tripping
    trip: {
      frames: ['shime19.png', 'shime18.png', 'shime20.png', 'shime19.png'],
      frameDelay: 100,
      loop: false,
    },
    
    // Carrying
    carry: {
      frames: ['shime34.png', 'shime35.png', 'shime34.png', 'shime36.png'],
      frameDelay: 150,
      loop: true,
    },
    
    // Throwing
    throw: {
      frames: ['shime37.png'],
      frameDelay: 100,
      loop: false,
    },
    
    // Thinking/Pocket check - searching the 4D pocket (for random behavior)
    thinking: {
      frames: [
        'shime38.png', 'shime38a.png', 'shime38.png', 'shime38a.png',
        'shime39.png', 'shime40.png', 'shime38.png'
      ],
      frameDelay: 200,
      loop: true,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // EMOTIONS - Rich emotional expressions with dynamic animations
  // ═══════════════════════════════════════════════════════════════
  emotions: {
    // Neutral - calm idle with occasional blink
    neutral: {
      frames: ['shime1.png', 'shime1.png', 'shime1.png', 'shime1a.png'],
      frameDelay: 400,
      loop: true,
    },
    
    // Happy - bouncy excited animation
    happy: {
      frames: ['shime22.png', 'shime1.png', 'shime22.png', 'shime41n.png', 'shime1.png'],
      frameDelay: 200,
      loop: true,
    },
    
    // Very Happy / Celebrating - full celebration
    celebrating: {
      frames: [
        'shime22.png', 'shime41n.png', 'shime22.png', 'shime1.png',
        'shime15.png', 'shime16.png', 'shime17.png', 'shime22.png'
      ],
      frameDelay: 150,
      loop: true,
    },
    
    // Sad - laying down dejected
    sad: {
      frames: ['shime20.png', 'shime20a.png', 'shime20.png', 'shime20b.png', 'shime21.png', 'shime21a.png'],
      frameDelay: 400,
      loop: true,
    },
    
    // Crying / Very Sad
    crying: {
      frames: ['shime20.png', 'shime20a.png', 'shime20b.png', 'shime21.png', 'shime21a.png', 'shime20b.png'],
      frameDelay: 250,
      loop: true,
    },
    
    // Thinking - searching the 4D pocket
    thinking: {
      frames: [
        'shime38.png', 'shime38a.png', 'shime38.png', 'shime38a.png',
        'shime39.png', 'shime40.png', 'shime38.png'
      ],
      frameDelay: 200,
      loop: true,
    },
    
    // Deep Thinking - looking up and pondering
    pondering: {
      frames: ['shime26.png', 'shime27.png', 'shime28.png', 'shime29.png', 'shime28.png', 'shime26.png'],
      frameDelay: 300,
      loop: true,
    },
    
    // Surprised - startled reaction
    surprised: {
      frames: ['shime4.png', 'shime18.png', 'shime4.png', 'shime19.png'],
      frameDelay: 150,
      loop: true,
    },
    
    // Shocked - extreme surprise
    shocked: {
      frames: ['shime4.png', 'shime18.png', 'shime19.png', 'shime4.png', 'shime18.png'],
      frameDelay: 100,
      loop: true,
    },
    
    // Angry - struggling and resisting
    angry: {
      frames: ['shime5.png', 'shime6.png', 'shime5.png', 'shime6.png', 'shime10.png', 'shime5.png'],
      frameDelay: 100,
      loop: true,
    },
    
    // Frustrated - more intense anger
    frustrated: {
      frames: [
        'shime5.png', 'shime6.png', 'shime5.png', 'shime6.png',
        'shime10.png', 'shime8.png', 'shime10.png', 'shime5.png'
      ],
      frameDelay: 80,
      loop: true,
    },
    
    // Sleepy - drowsy laying
    sleepy: {
      frames: ['shime20.png', 'shime20a.png', 'shime20.png', 'shime20a.png', 'shime20b.png'],
      frameDelay: 500,
      loop: true,
    },
    
    // Sleeping - deep sleep with breathing
    sleeping: {
      frames: ['shime21.png', 'shime21a.png', 'shime21.png', 'shime21a.png'],
      frameDelay: 600,
      loop: true,
    },
    
    // Excited - running around happily
    excited: {
      frames: ['shime15.png', 'shime16.png', 'shime17.png', 'shime22.png', 'shime15.png', 'shime16.png'],
      frameDelay: 100,
      loop: true,
    },
    
    // Working - using gadget from pocket
    working: {
      frames: [
        'shime41.png', 'shime41a.png', 'shime41b.png', 'shime41c.png',
        'shime41d.png', 'shime41e.png', 'shime41f.png', 'shime41g.png', 'shime41h.png'
      ],
      frameDelay: 150,
      loop: true,
    },
    
    // Success - gadget worked!
    success: {
      frames: ['shime41i.png', 'shime41j.png', 'shime41k.png', 'shime41l.png', 'shime41m.png', 'shime41n.png'],
      frameDelay: 120,
      loop: false,
    },
    
    // Curious - looking around
    curious: {
      frames: ['shime26.png', 'shime1.png', 'shime27.png', 'shime1a.png', 'shime28.png', 'shime1.png'],
      frameDelay: 250,
      loop: true,
    },
    
    // Confused - head spinning
    confused: {
      frames: ['shime26.png', 'shime27.png', 'shime28.png', 'shime29.png'],
      frameDelay: 120,
      loop: true,
    },
    
    // Relaxed - sitting comfortably
    relaxed: {
      frames: ['shime11.png', 'shime11a.png', 'shime11.png', 'shime30.png', 'shime31.png', 'shime30.png'],
      frameDelay: 350,
      loop: true,
    },
    
    // Bored - sitting and fidgeting
    bored: {
      frames: [
        'shime11.png', 'shime11a.png', 'shime11b.png', 'shime11c.png',
        'shime11d.png', 'shime11c.png', 'shime11b.png', 'shime11a.png'
      ],
      frameDelay: 200,
      loop: true,
    },
    
    // Determined - ready for action
    determined: {
      frames: ['shime1.png', 'shime38.png', 'shime1.png', 'shime15.png'],
      frameDelay: 200,
      loop: true,
    },
    
    // Nervous - fidgeting
    nervous: {
      frames: ['shime1.png', 'shime1a.png', 'shime7.png', 'shime1.png', 'shime9.png', 'shime1a.png'],
      frameDelay: 150,
      loop: true,
    },
    
    // Proud - standing tall after success
    proud: {
      frames: ['shime41n.png', 'shime1.png', 'shime41n.png', 'shime32.png', 'shime33.png'],
      frameDelay: 300,
      loop: true,
    },
    
    // Mischievous - playful
    mischievous: {
      frames: ['shime1a.png', 'shime38.png', 'shime38a.png', 'shime1a.png', 'shime22.png'],
      frameDelay: 180,
      loop: true,
    },
    
    // Waiting - patient idle
    waiting: {
      frames: ['shime1.png', 'shime1.png', 'shime1a.png', 'shime26.png', 'shime1.png'],
      frameDelay: 400,
      loop: true,
    },
    
    // Hanging - on ceiling/wall
    hanging: {
      frames: ['shime23.png', 'shime23a.png', 'shime23b.png', 'shime23a.png'],
      frameDelay: 250,
      loop: true,
    },
    
    // Climbing - active climbing
    climbing: {
      frames: ['shime12.png', 'shime13.png', 'shime14.png', 'shime13.png'],
      frameDelay: 150,
      loop: true,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // SPECIAL - One-time animations for special events
  // ═══════════════════════════════════════════════════════════════
  special: {
    // Clone/Multiply animation - when spawning new instance
    clone: {
      frames: [
        'shime42.png', 'shime43.png', 'shime44.png', 'shime45.png',
        'shime46.png', 'shime47.png', 'shime48.png', 'shime49.png', 'shime50.png'
      ],
      frameDelay: 100,
      loop: false,
    },
    
    // Pull from pocket - full 4D pocket animation
    pocket_pull: {
      frames: [
        'shime38.png', 'shime38a.png', 'shime38.png', 'shime38a.png',
        'shime39.png', 'shime40.png',
        'shime41.png', 'shime41a.png', 'shime41b.png', 'shime41c.png', 'shime41d.png',
        'shime41e.png', 'shime41f.png', 'shime41g.png', 'shime41h.png',
        'shime41i.png', 'shime41j.png', 'shime41k.png', 'shime41l.png', 'shime41m.png', 'shime41n.png'
      ],
      frameDelay: 80,
      loop: false,
    },
    
    // Greeting - wave hello
    greeting: {
      frames: ['shime1.png', 'shime22.png', 'shime1.png', 'shime22.png', 'shime1.png', 'shime1a.png'],
      frameDelay: 150,
      loop: false,
    },
    
    // Goodbye - wave bye
    goodbye: {
      frames: ['shime1.png', 'shime1a.png', 'shime22.png', 'shime1.png', 'shime20.png', 'shime20a.png'],
      frameDelay: 200,
      loop: false,
    },
    
    // Error/Fail - trip and fall
    error: {
      frames: ['shime19.png', 'shime18.png', 'shime20.png', 'shime20a.png', 'shime20b.png'],
      frameDelay: 120,
      loop: false,
    },
    
    // Loading - searching pocket
    loading: {
      frames: ['shime38.png', 'shime38a.png', 'shime39.png', 'shime40.png'],
      frameDelay: 150,
      loop: true,
    },
    
    // Connected - celebration
    connected: {
      frames: ['shime22.png', 'shime41n.png', 'shime22.png', 'shime1.png'],
      frameDelay: 150,
      loop: false,
    },
    
    // Disconnected - sad fall
    disconnected: {
      frames: ['shime4.png', 'shime18.png', 'shime20.png', 'shime20a.png'],
      frameDelay: 200,
      loop: false,
    },
    
    // Throw window - for fun interaction
    throw_window: {
      frames: ['shime34.png', 'shime35.png', 'shime36.png', 'shime37.png'],
      frameDelay: 100,
      loop: false,
    },
    
    // Wake up - from sleep
    wakeup: {
      frames: ['shime21.png', 'shime20b.png', 'shime20.png', 'shime19.png', 'shime1.png', 'shime1a.png'],
      frameDelay: 200,
      loop: false,
    },
    
    // Fall asleep
    fall_asleep: {
      frames: ['shime1.png', 'shime11.png', 'shime20.png', 'shime20a.png', 'shime21.png', 'shime21a.png'],
      frameDelay: 300,
      loop: false,
    },
  },
};

/**
 * Get animation by name from any category
 */
export function getAnimation(name: string): SpriteAnimation | null {
  return DORAEMON_SPRITES.actions[name] 
    || DORAEMON_SPRITES.emotions[name] 
    || DORAEMON_SPRITES.special[name] 
    || null;
}

/**
 * Get all unique sprite filenames used
 */
export function getAllSpriteFiles(): string[] {
  const files = new Set<string>();
  
  const addFrames = (anims: Record<string, SpriteAnimation>) => {
    for (const anim of Object.values(anims)) {
      anim.frames.forEach(f => files.add(f));
    }
  };
  
  addFrames(DORAEMON_SPRITES.actions);
  addFrames(DORAEMON_SPRITES.emotions);
  addFrames(DORAEMON_SPRITES.special);
  
  return Array.from(files).sort();
}

/**
 * All 80 sprites in the Doraemon Shimeji folder
 */
export const ALL_SPRITES = [
  'icon.png',
  'shime1.png', 'shime1a.png',
  'shime2.png', 'shime3.png', 'shime4.png', 'shime5.png', 'shime6.png',
  'shime7.png', 'shime8.png', 'shime9.png', 'shime10.png',
  'shime11.png', 'shime11a.png', 'shime11b.png', 'shime11c.png', 'shime11d.png',
  'shime12.png', 'shime13.png', 'shime13a.png', 'shime14.png',
  'shime15.png', 'shime16.png', 'shime17.png',
  'shime18.png', 'shime19.png',
  'shime20.png', 'shime20a.png', 'shime20b.png',
  'shime21.png', 'shime21a.png', 'shime22.png',
  'shime23.png', 'shime23a.png', 'shime23b.png', 'shime23c.png',
  'shime24.png', 'shime25.png',
  'shime26.png', 'shime27.png', 'shime28.png', 'shime29.png',
  'shime30.png', 'shime31.png', 'shime32.png', 'shime33.png',
  'shime34.png', 'shime35.png', 'shime36.png', 'shime37.png',
  'shime38.png', 'shime38a.png', 'shime39.png', 'shime40.png',
  'shime41.png', 'shime41a.png', 'shime41b.png', 'shime41c.png', 'shime41d.png',
  'shime41e.png', 'shime41f.png', 'shime41g.png', 'shime41h.png',
  'shime41i.png', 'shime41j.png', 'shime41k.png', 'shime41l.png', 'shime41m.png', 'shime41n.png',
  'shime42.png', 'shime43.png', 'shime44.png', 'shime45.png',
  'shime46.png', 'shime47.png', 'shime48.png', 'shime49.png', 'shime50.png',
  'shimeX.png', 'shimeXa.png',
];
