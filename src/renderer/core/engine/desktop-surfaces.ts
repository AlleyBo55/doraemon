/** Another app's window in engine coordinates. Hosts pass these front-to-back. */
export interface DesktopWindow {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A stretch of a window's top edge that no window in front of it covers. */
export interface Ledge {
  windowId: number;
  y: number;
  left: number;
  right: number;
}

/** Where a ledge may be: `left`/`right` bound the mascot's centre, `top` is the highest usable edge. */
export interface LedgeArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type Interval = [number, number];

function subtract(intervals: Interval[], [cutFrom, cutTo]: Interval): Interval[] {
  const kept: Interval[] = [];
  for (const [from, to] of intervals) {
    if (cutTo <= from || cutFrom >= to) {
      kept.push([from, to]);
      continue;
    }
    if (cutFrom > from) kept.push([from, cutFrom]);
    if (cutTo < to) kept.push([cutTo, to]);
  }
  return kept;
}

/** True when `cover` is drawn over the horizontal line at `y`. */
const coversLine = (cover: DesktopWindow, y: number): boolean => cover.y <= y && y < cover.y + cover.h;

/**
 * Visible top edges, so the mascot never stands on a title bar hidden behind
 * another window. `windows` must be front-to-back.
 */
export function findLedges(windows: DesktopWindow[], area: LedgeArea, minWidth: number): Ledge[] {
  const ledges: Ledge[] = [];

  windows.forEach((window, index) => {
    const y = window.y;
    if (y < area.top || y > area.bottom) return;

    let visible: Interval[] = [[Math.max(window.x, area.left), Math.min(window.x + window.w, area.right)]];
    for (let front = 0; front < index && visible.length > 0; front++) {
      const cover = windows[front];
      if (cover && coversLine(cover, y)) visible = subtract(visible, [cover.x, cover.x + cover.w]);
    }

    for (const [left, right] of visible) {
      if (right - left >= minWidth) ledges.push({ windowId: window.id, y, left, right });
    }
  });

  return ledges;
}
