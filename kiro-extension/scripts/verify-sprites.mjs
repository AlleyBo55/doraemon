/**
 * Every animation frame name in sprites.ts is generated at runtime, so a typo or
 * a missing asset only shows up as an invisible mascot. This resolves the real
 * animation table and asserts each referenced PNG exists in media/dora-sprites.
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const spritesEntry = path.resolve(root, '../src/renderer/core/constants/sprites.ts');
const spriteDir = path.join(root, 'media/dora-sprites');
const tempBundle = path.join(root, 'dist/.sprites-check.mjs');

await fs.mkdir(path.dirname(tempBundle), { recursive: true });
await build({
  entryPoints: [spritesEntry],
  outfile: tempBundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
});

try {
  const { SPRITE_ANIMATIONS } = await import(`file://${tempBundle}?t=${Date.now()}`);
  const available = new Set(await fs.readdir(spriteDir));

  const missing = new Map();
  let frameRefs = 0;

  for (const [name, animation] of Object.entries(SPRITE_ANIMATIONS)) {
    const frames = animation?.frames ?? [];
    if (frames.length === 0) {
      missing.set(name, ['<no frames defined>']);
      continue;
    }
    for (const frame of frames) {
      frameRefs++;
      if (!available.has(frame)) {
        if (!missing.has(name)) missing.set(name, []);
        const list = missing.get(name);
        if (!list.includes(frame)) list.push(frame);
      }
    }
  }

  const animationCount = Object.keys(SPRITE_ANIMATIONS).length;

  if (missing.size > 0) {
    console.error(`[doraemon] missing sprite assets in ${spriteDir}:`);
    for (const [name, frames] of missing) {
      console.error(`  ${name}: ${frames.join(', ')}`);
    }
    process.exit(1);
  }

  console.log(
    `[doraemon] sprites verified: ${animationCount} animations, ` +
      `${frameRefs} frame references, ${available.size} files on disk`
  );
} finally {
  await fs.rm(tempBundle, { force: true });
}
