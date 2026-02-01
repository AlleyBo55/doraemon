/**
 * Shimeji Engine - Desktop mascot physics and behaviors
 * Makes Doraemon walk, climb, fall, and live freely on your desktop
 * 
 * Features:
 * - Physics-based movement (gravity, wall climbing)
 * - Random "sentient" behaviors (looking around, stretching, yawning)
 * - Emotion-driven behavior changes
 * - Drag and drop interaction
 */

export type ShimejiState = 
  | 'idle'
  | 'walk_left'
  | 'walk_right'
  | 'climb_left'
  | 'climb_right'
  | 'fall'
  | 'sit'
  | 'drag'
  | 'jump'
  | 'look_around'    // Random sentient behavior
  | 'stretch'        // Random sentient behavior
  | 'yawn'           // Random sentient behavior
  | 'scratch'        // Random sentient behavior
  | 'pocket_check';  // Random sentient behavior - checking 4D pocket

export type ShimejiSprites = {
  idle: string[];
  walk: string[];
  climb: string[];
  fall: string[];
  sit: string[];
  jump: string[];
  // Emotion overlays (optional)
  emotions?: {
    happy?: string[];
    sad?: string[];
    thinking?: string[];
    surprised?: string[];
    angry?: string[];
    sleepy?: string[];
  };
};

export type Position = { x: number; y: number };
export type Velocity = { vx: number; vy: number };

const GRAVITY = 0.5;
const WALK_SPEED = 2;
const CLIMB_SPEED = 1.5;
const FALL_SPEED_MAX = 10;
const GROUND_MARGIN = 50; // Distance from bottom of screen

// Random behavior chances (per behavior check)
const RANDOM_BEHAVIOR_CHANCE = 0.15; // 15% chance to do something random when idle
const RANDOM_BEHAVIORS: { state: ShimejiState; weight: number; duration: [number, number] }[] = [
  { state: 'look_around', weight: 30, duration: [2000, 4000] },
  { state: 'stretch', weight: 20, duration: [1500, 2500] },
  { state: 'yawn', weight: 15, duration: [2000, 3000] },
  { state: 'scratch', weight: 20, duration: [1000, 2000] },
  { state: 'pocket_check', weight: 15, duration: [2500, 4000] },
];

export class ShimejiEngine {
  private state: ShimejiState = 'idle';
  private position: Position;
  private velocity: Velocity = { vx: 0, vy: 0 };
  private screenWidth: number;
  private screenHeight: number;
  private spriteSize = { width: 128, height: 128 };
  
  private frameIndex = 0;
  private frameTimer = 0;
  private frameDelay = 150; // ms per frame
  
  private behaviorTimer = 0;
  private behaviorDuration = 0;
  
  private isDragging = false;
  private isOnGround = true;
  private isOnWall: 'left' | 'right' | null = null;

  private onPositionChange: ((pos: Position) => void) | null = null;
  private onStateChange: ((state: ShimejiState, frame: number, flip: boolean) => void) | null = null;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    
    // Start at random position on ground
    this.position = {
      x: Math.random() * (screenWidth - this.spriteSize.width),
      y: screenHeight - this.spriteSize.height - GROUND_MARGIN,
    };
  }

  setCallbacks(
    onPositionChange: (pos: Position) => void,
    onStateChange: (state: ShimejiState, frame: number, flip: boolean) => void
  ) {
    this.onPositionChange = onPositionChange;
    this.onStateChange = onStateChange;
  }

  updateScreenSize(width: number, height: number) {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  // Called every frame (~16ms)
  update(deltaTime: number) {
    if (this.isDragging) {
      return; // Don't update physics while dragging
    }

    // Update behavior timer
    this.behaviorTimer += deltaTime;
    if (this.behaviorTimer >= this.behaviorDuration) {
      this.chooseBehavior();
    }

    // Update animation frame
    this.frameTimer += deltaTime;
    if (this.frameTimer >= this.frameDelay) {
      this.frameTimer = 0;
      this.frameIndex++;
    }

    // Apply physics based on state
    this.applyPhysics(deltaTime);

    // Update position
    this.position.x += this.velocity.vx;
    this.position.y += this.velocity.vy;

    // Boundary checks
    this.checkBoundaries();

    // Notify listeners
    const flip = this.state === 'walk_left' || this.state === 'climb_left';
    this.onPositionChange?.(this.position);
    this.onStateChange?.(this.state, this.frameIndex, flip);
  }

  private applyPhysics(_deltaTime: number) {
    switch (this.state) {
      case 'idle':
      case 'sit':
      case 'look_around':
      case 'stretch':
      case 'yawn':
      case 'scratch':
      case 'pocket_check':
        // Stationary behaviors
        this.velocity.vx = 0;
        if (!this.isOnGround && !this.isOnWall) {
          this.state = 'fall';
        }
        break;

      case 'walk_left':
        this.velocity.vx = -WALK_SPEED;
        if (!this.isOnGround) {
          this.state = 'fall';
        }
        break;

      case 'walk_right':
        this.velocity.vx = WALK_SPEED;
        if (!this.isOnGround) {
          this.state = 'fall';
        }
        break;

      case 'climb_left':
      case 'climb_right':
        this.velocity.vy = -CLIMB_SPEED;
        this.velocity.vx = 0;
        break;

      case 'fall':
        this.velocity.vy = Math.min(this.velocity.vy + GRAVITY, FALL_SPEED_MAX);
        this.velocity.vx *= 0.98; // Air resistance
        break;

      case 'jump':
        this.velocity.vy += GRAVITY;
        if (this.velocity.vy > 0) {
          this.state = 'fall';
        }
        break;
    }
  }

  private checkBoundaries() {
    const groundY = this.screenHeight - this.spriteSize.height - GROUND_MARGIN;

    // Ground collision
    if (this.position.y >= groundY) {
      this.position.y = groundY;
      this.velocity.vy = 0;
      this.isOnGround = true;
      if (this.state === 'fall') {
        this.state = 'idle';
        this.chooseBehavior();
      }
    } else {
      this.isOnGround = false;
    }

    // Left wall
    if (this.position.x <= 0) {
      this.position.x = 0;
      this.isOnWall = 'left';
      if (this.state === 'walk_left') {
        // Start climbing or turn around
        if (Math.random() > 0.5) {
          this.state = 'climb_left';
          this.behaviorDuration = 2000 + Math.random() * 3000;
          this.behaviorTimer = 0;
        } else {
          this.state = 'walk_right';
        }
      }
    } else if (this.position.x >= this.screenWidth - this.spriteSize.width) {
      // Right wall
      this.position.x = this.screenWidth - this.spriteSize.width;
      this.isOnWall = 'right';
      if (this.state === 'walk_right') {
        if (Math.random() > 0.5) {
          this.state = 'climb_right';
          this.behaviorDuration = 2000 + Math.random() * 3000;
          this.behaviorTimer = 0;
        } else {
          this.state = 'walk_left';
        }
      }
    } else {
      this.isOnWall = null;
    }

    // Top of screen (stop climbing)
    if (this.position.y <= 0) {
      this.position.y = 0;
      if (this.state === 'climb_left' || this.state === 'climb_right') {
        this.state = 'fall';
        this.velocity.vy = 0;
      }
    }

    // Stop climbing if not on wall
    if ((this.state === 'climb_left' || this.state === 'climb_right') && !this.isOnWall) {
      this.state = 'fall';
    }
  }

  private chooseBehavior() {
    if (!this.isOnGround && !this.isOnWall) {
      return; // Don't change behavior while in air
    }

    const rand = Math.random();
    
    if (this.isOnWall) {
      // On wall - climb, fall, or keep climbing
      if (rand < 0.3) {
        this.state = 'fall';
        this.isOnWall = null;
      } else {
        // Keep climbing
        this.behaviorDuration = 1000 + Math.random() * 2000;
      }
    } else if (this.isOnGround) {
      // Check for random "sentient" behavior first
      if (rand < RANDOM_BEHAVIOR_CHANCE) {
        this.doRandomSentientBehavior();
        return;
      }
      
      // Normal behaviors
      const normalRand = Math.random();
      if (normalRand < 0.25) {
        this.state = 'idle';
        this.behaviorDuration = 2000 + Math.random() * 3000;
      } else if (normalRand < 0.45) {
        this.state = 'sit';
        this.behaviorDuration = 3000 + Math.random() * 5000;
      } else if (normalRand < 0.7) {
        this.state = 'walk_left';
        this.behaviorDuration = 2000 + Math.random() * 4000;
      } else {
        this.state = 'walk_right';
        this.behaviorDuration = 2000 + Math.random() * 4000;
      }
    }

    this.behaviorTimer = 0;
    this.frameIndex = 0;
  }

  /**
   * Randomly choose a "sentient" behavior to make Doraemon feel alive
   */
  private doRandomSentientBehavior() {
    // Weighted random selection
    const totalWeight = RANDOM_BEHAVIORS.reduce((sum, b) => sum + b.weight, 0);
    let roll = Math.random() * totalWeight;
    
    for (const behavior of RANDOM_BEHAVIORS) {
      roll -= behavior.weight;
      if (roll <= 0) {
        this.state = behavior.state;
        this.behaviorDuration = behavior.duration[0] + Math.random() * (behavior.duration[1] - behavior.duration[0]);
        this.behaviorTimer = 0;
        this.frameIndex = 0;
        return;
      }
    }
    
    // Fallback to idle
    this.state = 'idle';
    this.behaviorDuration = 2000;
    this.behaviorTimer = 0;
    this.frameIndex = 0;
  }

  // Called when user starts dragging
  startDrag() {
    this.isDragging = true;
    this.state = 'drag';
    this.velocity = { vx: 0, vy: 0 };
  }

  // Called while dragging
  drag(x: number, y: number) {
    if (this.isDragging) {
      this.position.x = x - this.spriteSize.width / 2;
      this.position.y = y - this.spriteSize.height / 2;
      this.onPositionChange?.(this.position);
    }
  }

  // Called when user stops dragging
  endDrag() {
    this.isDragging = false;
    this.state = 'fall';
    this.isOnGround = false;
    this.isOnWall = null;
  }

  // Force a specific behavior (for emotion reactions)
  triggerBehavior(behavior: 'jump' | 'sit' | 'idle') {
    switch (behavior) {
      case 'jump':
        if (this.isOnGround) {
          this.state = 'jump';
          this.velocity.vy = -8;
          this.isOnGround = false;
        }
        break;
      case 'sit':
        if (this.isOnGround) {
          this.state = 'sit';
          this.behaviorDuration = 3000;
          this.behaviorTimer = 0;
        }
        break;
      case 'idle':
        this.state = 'idle';
        this.behaviorDuration = 2000;
        this.behaviorTimer = 0;
        break;
    }
  }

  getState(): ShimejiState {
    return this.state;
  }

  getPosition(): Position {
    return { ...this.position };
  }

  setSpriteSize(width: number, height: number) {
    this.spriteSize = { width, height };
  }
}

/**
 * Maps Shimeji state to sprite animation name
 */
export function getAnimationForState(state: ShimejiState): string {
  switch (state) {
    case 'idle':
    case 'drag':
      return 'idle';
    case 'walk_left':
    case 'walk_right':
      return 'walk';
    case 'climb_left':
    case 'climb_right':
      return 'climb';
    case 'fall':
      return 'fall';
    case 'sit':
      return 'sit';
    case 'jump':
      return 'jump';
    // Random sentient behaviors
    case 'look_around':
      return 'sit_lookup';  // Uses the looking up animation
    case 'stretch':
      return 'bounce';      // Stretching motion
    case 'yawn':
      return 'lay';         // Laying/relaxed animation
    case 'scratch':
      return 'drag_resist'; // Wiggling/scratching motion
    case 'pocket_check':
      return 'thinking';    // Checking the 4D pocket!
    default:
      return 'idle';
  }
}
