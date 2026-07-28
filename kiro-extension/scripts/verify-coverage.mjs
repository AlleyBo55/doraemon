/**
 * Asserts every generated sprite set can actually be triggered.
 *
 * The extension ships 40 generated sprite sets. Any set nothing maps to is dead
 * weight in the VSIX and, worse, invisible: nobody notices artwork that never
 * plays. This fails the build rather than letting coverage rot.
 *
 * A set counts as reachable if reactions.ts pins it as an `animation`, or if the
 * engine plays it as the reaction for an emotion reactions.ts actually sets.
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const core = path.resolve(root, '../src/renderer/core');
const tempBundle = path.join(root, 'dist/.coverage-check.mjs');

await fs.mkdir(path.dirname(tempBundle), { recursive: true });
await build({
  entryPoints: [path.join(core, 'constants/sprites.ts')],
  outfile: tempBundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
});

try {
  const { SPRITE_ANIMATIONS } = await import(`file://${tempBundle}?t=${Date.now()}`);
  const generated = Object.keys(SPRITE_ANIMATIONS).filter(
    (name) => name.startsWith('emotion_') || name.startsWith('action_')
  );

  const reactions = await fs.readFile(path.join(root, 'src/reactions.ts'), 'utf-8');
  const shimeji = await fs.readFile(path.join(core, 'engine/shimeji.ts'), 'utf-8');

  /* Animations pinned directly by a reaction. */
  const pinned = new Set(
    [...reactions.matchAll(/animation:\s*'([a-z0-9_]+)'/g)].map((m) => m[1])
  );
  for (const m of reactions.matchAll(/animation:\s*described\.animation\s*\?\?\s*'([a-z0-9_]+)'/g)) {
    pinned.add(m[1]);
  }
  for (const m of reactions.matchAll(/animation:\s*'([a-z0-9_]+)'/g)) pinned.add(m[1]);
  for (const m of reactions.matchAll(/animation:\s*Math\.random\(\)[^']*'([a-z0-9_]+)'[^']*'([a-z0-9_]+)'/g)) {
    pinned.add(m[1]);
    pinned.add(m[2]);
  }
  // Command-family readings return their own animation.
  for (const m of reactions.matchAll(/animation:\s*'([a-z0-9_]+)',?\s*$/gm)) pinned.add(m[1]);

  /* Emotions the extension sets, and what the engine plays for each. */
  const emotionsSet = new Set(
    [...reactions.matchAll(/emotion:\s*'([a-z]+)'/g)].map((m) => m[1])
  );

  const reactionState = new Map();
  const table = shimeji.match(/EMOTION_REACTION_STATE[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (table) {
    for (const m of table[1].matchAll(/([a-z]+):\s*'([a-z0-9_]+)'/g)) {
      reactionState.set(m[1], m[2]);
    }
  }

  const viaEmotion = new Set(
    [...emotionsSet].map((e) => reactionState.get(e)).filter(Boolean)
  );

  const reachable = new Set([...pinned, ...viaEmotion]);
  const dead = generated.filter((name) => !reachable.has(name));

  if (dead.length > 0) {
    console.error(`[doraemon] ${dead.length} sprite sets ship but can never play:`);
    for (const name of dead) console.error(`  - ${name}`);
    console.error('\nMap them to an activity in src/reactions.ts, or stop shipping them.');
    process.exit(1);
  }

  console.log(
    `[doraemon] sprite coverage: all ${generated.length} generated sets reachable ` +
      `(${pinned.size} pinned by reactions, ${viaEmotion.size} via ${emotionsSet.size} emotions)`
  );
} finally {
  await fs.rm(tempBundle, { force: true });
}
