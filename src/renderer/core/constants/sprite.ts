export const SPRITE = {
  WIDTH: 128,
  HEIGHT: 128,
  SCALE: 1,
  FRAME_DURATION: 100,
} as const;

export const SPRITE_STATES = [
  'idle',
  'walk',
  'jump',
  'fall',
  'sit',
  'sleep',
  'wave',
  'think',
  'happy',
  'sad',
  'surprised',
] as const;

export type SpriteState = typeof SPRITE_STATES[number];

export const PHYSICS = {
  GRAVITY: 0.5,
  FRICTION: 0.8,
  BOUNCE: 0.3,
  MAX_VELOCITY: 15,
  DRAG_DAMPING: 0.95,
} as const;
