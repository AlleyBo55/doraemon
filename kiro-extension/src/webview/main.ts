import {
  ShimejiEngine,
  getAnimationForState,
  type Position,
} from '../../../src/renderer/core/engine/shimeji';
import { getAnimation } from '../../../src/renderer/core/constants/sprites';
import type { HostMessage, WebviewMessage } from '../protocol';

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

declare global {
  interface Window {
    __DORA_SPRITE_BASE__?: string;
  }
}

const SPRITE_PX = 128;
// The engine reserves 178px of vertical space (sprite + ground margin), so give
// it a floor even when the panel is squeezed very short.
const MIN_STAGE_HEIGHT = 240;
const MIN_STAGE_WIDTH = 160;
// A press that neither moves far nor lasts long counts as a poke, not a drag.
const POKE_MAX_DISTANCE = 6;
const POKE_MAX_DURATION_MS = 400;

const vscodeApi = acquireVsCodeApi();
const spriteBase = window.__DORA_SPRITE_BASE__ ?? '';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`[doraemon] webview markup missing #${id}`);
  return element as T;
}

const stage = requireElement<HTMLDivElement>('stage');
const sprite = requireElement<HTMLImageElement>('sprite');
const bubble = requireElement<HTMLDivElement>('bubble');

const stageSize = () => ({
  width: Math.max(MIN_STAGE_WIDTH, stage.clientWidth),
  height: Math.max(MIN_STAGE_HEIGHT, stage.clientHeight),
});

const initial = stageSize();
const engine = new ShimejiEngine(initial.width, initial.height);

let currentAnimation = 'idle';
let frameIndex = 0;
let frameTimer = 0;
let lastFrameTime = 0;
let flipped = false;
let isDragging = false;
let animationLockUntil = 0;
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;

/* ── rendering ─────────────────────────────────────────────────────────── */

function renderPosition(position: Position): void {
  sprite.style.transform =
    `translate3d(${position.x}px, ${position.y}px, 0)` + (flipped ? ' scaleX(-1)' : '');
}

function setAnimation(name: string): void {
  if (name === currentAnimation) return;
  if (!getAnimation(name)) return;
  currentAnimation = name;
  frameIndex = 0;
  frameTimer = 0;
}

engine.setCallbacks(
  (position) => renderPosition(position),
  (state, _frame, shouldFlip) => {
    flipped = shouldFlip;
    // A locked reaction animation owns the sprite until it expires, except when
    // the user is dragging, which always wins.
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
      if (frame) sprite.src = `${spriteBase}/${frame}`;
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

/* ── pointer interaction ───────────────────────────────────────────────── */

let pressStartedAt = 0;
let pressOrigin = { x: 0, y: 0 };
let movedDistance = 0;

const localPoint = (event: MouseEvent) => {
  const bounds = stage.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
};

sprite.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();

  isDragging = true;
  pressStartedAt = Date.now();
  pressOrigin = { x: event.clientX, y: event.clientY };
  movedDistance = 0;

  engine.startDrag();
  setAnimation('drag');
});

window.addEventListener('mousemove', (event) => {
  if (!isDragging) return;
  movedDistance = Math.max(
    movedDistance,
    Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y)
  );
  const point = localPoint(event);
  engine.drag(point.x, point.y);
});

window.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  engine.endDrag();

  const wasPoke =
    movedDistance < POKE_MAX_DISTANCE && Date.now() - pressStartedAt < POKE_MAX_DURATION_MS;
  if (wasPoke) vscodeApi.postMessage({ type: 'poked' });
});

/* ── host messages ─────────────────────────────────────────────────────── */

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (!message) return;

  switch (message.type) {
    case 'react': {
      engine.setEmotion(message.emotion);
      if (message.animation && !isDragging) {
        setAnimation(message.animation);
        animationLockUntil = Date.now() + message.durationMs;
      }
      showThought(message.thought, message.durationMs);
      break;
    }

    case 'resetPosition': {
      const size = stageSize();
      engine.setPosition(Math.floor(size.width / 2 - SPRITE_PX / 2), 0);
      break;
    }

    case 'config': {
      if (!message.showThoughts) showThought(null, 0);
      break;
    }

    case 'init':
      break;
  }
});

/* ── lifecycle ─────────────────────────────────────────────────────────── */

const observer = new ResizeObserver(() => {
  const size = stageSize();
  engine.updateScreenSize(size.width, size.height);
});
observer.observe(stage);

renderPosition(engine.getPosition());
requestAnimationFrame(tick);
vscodeApi.postMessage({ type: 'ready' });
