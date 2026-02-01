export type Vector2D = {
  x: number;
  y: number;
};

export type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ShimejiState = {
  position: Vector2D;
  velocity: Vector2D;
  isGrounded: boolean;
  isDragging: boolean;
  currentAction: ShimejiAction;
};

export type ShimejiAction =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'fall'
  | 'sit'
  | 'sleep'
  | 'drag'
  | 'wave';
