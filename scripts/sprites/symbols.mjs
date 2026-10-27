// Procedural manga symbols for build-sprites.mjs. Every symbol is built from vector paths (no fonts),
// drawn at 2x pixel size around a local origin, with the same dark outline weight as the sprite art.
// draw(t, index) receives t = 0..1 from frame 01 to the last frame; motion is monotonic in t because
// playback is ping-pong.

const INK = '#151515';
const INK_WIDTH = 2.5;

const YELLOW = '#ffd84a';
const WHITE = '#ffffff';
const PINK = '#ff6f9f';
const LIGHT_PINK = '#ff9fc3';
const PALE_PINK = '#ffc9db';
const SKY = '#8fd8ff';
const RED = '#ff4b4b';
const LAVENDER = '#ab9ff2';
const CRUMB = '#d99a5b';
const BULB = '#ffe45c';
const METAL = '#c3c9d2';
const CYAN = '#7fe6ff';
const STEAM = '#f3f3f3';

const lerp = (from, to, t) => from + (to - from) * t;
const radians = (degrees) => (degrees * Math.PI) / 180;

// ─── Geometry ────────────────────────────────────────────────────────────────

function affine({ x = 0, y = 0, scale = 1, rotate = 0, flip = false }) {
  const cos = Math.cos(radians(rotate)) * scale;
  const sin = Math.sin(radians(rotate)) * scale;
  const mirror = flip ? -1 : 1;
  return { a: cos * mirror, b: sin, c: -sin * mirror, d: cos, e: x, f: y };
}

function compose(outer, inner) {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

function transformPath(segments, m) {
  return segments.map(([command, ...values]) => {
    const out = [command];
    for (let i = 0; i < values.length; i += 2) {
      out.push(m.a * values[i] + m.c * values[i + 1] + m.e, m.b * values[i] + m.d * values[i + 1] + m.f);
    }
    return out;
  });
}

const moved = (shape, transform) => ({ ...shape, d: transformPath(shape.d, affine(transform)) });
const movedAll = (shapes, transform) => shapes.map((shape) => moved(shape, transform));

function ellipse(cx, cy, rx, ry, rotate = 0) {
  const k = 0.5523;
  const d = [
    ['M', rx, 0], ['C', rx, k * ry, k * rx, ry, 0, ry], ['C', -k * rx, ry, -rx, k * ry, -rx, 0],
    ['C', -rx, -k * ry, -k * rx, -ry, 0, -ry], ['C', k * rx, -ry, rx, -k * ry, rx, 0], ['Z'],
  ];
  return transformPath(d, affine({ x: cx, y: cy, rotate }));
}

const circle = (cx, cy, r) => ellipse(cx, cy, r, r);
const polyline = (points) => points.map(([x, y], i) => [i === 0 ? 'M' : 'L', x, y]);
const polygon = (points) => [...polyline(points), ['Z']];

function radial(cx, cy, angle, from, to) {
  const dx = Math.cos(radians(angle)), dy = Math.sin(radians(angle));
  return polyline([[cx + dx * from, cy + dy * from], [cx + dx * to, cy + dy * to]]);
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

function sparkle(x, y, r, fill) {
  const w = r * 0.26;
  const d = [['M', 0, -r], ['Q', w, -w, r, 0], ['Q', w, w, 0, r], ['Q', -w, w, -r, 0], ['Q', -w, -w, 0, -r], ['Z']];
  return { d: transformPath(d, affine({ x, y })), fill };
}

function star(x, y, r, rotate, fill) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.48;
    const angle = radians(-90 + i * 36);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  return { d: transformPath(polygon(points), affine({ x, y, rotate })), fill };
}

function heart(x, y, s, fill) {
  const d = [
    ['M', 0, 0.95 * s], ['C', -0.25 * s, 0.7 * s, -1.05 * s, 0.25 * s, -1.0 * s, -0.3 * s],
    ['C', -0.95 * s, -0.85 * s, -0.25 * s, -1.05 * s, 0, -0.55 * s],
    ['C', 0.25 * s, -1.05 * s, 0.95 * s, -0.85 * s, 1.0 * s, -0.3 * s],
    ['C', 1.05 * s, 0.25 * s, 0.25 * s, 0.7 * s, 0, 0.95 * s], ['Z'],
  ];
  const shine = { d: ellipse(-0.48 * s, -0.42 * s, 0.2 * s, 0.13 * s, -40), fill: WHITE, outline: false };
  return movedAll([{ d, fill }, shine], { x, y });
}

function eighthNote(x, y, scale, rotate, fill) {
  const head = { d: ellipse(-3.5, 7, 6, 4.4, -22), fill };
  const stem = { d: polyline([[1.7, 6.5], [1.7, -12]]), stroke: fill, width: 3 };
  const flag = { d: [['M', 1.7, -12], ['C', 6, -10.5, 9.5, -7, 7, -1.5]], stroke: fill, width: 3 };
  return movedAll([head, stem, flag], { x, y, scale, rotate });
}

function zee(x, y, size, color) {
  const h = size / 2;
  return { d: transformPath(polyline([[-h, -h], [h, -h], [-h, h], [h, h]]), affine({ x, y })), stroke: color, width: size > 12 ? 3.8 : 3.2 };
}

function questionMark(x, y, scale, rotate, color) {
  const hook = { d: [['M', -6, -7], ['C', -6, -15, 6.5, -15, 6.5, -7], ['C', 6.5, -2.5, 0.5, -1.5, 0.5, 4]], stroke: color, width: 4.6 };
  const dot = { d: circle(0.5, 11, 2.7), fill: color };
  return movedAll([hook, dot], { x, y, scale, rotate });
}

function exclamation(x, y, scale, color) {
  const bar = { d: polygon([[-3.6, -13], [3.6, -13], [2.1, 4], [-2.1, 4]]), fill: color };
  const dot = { d: circle(0, 10.5, 3), fill: color };
  return movedAll([bar, dot], { x, y, scale });
}

function crumb(x, y, r, rotate) {
  const radii = [1, 0.72, 0.95, 0.68, 0.9];
  const points = radii.map((k, i) => [Math.cos(radians(i * 72)) * r * k, Math.sin(radians(i * 72)) * r * k]);
  return { d: transformPath(polygon(points), affine({ x, y, rotate })), fill: CRUMB };
}

function spiral(x, y, radius, turns, rotate, color) {
  const steps = 48;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * turns * 2 * Math.PI;
    const r = radius * (0.12 + 0.88 * (i / steps));
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  });
  return { d: transformPath(polyline(points), affine({ x, y, rotate })), stroke: color, width: 3.2 };
}

function wavyLine(x, top, length) {
  return [['M', x, top], ['C', x + 2.6, top + length / 3, x - 2.6, top + (2 * length) / 3, x, top + length]];
}

function veinCorner(rotate, scale) {
  const d = [['M', 2.6, -10], ['Q', 2.6, -2.6, 10, -2.6]];
  return { d: transformPath(d, affine({ rotate, scale })), stroke: RED, width: 3.8 };
}

function puff(x, y, s) {
  return [
    { d: circle(x - 3.6 * s, y + 1.2 * s, 4.2 * s), fill: STEAM },
    { d: circle(x + 1.2 * s, y - 2.4 * s, 5.2 * s), fill: STEAM },
    { d: circle(x + 4.8 * s, y + 1.6 * s, 3.8 * s), fill: STEAM },
  ];
}

function drop(x, y, s, rotate, fill) {
  const d = [
    ['M', 0, -10 * s], ['C', 2.2 * s, -6 * s, 7 * s, -0.5 * s, 7 * s, 3.6 * s],
    ['C', 7 * s, 7.8 * s, 3.8 * s, 10 * s, 0, 10 * s], ['C', -3.8 * s, 10 * s, -7 * s, 7.8 * s, -7 * s, 3.6 * s],
    ['C', -7 * s, -0.5 * s, -2.2 * s, -6 * s, 0, -10 * s], ['Z'],
  ];
  const shine = { d: ellipse(-2.9 * s, 4.2 * s, 1.5 * s, 2.6 * s, 18), fill: WHITE, outline: false };
  return movedAll([{ d, fill }, shine], { x, y, rotate });
}

function bulb(t) {
  const rays = [-155, -120, -90, -60, -25].map((angle) => ({
    d: radial(0, -5, angle, 13.5, 13.5 + lerp(2.5, 6, t)), stroke: YELLOW, width: 2.8,
  }));
  const glass = [{ d: circle(0, -5, 8.6), fill: BULB }, { d: polygon([[-4.6, 0], [4.6, 0], [3.8, 5.5], [-3.8, 5.5]]), fill: BULB }];
  const base = { d: polygon([[-4.2, 5], [4.2, 5], [4.2, 10.5], [-4.2, 10.5]]), fill: METAL };
  const threads = { d: polyline([[-4.2, 7.8], [4.2, 7.8]]), stroke: '#7d8794', width: 1.2, outline: false };
  const shine = { d: ellipse(-3.2, -8, 1.6, 2.8, 30), fill: WHITE, outline: false };
  return [rays, [...glass, base, threads, shine]];
}

// ─── Symbols ─────────────────────────────────────────────────────────────────

export const SYMBOLS = {
  twinkle: { draw: (t) => [[sparkle(0, 0, lerp(7, 11, t), YELLOW)], [sparkle(12, -11, lerp(5.5, 3, t), YELLOW)]] },
  note: { draw: (t) => [eighthNote(0, lerp(2, -3, t), 1, lerp(-8, 8, t), SKY)] },
  smallZ: { draw: (t) => [[zee(0, lerp(3, -3, t), lerp(10, 13, t), SKY)]] },
  zzz: {
    draw: (t) => {
      const letters = [[-12, 11, 9], [0, -1, 12], [13, -15, 15]];
      return letters.slice(0, 1 + Math.round(t * 2)).map(([x, y, size]) => [zee(x, y, size * lerp(0.92, 1.05, t), SKY)]);
    },
  },
  gloom: {
    draw: (t) => [[[-10, 14], [-3.5, 20], [3, 16], [9.5, 22]].map(([x, length]) => ({
      d: wavyLine(x, -16, length + 6 * t), stroke: LAVENDER, width: 3,
    }))],
  },
  fadedHeart: { draw: (t) => [heart(0, lerp(2, -3, t), lerp(8.5, 9.5, t), PALE_PINK)] },
  heartPulse: { draw: (t) => [heart(0, 0, lerp(8, 11, t), PINK)] },
  crumbs: {
    draw: (t) => [[[-6, -4, 3.2, 10], [3, 1, 2.6, 40], [-2, 8, 2.2, 75], [7, 10, 2.8, 20]].map(([x, y, r, rotate]) =>
      crumb(x, y + 5 * t, r, rotate + 40 * t))],
  },
  swirl: { draw: (t) => [[spiral(0, 0, 12, 1.6, t * 120, CYAN)], [sparkle(13, -12, lerp(3.5, 6, t), YELLOW)]] },
  typingTicks: {
    draw: (t) => [[-140, -90, -40].slice(0, 1 + Math.round(2 * t)).map((angle) => ({
      d: radial(0, 6, angle, 5, 12), stroke: WHITE, width: 3,
    }))],
  },
  notes: { draw: (t) => [eighthNote(-9, lerp(4, -2, t), 0.9, -6, PINK), eighthNote(9, lerp(-7, -1, t), 0.8, 8, YELLOW)] },
  star: { draw: (t) => [[star(0, 0, lerp(10, 13, t), lerp(-8, 8, t), YELLOW)]] },
  twoHearts: { draw: (t) => [heart(-7, 6, lerp(8.5, 6, t), PINK), heart(8, -7, lerp(6, 8.5, t), LIGHT_PINK)] },
  speechLines: {
    draw: (t) => [[-35, 0, 35].map((angle) => ({ d: radial(-8, 0, angle, 0, lerp(8, 13, t)), stroke: WHITE, width: 3.2 }))],
  },
  thoughtDots: {
    draw: (t, index) => {
      const dots = [[-9, 9, 3], [-1, 1, 4.2], [8.5, -8.5, 5.6]];
      const pulse = index >= 3 ? 1.12 : 1;
      return dots.slice(0, Math.min(3, index + 1)).map(([x, y, r], i) => [{ d: circle(x, y, i === 2 ? r * pulse : r), fill: WHITE }]);
    },
  },
  question: { draw: (t) => [questionMark(0, lerp(1, -2, t), 1, lerp(-10, 8, t), WHITE)] },
  smallQuestion: { draw: (t) => [questionMark(0, lerp(1, -1, t), 0.75, lerp(-10, 8, t), WHITE)] },
  lightbulb: { draw: (t) => bulb(t) },
  exclaim: { draw: (t) => [exclamation(0, lerp(1, -2, t), lerp(0.92, 1.12, t), YELLOW)] },
  whiteSparkles: {
    draw: (t) => [[sparkle(-8, -4, lerp(9, 5.5, t), WHITE)], [sparkle(9, 6, lerp(5, 8.5, t), WHITE)], [sparkle(4, -15, lerp(3.5, 5, t), WHITE)]],
  },
  angerVein: { draw: (t) => [[0, 90, 180, 270].map((rotate) => veinCorner(rotate, lerp(0.85, 1.12, t)))] },
  steam: { draw: (t) => [puff(-7 - 2 * t, 5 - 3 * t, lerp(0.75, 1, t)), puff(7 + 2 * t, -6 - 3 * t, lerp(0.6, 0.9, t))] },
  burst: {
    draw: (t) => [[-62, -38, -14].map((angle) => ({ d: radial(-8, 8, angle, 6, 6 + lerp(9, 14, t)), stroke: YELLOW, width: 3.4 }))],
  },
  shine: { draw: (t) => [[sparkle(-6, 4, lerp(8.5, 5, t), YELLOW)], [sparkle(8, -8, lerp(4.5, 8, t), YELLOW)]] },
  sweatDrop: { draw: (t) => [drop(0, lerp(-2, 3, t), lerp(0.95, 1.05, t), -12, SKY)] },
};

// ─── MVG ─────────────────────────────────────────────────────────────────────

const number = (value) => String(Math.round(value * 100) / 100);
const pathText = (segments) => segments.map(([command, ...values]) => [command, ...values.map(number)].join(' ')).join(' ');

function shapeMvg(shape, m, pass) {
  const d = `path '${pathText(transformPath(shape.d, m))}'`;
  const stroked = Boolean(shape.stroke);
  if (pass === 'ink') {
    const width = (stroked ? shape.width : 0) + 2 * INK_WIDTH;
    return [`fill ${shape.fill ? INK : 'none'}`, `stroke ${INK}`, `stroke-width ${number(width)}`, d];
  }
  return [`fill ${shape.fill ?? 'none'}`, `stroke ${shape.stroke ?? 'none'}`, `stroke-width ${number(stroked ? shape.width : 0)}`, d];
}

/** MVG that draws `symbol` at `anchor` for animation position t (0..1) of frame `index`. */
export function renderSymbolMvg(symbol, anchor, t, index, { flip = false } = {}) {
  const m = compose(affine({ x: anchor.x, y: anchor.y }), affine({ flip }));
  const lines = ['stroke-linecap round', 'stroke-linejoin round'];
  for (const group of symbol.draw(t, index)) {
    for (const shape of group) if (shape.outline !== false) lines.push(...shapeMvg(shape, m, 'ink'));
    for (const shape of group) lines.push(...shapeMvg(shape, m, 'colour'));
  }
  return lines.join('\n');
}
