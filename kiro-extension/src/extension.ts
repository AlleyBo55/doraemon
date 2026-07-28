import * as vscode from 'vscode';
import thoughts from '../../src/renderer/core/constants/thoughts.json';
import { ActivityWatcher } from './activity-watcher';
import { AgentStateWatcher } from './agent-state';
import { installAgentHooks } from './hook-installer';
import { PetPanel, PetViewProvider } from './pet-view';
import { reactTo, type ActivityKind, type Reaction } from './reactions';
import { DesktopCompanion, platformCaveat } from './desktop-companion';
import type { EmotionType } from './protocol';

const EMOTION_CHOICES: readonly EmotionType[] = [
  'joy',
  'pride',
  'curiosity',
  'determination',
  'focus',
  'calm',
  'contemplation',
  'concern',
  'frustration',
  'fatigue',
  'excitement',
  'confusion',
  'gratitude',
  'angry',
  'hungry',
] as const;

/** Thought pools that read well as unprompted idle chatter. */
const IDLE_POOLS = [
  'idle',
  'playful',
  'philosophical',
  'nostalgic',
  'curious',
  'grateful',
  'mischievous',
] as const;

const thoughtPools = thoughts as Record<string, string[]>;

function randomIdleThought(): string | null {
  const pools = IDLE_POOLS.filter((name) => (thoughtPools[name]?.length ?? 0) > 0);
  if (pools.length === 0) return null;

  const pool = thoughtPools[pools[Math.floor(Math.random() * pools.length)] as string];
  if (!pool || pool.length === 0) return null;

  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function activate(context: vscode.ExtensionContext): void {
  const REMEMBERED_PATH_KEY = 'doraemon.rememberedDesktopAppPath';

  const petView = new PetViewProvider(context.extensionUri);
  const petPanel = new PetPanel(context.extensionUri);
  const companion = new DesktopCompanion(context.extensionUri, context.globalStorageUri, () =>
    context.globalState.get<string>(REMEMBERED_PATH_KEY, '')
  );
  let idleThoughtTimer: ReturnType<typeof setInterval> | undefined;

  const settings = () => vscode.workspace.getConfiguration('doraemon');
  const showThoughts = (): boolean => settings().get<boolean>('showThoughts', true);
  const target = (): 'auto' | 'desktop' | 'window' | 'sidebar' =>
    settings().get<'auto' | 'desktop' | 'window' | 'sidebar'>('target', 'auto');

  // Exactly one surface owns the mascot, otherwise several Doraemons react to
  // the same keystroke. Most detached surface wins.
  const deliver = (reaction: Reaction): void => {
    const thought = showThoughts() ? reaction.thought : null;

    if (companion.isRunning) {
      companion.send({ ...reaction, thought });
      return;
    }

    const message = {
      type: 'react' as const,
      emotion: reaction.emotion,
      animation: reaction.animation,
      thought,
      durationMs: reaction.durationMs,
    };

    if (petPanel.isOpen) {
      petPanel.post(message);
      return;
    }

    petView.post(message);
  };

  const react = (kind: ActivityKind, detail: Parameters<typeof reactTo>[1] = {}): void => {
    deliver(reactTo(kind, detail));
  };

  const startCompanion = async (announce: boolean): Promise<void> => {
    const binary = await companion.start();
    if (binary) {
      console.log('[doraemon] desktop companion started:', binary);
      // The mascot is on the desktop now, so the in-editor copy must go or it
      // looks like nothing happened.
      petPanel.close();
      const caveat = platformCaveat();
      if (caveat) console.log('[doraemon]', caveat);
      if (announce) {
        void vscode.window.showInformationMessage(
          caveat ?? 'Doraemon is on your desktop now~'
        );
      }
      return;
    }

    const message =
      'Doraemon desktop app not found. Set "doraemon.desktopAppPath" for the transparent ' +
      'floating mascot.';

    if (target() === 'desktop') {
      void vscode.window.showWarningMessage(message);
      return;
    }

    // auto: still get Doraemon out of the IDE frame, just in a plain OS window.
    console.log('[doraemon]', message, 'Falling back to a detached window.');
    await openInWindow();
  };

  const openInWindow = async (): Promise<void> => {
    const moved = await petPanel.openInWindow();
    if (!moved) {
      void vscode.window.showWarningMessage(
        'This IDE version cannot detach editors into separate windows. ' +
          'Doraemon is open as a tab instead, drag it out manually to float it.'
      );
    }
  };

  if (target() === 'desktop' || target() === 'auto') {
    void startCompanion(false);
  } else if (target() === 'window') {
    void openInWindow();
  }

  const watcher = new ActivityWatcher((kind, detail) => react(kind, detail));
  watcher.start();

  // Kiro agent lifecycle, delivered by hooks writing .kiro/doraemon/agent-state.json
  const agentWatcher = new AgentStateWatcher((kind, detail) => react(kind, detail));
  agentWatcher.start();

  // A VSIX cannot ship workspace hooks, so they are written on activation.
  // Kiro only picks up new hook files on reload, hence the nudge.
  void installAgentHooks().then((created) => {
    if (created.length === 0) return;
    void vscode.window.showInformationMessage(
      `Doraemon added ${created.length} Kiro hooks so he can follow the agent. ` +
        'Reload the window to activate them.',
      'Reload Window'
    ).then((choice) => {
      if (choice === 'Reload Window') {
        void vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
  });

  const restartIdleThoughts = (): void => {
    if (idleThoughtTimer) clearInterval(idleThoughtTimer);
    const seconds = vscode.workspace
      .getConfiguration('doraemon')
      .get<number>('thoughtIntervalSeconds', 45);

    idleThoughtTimer = setInterval(() => {
      if (!showThoughts()) return;
      // On the desktop the mascot is always on screen; in the sidebar there is
      // no point talking to a collapsed panel.
      if (!companion.isRunning && !petPanel.isOpen && !petView.isVisible) return;
      const thought = randomIdleThought();
      if (thought) react('idleThought', { thought });
    }, Math.max(10, seconds) * 1000);
  };

  restartIdleThoughts();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PetViewProvider.viewId, petView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    petView.onPoked(() => react('poked')),

    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration('doraemon')) return;
      if (event.affectsConfiguration('doraemon.thoughtIntervalSeconds')) restartIdleThoughts();

      if (
        event.affectsConfiguration('doraemon.target') ||
        event.affectsConfiguration('doraemon.desktopAppPath')
      ) {
        if (target() === 'sidebar') {
          companion.stop();
        } else if (!companion.isRunning) {
          await startCompanion(false);
        }
      }

      petView.post({ type: 'config', showThoughts: showThoughts() });
    }),

    vscode.commands.registerCommand('doraemon.focus', async () => {
      await vscode.commands.executeCommand('doraemon.pet.focus');
    }),

    vscode.commands.registerCommand('doraemon.resetPosition', () => {
      petView.post({ type: 'resetPosition' });
      petPanel.post({ type: 'resetPosition' });
    }),

    vscode.commands.registerCommand('doraemon.openInWindow', openInWindow),

    vscode.commands.registerCommand('doraemon.closeWindow', () => {
      petPanel.close();
    }),

    petPanel.onPoked(() => react('poked')),

    // A reloaded window restores the pet tab. In desktop mode that tab is stale
    // and must go, otherwise it looks like the mascot never left the IDE.
    vscode.window.registerWebviewPanelSerializer(PetPanel.serializerViewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        if (companion.isRunning || target() === 'desktop') {
          panel.dispose();
          return;
        }
        petPanel.adopt(panel);
      },
    }),

    vscode.commands.registerCommand('doraemon.triggerEmotion', async () => {
      const choice = await vscode.window.showQuickPick([...EMOTION_CHOICES], {
        title: 'Doraemon: trigger an emotion',
        placeHolder: 'Pick how Doraemon should feel',
      });
      if (!choice) return;

      deliver({
        emotion: choice as EmotionType,
        animation: null,
        thought: null,
        durationMs: 6000,
      });
    }),

    vscode.commands.registerCommand('doraemon.restartCompanion', async () => {
      companion.stop();
      await startCompanion(true);
    }),

    vscode.commands.registerCommand('doraemon.locateDesktopApp', async () => {
      const picked = await vscode.window.showOpenDialog({
        title: 'Select the Doraemon desktop app executable',
        openLabel: 'Use this app',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
      });

      const chosen = picked?.[0]?.fsPath;
      if (!chosen) return;

      await context.globalState.update(REMEMBERED_PATH_KEY, chosen);
      companion.stop();
      await startCompanion(true);
    }),

    vscode.commands.registerCommand('doraemon.diagnose', async () => {
      const resolution = await companion.resolve();
      const report = [
        `target setting:       ${target()}`,
        `companion running:    ${companion.isRunning}`,
        `pet window open:      ${petPanel.isOpen}`,
        `sidebar visible:      ${petView.isVisible}`,
        '',
        `resolved binary:      ${resolution.binary ?? '(none found)'}`,
        `resolved from:        ${resolution.source}`,
        `bundled companion:    ${resolution.bundledValue}`,
        `  exists:             ${resolution.bundledExists}`,
        `desktopAppPath value: ${resolution.settingValue || '(empty)'}`,
        `  exists:             ${resolution.settingExists ?? 'n/a'}`,
        `remembered path:      ${resolution.rememberedValue || '(none)'}`,
        `  exists:             ${resolution.rememberedExists ?? 'n/a'}`,
        `last spawn error:     ${companion.lastError ?? '(none)'}`,
        `platform:             ${process.platform}`,
        '',
        'auto-detect candidates checked:',
        ...(resolution.checked.length > 0
          ? resolution.checked.map((c) => `  ${c}`)
          : ['  (skipped, an explicit path resolved first)']),
      ].join('\n');

      const document = await vscode.workspace.openTextDocument({
        content: report,
        language: 'plaintext',
      });
      await vscode.window.showTextDocument(document, { preview: false });
    }),

    vscode.commands.registerCommand('doraemon.stopCompanion', () => {
      if (!companion.isRunning) {
        void vscode.window.showInformationMessage('The desktop companion is not running.');
        return;
      }
      companion.stop();
      void vscode.window.showInformationMessage('Doraemon went back into the sidebar~');
    }),

    vscode.commands.registerCommand('doraemon.showStats', () => {
      const snapshot = watcher.stats.snapshot();
      const languages = snapshot.languages.length > 0 ? snapshot.languages.join(', ') : 'none yet';
      void vscode.window.showInformationMessage(
        `Active ${snapshot.activeMinutes}m · ${snapshot.filesTouched} files · ` +
          `${snapshot.savedCount} saves · streak ${snapshot.currentStreakMinutes}m · ${languages}`
      );
    }),

    watcher,
    agentWatcher,
    petView,
    petPanel,
    // Disposed on window close, which is what ends the mascot's stay.
    companion,
    new vscode.Disposable(() => {
      if (idleThoughtTimer) clearInterval(idleThoughtTimer);
    })
  );
}

export function deactivate(): void {
  // Everything is registered through context.subscriptions.
}
