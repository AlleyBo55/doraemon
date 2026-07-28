import * as vscode from 'vscode';
import { STATE_DIR, STATE_RELATIVE } from './agent-state';

/**
 * Installs the Kiro hooks that report agent state.
 *
 * A VSIX cannot ship workspace hooks, so without this the agent-state feature
 * would only work for people who hand-wrote the files. The extension writes them
 * on activation instead, and never overwrites an existing file so local edits
 * survive.
 *
 * Note the file extension: Kiro loads `hooks/**\/*.kiro.hook` only. A hook named
 * `.json` is silently ignored.
 */

const HOOK_DIR = '.kiro/hooks';

type HookSpec = {
  file: string;
  name: string;
  description: string;
  trigger: 'userPromptSubmit' | 'preToolUse' | 'agentStop';
  state: 'thinking' | 'working' | 'done';
  message: string;
};

const HOOKS: readonly HookSpec[] = [
  {
    file: 'doraemon-agent-thinking.kiro.hook',
    name: 'Doraemon: Kiro is thinking',
    description:
      'Tells the Doraemon mascot that a prompt was submitted, so the bubble shows a thinking state while you are away from the IDE.',
    trigger: 'userPromptSubmit',
    state: 'thinking',
    message: 'Kiro is thinking about it~',
  },
  {
    file: 'doraemon-agent-working.kiro.hook',
    name: 'Doraemon: Kiro is working',
    description:
      'Tells the Doraemon mascot that Kiro is about to use a tool, and resets the quiet-period timer that decides when Doraemon suspects Kiro is waiting on you.',
    trigger: 'preToolUse',
    state: 'working',
    message: 'Kiro is working on it~',
  },
  {
    file: 'doraemon-agent-done.kiro.hook',
    name: 'Doraemon: Kiro finished',
    description:
      'Tells the Doraemon mascot that Kiro has finished, so the bubble shows a result you can click to jump back to the IDE.',
    trigger: 'agentStop',
    state: 'done',
    message: 'Kiro finished! Click me to see the result.',
  },
];

/**
 * The hook runs in a shell, so the command has to match the platform. Generating
 * it here beats shipping POSIX-only hooks that quietly fail on Windows.
 */
function commandFor(spec: HookSpec): string {
  const payload = JSON.stringify({ state: spec.state, message: spec.message });

  if (process.platform === 'win32') {
    // Single quotes keep the JSON's double quotes intact inside PowerShell.
    const literal = payload.replace(/'/g, "''");
    return (
      `powershell -NoProfile -Command "New-Item -ItemType Directory -Force ${STATE_DIR} ` +
      `| Out-Null; Set-Content -NoNewline -Path ${STATE_RELATIVE} -Value '${literal}'"`
    );
  }

  const literal = payload.replace(/'/g, `'\\''`);
  return `mkdir -p ${STATE_DIR} && printf '%s' '${literal}' > ${STATE_RELATIVE}`;
}

function hookBody(spec: HookSpec): string {
  return `${JSON.stringify(
    {
      enabled: true,
      name: spec.name,
      description: spec.description,
      version: '1',
      when: { type: spec.trigger },
      then: { type: 'runCommand', command: commandFor(spec) },
    },
    null,
    2
  )}\n`;
}

/**
 * Ensures the hooks exist in every workspace folder.
 * Returns the names of files actually created.
 */
export async function installAgentHooks(): Promise<string[]> {
  const enabled = vscode.workspace
    .getConfiguration('doraemon')
    .get<boolean>('installAgentHooks', true);
  if (!enabled) return [];

  const folders = vscode.workspace.workspaceFolders ?? [];
  const created: string[] = [];

  for (const folder of folders) {
    const dir = vscode.Uri.joinPath(folder.uri, ...HOOK_DIR.split('/'));

    for (const spec of HOOKS) {
      const target = vscode.Uri.joinPath(dir, spec.file);

      try {
        await vscode.workspace.fs.stat(target);
        continue; // Already there, leave it alone.
      } catch {
        // Missing, so write it.
      }

      try {
        await vscode.workspace.fs.createDirectory(dir);
        await vscode.workspace.fs.writeFile(target, Buffer.from(hookBody(spec), 'utf-8'));
        created.push(spec.file);
      } catch (err) {
        console.warn(`[doraemon] could not install hook ${spec.file}:`, err);
      }
    }
  }

  if (created.length > 0) {
    console.log(`[doraemon] installed ${created.length} agent hooks:`, created.join(', '));
  }
  return created;
}
