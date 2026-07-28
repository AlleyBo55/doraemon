import {
  ShimejiEngine,
  getAnimationForState,
  type Position,
} from '../../../src/renderer/core/engine/shimeji';
import { getAnimation } from '../../../src/renderer/core/constants/sprites';
import type { EmotionType } from '../protocol';

/**
 * Renderer for the standalone floating mascot.
 *
 * The engine believes it is roaming the whole screen. Instead of translating the
 * sprite inside a fullscreen overlay, we keep the sprite fixed in a small window
 * and ask Rust to move that window. That avoids needing click-through, so the
 * mascot stays draggable on every platform.
 */

type Boot = { screenW: number; screenH: number; winW: number; winH: number };

type Incoming = {
  id: string;
  emotion?: string;
  animation?: string | null;
  thought?: string | null;
};

declare global {
  interface Window {
    __DORA__?: Boot;
    __doraCommand__?: (raw: string) => void;
    ipc?: { postMessage(message: string): void };
  }
}

const SPRITE_PX = 128;
const SPRITE_BASE = 'dora://localhost/dora-sprites';
const POKE_MAX_DISTANCE = 6;
const POKE_MAX_DURATION_MS = 400;

const boot: Boot = window.__DORA__ ?? {
  screenW: 1440,
  screenH: 900,
  winW: 320,
  winH: 260,
};

const send = (message: unknown): void => {
  window.ipc?.postMessage(JSON.stringify(message));
};

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`[companion] markup missing #${id}`);
  return element as T;
}

const sprite = requireElement<HTMLImageElement>('sprite');
const bubble = requireElement<HTMLDivElement>('bubble');

// Where the sprite sits inside our little window: centred, near the bottom.
const SPRITE_OFFSET_X = (boot.winW - SPRITE_PX) / 2;
const SPRITE_OFFSET_Y = boot.winH - SPRITE_PX;

const engine = new ShimejiEngine(boot.screenW, boot.screenH);

let currentAnimation = 'idle';
let frameIndex = 0;
let frameTimer = 0;
let lastFrameTime = 0;
let flipped = false;
let isDragging = false;
let animationLockUntil = 0;
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;

/** Last window position we asked Rust for, so pointer maths can go global. */
let windowX = 0;
let windowY = 0;

function setAnimation(name: string): void {
  if (name === currentAnimation) return;
  if (!getAnimation(name)) return;
  currentAnimation = name;
  frameIndex = 0;
  frameTimer = 0;
}

/** Converts a mascot position into a window position and asks Rust to move. */
function placeWindow(position: Position): void {
  const x = Math.round(position.x - SPRITE_OFFSET_X);
  const y = Math.round(position.y - SPRITE_OFFSET_Y);
  if (x === windowX && y === windowY) return;
  windowX = x;
  windowY = y;
  send({ type: 'move', x, y });
}

engine.setCallbacks(
  (position) => placeWindow(position),
  (state, _frame, shouldFlip) => {
    flipped = shouldFlip;
    sprite.style.transform = flipped ? 'scaleX(-1)' : 'none';
    if (!isDragging && Date.now() < animationLockUntil) return;
    setAnimation(getAnimationForState(state));
  }
);

function tick(time: number): void {
  const delta = lastFrameTime ? time - lastFrameTime : 16;
  lastFrameTime = time;

  engine.update(delta);

  const animation = getAnimation(currentAnimation);
  if (animation && animation.frames.length > 0) {
    frameTimer += delta;
    if (frameTimer >= animation.frameDelay) {
      frameTimer = 0;
      frameIndex++;
      if (frameIndex >= animation.frames.length) {
        frameIndex = animation.loop ? 0 : animation.frames.length - 1;
      }
      const frame = animation.frames[frameIndex];
      if (frame) sprite.src = `${SPRITE_BASE}/${frame}`;
    }
  }

  requestAnimationFrame(tick);
}

/* ── speech bubble ─────────────────────────────────────────────────────── */

function showThought(text: string | null, durationMs: number): void {
  if (bubbleTimer) clearTimeout(bubbleTimer);
  if (!text) {
    bubble.hidden = true;
    return;
  }
  bubble.textContent = text;
  bubble.hidden = false;
  bubbleTimer = setTimeout(() => {
    bubble.hidden = true;
  }, durationMs);
}

/* ── reactions from the extension ──────────────────────────────────────── */

window.__doraCommand__ = (raw: string): void => {
  let payload: Incoming;
  try {
    payload = JSON.parse(raw) as Incoming;
  } catch {
    return;
  }

  if (payload.emotion) engine.setEmotion(payload.emotion as EmotionType);
  if (payload.animation && !isDragging) {
    setAnimation(payload.animation);
    animationLockUntil = Date.now() + 8000;
  }
  showThought(payload.thought ?? null, 8000);
};

/* ── dragging ──────────────────────────────────────────────────────────── */

let pressStartedAt = 0;
let pressOrigin = { x: 0, y: 0 };
let movedDistance = 0;

/** Pointer position in screen space, since the engine thinks in screen space. */
const toGlobal = (event: MouseEvent) => ({
  x: windowX + event.clientX,
  y: windowY + event.clientY,
});

sprite.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();

  isDragging = true;
  pressStartedAt = Date.now();
  pressOrigin = { x: event.screenX, y: event.screenY };
  movedDistance = 0;

  engine.startDrag();
  setAnimation('drag');
});

window.addEventListener('mousemove', (event) => {
  if (!isDragging) return;
  movedDistance = Math.max(
    movedDistance,
    Math.hypot(event.screenX - pressOrigin.x, event.screenY - pressOrigin.y)
  );
  const point = toGlobal(event);
  engine.drag(point.x, point.y);
});

window.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  engine.endDrag();

  const wasPoke =
    movedDistance < POKE_MAX_DISTANCE && Date.now() - pressStartedAt < POKE_MAX_DURATION_MS;
  if (wasPoke) send({ type: 'poked' });
});

/* ── clicking the bubble brings the IDE forward ────────────────────────── */

bubble.addEventListener('click', () => {
  send({ type: 'openIde' });
  showThought(null, 0);
});

/* ── start ─────────────────────────────────────────────────────────────── */

placeWindow(engine.getPosition());
requestAnimationFrame(tick);
send({ type: 'ready' });
