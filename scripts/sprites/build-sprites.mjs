#!/usr/bin/env node
/**
 * Rebuilds every Doraemon animation frame as a 256x256 RGBA master (shown at 128 CSS px, so it is
 * 2x on Retina) from the pristine 1x frames in art/dora-sprites, then regenerates
 * docs/assets/doraemon-live-sprites-preview.png.
 *
 *   node scripts/sprites/build-sprites.mjs [--review <dir>] [--only <regex>]
 *
 *   --review <dir>  also write before/after review sheets into <dir>
 *   --only <regex>  rebuild only the groups whose name matches (the preview is always rebuilt)
 *
 * Needs ImageMagick 7 (`magick`). Reads only art/dora-sprites; the same sources give the same bytes.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYMBOLS, renderSymbolMvg } from './symbols.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART_DIR = path.join(ROOT, 'art/dora-sprites');
const OUT_DIR = path.join(ROOT, 'src/renderer/public/dora-sprites');
const PREVIEW_FILE = path.join(ROOT, 'docs/assets/doraemon-live-sprites-preview.png');

const SIZE = 256;
const SOURCE_SIZE = 128;
const MARGIN = 48;
const WORK = SIZE + 2 * MARGIN;
const OPAQUE = 8;
const RESAMPLE = ['-filter', 'Lanczos'];
const SHARPEN = ['-unsharp', '0x0.8+0.6+0.02', '-clamp'];
const PNG_OUT = ['-strip', '-define', 'png:exclude-chunks=date,time', '-define', 'png:compression-level=9'];

// The generated sets were drawn at different sizes. Each factor is the drawing's size relative to the
// 1x shime art, found by registering it against the shime frame it was traced from (shime15, 20, 20a,
// 21, 22, 11, 34, 30, 26, 1), or else its head against shime1's head. Output scale = 2 x factor, reduced
// only where the canvas cannot hold the frame (see fitScale).
const SHIME_RELATIVE_SIZE = [
  [1.06, ['emotion-joy', 'emotion-hope', 'emotion-connection', 'emotion-gratitude', 'action-greeting', 'action-chat_answer']],
  [1.08, ['emotion-pride', 'action-explain_gadget', 'action-gadget_use']],
  [1.11, ['action-angry', 'emotion-frustration']],
  [1.12, ['action-coding_thinking']],
  [1.13, ['action-eating', 'action-hungry', 'action-gadget_surprise', 'action-protect']],
  [1.14, ['emotion-satisfaction', 'action-rest', 'action-gadget_search', 'action-research']],
  [1.15, ['emotion-awe', 'emotion-wonder']],
  [1.18, ['emotion-contemplation', 'emotion-curiosity', 'action-random_thought']],
  [1.19, ['emotion-calm', 'action-walk', 'emotion-determination']],
  [1.22, ['emotion-concern', 'emotion-confusion']],
  [1.25, [
    'action-take_copter', 'emotion-excitement', 'action-nap', 'emotion-fatigue', 'emotion-melancholy', 'emotion-longing',
    'emotion-focus', 'action-chat_question', 'action-coding_typing',
  ]],
  // Measured 1.34, but the time machine is wider than the canvas at that size.
  [1.24, ['action-time_travel']],
];
const DRAWING_SCALE = new Map(SHIME_RELATIVE_SIZE.flatMap(([factor, sets]) => sets.map((set) => [set, 2 * factor])));
const GENERATED_PAD_WIDTH = SOURCE_SIZE + 2;
const OUTLINE = { color: '#151515', radius: 3, soften: 0.5 };
// How far the soft outline still counts as visible; used when fitting a set inside the canvas.
const OUTLINE_REACH = OUTLINE.radius + 1;
const SIDE_CLEARANCE = 1;
const TOP_CLEARANCE = 1;
const CEILING_CROP = { x: 0, y: 53, width: 128, height: 131 };
const CEILING_MAX_TOP = 4;

const shime = (...ids) => ids.map((id) => `shime${id}.png`);
const DOOR_FRAMES = shime(
  '38', '38a', '39', '40', '41', '41a', '41b', '41c', '41d', '41e', '41f', '41g', '41h', '41i', '41j', '41k',
  '41l', '41m', '41n', '42', '43', '44', '45', '46', '47', '48', '49', '50',
);

// grounded: one shared shift per group puts its lowest visible pixel on the bottom row.
// keep: scale only, so poses that hang off walls or fly keep their registration.
const SHIME_GROUPS = [
  { name: 'stand-walk', mode: 'grounded', frames: shime('1', '1a', '2', '3') },
  { name: 'sit', mode: 'grounded', frames: shime('11', '11a', '11b', '11c', '11d') },
  { name: 'sit-lookup', mode: 'grounded', frames: shime('26', '27', '28', '29') },
  { name: 'sit-dangle-carry', mode: 'grounded', frames: shime('30', '31', '32', '33') },
  { name: 'sprawl-sleep', mode: 'grounded', frames: shime('20', '20a', '20b', '21', '21a') },
  { name: 'bounce-trip', mode: 'grounded', frames: shime('18', '19') },
  { name: 'work', mode: 'grounded', frames: shime('34', '35', '36', '37') },
  { name: 'anywhere-door', mode: 'grounded', frames: DOOR_FRAMES },
  { name: 'fall', mode: 'keep', frames: shime('4') },
  { name: 'jump', mode: 'keep', frames: shime('22') },
  { name: 'fly', mode: 'keep', frames: shime('15', '16', '17') },
  { name: 'wall', mode: 'keep', frames: shime('12', '13', '13a', '14') },
  { name: 'drag', mode: 'keep', frames: shime('5', '6', '7', '8', '9', '10', 'X', 'Xa') },
  { name: 'ceiling', mode: 'ceiling', frames: shime('23', '23a', '23b', '23c', '24', '25') },
];

// t runs 0..1 from frame 01 to the last frame. Playback is ping-pong, so every motion is monotonic in t.
const breathe = (amplitude) => (t) => ({ sx: 1 - (amplitude * t) / 2, sy: 1 + amplitude * t, lift: 0 });
const chew = (amplitude) => (t) => ({ sx: 1 + (amplitude * t) / 2, sy: 1 - amplitude * t, lift: 0 });
const hover = (pixels) => (t) => ({ sx: 1, sy: 1, lift: Math.round(pixels * t) });
const still = () => ({ sx: 1, sy: 1, lift: 0 });

const STANDING_BREATH = 0.025;
const LYING_BREATH = 0.04;
const DEFAULT_SYMBOL_TARGET = { x: 228, y: 40 };

// target: preferred symbol centre in final 256 px coordinates; the nearest spot clear of the figure wins.
const SET_EFFECTS = {
  'emotion-calm': { motion: breathe(STANDING_BREATH) },
  'emotion-fatigue': { motion: breathe(LYING_BREATH), symbol: 'smallZ' },
  'emotion-satisfaction': { motion: breathe(STANDING_BREATH), symbol: 'twinkle' },
  'emotion-melancholy': { motion: breathe(LYING_BREATH), symbol: 'gloom' },
  'emotion-longing': { motion: breathe(LYING_BREATH), symbol: 'fadedHeart' },
  'emotion-gratitude': { motion: breathe(STANDING_BREATH), symbol: 'heartPulse' },
  'action-nap': { motion: breathe(LYING_BREATH), symbol: 'zzz' },
  'action-rest': { motion: breathe(STANDING_BREATH), symbol: 'note' },
  'action-eating': { motion: chew(0.035), symbol: 'crumbs' },
  'action-time_travel': { motion: hover(4), symbol: 'swirl' },
  'action-coding_typing': { motion: breathe(STANDING_BREATH), symbol: 'typingTicks' },
  'emotion-joy': { symbol: 'notes' },
  'emotion-hope': { symbol: 'star' },
  'emotion-connection': { symbol: 'twoHearts' },
  'action-chat_answer': { symbol: 'speechLines' },
  'emotion-contemplation': { symbol: 'thoughtDots' },
  'emotion-curiosity': { symbol: 'question' },
  'action-random_thought': { symbol: 'lightbulb' },
  'emotion-wonder': { symbol: 'exclaim' },
  'emotion-awe': { symbol: 'whiteSparkles' },
  'action-angry': { symbol: 'angerVein' },
  'emotion-frustration': { symbol: 'steam' },
  'emotion-determination': { symbol: 'burst' },
  'action-explain_gadget': { symbol: 'shine' },
  'action-gadget_search': { symbol: 'smallQuestion' },
  'action-gadget_surprise': { symbol: 'exclaim' },
  'action-chat_question': { symbol: 'question' },
  'emotion-concern': { symbol: 'sweatDrop' },
};

// ─── ImageMagick plumbing ────────────────────────────────────────────────────

function fail(message) {
  console.error(`[sprites] ${message}`);
  process.exit(1);
}

function requireMagick() {
  let version = '';
  try {
    version = execFileSync('magick', ['-version'], { encoding: 'utf8' });
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'is not on PATH' : `failed to run (${error.message})`;
    fail(`ImageMagick 7 \`magick\` ${reason}. Install it (macOS: brew install imagemagick) and re-run.`);
  }
  if (!/ImageMagick 7\./.test(version)) fail(`ImageMagick 7 is required, found: ${version.split('\n')[0]}`);
}

function magick(args, input) {
  return execFileSync('magick', args, { input, maxBuffer: 1 << 28 });
}

function readRgba(args, width, height, input) {
  const data = magick([...args, '-depth', '8', 'RGBA:-'], input);
  if (data.length !== width * height * 4) {
    throw new Error(`expected ${width}x${height} RGBA from magick ${args.join(' ')}, got ${data.length} bytes`);
  }
  return { width, height, data };
}

const rawInput = (image) => ['-size', `${image.width}x${image.height}`, '-depth', '8', 'RGBA:-'];

function pngHeader(file) {
  const header = fs.readFileSync(file).subarray(0, 26);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), bitDepth: header[24], colorType: header[25] };
}

// ─── Pixel helpers ───────────────────────────────────────────────────────────

const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];

function bounds(image, threshold = OPAQUE) {
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (alphaAt(image, x, y) <= threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0 ? null : { left, top, right, bottom };
}

function unionBounds(boxes) {
  const present = boxes.filter(Boolean);
  return {
    left: Math.min(...present.map((b) => b.left)),
    top: Math.min(...present.map((b) => b.top)),
    right: Math.max(...present.map((b) => b.right)),
    bottom: Math.max(...present.map((b) => b.bottom)),
  };
}

function crop(image, x0, y0, width, height) {
  const data = Buffer.alloc(width * height * 4);
  const from = Math.max(0, x0), to = Math.min(image.width, x0 + width);
  for (let y = 0; y < height && to > from; y++) {
    const sy = y + y0;
    if (sy < 0 || sy >= image.height) continue;
    image.data.copy(data, (y * width + (from - x0)) * 4, (sy * image.width + from) * 4, (sy * image.width + to) * 4);
  }
  return { width, height, data };
}

function countVisibleOutside(image, window) {
  let count = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const inside = x >= window.x && x < window.x + SIZE && y >= window.y && y < window.y + SIZE;
      if (!inside && alphaAt(image, x, y) > OPAQUE) count++;
    }
  }
  return count;
}

// ─── Rendering onto a WORK x WORK canvas whose centre SIZE x SIZE square is the output ──

const source = (frame) => path.join(ART_DIR, frame);
const centreOnWork = ['-background', 'none', '-gravity', 'center', '-extent', `${WORK}x${WORK}`];

function readSource(frame) {
  const { width, height } = pngHeader(source(frame));
  return readRgba([source(frame)], width, height);
}

function renderShime(frame) {
  return readRgba([source(frame), ...RESAMPLE, '-resize', '200%', ...SHARPEN, ...centreOnWork], WORK, WORK);
}

// Every ceiling frame gets the same crop, so the take-copter bob of the original animation survives.
function renderCeiling(frame) {
  const { x, y, width, height } = CEILING_CROP;
  const args = [source(frame), '-crop', `${width}x${height}+${x}+${y}`, '+repage', ...RESAMPLE, '-resize', `x${SIZE}`];
  return readRgba([...args, ...SHARPEN, ...centreOnWork], WORK, WORK);
}

const outlineArgs = () => [
  '(', '+clone', '-alpha', 'extract', '-morphology', 'Dilate', `Disk:${OUTLINE.radius}`, '-blur', `0x${OUTLINE.soften}`,
  '-background', OUTLINE.color, '-alpha', 'shape', ')', '+swap', '-compose', 'Over', '-composite',
];

// Scales about the canvas centre x, anchored on the content's bottom edge, so squash/stretch frames
// stay planted on the feet and on the centre line. An even output width keeps the centre on a pixel edge.
function renderGenerated(frame, { scale, bottomEdge }, { sx, sy }) {
  const width = 2 * Math.round((GENERATED_PAD_WIDTH * scale * sx) / 2);
  const height = Math.round(bottomEdge * scale * sy);
  const left = MARGIN + SIZE / 2 - width / 2;
  const top = MARGIN + SIZE - height;
  return readRgba([
    source(frame), '-background', 'none', '-gravity', 'North', '-extent', `${GENERATED_PAD_WIDTH}x${bottomEdge}`,
    ...RESAMPLE, '-resize', `${width}x${height}!`, ...SHARPEN,
    '-gravity', 'NorthWest', '-extent', `${WORK}x${WORK}-${left}-${top}`, ...outlineArgs(),
  ], WORK, WORK);
}

// ─── Groups ──────────────────────────────────────────────────────────────────

function cropToOutput(group, works, lifts = []) {
  const grounded = group.mode === 'grounded' || group.mode === 'generated';
  const lowest = Math.max(...works.map((work) => bounds(work).bottom));
  const window = { x: MARGIN, y: grounded ? lowest - (SIZE - 1) : MARGIN };
  return works.map((work, index) => {
    const frameWindow = { x: window.x, y: window.y + (lifts[index] ?? 0) };
    const clipped = countVisibleOutside(work, frameWindow);
    if (clipped > 0) console.warn(`[sprites] warning: ${group.frames[index]} loses ${clipped} visible px at the canvas edge`);
    return crop(work, frameWindow.x, frameWindow.y, SIZE, SIZE);
  });
}

function buildShimeGroup(group) {
  const render = group.mode === 'ceiling' ? renderCeiling : renderShime;
  return { finals: cropToOutput(group, group.frames.map(render)), info: group.mode };
}

// Largest scale up to `preferred` at which every frame, outline included, stays inside the canvas
// without reaching a side it did not already touch at 1x.
function fitScale(preferred, box, motions) {
  const maxSx = Math.max(...motions.map((m) => m.sx));
  const maxSy = Math.max(...motions.map((m) => m.sy));
  const maxLift = Math.max(...motions.map((m) => m.lift));
  const halfRoom = SIZE / 2 - OUTLINE_REACH - SIDE_CLEARANCE;
  const limits = [preferred];
  if (box.left > 0) limits.push(halfRoom / ((SOURCE_SIZE / 2 - box.left) * maxSx));
  if (box.right < SOURCE_SIZE - 1) limits.push(halfRoom / ((box.right + 1 - SOURCE_SIZE / 2) * maxSx));
  const verticalRoom = SIZE - 2 * OUTLINE_REACH - TOP_CLEARANCE - maxLift;
  limits.push(verticalRoom / ((box.bottom + 1 - box.top) * maxSy));
  return Math.min(...limits);
}

function buildGeneratedSet(group) {
  const effects = SET_EFFECTS[group.name] ?? {};
  const last = Math.max(1, group.frames.length - 1);
  const motions = group.frames.map((_, index) => (effects.motion ?? still)(index / last));
  const box = unionBounds(group.frames.map((frame) => bounds(readSource(frame), 0)));
  const preferred = DRAWING_SCALE.get(group.name);
  if (!preferred) throw new Error(`no measured scale for ${group.name}; add it to SHIME_RELATIVE_SIZE`);
  const placement = { scale: fitScale(preferred, box, motions), bottomEdge: box.bottom + 1 };
  const works = group.frames.map((frame, index) => renderGenerated(frame, placement, motions[index]));
  const finals = cropToOutput(group, works, motions.map((m) => m.lift));
  const symbol = effects.symbol ? applySymbol(effects, finals, group) : null;
  const fitted = placement.scale < preferred - 1e-9 ? ` (wanted ${preferred.toFixed(2)}, fitted to canvas)` : '';
  const notes = [`scale ${placement.scale.toFixed(3)}${fitted}`];
  if (effects.motion) notes.push('motion');
  if (symbol) notes.push(`${effects.symbol} @${symbol.anchor.x},${symbol.anchor.y}`);
  return { finals: symbol?.finals ?? finals, info: notes.join(', ') };
}

function generatedGroups() {
  const sets = new Map();
  for (const file of fs.readdirSync(ART_DIR).sort()) {
    const match = /^((?:emotion|action)-.+)-\d\d\.png$/.exec(file);
    if (!match) continue;
    if (!sets.has(match[1])) sets.set(match[1], []);
    sets.get(match[1]).push(file);
  }
  return [...sets].map(([name, frames]) => ({ name, mode: 'generated', frames, animated: Boolean(SET_EFFECTS[name]) }));
}

// ─── Symbols ─────────────────────────────────────────────────────────────────

const SYMBOL_GAP = 5;
const SYMBOL_EDGE = 2;

function figureMask(images, radius) {
  const mask = new Uint8Array(SIZE * SIZE);
  for (const image of images) {
    for (let i = 0; i < SIZE * SIZE; i++) if (image.data[i * 4 + 3] > 0) mask[i] = 1;
  }
  const grown = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!mask[y * SIZE + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (dx * dx + dy * dy <= radius * radius && nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) grown[ny * SIZE + nx] = 1;
        }
      }
    }
  }
  return grown;
}

function symbolFootprint(symbol, frameCount, options) {
  const covered = new Set();
  const anchor = { x: SIZE / 2, y: SIZE / 2 };
  const last = Math.max(1, frameCount - 1);
  for (let index = 0; index < frameCount; index++) {
    const mvg = renderSymbolMvg(symbol, anchor, index / last, index, options);
    const layer = readRgba(['-size', `${SIZE}x${SIZE}`, 'xc:none', '-draw', mvg], SIZE, SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) if (layer.data[i * 4 + 3] > 0) covered.add(i);
  }
  return [...covered].map((i) => [(i % SIZE) - anchor.x, Math.floor(i / SIZE) - anchor.y]);
}

function findAnchor(footprint, blocked, target) {
  const candidates = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) candidates.push([x, y, (x - target.x) ** 2 + (y - target.y) ** 2]);
  candidates.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const inside = (v) => v >= SYMBOL_EDGE && v < SIZE - SYMBOL_EDGE;
  for (const [x, y] of candidates) {
    const fits = footprint.every(([dx, dy]) => inside(x + dx) && inside(y + dy) && !blocked[(y + dy) * SIZE + x + dx]);
    if (fits) return { x, y };
  }
  return null;
}

function applySymbol(effects, finals, group) {
  const symbol = SYMBOLS[effects.symbol];
  if (!symbol) throw new Error(`unknown symbol ${effects.symbol} for ${group.name}`);
  const options = { flip: Boolean(effects.flip) };
  const footprint = symbolFootprint(symbol, finals.length, options);
  const anchor = findAnchor(footprint, figureMask(finals, SYMBOL_GAP), effects.target ?? DEFAULT_SYMBOL_TARGET);
  if (!anchor) {
    console.warn(`[sprites] warning: no free space for ${effects.symbol} on ${group.name}; frames kept without it`);
    return null;
  }
  const last = Math.max(1, finals.length - 1);
  const drawn = finals.map((image, index) => {
    const mvg = renderSymbolMvg(symbol, anchor, index / last, index, options);
    return readRgba([...rawInput(image), '-draw', mvg], SIZE, SIZE, image.data);
  });
  return { finals: drawn, anchor };
}

// ─── Output ──────────────────────────────────────────────────────────────────

const encodePng = (image) => magick([...rawInput(image), ...PNG_OUT, 'PNG32:-'], image.data);

function writeIfChanged(file, bytes) {
  if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return false;
  fs.writeFileSync(file, bytes);
  return true;
}

function writeFrames(group, finals) {
  return finals.filter((image, index) => writeIfChanged(path.join(OUT_DIR, group.frames[index]), encodePng(image))).length;
}

const PREVIEW = { columns: 8, rows: 5, cellWidth: 168, cellHeight: 164, offsetX: 20, offsetY: 18, background: '#080d1d' };

// Contact sheet of each generated set's first frame, emotions then actions, shown at 128 CSS px.
function writePreview(groups) {
  const sorted = (prefix) => groups.filter((g) => g.name.startsWith(prefix)).sort((a, b) => a.name.localeCompare(b.name));
  const ordered = [...sorted('emotion-'), ...sorted('action-')];
  const { columns, rows, cellWidth, cellHeight, offsetX, offsetY, background } = PREVIEW;
  const args = ['-size', `${columns * cellWidth}x${rows * cellHeight}`, `xc:${background}`];
  ordered.slice(0, columns * rows).forEach((group, index) => {
    const x = (index % columns) * cellWidth + offsetX;
    const y = Math.floor(index / columns) * cellHeight + offsetY;
    const frame = path.join(OUT_DIR, group.frames[0]);
    args.push('(', frame, ...RESAMPLE, '-resize', `${SOURCE_SIZE}x${SOURCE_SIZE}`, ')', '-geometry', `+${x}+${y}`, '-composite');
  });
  return writeIfChanged(PREVIEW_FILE, magick([...args, '-alpha', 'off', '-depth', '8', ...PNG_OUT, 'PNG24:-']));
}

// ─── Verification (reads the written files back) ─────────────────────────────

function verifyGroup(group, problems) {
  const images = group.frames.map((frame) => {
    const file = path.join(OUT_DIR, frame);
    const header = pngHeader(file);
    if (header.width !== SIZE || header.height !== SIZE || header.bitDepth !== 8 || header.colorType !== 6) {
      problems.push(`${frame}: ${header.width}x${header.height}, bit depth ${header.bitDepth}, colour type ${header.colorType}`);
    }
    return readRgba([file], SIZE, SIZE);
  });
  const boxes = images.map((image) => bounds(image));
  const union = unionBounds(boxes);
  if ((group.mode === 'grounded' || group.mode === 'generated') && union.bottom !== SIZE - 1) {
    problems.push(`${group.name}: lowest visible row ${union.bottom}, expected ${SIZE - 1}`);
  }
  if (group.mode === 'ceiling') {
    // One shared transform keeps the take-copter bob drawn into the 1x frames, so only the highest frame reaches row 0-4.
    console.log(`[sprites] ceiling top rows: ${boxes.map((box, i) => `${group.frames[i].replace('.png', '')} ${box.top}`).join(', ')}`);
    if (union.top > CEILING_MAX_TOP) problems.push(`${group.name}: topmost visible row ${union.top}, expected <= ${CEILING_MAX_TOP}`);
  }
  if (group.mode === 'generated') checkSideEdges(group, images, problems);
  return boxes;
}

function checkSideEdges(group, images, problems) {
  const at1x = unionBounds(group.frames.map((frame) => bounds(readSource(frame))));
  images.forEach((image, index) => {
    const box = bounds(image);
    if (box.left === 0 && at1x.left > 0) problems.push(`${group.frames[index]}: touches the left edge`);
    if (box.right === SIZE - 1 && at1x.right < SOURCE_SIZE - 1) problems.push(`${group.frames[index]}: touches the right edge`);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = { review: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const value = () => argv[++i] ?? fail(`${argv[i - 1]} needs a value`);
    if (argv[i] === '--review') options.review = path.resolve(value());
    else if (argv[i] === '--only') options.only = new RegExp(value());
    else fail(`unknown argument ${argv[i]}`);
  }
  return options;
}

const folderKb = (dir) =>
  Math.round(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0) / 1024);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  requireMagick();
  const groups = [...SHIME_GROUPS, ...generatedGroups()];
  const missing = groups.flatMap((g) => g.frames).filter((frame) => !fs.existsSync(source(frame)));
  if (missing.length) fail(`missing source frames in ${ART_DIR}: ${missing.join(', ')}`);

  const kbBefore = folderKb(OUT_DIR);
  const selected = groups.filter((group) => !options.only || options.only.test(group.name));
  let written = 0;
  for (const group of selected) {
    const { finals, info } = group.mode === 'generated' ? buildGeneratedSet(group) : buildShimeGroup(group);
    written += writeFrames(group, finals);
    console.log(`[sprites] ${group.name.padEnd(28)} ${String(group.frames.length).padStart(2)} frames  ${info}`);
  }
  const previewUpdated = writePreview(groups.filter((g) => g.mode === 'generated'));
  const problems = [];
  for (const group of selected) verifyGroup(group, problems);

  console.log(`[sprites] ${written} frames written, preview ${previewUpdated ? 'updated' : 'unchanged'}`);
  console.log(`[sprites] ${path.relative(ROOT, OUT_DIR)}: ${kbBefore} KB -> ${folderKb(OUT_DIR)} KB`);
  if (options.review) {
    const { writeReviewSheets } = await import('./review.mjs');
    writeReviewSheets({ dir: options.review, groups: selected, artDir: ART_DIR, outDir: OUT_DIR, size: SIZE });
  }
  if (problems.length) fail(`verification failed:\n  ${problems.join('\n  ')}`);
  console.log(`[sprites] verified ${selected.reduce((n, g) => n + g.frames.length, 0)} frames: ${SIZE}x${SIZE} RGBA, ` +
    `baselines on row ${SIZE - 1}, ceiling tops <= ${CEILING_MAX_TOP}, no new side-edge contact`);
}

await main();
