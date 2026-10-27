import { PHYSICS, SPRITE_SIZE, getAnimation } from '../constants/sprites';
import type { EmotionType } from '../types/emotion';
import { findLedges, type DesktopWindow, type Ledge } from './desktop-surfaces';

export type { DesktopWindow } from './desktop-surfaces';

type GeneratedSpriteState = `emotion_${string}` | `action_${string}`;

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
  | 'coding' | 'coding_intense' | 'coding_focused' | 'coding_typing' | 'coding_thinking' | 'coding_celebrate'
  | 'door_exit' | 'door_enter'
  | GeneratedSpriteState;

export type Position = { x: number; y: number };
type Velocity = { vx: number; vy: number };

const WALK_SPEED = 2;
const RUN_SPEED = 4;
const DASH_SPEED = 8;
const CLIMB_SPEED = 2;
const CEILING_SPEED = 2;
const GROUND_MARGIN = 50;

// How long the user has to hold before Doraemon starts struggling.
const DRAG_RESIST_DELAY = 3000;
// Fling strength carried over from the pointer when the user lets go.
const THROW_VELOCITY_SCALE = 0.9;
const MAX_THROW_VELOCITY = 22;
// Pointer samples older than this are treated as "let go while holding still".
const THROW_SAMPLE_WINDOW = 120;

// Other apps' windows. A ledge narrower than this is not worth standing on, and
// one this close to the floor is the floor for all practical purposes.
const MIN_LEDGE_WIDTH = SPRITE_SIZE / 2;
const MIN_LEDGE_HEIGHT = 24;
// Odds, per behaviour choice, of setting off for a window top.
const TRIP_CHANCE_FROM_FLOOR = 0.22;
const TRIP_CHANCE_FROM_WINDOW = 0.1;
// A trip only aims at ledges at least this far above his feet; going down is walking off.
const TRIP_MIN_RISE = 48;
// Low, close ledges are jumped onto; anything else needs the Take-copter or the Anywhere Door.
const JUMP_MAX_RISE = 150;
const JUMP_MAX_REACH = 240;
const JUMP_CLEARANCE = 30;
const DOOR_MIN_DISTANCE = 480;
const DOOR_CHANCE = 0.5;
const FLY_SPEED = 5;
// The Take-copter stops this far above the ledge and lets gravity finish the landing.
const FLY_HOVER = 20;
const FLIGHT_TIMEOUT = 9000;
// Odds of turning back, rather than stepping off, at the end of a ledge.
const LEDGE_TURN_CHANCE = 0.55;
// Odds of climbing a window's side when walking into it.
const WINDOW_CLIMB_CHANCE = 0.35;
// The renderer advances a frame on the first tick past its delay, so a
// one-shot animation runs slightly long; allow a tick per frame.
const FRAME_SLACK_MS = 17;

// States in which he is not standing on anything.
const OFF_GROUND_STATES = new Set<ShimejiState>([
  'fall', 'jump', 'fly', 'climb_wall', 'grab_wall', 'grab_ceiling', 'climb_ceiling',
]);
const WALKING_STATES = new Set<ShimejiState>(['walk', 'run', 'dash', 'work_walk', 'carry']);

type TripTarget = { windowId: number; offset: number };

const oneShotDuration = (name: string): number => {
  const animation = getAnimation(name);
  return animation ? animation.frames.length * (animation.frameDelay + FRAME_SLACK_MS) : 1000;
};

type BehaviorDef = { state: ShimejiState; weight: number; duration: [number, number] };

const EMOTION_BEHAVIORS: Partial<Record<EmotionType, BehaviorDef[]>> = {
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

const EMOTION_BEHAVIOR_ALIAS: Partial<Record<EmotionType, EmotionType>> = {
  joy: 'happy',
  pride: 'proud',
  satisfaction: 'relaxed',
  curiosity: 'curious',
  wonder: 'surprised',
  determination: 'determined',
  focus: 'working',
  calm: 'relaxed',
  contemplation: 'thinking',
  concern: 'anxious',
  frustration: 'frustrated',
  fatigue: 'sleepy',
  longing: 'sad',
  gratitude: 'happy',
  connection: 'happy',
  confusion: 'confused',
  excitement: 'excited',
  melancholy: 'sad',
  hope: 'determined',
  awe: 'surprised',
  angry: 'frustrated',
  hungry: 'curious',
};

const EMOTION_REACTION_STATE: Partial<Record<EmotionType, ShimejiState>> = {
  neutral: 'emotion_calm',
  calm: 'emotion_calm',
  happy: 'emotion_joy',
  joy: 'emotion_joy',
  sad: 'emotion_melancholy',
  melancholy: 'emotion_melancholy',
  longing: 'emotion_longing',
  excited: 'emotion_excitement',
  excitement: 'emotion_excitement',
  thinking: 'emotion_contemplation',
  contemplation: 'emotion_contemplation',
  confused: 'emotion_confusion',
  confusion: 'emotion_confusion',
  sleepy: 'emotion_fatigue',
  fatigue: 'emotion_fatigue',
  surprised: 'emotion_wonder',
  wonder: 'emotion_wonder',
  awe: 'emotion_awe',
  working: 'emotion_focus',
  focus: 'emotion_focus',
  frustrated: 'emotion_frustration',
  frustration: 'emotion_frustration',
  angry: 'action_angry',
  proud: 'emotion_pride',
  pride: 'emotion_pride',
  curious: 'emotion_curiosity',
  curiosity: 'emotion_curiosity',
  playful: 'action_random_thought',
  determined: 'emotion_determination',
  determination: 'emotion_determination',
  relaxed: 'emotion_satisfaction',
  satisfaction: 'emotion_satisfaction',
  anxious: 'emotion_concern',
  concern: 'emotion_concern',
  gratitude: 'emotion_gratitude',
  connection: 'emotion_connection',
  hope: 'emotion_hope',
  hungry: 'action_hungry',
};

const EMOTION_REACTION_DURATION: Partial<Record<EmotionType, number>> = {
  fatigue: 5000,
  sleepy: 5000,
  longing: 3500,
  melancholy: 3500,
  sad: 3500,
  calm: 3000,
  satisfaction: 3000,
  relaxed: 3000,
  focus: 3500,
  working: 3500,
};

const resolveBehaviorEmotion = (emotion: EmotionType): EmotionType =>
  EMOTION_BEHAVIOR_ALIAS[emotion] ?? emotion;

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
  private spriteSize = { width: SPRITE_SIZE, height: SPRITE_SIZE };
  private codingSpriteSize = { width: SPRITE_SIZE, height: SPRITE_SIZE };
  // Other apps' windows, front-to-back, and the visible top edges they leave.
  private desktopOrder: DesktopWindow[] = [];
  private desktopWindows = new Map<number, DesktopWindow>();
  private ledges: Ledge[] = [];
  // The window whose top edge is under his feet, or null on the floor or in the air.
  private standingOn: number | null = null;
  // The window whose side he is climbing; `left` means its left side, so the window is on his right.
  private climbingWindow: { id: number; side: 'left' | 'right' } | null = null;
  private flightTarget: TripTarget | null = null;
  private doorTrip: TripTarget | null = null;
  private behaviorTimer = 0;
  private behaviorDuration = 0;
  private isDragging = false;
  private dragStartTime = 0;
  private lastDragPoint: { x: number; y: number; time: number } | null = null;
  private throwVelocity: Velocity = { vx: 0, vy: 0 };
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
    this.refreshLedges();
  }

  /**
   * Other apps' on-screen windows in engine coordinates, front-to-back. Their
   * top edges become ledges he lands on, walks along and rides when the window
   * moves; their sides can be climbed. Pass an empty list to forget them.
   */
  setDesktopWindows(windows: DesktopWindow[]) {
    const previous = this.desktopWindows;
    this.desktopOrder = windows.filter((w) => w.w > 0 && w.h > 0);
    this.desktopWindows = new Map(this.desktopOrder.map((w) => [w.id, w]));
    this.refreshLedges();
    this.rideSupport(previous);
  }

  private getCurrentSpriteSize() {
    const isCodingState = this.state.startsWith('coding') || this._forcedCodingState?.startsWith('coding');
    return isCodingState ? this.codingSpriteSize : this.spriteSize;
  }

  setEmotion(emotion: EmotionType) {
    if (emotion !== this.currentEmotion) {
      this.currentEmotion = emotion;
      this.emotionChangedAt = Date.now();
      
      // Half-way through the Anywhere Door is no time for a reaction.
      const isTeleporting = this.state === 'door_exit' || this.state === 'door_enter';
      if (!this.isDragging && this.isOnGround && !isTeleporting) {
        this.triggerEmotionReaction(emotion);
      }
    }
  }

  private triggerEmotionReaction(emotion: EmotionType) {
    const resolvedEmotion = resolveBehaviorEmotion(emotion);
    this.state =
      EMOTION_REACTION_STATE[emotion] ??
      EMOTION_REACTION_STATE[resolvedEmotion] ??
      'emotion_calm';
    this.behaviorDuration =
      EMOTION_REACTION_DURATION[emotion] ??
      EMOTION_REACTION_DURATION[resolvedEmotion] ??
      2200;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.behaviorTimer = 0;
  }

  update(deltaTime: number) {
    if (this.isDragging) {
      if (Date.now() - this.dragStartTime > DRAG_RESIST_DELAY) {
        this.state = 'resist';
      }
      // Publish the drag/resist state so the renderer follows the lean direction
      // instead of staying pinned on the frame set at pointer-down.
      this.onStateChange?.(this.state, 0, this.facingRight);
      return;
    }

    // When coding lock is active, force stationary state and stop all movement.
    // In the air the lock waits for the landing, so he never freezes mid-flight.
    const isSupported = this.isOnGround || this.isOnWall !== null || this.isOnCeiling;
    if (this._codingLock && this._forcedCodingState && !isSupported) {
      this.flightTarget = null;
      if (this.state === 'fly') this.state = 'fall';
    } else if (this._codingLock && this._forcedCodingState) {
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
    if (this.behaviorTimer >= this.behaviorDuration && !this.advanceDoorTrip()) this.chooseBehavior();

    const before = { x: this.position.x, y: this.position.y };
    this.applyPhysics();
    this.position.x += this.velocity.vx;
    this.position.y += this.velocity.vy;
    this.followDesktop(before);
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
      'door_exit', 'door_enter',
    ];

    if (
      stationaryStates.includes(this.state) ||
      this.state.startsWith('emotion_') ||
      this.state.startsWith('action_')
    ) {
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
        if (this.flightTarget) {
          this.steerFlight();
          break;
        }
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
      this.standingOn = null;
      this.flightTarget = null;
      if (this.state === 'fall') {
        this.state = 'bounce';
        this.behaviorDuration = 200;
        this.behaviorTimer = 0;
      }
    } else if (this.standingOn === null) {
      this.isOnGround = false;
    }

    if (this.climbingWindow) {
      // Pinned to a window's side by followWindowWall; the screen edges do not apply.
    } else if (this.position.x <= minX) {
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
      if (this.maybeStartWindowTrip()) return;
      behaviors =
        EMOTION_BEHAVIORS[this.currentEmotion] ||
        EMOTION_BEHAVIORS[resolveBehaviorEmotion(this.currentEmotion)] ||
        EMOTION_BEHAVIORS.neutral ||
        [];
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
    this.throwVelocity = { vx: 0, vy: 0 };
    this.lastDragPoint = null;
    // A held animation would otherwise keep forcing its own state and skip
    // physics entirely, so direct interaction takes the lock back.
    this._codingLock = false;
    this._forcedCodingState = null;
    this.detachFromDesktop();
  }

  setPosition(x: number, y: number) {
    this.position.x = x;
    this.position.y = y;
    this.detachFromDesktop();
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

    const now = Date.now();
    if (now - this.dragStartTime > DRAG_RESIST_DELAY) this.state = 'resist';

    this.trackThrowVelocity(x, y, now);

    this.position.x = x - currentSize.width / 2;
    this.position.y = y - currentSize.height / 2;
    this.onPositionChange?.(this.position);
  }

  private trackThrowVelocity(x: number, y: number, now: number) {
    const previous = this.lastDragPoint;
    this.lastDragPoint = { x, y, time: now };
    if (!previous) return;

    const elapsed = now - previous.time;
    if (elapsed <= 0) return;

    // Normalise to a per-frame delta (~16ms) so the throw feels the same
    // regardless of how often pointer events arrive.
    const perFrame = 16 / elapsed;
    const clamp = (value: number) =>
      Math.max(-MAX_THROW_VELOCITY, Math.min(MAX_THROW_VELOCITY, value));

    this.throwVelocity = {
      vx: clamp((x - previous.x) * perFrame * THROW_VELOCITY_SCALE),
      vy: clamp((y - previous.y) * perFrame * THROW_VELOCITY_SCALE),
    };
  }

  endDrag() {
    this.isDragging = false;

    const sample = this.lastDragPoint;
    const isStale = !sample || Date.now() - sample.time > THROW_SAMPLE_WINDOW;
    // Released mid-motion: keep the momentum so it reads as a throw.
    // Released while holding still: plain drop.
    this.velocity = isStale ? { vx: 0, vy: 0 } : { ...this.throwVelocity };

    if (this.velocity.vx !== 0) this.facingRight = this.velocity.vx > 0;

    this.throwVelocity = { vx: 0, vy: 0 };
    this.lastDragPoint = null;

    this.state = 'fall';
    this.isOnGround = false;
    this.isOnWall = null;
    this.isOnCeiling = false;
  }

  // ─── Other apps' windows ──────────────────────────────────────────────────

  private get centerX(): number { return this.position.x + this.spriteSize.width / 2; }
  private get feetY(): number { return this.position.y + this.spriteSize.height; }

  private refreshLedges() {
    const { width, height } = this.spriteSize;
    const floorFeet = this.screenOffsetY + this.screenHeight - GROUND_MARGIN;
    this.ledges = findLedges(
      this.desktopOrder,
      {
        left: this.screenOffsetX + width / 2,
        right: this.screenOffsetX + this.screenWidth - width / 2,
        // He has to fit between the ledge and the top of the screen.
        top: this.screenOffsetY + height,
        bottom: floorFeet - MIN_LEDGE_HEIGHT,
      },
      MIN_LEDGE_WIDTH
    );
  }

  /** The visible stretch of a window's top edge under centre x `x`, if any. */
  private ledgeAt(windowId: number, x: number): Ledge | undefined {
    return this.ledges.find((l) => l.windowId === windowId && x >= l.left && x <= l.right);
  }

  /** Carries him along with the window he is on or climbing, and drops him when it goes. */
  private rideSupport(previous: Map<number, DesktopWindow>) {
    if (this.isDragging) return;
    const id = this.standingOn ?? this.climbingWindow?.id ?? null;
    if (id === null) return;

    const current = this.desktopWindows.get(id);
    if (!current) {
      this.dropFromDesktop();
      return;
    }
    const before = previous.get(id);
    if (before) {
      this.position.x += current.x - before.x;
      this.position.y += current.y - before.y;
    }
    // A climber is re-pinned to the window's side on the next tick.
    if (this.standingOn === null) return;

    const ledge = this.ledgeAt(id, this.centerX);
    if (!ledge) {
      this.dropFromDesktop();
      return;
    }
    this.position.y = ledge.y - this.spriteSize.height;
  }

  /** Lets go of every window, for when he is picked up or put somewhere by hand. */
  private detachFromDesktop() {
    this.standingOn = null;
    this.climbingWindow = null;
    this.flightTarget = null;
    this.doorTrip = null;
  }

  /** The window under or beside him closed, minimised, moved away or got covered. */
  private dropFromDesktop() {
    this.detachFromDesktop();
    this.isOnGround = false;
    this.isOnWall = null;
    this.state = 'fall';
    this.velocity = { vx: 0, vy: 0 };
    this.behaviorTimer = 0;
    // A held reaction skips physics, which would leave him hanging where the window was.
    this._codingLock = false;
    this._forcedCodingState = null;
  }

  /** Runs after each move: keeps him on his ledge, lands him on one, or starts a window climb. */
  private followDesktop(before: Position) {
    if (this.climbingWindow) {
      this.followWindowWall();
      return;
    }

    if (this.standingOn !== null) {
      if (OFF_GROUND_STATES.has(this.state)) {
        this.standingOn = null;
        this.isOnGround = false;
      } else if (!this.keepOnLedge(before.x)) {
        return;
      }
    }

    const isFalling = this.state === 'fall' || this.state === 'jump';
    if (this.standingOn === null && isFalling && this.velocity.vy > 0) this.landOnLedge(before.y);

    if (this.isOnGround && this.velocity.vx !== 0 && WALKING_STATES.has(this.state)) {
      this.maybeClimbWindow(before.x);
    }
  }

  /** False when he walked off the end of his ledge, or it vanished from under him. */
  private keepOnLedge(previousX: number): boolean {
    const id = this.standingOn;
    if (id === null) return false;
    const { width, height } = this.spriteSize;

    const ledge = this.ledgeAt(id, this.centerX);
    if (ledge) {
      this.position.y = ledge.y - height;
      this.velocity.vy = 0;
      this.isOnGround = true;
      return true;
    }

    // Walked past the end of the stretch he was on: turn back, or step off.
    const from = this.ledgeAt(id, previousX + width / 2);
    if (from && WALKING_STATES.has(this.state) && Math.random() < LEDGE_TURN_CHANCE) {
      const edge = this.centerX > from.right ? from.right : from.left;
      this.position.x = edge - width / 2;
      this.position.y = from.y - height;
      this.facingRight = !this.facingRight;
      this.isOnGround = true;
      return true;
    }

    this.standingOn = null;
    this.isOnGround = false;
    if (!OFF_GROUND_STATES.has(this.state)) this.state = 'fall';
    return false;
  }

  /** Catches a falling mascot on the first ledge his feet crossed this tick. */
  private landOnLedge(previousY: number) {
    const height = this.spriteSize.height;
    const previousFeet = previousY + height;
    const feet = this.feetY;
    const x = this.centerX;

    let caught: Ledge | null = null;
    for (const ledge of this.ledges) {
      if (ledge.y < previousFeet - 0.5 || ledge.y > feet) continue;
      if (x < ledge.left || x > ledge.right) continue;
      if (!caught || ledge.y < caught.y) caught = ledge;
    }
    if (!caught) return;

    this.position.y = caught.y - height;
    this.velocity.vy = 0;
    this.standingOn = caught.windowId;
    this.isOnGround = true;
    this.isOnCeiling = false;
    this.flightTarget = null;
    this.state = 'bounce';
    this.behaviorDuration = 200;
    this.behaviorTimer = 0;
  }

  /** Walking into the side of a window can turn into climbing it. */
  private maybeClimbWindow(previousX: number) {
    const { width, height } = this.spriteSize;
    const direction = Math.sign(this.velocity.vx);
    const reach = width * 0.3;
    const lead = this.centerX + direction * reach;
    const previousLead = previousX + width / 2 + direction * reach;
    const feet = this.feetY;
    const screenLeft = this.screenOffsetX;
    const screenRight = this.screenOffsetX + this.screenWidth;

    for (let index = 0; index < this.desktopOrder.length; index++) {
      const win = this.desktopOrder[index];
      if (!win || win.id === this.standingOn) continue;

      const sideX = direction > 0 ? win.x : win.x + win.w;
      const crossed = direction > 0
        ? previousLead < sideX && lead >= sideX
        : previousLead > sideX && lead <= sideX;
      if (!crossed) continue;
      // The window has to rise well above him and reach down to his body.
      if (win.y > feet - height * 0.8 || win.y + win.h < feet - height * 0.4) continue;
      // There has to be room beside it to hang on without leaving the screen.
      if (direction > 0 ? sideX - width < screenLeft : sideX + width > screenRight) continue;
      if (this.isHiddenBehind(index, sideX, feet - height / 2)) continue;
      // And a top to climb out onto.
      if (!this.ledges.some((l) => l.windowId === win.id)) continue;

      if (Math.random() < WINDOW_CLIMB_CHANCE) this.startWindowClimb(win, direction > 0 ? 'left' : 'right');
      return;
    }
  }

  /** True when a window in front of `desktopOrder[index]` covers the point. */
  private isHiddenBehind(index: number, x: number, y: number): boolean {
    for (let front = 0; front < index; front++) {
      const cover = this.desktopOrder[front];
      if (cover && x >= cover.x && x <= cover.x + cover.w && y >= cover.y && y <= cover.y + cover.h) return true;
    }
    return false;
  }

  private startWindowClimb(win: DesktopWindow, side: 'left' | 'right') {
    this.climbingWindow = { id: win.id, side };
    this.standingOn = null;
    this.isOnGround = false;
    // Unflipped climbing frames hug the right edge of the sprite, so a window on
    // his right means no flip.
    this.facingRight = side === 'right';
    this.isOnWall = side === 'left' ? 'right' : 'left';
    this.state = 'climb_wall';
    this.velocity = { vx: 0, vy: 0 };
    this.behaviorDuration = 2500 + Math.random() * 3000;
    this.behaviorTimer = 0;
    this.pinToWindowSide(win, side);
  }

  private pinToWindowSide(win: DesktopWindow, side: 'left' | 'right') {
    this.position.x = side === 'left' ? win.x - this.spriteSize.width : win.x + win.w;
  }

  /** Keeps him on the side he is climbing, and pulls him up onto the top once he gets there. */
  private followWindowWall() {
    const climb = this.climbingWindow;
    if (!climb) return;
    const win = this.desktopWindows.get(climb.id);
    if (!win) {
      this.dropFromDesktop();
      return;
    }
    if (this.state !== 'climb_wall' && this.state !== 'grab_wall') {
      // Let go on purpose (the wall behaviours include a fall).
      this.climbingWindow = null;
      this.isOnWall = null;
      if (!OFF_GROUND_STATES.has(this.state)) this.state = 'fall';
      return;
    }

    const { width, height } = this.spriteSize;
    this.pinToWindowSide(win, climb.side);
    this.isOnWall = climb.side === 'left' ? 'right' : 'left';
    this.isOnGround = false;

    // The window moved up and away from under his hands.
    if (this.feetY > win.y + win.h + height * 0.5) {
      this.dropFromDesktop();
      return;
    }
    if (this.feetY > win.y) return;

    const x = climb.side === 'left' ? win.x + width * 0.3 : win.x + win.w - width * 0.3;
    const ledge = this.ledgeAt(win.id, x);
    if (!ledge) {
      this.dropFromDesktop();
      return;
    }
    this.position.x = x - width / 2;
    this.position.y = ledge.y - height;
    this.climbingWindow = null;
    this.isOnWall = null;
    this.standingOn = win.id;
    this.isOnGround = true;
    this.velocity = { vx: 0, vy: 0 };
    this.facingRight = climb.side === 'left';
    this.state = 'stand';
    this.behaviorDuration = 600;
    this.behaviorTimer = 0;
  }

  /** Sometimes, instead of the usual behaviour, he sets off for another window's top. */
  private maybeStartWindowTrip(): boolean {
    if (this.ledges.length === 0) return false;
    const chance = this.standingOn === null ? TRIP_CHANCE_FROM_FLOOR : TRIP_CHANCE_FROM_WINDOW;
    if (Math.random() >= chance) return false;

    const feet = this.feetY;
    const candidates = this.ledges.filter((l) => l.windowId !== this.standingOn && feet - l.y >= TRIP_MIN_RISE);
    const ledge = candidates[Math.floor(Math.random() * candidates.length)];
    const win = ledge ? this.desktopWindows.get(ledge.windowId) : undefined;
    if (!ledge || !win) return false;

    const margin = Math.min(24, (ledge.right - ledge.left) / 2);
    const x = ledge.left + margin + Math.random() * (ledge.right - ledge.left - 2 * margin);
    const dx = x - this.centerX;
    const rise = feet - ledge.y;
    const trip: TripTarget = { windowId: ledge.windowId, offset: x - win.x };

    if (rise <= JUMP_MAX_RISE && Math.abs(dx) <= JUMP_MAX_REACH) this.startTargetedJump(x, ledge.y);
    else if (Math.hypot(dx, rise) >= DOOR_MIN_DISTANCE && Math.random() < DOOR_CHANCE) this.startDoorTrip(trip);
    else this.startFlight(trip);
    return true;
  }

  /** Where a trip target is now; its window may have moved since it was picked. */
  private resolveTrip(target: TripTarget | null): Position | null {
    if (!target) return null;
    const win = this.desktopWindows.get(target.windowId);
    if (!win) return null;

    const wanted = win.x + target.offset;
    let best: Position | null = null;
    let bestDistance = Infinity;
    for (const ledge of this.ledges) {
      if (ledge.windowId !== target.windowId) continue;
      const margin = Math.min(24, (ledge.right - ledge.left) / 2);
      const x = Math.max(ledge.left + margin, Math.min(ledge.right - margin, wanted));
      if (Math.abs(x - wanted) < bestDistance) {
        best = { x, y: ledge.y };
        bestDistance = Math.abs(x - wanted);
      }
    }
    return best;
  }

  /** A jump aimed so his feet come down on the ledge at centre x `targetX`. */
  private startTargetedJump(targetX: number, ledgeY: number) {
    const gravity = PHYSICS.GRAVITY;
    const headroom = ledgeY - this.spriteSize.height - this.screenOffsetY - 1;
    const apex = this.feetY - ledgeY + Math.max(0, Math.min(JUMP_CLEARANCE, headroom));
    const launch = -Math.ceil(Math.sqrt(2 * gravity * apex)) - gravity;

    // Replay the integrator (the jump, then the fall with air drag) to learn how
    // far one unit of horizontal speed carries him by the time he reaches the ledge.
    let vy = launch;
    let feet = this.feetY;
    let drag = 1;
    let carry = 0;
    let falling = false;
    for (let tick = 0; tick < 600; tick++) {
      if (falling) {
        vy = Math.min(vy + gravity, PHYSICS.MAX_VELOCITY);
        drag *= 1 - PHYSICS.RESISTANCE_X;
      } else {
        vy += gravity;
        falling = vy > 0;
      }
      feet += vy;
      carry += drag;
      if (falling && feet >= ledgeY) break;
    }

    const vx = (targetX - this.centerX) / Math.max(carry, 1);
    this.standingOn = null;
    this.isOnGround = false;
    this.state = 'jump';
    this.velocity = { vx, vy: launch };
    if (vx !== 0) this.facingRight = vx > 0;
    this.behaviorDuration = FLIGHT_TIMEOUT;
    this.behaviorTimer = 0;
  }

  private startFlight(trip: TripTarget) {
    this.flightTarget = trip;
    this.standingOn = null;
    this.isOnGround = false;
    this.state = 'fly';
    this.behaviorDuration = FLIGHT_TIMEOUT;
    this.behaviorTimer = 0;
  }

  /** Take-copter flight: head for a point just above the ledge, then drop onto it. */
  private steerFlight() {
    this.isOnGround = false;
    const target = this.resolveTrip(this.flightTarget);
    if (!target || this.behaviorTimer > FLIGHT_TIMEOUT) {
      this.flightTarget = null;
      this.state = 'fall';
      this.velocity = { vx: 0, vy: 0 };
      return;
    }

    // Hovering above the top of the screen would read as grabbing the ceiling.
    const headroom = target.y - this.spriteSize.height - this.screenOffsetY - 1;
    const hover = Math.max(0, Math.min(FLY_HOVER, headroom));
    const dx = target.x - this.centerX;
    const dy = target.y - hover - this.feetY;
    const distance = Math.hypot(dx, dy);

    if (distance <= FLY_SPEED) {
      this.velocity = { vx: dx, vy: dy };
      this.flightTarget = null;
      this.state = 'fall';
      return;
    }
    this.velocity = { vx: (dx / distance) * FLY_SPEED, vy: (dy / distance) * FLY_SPEED };
    if (Math.abs(dx) > 2) this.facingRight = dx > 0;
  }

  private startDoorTrip(trip: TripTarget) {
    this.doorTrip = trip;
    this.state = 'door_exit';
    this.velocity = { vx: 0, vy: 0 };
    this.behaviorDuration = oneShotDuration('door_exit');
    this.behaviorTimer = 0;
  }

  /** Moves the Anywhere Door trip on once an animation ends. True if it used the turn. */
  private advanceDoorTrip(): boolean {
    if (this.state !== 'door_exit') return false;

    const target = this.resolveTrip(this.doorTrip);
    const windowId = this.doorTrip?.windowId ?? null;
    this.doorTrip = null;
    // With nowhere left to go he steps back out where he went in.
    if (target && windowId !== null) {
      this.position.x = target.x - this.spriteSize.width / 2;
      this.position.y = target.y - this.spriteSize.height;
      this.standingOn = windowId;
      this.isOnGround = true;
      this.velocity = { vx: 0, vy: 0 };
    }
    this.state = 'door_enter';
    this.behaviorDuration = oneShotDuration('door_enter');
    this.behaviorTimer = 0;
    return true;
  }

  isBeingDragged(): boolean { return this.isDragging; }

  getState(): ShimejiState { return this.state; }
  getPosition(): Position { return { ...this.position }; }
  getEmotion(): EmotionType { return this.currentEmotion; }
}

export function getAnimationForState(state: ShimejiState): string {
  return state;
}
