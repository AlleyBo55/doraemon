import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShimejiEngine, type ShimejiState } from './shimeji';

const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 800;
const SPRITE = 128;
const GROUND_MARGIN = 50;
const GROUND_Y = SCREEN_HEIGHT - SPRITE - GROUND_MARGIN;

type Recorded = { states: ShimejiState[]; positions: { x: number; y: number }[] };

function makeEngine() {
  const engine = new ShimejiEngine(SCREEN_WIDTH, SCREEN_HEIGHT);
  const recorded: Recorded = { states: [], positions: [] };

  engine.setCallbacks(
    (pos) => recorded.positions.push({ ...pos }),
    (state) => recorded.states.push(state)
  );

  // Park the mascot at a known spot so drag offsets are predictable.
  engine.setPosition(500, GROUND_Y);
  recorded.positions.length = 0;

  return { engine, recorded };
}

/** Centre point of the sprite for a given top-left position. */
const centreOf = (pos: { x: number; y: number }) => ({
  x: pos.x + SPRITE / 2,
  y: pos.y + SPRITE / 2,
});

describe('ShimejiEngine drag lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startDrag', () => {
    it('enters the drag state', () => {
      const { engine } = makeEngine();
      engine.startDrag();

      expect(engine.isBeingDragged()).toBe(true);
      expect(engine.getState()).toBe('drag');
    });

    it('releases a held animation lock so physics can run again', () => {
      const { engine } = makeEngine();
      engine._codingLock = true;
      engine._forcedCodingState = 'action_angry';

      engine.startDrag();

      expect(engine._codingLock).toBe(false);
      expect(engine._forcedCodingState).toBeNull();
    });
  });

  describe('state emission while dragging', () => {
    it('publishes the drag state on update so the renderer can follow', () => {
      const { engine, recorded } = makeEngine();
      engine.startDrag();
      recorded.states.length = 0;

      engine.update(16);

      expect(recorded.states).toEqual(['drag']);
    });

    it.each<[string, number, ShimejiState]>([
      ['far left', -80, 'drag_left_far'],
      ['left', -40, 'drag_left'],
      ['right', 20, 'drag_right'],
      ['far right', 40, 'drag_right_far'],
      ['extreme right', 80, 'drag_extreme'],
      ['centred', 0, 'drag'],
    ])('leans %s when the pointer is %dpx off centre', (_label, offset, expected) => {
      const { engine } = makeEngine();
      engine.startDrag();

      const centre = centreOf(engine.getPosition());
      engine.drag(centre.x + offset, centre.y);

      expect(engine.getState()).toBe(expected);
    });

    it('emits the lean state through the state callback', () => {
      const { engine, recorded } = makeEngine();
      engine.startDrag();

      const centre = centreOf(engine.getPosition());
      engine.drag(centre.x - 80, centre.y);
      recorded.states.length = 0;
      engine.update(16);

      expect(recorded.states).toEqual(['drag_left_far']);
    });

    it('struggles after being held for three seconds', () => {
      const { engine, recorded } = makeEngine();
      engine.startDrag();

      vi.advanceTimersByTime(3001);
      recorded.states.length = 0;
      engine.update(16);

      expect(engine.getState()).toBe('resist');
      expect(recorded.states).toEqual(['resist']);
    });

    it('does not move or change behaviour state while held', () => {
      const { engine } = makeEngine();
      engine.startDrag();

      const centre = centreOf(engine.getPosition());
      engine.drag(centre.x, centre.y);
      const held = engine.getPosition();

      engine.update(16);
      engine.update(16);

      expect(engine.getPosition()).toEqual(held);
    });

    it('ignores drag input when not being dragged', () => {
      const { engine } = makeEngine();
      const before = engine.getPosition();

      engine.drag(900, 100);

      expect(engine.getPosition()).toEqual(before);
    });
  });

  describe('endDrag', () => {
    it('falls after being dropped', () => {
      const { engine } = makeEngine();
      engine.startDrag();
      engine.drag(600, 200);
      engine.endDrag();

      expect(engine.isBeingDragged()).toBe(false);
      expect(engine.getState()).toBe('fall');
    });

    it('actually descends once released mid-air', () => {
      const { engine } = makeEngine();
      engine.startDrag();
      engine.drag(600, 200);
      engine.endDrag();

      const dropped = engine.getPosition();
      engine.update(16);

      expect(engine.getPosition().y).toBeGreaterThan(dropped.y);
    });

    it('carries sideways momentum when flung', () => {
      const { engine } = makeEngine();
      engine.startDrag();

      // Two samples 16ms apart moving right = a rightward throw.
      engine.drag(400, 200);
      vi.advanceTimersByTime(16);
      engine.drag(460, 200);
      engine.endDrag();

      const dropped = engine.getPosition();
      engine.update(16);

      expect(engine.getPosition().x).toBeGreaterThan(dropped.x);
    });

    it('throws in the direction of the fling', () => {
      const { engine } = makeEngine();
      engine.startDrag();

      engine.drag(700, 200);
      vi.advanceTimersByTime(16);
      engine.drag(640, 200);
      engine.endDrag();

      const dropped = engine.getPosition();
      engine.update(16);

      expect(engine.getPosition().x).toBeLessThan(dropped.x);
    });

    it('drops straight down when released while holding still', () => {
      const { engine } = makeEngine();
      engine.startDrag();

      engine.drag(600, 200);
      vi.advanceTimersByTime(16);
      engine.drag(660, 200);
      // Held motionless past the sample window before letting go.
      vi.advanceTimersByTime(500);
      engine.endDrag();

      const dropped = engine.getPosition();
      engine.update(16);

      expect(engine.getPosition().x).toBe(dropped.x);
      expect(engine.getPosition().y).toBeGreaterThan(dropped.y);
    });

    it('clamps an extremely fast fling to the velocity ceiling', () => {
      const { engine } = makeEngine();
      engine.startDrag();

      engine.drag(200, 200);
      vi.advanceTimersByTime(1);
      engine.drag(1200, 200);
      engine.endDrag();

      const dropped = engine.getPosition();
      engine.update(16);

      // MAX_THROW_VELOCITY is 22px/frame; without the clamp this would be ~16000.
      expect(engine.getPosition().x - dropped.x).toBeLessThanOrEqual(22);
    });

    it('does not reuse momentum from a previous drag', () => {
      const { engine } = makeEngine();

      engine.startDrag();
      engine.drag(400, 200);
      vi.advanceTimersByTime(16);
      engine.drag(560, 200);
      engine.endDrag();

      // Second drag is a clean pick-up-and-hold.
      engine.startDrag();
      engine.drag(600, 200);
      vi.advanceTimersByTime(500);
      engine.endDrag();

      const dropped = engine.getPosition();
      engine.update(16);

      expect(engine.getPosition().x).toBe(dropped.x);
    });

    it('lands and bounces instead of freezing mid-air', () => {
      const { engine } = makeEngine();
      engine.startDrag();
      engine.drag(600, 200);
      engine.endDrag();

      // Long enough for gravity to carry it to the floor.
      for (let i = 0; i < 200; i++) engine.update(16);

      expect(engine.getPosition().y).toBe(GROUND_Y);
      expect(engine.getState()).not.toBe('fall');
    });

    it('still falls when an animation was locked before the drag', () => {
      const { engine } = makeEngine();
      // The regression: a held animation forced a stationary state and returned
      // before physics ran, so a dropped mascot hung in mid-air.
      engine._codingLock = true;
      engine._forcedCodingState = 'action_angry';

      engine.startDrag();
      engine.drag(600, 200);
      engine.endDrag();

      for (let i = 0; i < 200; i++) engine.update(16);

      expect(engine.getPosition().y).toBe(GROUND_Y);
      expect(engine.getState()).not.toBe('action_angry');
    });
  });

  describe('emotion changes during a drag', () => {
    it('does not interrupt the drag with an emotion reaction', () => {
      const { engine } = makeEngine();
      engine.startDrag();

      engine.setEmotion('angry');

      expect(engine.getState()).toBe('drag');
      expect(engine.getEmotion()).toBe('angry');
    });
  });
});
