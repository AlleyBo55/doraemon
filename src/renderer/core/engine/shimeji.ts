import { PHYSICS } from '../constants/sprites';
import type { EmotionType } from '../types/emotion';

export type ShimejiState =
  | 'stand' | 'walk' | 'run' | 'dash' | 'fly'
  | 'sit' | 'sit_lookup' | 'sit_spin_head' | 'sit_dangle'
  | 'sprawl' | 'sleep' | 'grab_ceiling' | 'climb_ceiling'
  | 'grab_wall' | 'climb_wall'
  | 'jump' | 'fall' | 'bounce' | 'trip'
  | 'drag' | 'drag_left' | 'drag_left_far' | 'drag_right' | 'drag_right_far' | 'drag_extreme' | 'resist'
  | 'carry' | 'work_walk' | 'work_hold' | 'work_throw'
  | 'pocket_search' | 'gadget_pull'
  | 'pull_up' | 'helping' | 'success'
  | 'wave' | 'greet' | 'cheer' | 'celebrate' | 'victory'
  | 'coding' | 'coding_intense' | 'coding_focused' | 'coding_typing' | 'coding_thinking' | 'coding_celebrate';

export type Position = { x: number; y: number };
type Velocity = { vx: number; vy: number };

const WALK_SPEED = 2;
const RUN_SPEED = 4;
const DASH_SPEED = 8;
const CLIMB_SPEED = 2;
const CEILING_SPEED = 2;
const GROUND_MARGIN = 50;

type BehaviorDef = { state: ShimejiState; weight: number; duration: [number, number] };

const EMOTION_BEHAVIORS: Record<EmotionType, BehaviorDef[]> = {
  neutral: [
    { state: 'stand', weight: 200, duration: [1000, 3000] },
    { state: 'sit', weight: 150, duration: [2000, 4000] },
    { state: 'walk', weight: 100, duration: [2000, 4000] },
    { state: 'sit_lookup', weight: 30, duration: [1000, 2000] },
    { state: 'coding', weight: 40, duration: [3000, 5000] },
  ],
  happy: [
    { state: 'wave', weight: 150, duration: [1000, 2000] },
    { state: 'cheer', weight: 120, duration: [1000, 2000] },
    { state: 'jump', weight: 100, duration: [500, 500] },
    { state: 'run', weight: 100, duration: [1000, 2000] },
    { state: 'celebrate', weight: 80, duration: [1500, 2500] },
    { state: 'greet', weight: 60, duration: [800, 1200] },
    { state: 'success', weight: 50, duration: [1000, 1500] },
    { state: 'coding_celebrate', weight: 40, duration: [2000, 3000] },
  ],
  sad: [
    { state: 'sprawl', weight: 200, duration: [3000, 6000] },
    { state: 'sit', weight: 150, duration: [2000, 4000] },
    { state: 'sit_dangle', weight: 100, duration: [2000, 4000] },
    { state: 'sleep', weight: 80, duration: [3000, 5000] },
    { state: 'stand', weight: 30, duration: [1000, 2000] },
  ],
  excited: [
    { state: 'fly', weight: 200, duration: [2000, 4000] },
    { state: 'run', weight: 150, duration: [1000, 2000] },
    { state: 'dash', weight: 100, duration: [500, 1000] },
    { state: 'jump', weight: 100, duration: [500, 500] },
    { state: 'cheer', weight: 80, duration: [1000, 2000] },
    { state: 'celebrate', weight: 60, duration: [1500, 2500] },
    { state: 'victory', weight: 40, duration: [1000, 1500] },
    { state: 'coding_intense', weight: 60, duration: [3000, 5000] },
  ],
  thinking: [
    { state: 'sit_spin_head', weight: 200, duration: [2000, 4000] },
    { state: 'pocket_search', weight: 150, duration: [2000, 3000] },
    { state: 'sit_lookup', weight: 120, duration: [1500, 3000] },
    { state: 'stand', weight: 80, duration: [1000, 2000] },
    { state: 'walk', weight: 50, duration: [1500, 3000] },
    { state: 'coding_thinking', weight: 100, duration: [3000, 5000] },
  ],
  confused: [
    { state: 'sit_spin_head', weight: 200, duration: [1500, 3000] },
    { state: 'trip', weight: 100, duration: [800, 800] },
    { state: 'bounce', weight: 80, duration: [300, 300] },
    { state: 'stand', weight: 60, duration: [500, 1500] },
    { state: 'pocket_search', weight: 50, duration: [1500, 2500] },
  ],
  sleepy: [
    { state: 'sleep', weight: 300, duration: [5000, 10000] },
    { state: 'sprawl', weight: 200, duration: [4000, 8000] },
    { state: 'sit', weight: 80, duration: [3000, 6000] },
    { state: 'sit_dangle', weight: 60, duration: [2000, 4000] },
  ],
  surprised: [
    { state: 'jump', weight: 200, duration: [500, 500] },
    { state: 'bounce', weight: 150, duration: [300, 300] },
    { state: 'fall', weight: 100, duration: [300, 500] },
    { state: 'run', weight: 80, duration: [800, 1500] },
    { state: 'trip', weight: 50, duration: [800, 800] },
  ],
  working: [
    { state: 'work_walk', weight: 150, duration: [2000, 4000] },
    { state: 'carry', weight: 100, duration: [1500, 3000] },
    { state: 'work_hold', weight: 80, duration: [1000, 2000] },
    { state: 'pocket_search', weight: 60, duration: [1500, 2500] },
    { state: 'gadget_pull', weight: 40, duration: [1000, 1500] },
    { state: 'helping', weight: 30, duration: [2000, 3000] },
    { state: 'coding', weight: 150, duration: [4000, 7000] },
    { state: 'coding_typing', weight: 120, duration: [3000, 5000] },
    { state: 'coding_focused', weight: 80, duration: [4000, 6000] },
  ],
  frustrated: [
    { state: 'resist', weight: 200, duration: [2000, 4000] },
    { state: 'trip', weight: 150, duration: [800, 800] },
    { state: 'sit_spin_head', weight: 100, duration: [1500, 2500] },
    { state: 'dash', weight: 80, duration: [500, 1000] },
    { state: 'work_throw', weight: 50, duration: [500, 500] },
  ],
  proud: [
    { state: 'success', weight: 200, duration: [2000, 3000] },
    { state: 'victory', weight: 180, duration: [1500, 2500] },
    { state: 'celebrate', weight: 150, duration: [2000, 3000] },
    { state: 'cheer', weight: 120, duration: [1500, 2500] },
    { state: 'wave', weight: 80, duration: [1000, 2000] },
    { state: 'coding_celebrate', weight: 100, duration: [2000, 3500] },
  ],
  curious: [
    { state: 'pocket_search', weight: 200, duration: [2000, 3500] },
    { state: 'sit_lookup', weight: 150, duration: [1500, 2500] },
    { state: 'sit_spin_head', weight: 120, duration: [1500, 2500] },
    { state: 'walk', weight: 100, duration: [2000, 3500] },
    { state: 'climb_wall', weight: 80, duration: [2000, 4000] },
    { state: 'gadget_pull', weight: 60, duration: [1000, 1500] },
    { state: 'coding_thinking', weight: 60, duration: [3000, 5000] },
  ],
  playful: [
    { state: 'bounce', weight: 200, duration: [300, 500] },
    { state: 'jump', weight: 180, duration: [500, 500] },
    { state: 'run', weight: 150, duration: [1000, 2000] },
    { state: 'wave', weight: 120, duration: [800, 1500] },
    { state: 'cheer', weight: 100, duration: [1000, 2000] },
    { state: 'trip', weight: 50, duration: [800, 800] },
  ],
  determined: [
    { state: 'run', weight: 150, duration: [1500, 3000] },
    { state: 'climb_wall', weight: 120, duration: [2000, 4000] },
    { state: 'dash', weight: 100, duration: [800, 1500] },
    { state: 'work_walk', weight: 80, duration: [2000, 3500] },
    { state: 'helping', weight: 60, duration: [2000, 3000] },
    { state: 'coding_focused', weight: 150, duration: [4000, 7000] },
    { state: 'coding_intense', weight: 100, duration: [3000, 5000] },
  ],
  relaxed: [
    { state: 'sit', weight: 200, duration: [3000, 6000] },
    { state: 'sit_dangle', weight: 180, duration: [2500, 5000] },
    { state: 'sit_lookup', weight: 150, duration: [2000, 4000] },
    { state: 'stand', weight: 100, duration: [2000, 4000] },
    { state: 'walk', weight: 50, duration: [2000, 3500] },
    { state: 'coding', weight: 60, duration: [4000, 6000] },
  ],
  anxious: [
    { state: 'sit_spin_head', weight: 200, duration: [1000, 2000] },
    { state: 'pocket_search', weight: 150, duration: [1500, 2500] },
    { state: 'walk', weight: 120, duration: [1000, 2000] },
    { state: 'stand', weight: 100, duration: [500, 1500] },
    { state: 'sit_lookup', weight: 80, duration: [1000, 2000] },
    { state: 'trip', weight: 30, duration: [800, 800] },
    { state: 'coding_thinking', weight: 60, duration: [2000, 4000] },
  ],
};

const WALL_BEHAVIORS: BehaviorDef[] = [
  { state: 'grab_wall', weight: 100, duration: [500, 1500] },
  { state: 'climb_wall', weight: 100, duration: [2000, 5000] },
  { state: 'fall', weight: 50, duration: [100, 100] },
];

const CEILING_BEHAVIORS: BehaviorDef[] = [
  { state: 'grab_ceiling', weight: 100, duration: [500, 1500] },
  { state: 'climb_ceiling', weight: 100, duration: [2000, 4000] },
  { state: 'fall', weight: 50, duration: [100, 100] },
];

export class ShimejiEngine {
  private state: ShimejiState = 'stand';
  private position: Position;
  private velocity: Velocity = { vx: 0, vy: 0 };
  private screenWidth: number;
  private screenHeight: number;
  private screenOffsetX: number;
  private screenOffsetY: number;
  private spriteSize = { width: 128, height: 128 };
  private codingSpriteSize = { width: 168, height: 168 };
  private behaviorTimer = 0;
  private behaviorDuration = 0;
  private isDragging = false;
  private dragStartTime = 0;
  private isOnGround = true;
  private isOnWall: 'left' | 'right' | null = null;
  private isOnCeiling = false;
  private facingRight = true;
  private jumpVelocity = -20;
  private currentEmotion: EmotionType = 'neutral';
  private emotionChangedAt = 0;
  private onPositionChange: ((pos: Position) => void) | null = null;
  private onStateChange: ((state: ShimejiState, frame: number, flip: boolean) => void) | null = null;
  public _codingLock = false;
  public _forcedCodingState: ShimejiState | null = null;

  constructor(screenWidth: number, screenHeight: number, offsetX = 0, offsetY = 0) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.screenOffsetX = offsetX;
    this.screenOffsetY = offsetY;
    this.position = {
      x: offsetX + Math.random() * (screenWidth - this.spriteSize.width),
      y: offsetY + screenHeight - this.spriteSize.height - GROUND_MARGIN,
    };
  }

  setCallbacks(
    onPositionChange: (pos: Position) => void,
    onStateChange: (state: ShimejiState, frame: number, flip: boolean) => void
  ) {
    this.onPositionChange = onPositionChange;
    this.onStateChange = onStateChange;
  }

  updateScreenSize(width: number, height: number, offsetX = 0, offsetY = 0) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.screenOffsetX = offsetX;
    this.screenOffsetY = offsetY;
  }

  private getCurrentSpriteSize() {
    const isCodingState = this.state.startsWith('coding') || this._forcedCodingState?.startsWith('coding');
    return isCodingState ? this.codingSpriteSize : this.spriteSize;
  }

  setEmotion(emotion: EmotionType) {
    if (emotion !== this.currentEmotion) {
      this.currentEmotion = emotion;
      this.emotionChangedAt = Date.now();
      
      if (!this.isDragging && this.isOnGround) {
        this.triggerEmotionReaction(emotion);
      }
    }
  }

  private triggerEmotionReaction(emotion: EmotionType) {
    const reactions: Record<EmotionType, () => void> = {
      neutral: () => { this.state = 'stand'; this.behaviorDuration = 1000; },
      happy: () => { this.state = Math.random() > 0.5 ? 'wave' : 'jump'; this.behaviorDuration = 1000; },
      sad: () => { this.state = 'sprawl'; this.behaviorDuration = 3000; },
      excited: () => { 
        const roll = Math.random();
        if (roll > 0.6) {
          this.state = 'fly';
          this.behaviorDuration = 3000;
          this.isOnGround = false;
        } else if (roll > 0.3) {
          this.state = 'run';
          this.behaviorDuration = 1500;
        } else {
          this.state = 'cheer';
          this.behaviorDuration = 1500;
        }
      },
      thinking: () => { this.state = 'pocket_search'; this.behaviorDuration = 2000; },
      confused: () => { this.state = Math.random() > 0.5 ? 'sit_spin_head' : 'trip'; this.behaviorDuration = 1500; },
      sleepy: () => { this.state = 'sleep'; this.behaviorDuration = 5000; },
      surprised: () => { 
        this.state = 'jump'; 
        this.behaviorDuration = 500; 
        this.velocity.vy = this.jumpVelocity; 
        this.isOnGround = false; 
      },
      working: () => { this.state = 'pocket_search'; this.behaviorDuration = 2000; },
      frustrated: () => { this.state = 'resist'; this.behaviorDuration = 2000; },
      proud: () => { this.state = 'success'; this.behaviorDuration = 2000; },
      curious: () => { this.state = 'pocket_search'; this.behaviorDuration = 2500; },
      playful: () => { this.state = Math.random() > 0.5 ? 'bounce' : 'jump'; this.behaviorDuration = 500; },
      determined: () => { this.state = 'run'; this.behaviorDuration = 2000; },
      relaxed: () => { this.state = 'sit_dangle'; this.behaviorDuration = 3000; },
      anxious: () => { this.state = 'sit_spin_head'; this.behaviorDuration = 1500; },
    };

    reactions[emotion]?.();
    this.behaviorTimer = 0;
  }

  update(deltaTime: number) {
    if (this.isDragging) {
      if (Date.now() - this.dragStartTime > 3000) {
        this.state = 'resist';
      }
      return;
    }

    // When coding lock is active, force stationary state and stop all movement
    if (this._codingLock && this._forcedCodingState) {
      this.state = this._forcedCodingState;
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.behaviorTimer = 0;
      
      const flip = this.facingRight;
      this.onPositionChange?.(this.position);
      this.onStateChange?.(this.state, 0, flip);
      return;
    }

    this.behaviorTimer += deltaTime;
    if (this.behaviorTimer >= this.behaviorDuration) this.chooseBehavior();

    this.applyPhysics();
    this.position.x += this.velocity.vx;
    this.position.y += this.velocity.vy;
    this.checkBoundaries();

    // All sprites use the same flip logic: flip when facing right
    // The issue with flying/ceiling sprites moving backward is in the velocity, not flip
    const flip = this.facingRight;
    
    this.onPositionChange?.(this.position);
    this.onStateChange?.(this.state, 0, flip);
  }

  private applyPhysics() {
    const stationaryStates: ShimejiState[] = [
      'stand', 'sit', 'sit_lookup', 'sit_spin_head', 'sit_dangle',
      'sprawl', 'sleep', 'wave', 'greet', 'cheer', 'celebrate', 'victory',
      'bounce', 'pocket_search', 'gadget_pull', 'pull_up', 'helping', 'success',
      'work_hold', 'work_throw', 'resist', 'grab_wall', 'grab_ceiling',
      'coding', 'coding_intense', 'coding_focused', 'coding_typing', 'coding_thinking', 'coding_celebrate',
    ];

    if (stationaryStates.includes(this.state)) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      if (!this.isOnGround && !this.isOnWall && !this.isOnCeiling) {
        this.state = 'fall';
      }
      return;
    }

    switch (this.state) {
      case 'walk':
      case 'carry':
        this.velocity.vx = this.facingRight ? WALK_SPEED : -WALK_SPEED;
        this.velocity.vy = 0;
        if (!this.isOnGround) this.state = 'fall';
        break;

      case 'run':
      case 'work_walk':
        this.velocity.vx = this.facingRight ? RUN_SPEED : -RUN_SPEED;
        this.velocity.vy = 0;
        if (!this.isOnGround) this.state = 'fall';
        break;

      case 'dash':
        this.velocity.vx = this.facingRight ? DASH_SPEED : -DASH_SPEED;
        this.velocity.vy = 0;
        if (!this.isOnGround) this.state = 'fall';
        break;

      case 'fly':
        // Flying sprites face LEFT in original image (like walk sprites)
        // When facingRight=true, sprite is flipped to face right, so move right
        this.velocity.vx = this.facingRight ? RUN_SPEED : -RUN_SPEED;
        this.velocity.vy = -1;
        this.isOnGround = false;
        break;

      case 'trip':
        this.velocity.vx = this.facingRight ? -8 : 8;
        this.velocity.vy = 0;
        break;

      case 'climb_wall':
        this.velocity.vx = 0;
        this.velocity.vy = -CLIMB_SPEED;
        break;

      case 'climb_ceiling':
        // Ceiling sprites face LEFT in original image (like walk sprites)
        // When facingRight=true, sprite is flipped to face right, so move right
        this.velocity.vx = this.facingRight ? CEILING_SPEED : -CEILING_SPEED;
        this.velocity.vy = 0;
        break;

      case 'jump':
        if (this.velocity.vy === 0 && this.isOnGround) {
          this.velocity.vy = this.jumpVelocity;
          this.isOnGround = false;
        }
        this.velocity.vy += PHYSICS.GRAVITY;
        if (this.velocity.vy > 0) this.state = 'fall';
        break;

      case 'fall':
        this.velocity.vy = Math.min(this.velocity.vy + PHYSICS.GRAVITY, PHYSICS.MAX_VELOCITY);
        this.velocity.vx *= (1 - PHYSICS.RESISTANCE_X);
        break;
    }
  }

  private checkBoundaries() {
    const currentSize = this.getCurrentSpriteSize();
    const minX = this.screenOffsetX;
    const maxX = this.screenOffsetX + this.screenWidth - currentSize.width;
    const minY = this.screenOffsetY;
    const groundY = this.screenOffsetY + this.screenHeight - currentSize.height - GROUND_MARGIN;

    if (this.position.y >= groundY) {
      this.position.y = groundY;
      this.velocity.vy = 0;
      this.isOnGround = true;
      this.isOnCeiling = false;
      if (this.state === 'fall') {
        this.state = 'bounce';
        this.behaviorDuration = 200;
        this.behaviorTimer = 0;
      }
    } else {
      this.isOnGround = false;
    }

    if (this.position.x <= minX) {
      this.position.x = minX;
      this.isOnWall = 'left';
      this.facingRight = true;
      if (['walk', 'run', 'dash', 'work_walk', 'carry'].includes(this.state)) {
        if (Math.random() > 0.5) {
          this.state = 'climb_wall';
          this.behaviorDuration = 2000 + Math.random() * 3000;
          this.behaviorTimer = 0;
        }
      }
    } else if (this.position.x >= maxX) {
      this.position.x = maxX;
      this.isOnWall = 'right';
      this.facingRight = false;
      if (['walk', 'run', 'dash', 'work_walk', 'carry'].includes(this.state)) {
        if (Math.random() > 0.5) {
          this.state = 'climb_wall';
          this.behaviorDuration = 2000 + Math.random() * 3000;
          this.behaviorTimer = 0;
        }
      }
    } else {
      this.isOnWall = null;
    }

    if (this.position.y <= minY) {
      this.position.y = minY;
      this.isOnCeiling = true;
      if (this.state === 'climb_wall') {
        this.state = 'grab_ceiling';
        this.behaviorDuration = 500 + Math.random() * 1000;
        this.behaviorTimer = 0;
      } else if (this.state === 'jump' || this.state === 'fall') {
        this.state = 'grab_ceiling';
        this.velocity.vy = 0;
        this.behaviorDuration = 500 + Math.random() * 1000;
        this.behaviorTimer = 0;
      }
    } else if (this.position.y > minY) {
      this.isOnCeiling = false;
    }

    if ((this.state === 'climb_wall' || this.state === 'grab_wall') && !this.isOnWall) {
      this.state = 'fall';
    }

    if ((this.state === 'grab_ceiling' || this.state === 'climb_ceiling') && !this.isOnCeiling) {
      this.state = 'fall';
    }
  }

  private chooseBehavior() {
    // Don't change behavior if coding animation is locked
    if (this._codingLock) {
      this.behaviorTimer = 0;
      return;
    }
    
    let behaviors: BehaviorDef[];

    if (this.isOnCeiling) {
      behaviors = CEILING_BEHAVIORS;
    } else if (this.isOnWall) {
      behaviors = WALL_BEHAVIORS;
    } else if (this.isOnGround) {
      behaviors = EMOTION_BEHAVIORS[this.currentEmotion] || EMOTION_BEHAVIORS.neutral;
    } else {
      return;
    }

    const totalWeight = behaviors.reduce((sum, b) => sum + b.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const behavior of behaviors) {
      roll -= behavior.weight;
      if (roll <= 0) {
        this.state = behavior.state;
        this.behaviorDuration = behavior.duration[0] + Math.random() * (behavior.duration[1] - behavior.duration[0]);
        this.behaviorTimer = 0;

        const movementStates: ShimejiState[] = ['walk', 'run', 'dash', 'climb_ceiling', 'work_walk', 'carry'];
        if (movementStates.includes(this.state) && !this.isOnWall) {
          this.facingRight = Math.random() > 0.5;
        }
        return;
      }
    }

    this.state = 'stand';
    this.behaviorDuration = 1000;
    this.behaviorTimer = 0;
  }

  startDrag() {
    this.isDragging = true;
    this.dragStartTime = Date.now();
    this.state = 'drag';
    this.velocity = { vx: 0, vy: 0 };
  }

  setPosition(x: number, y: number) {
    this.position.x = x;
    this.position.y = y;
    this.onPositionChange?.(this.position);
  }

  drag(x: number, y: number) {
    if (!this.isDragging) return;

    const currentSize = this.getCurrentSpriteSize();
    const centerX = this.position.x + currentSize.width / 2;
    const diff = x - centerX;

    if (diff < -50) this.state = 'drag_left_far';
    else if (diff < -30) this.state = 'drag_left';
    else if (diff > 50) this.state = 'drag_extreme';
    else if (diff > 30) this.state = 'drag_right_far';
    else if (diff > 10) this.state = 'drag_right';
    else this.state = 'drag';

    if (Date.now() - this.dragStartTime > 3000) this.state = 'resist';

    this.position.x = x - currentSize.width / 2;
    this.position.y = y - currentSize.height / 2;
    this.onPositionChange?.(this.position);
  }

  endDrag() {
    this.isDragging = false;
    this.state = 'fall';
    this.isOnGround = false;
    this.isOnWall = null;
    this.isOnCeiling = false;
  }

  getState(): ShimejiState { return this.state; }
  getPosition(): Position { return { ...this.position }; }
  getEmotion(): EmotionType { return this.currentEmotion; }
}

export function getAnimationForState(state: ShimejiState): string {
  return state;
}
