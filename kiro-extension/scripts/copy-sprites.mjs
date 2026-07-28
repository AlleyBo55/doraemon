import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(root, '../src/renderer/public/dora-sprites');
const destination = path.join(root, 'media/dora-sprites');

async function main() {
  try {
    await fs.access(source);
  } catch {
    console.error(`[doraemon] sprite source missing: ${source}`);
    console.error('[doraemon] this script expects to run inside the doraemon repo');
    process.exit(1);
  }

  const entries = await fs.readdir(source);
  const sprites = entries.filter((name) => name.toLowerCase().endsWith('.png'));

  if (sprites.length === 0) {
    console.error(`[doraemon] no sprites found in ${source}`);
    process.exit(1);
  }

  await fs.mkdir(destination, { recursive: true });

  let copied = 0;
  let skipped = 0;

  for (const name of sprites) {
    const from = path.join(source, name);
    const to = path.join(destination, name);

    // Skip files that are already identical so rebuilds stay fast.
    const [fromStat, toStat] = await Promise.all([
      fs.stat(from),
      fs.stat(to).catch(() => null),
    ]);

    if (toStat && toStat.size === fromStat.size && toStat.mtimeMs >= fromStat.mtimeMs) {
      skipped++;
      continue;
    }

    await fs.copyFile(from, to);
    copied++;
  }

  console.log(`[doraemon] sprites: ${copied} copied, ${skipped} up to date`);
}

await main();
