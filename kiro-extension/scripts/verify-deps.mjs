/**
 * Guards against depending on packages hoisted from the parent project.
 *
 * This package sits inside a larger repo, so locally Node and tsc happily walk up
 * to ../node_modules. CI installs only this folder, so anything not declared here
 * fails there and passes here — which is exactly how @types/node slipped through
 * and broke every platform build on typecheck.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const readJson = async (file) =>
  JSON.parse(await fs.readFile(path.join(root, file), 'utf-8'));

const manifest = await readJson('package.json');
// tsconfig has comments, so strip them before parsing.
const tsconfigRaw = await fs.readFile(path.join(root, 'tsconfig.json'), 'utf-8');
const tsconfig = JSON.parse(tsconfigRaw.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));

const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);

const problems = [];

/* Every `types` entry must have a declared @types package. */
for (const name of tsconfig.compilerOptions?.types ?? []) {
  if (!declared.has(`@types/${name}`)) {
    problems.push(`tsconfig types includes "${name}" but @types/${name} is not a dependency`);
  }
}

/* Every bare import in src/ and scripts/ must resolve to a declared package. */
const BUILTIN = /^(node:|vscode$)/;
const localish = /^[./]/;

async function* sourceFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(relative);
    else if (/\.(ts|mjs)$/.test(entry.name)) yield relative;
  }
}

for (const dir of ['src', 'scripts']) {
  for await (const file of sourceFiles(dir)) {
    const text = await fs.readFile(path.join(root, file), 'utf-8');
    const specifiers = [...text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

    for (const specifier of specifiers) {
      if (localish.test(specifier) || BUILTIN.test(specifier)) continue;
      // Scoped and plain package roots, ignoring subpaths.
      const pkg = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      if (!declared.has(pkg)) {
        problems.push(`${file} imports "${pkg}" which is not a dependency of this package`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error('[doraemon] dependency check failed:');
  for (const problem of [...new Set(problems)]) console.error(`  - ${problem}`);
  console.error('\nThese resolve locally from the parent repo but not in CI.');
  process.exit(1);
}

console.log('[doraemon] dependencies self-contained: no reliance on the parent project');
