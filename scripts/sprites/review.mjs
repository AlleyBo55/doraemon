// Before/after review sheets for build-sprites.mjs --review <dir>. Development aid only; nothing ships from here.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BACKGROUNDS = { dark: '#1e1f24', light: '#f2efe8' };
const CELL = 128;
const COLUMNS = 12;
const GROUPS_PER_PAGE = 7;
const STRIPS_PER_PAGE = 7;

const magick = (args) => execFileSync('magick', args, { maxBuffer: 1 << 28 });

function boxed(file, size, extra = []) {
  return [
    '(', file, ...extra, '-background', 'none', '-gravity', 'center', '-extent', `${size}x${size}`,
    '-fill', 'none', '-stroke', '#8a8a8a', '-strokewidth', '1', '-draw', `rectangle 0,0 ${size - 1},${size - 1}`, ')',
  ];
}

function cell(tmp, name, file, extra) {
  const out = path.join(tmp, name);
  magick([...boxed(file, CELL, extra), out]);
  return out;
}

function padRow(items) {
  const rest = items.length % COLUMNS;
  return rest === 0 ? items : [...items, ...Array(COLUMNS - rest).fill(null)];
}

function montage(cells, background, out, size = CELL, columns = COLUMNS) {
  const args = ['montage'];
  for (const item of cells) {
    if (item) args.push('-label', item.label, item.file);
    else args.push('-label', '', 'null:');
  }
  args.push('-tile', `${columns}x`, '-geometry', `${size}x${size}+4+6`, '-background', background);
  args.push('-fill', background === BACKGROUNDS.dark ? '#d8d8d8' : '#333333', '-pointsize', '11', out);
  magick(args);
}

function groupCells(tmp, group, artDir, outDir) {
  const before = group.frames.map((frame) => ({
    label: `${frame.replace('.png', '')} 1x`,
    file: cell(tmp, `b-${frame}`, path.join(artDir, frame), ['-resize', `${CELL}x${CELL}!`]),
  }));
  const after = group.frames.map((frame) => ({
    label: `${frame.replace('.png', '')} new`,
    file: cell(tmp, `a-${frame}`, path.join(outDir, frame), ['-filter', 'Lanczos', '-resize', `${CELL}x${CELL}`]),
  }));
  return [...padRow(before), ...padRow(after)];
}

function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

function writeGroupSheets(dir, tmp, groups, artDir, outDir) {
  const cellsByGroup = groups.map((group) => groupCells(tmp, group, artDir, outDir));
  const written = [];
  chunk(cellsByGroup, GROUPS_PER_PAGE).forEach((page, index) => {
    for (const [name, background] of Object.entries(BACKGROUNDS)) {
      const out = path.join(dir, `groups-${String(index + 1).padStart(2, '0')}-${name}.png`);
      montage(page.flat(), background, out);
      written.push(out);
    }
  });
  return written;
}

function writeStrips(dir, tmp, groups, outDir, size) {
  const animated = groups.filter((group) => group.animated);
  const written = [];
  chunk(animated, STRIPS_PER_PAGE).forEach((page, index) => {
    const cells = page.flatMap((group) => {
      const frames = group.frames.map((frame) => ({ label: frame.replace('.png', ''), file: path.join(tmp, `s-${frame}`) }));
      group.frames.forEach((frame, i) => magick([...boxed(path.join(outDir, frame), size), frames[i].file]));
      return [...frames, ...Array(4 - frames.length).fill(null)];
    });
    for (const [name, background] of Object.entries(BACKGROUNDS)) {
      const out = path.join(dir, `strips-${String(index + 1).padStart(2, '0')}-${name}.png`);
      montage(cells, background, out, size, 4);
      written.push(out);
    }
  });
  return written;
}

function writeSideBySide(dir, outDir, size) {
  const frames = ['shime1.png', 'emotion-calm-01.png', 'emotion-joy-01.png'].map((f) => path.join(outDir, f));
  const written = [];
  for (const [name, background] of Object.entries(BACKGROUNDS)) {
    const out = path.join(dir, `side-by-side-${name}.png`);
    const width = size * frames.length;
    magick([
      ...frames.flatMap((file) => ['(', file, '-background', background, '-flatten', ')']), '+append',
      '-fill', 'none', '-stroke', '#ff3b6b', '-strokewidth', '1', '-draw', `line 0,${size - 1} ${width},${size - 1}`,
      '-stroke', '#3bb3ff', '-draw', `line 0,${size / 2} ${width},${size / 2}`, out,
    ]);
    written.push(out);
  }
  return written;
}

function writeRetina(dir, artDir, outDir, size) {
  const frames = ['shime1.png', 'emotion-calm-01.png', 'action-take_copter-01.png', 'shime23.png'];
  const written = [];
  for (const [name, background] of Object.entries(BACKGROUNDS)) {
    const out = path.join(dir, `retina-${name}.png`);
    const pairs = frames.flatMap((frame) => [
      '(', path.join(artDir, frame), '-filter', 'Triangle', '-resize', `${size}x${size}!`, '-background', background, '-flatten', ')',
      '(', path.join(outDir, frame), '-background', background, '-flatten', ')',
    ]);
    magick([...pairs, '+append', out]);
    written.push(out);
  }
  return written;
}

export function writeReviewSheets({ dir, groups, artDir, outDir, size }) {
  const tmp = path.join(dir, '.cells');
  fs.mkdirSync(tmp, { recursive: true });
  const written = [
    ...writeGroupSheets(dir, tmp, groups, artDir, outDir),
    ...writeStrips(dir, tmp, groups, outDir, size),
  ];
  if (groups.some((g) => g.frames.includes('shime1.png')) && groups.some((g) => g.name === 'emotion-calm')) {
    written.push(...writeSideBySide(dir, outDir, size), ...writeRetina(dir, artDir, outDir, size));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`[sprites] review sheets: ${written.length} files in ${dir}`);
}
