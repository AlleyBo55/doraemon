import * as vscode from 'vscode';
import type { ActivityDetail, ActivityKind } from './reactions';
import { SessionStats } from './session-stats';
import { GitWatcher } from './git-watcher';

export type ActivityListener = (kind: ActivityKind, context: ActivityDetail) => void;

// Typing fires on every keystroke; collapse into one reaction per window.
const TYPING_THROTTLE_MS = 20_000;
const SELECTION_THROTTLE_MS = 60_000;
const TERMINAL_THROTTLE_MS = 8_000;
const IDLE_CHECK_MS = 30_000;
// A selection this large reads as reviewing code rather than editing it.
const READING_SELECTION_LINES = 12;

/**
 * Terminal shell integration landed after our minimum engine version, so it is
 * declared locally and probed at runtime rather than raising the engine floor
 * and locking out older hosts.
 */
type ShellExecutionEvent = {
  execution: { commandLine?: { value?: string } };
};

type ShellExecutionEndEvent = ShellExecutionEvent & { exitCode?: number };

type ShellIntegrationHost = {
  onDidStartTerminalShellExecution?: (
    handler: (event: ShellExecutionEvent) => void
  ) => vscode.Disposable;
  onDidEndTerminalShellExecution?: (
    handler: (event: ShellExecutionEndEvent) => void
  ) => vscode.Disposable;
};

const isRealFile = (document: vscode.TextDocument): boolean =>
  document.uri.scheme === 'file';

const errorsIn = (diagnostics: readonly vscode.Diagnostic[]): number =>
  diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;

export class ActivityWatcher implements vscode.Disposable {
  readonly stats = new SessionStats();

  private readonly disposables: vscode.Disposable[] = [];
  private readonly errorCounts = new Map<string, number>();
  private readonly git: GitWatcher;

  private lastTypingReactionAt = 0;
  private lastSelectionReactionAt = 0;
  private lastTerminalReactionAt = 0;
  private lastEditAt = Date.now();
  private idleAnnounced = false;
  private breakAnnouncedForStreak = 0;
  private projectWasDirty = false;
  private idleTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly listener: ActivityListener) {
    this.git = new GitWatcher((kind, detail) => this.listener(kind, detail));
  }

  start(): void {
    this.watchEditing();
    this.watchDiagnostics();
    this.watchDebugging();
    this.watchTerminals();
    this.watchTasks();
    this.watchPresence();
    void this.git.start();

    this.seedErrorCounts();
    this.idleTimer = setInterval(() => this.checkIdleAndBreak(), IDLE_CHECK_MS);
  }

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('doraemon');
  }

  /* ── editing ────────────────────────────────────────────────────────── */

  private watchEditing(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.onEdit(event)),
      vscode.workspace.onDidSaveTextDocument((document) => this.onSave(document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.onEditorChange(editor)),
      vscode.window.onDidChangeTextEditorSelection((event) => this.onSelection(event)),

      vscode.workspace.onDidCreateFiles((event) => {
        const first = event.files[0];
        if (!first) return;
        this.listener('fileCreated', { fileName: basename(first), count: event.files.length });
      }),

      vscode.workspace.onDidDeleteFiles((event) => {
        const first = event.files[0];
        if (!first) return;
        this.listener('fileDeleted', { fileName: basename(first), count: event.files.length });
      }),

      vscode.workspace.onDidRenameFiles((event) => {
        if (event.files.length === 0) return;
        this.listener('fileRenamed', {});
      })
    );
  }

  private onEdit(event: vscode.TextDocumentChangeEvent): void {
    if (!isRealFile(event.document) || event.contentChanges.length === 0) return;

    const now = Date.now();
    this.lastEditAt = now;
    this.idleAnnounced = false;
    this.stats.recordEdit(event.document.uri.fsPath, event.document.languageId, now);

    if (now - this.lastTypingReactionAt < TYPING_THROTTLE_MS) return;
    this.lastTypingReactionAt = now;
    this.listener('typing', { language: event.document.languageId });
  }

  private onSave(document: vscode.TextDocument): void {
    if (!isRealFile(document)) return;
    this.stats.recordSave();
    this.listener('saved', { language: document.languageId });
  }

  private onEditorChange(editor: vscode.TextEditor | undefined): void {
    if (!editor || !isRealFile(editor.document)) return;
    this.listener('switchedFile', { language: editor.document.languageId });
  }

  /** A large selection that is not an edit reads as reading or reviewing. */
  private onSelection(event: vscode.TextEditorSelectionChangeEvent): void {
    if (!isRealFile(event.textEditor.document)) return;

    const selection = event.selections[0];
    if (!selection || selection.isEmpty) return;
    if (selection.end.line - selection.start.line < READING_SELECTION_LINES) return;

    const now = Date.now();
    if (now - this.lastSelectionReactionAt < SELECTION_THROTTLE_MS) return;
    this.lastSelectionReactionAt = now;
    this.listener('readingCode', { language: event.textEditor.document.languageId });
  }

  /* ── diagnostics ────────────────────────────────────────────────────── */

  private watchDiagnostics(): void {
    if (!this.config().get<boolean>('reactToDiagnostics', true)) return;
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((event) => this.onDiagnostics(event))
    );
  }

  /** Record current counts so the first change is a real delta, not a cold start. */
  private seedErrorCounts(): void {
    let total = 0;
    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      const errors = errorsIn(diagnostics);
      this.errorCounts.set(uri.toString(), errors);
      total += errors;
    }
    this.projectWasDirty = total > 0;
  }

  private onDiagnostics(event: vscode.DiagnosticChangeEvent): void {
    const active = vscode.window.activeTextEditor;

    if (active && isRealFile(active.document)) {
      const activeUri = active.document.uri.toString();
      if (event.uris.some((uri) => uri.toString() === activeUri)) {
        const previous = this.errorCounts.get(activeUri) ?? 0;
        const current = errorsIn(vscode.languages.getDiagnostics(active.document.uri));
        this.errorCounts.set(activeUri, current);

        if (current > previous) {
          this.listener('errorsAppeared', { errorCount: current });
          this.projectWasDirty = true;
          return;
        }
        if (current === 0 && previous > 0) {
          this.listener('errorsCleared', {});
          this.reportProjectCleanliness();
          return;
        }
      }
    }

    this.reportProjectCleanliness();
  }

  /** Celebrates the whole workspace going green, not just the open file. */
  private reportProjectCleanliness(): void {
    let total = 0;
    for (const [, diagnostics] of vscode.languages.getDiagnostics()) {
      total += errorsIn(diagnostics);
      if (total > 0) break;
    }

    if (total === 0 && this.projectWasDirty) {
      this.projectWasDirty = false;
      this.listener('projectClean', {});
    } else if (total > 0) {
      this.projectWasDirty = true;
    }
  }

  /* ── debugging ──────────────────────────────────────────────────────── */

  private watchDebugging(): void {
    this.disposables.push(
      vscode.debug.onDidStartDebugSession(() => this.listener('debugStarted', {})),
      vscode.debug.onDidTerminateDebugSession(() => this.listener('debugStopped', {})),
      vscode.debug.onDidChangeBreakpoints((event) => {
        if (event.added.length === 0) return;
        this.listener('breakpointsChanged', { count: event.added.length });
      })
    );
  }

  /* ── terminals ──────────────────────────────────────────────────────── */

  private watchTerminals(): void {
    this.disposables.push(
      vscode.window.onDidOpenTerminal(() => this.listener('terminalOpened', {}))
    );

    const host = vscode.window as unknown as ShellIntegrationHost;
    const onStart = host.onDidStartTerminalShellExecution;
    const onEnd = host.onDidEndTerminalShellExecution;
    if (typeof onStart !== 'function' || typeof onEnd !== 'function') {
      console.log('[doraemon] terminal shell integration unavailable, skipping command reactions');
      return;
    }

    this.disposables.push(
      onStart((event) => {
        const command = event.execution.commandLine?.value ?? '';
        if (!command.trim()) return;

        const now = Date.now();
        if (now - this.lastTerminalReactionAt < TERMINAL_THROTTLE_MS) return;
        this.lastTerminalReactionAt = now;
        this.listener('terminalCommand', { command });
      }),

      onEnd((event) => {
        // undefined means the shell reported no code, which is not a failure.
        if (event.exitCode === undefined || event.exitCode === 0) return;
        this.listener('terminalFailed', {
          command: event.execution.commandLine?.value ?? '',
        });
      })
    );
  }

  /* ── tasks ──────────────────────────────────────────────────────────── */

  private watchTasks(): void {
    this.disposables.push(
      vscode.tasks.onDidStartTask((event) => {
        this.listener('taskStarted', { taskName: event.execution.task.name });
      }),

      vscode.tasks.onDidEndTaskProcess((event) => {
        const taskName = event.execution.task.name;
        if (event.exitCode === 0) {
          this.listener('taskSucceeded', { taskName });
        } else if (event.exitCode !== undefined) {
          this.listener('taskFailed', { taskName });
        }
      })
    );
  }

  /* ── presence ───────────────────────────────────────────────────────── */

  private watchPresence(): void {
    let focused = vscode.window.state.focused;

    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused === focused) return;
        focused = state.focused;
        this.listener(focused ? 'windowFocused' : 'windowBlurred', {});
      })
    );
  }

  private checkIdleAndBreak(): void {
    const now = Date.now();
    const idleMinutes = this.config().get<number>('idleMinutes', 5);
    const breakMinutes = this.config().get<number>('breakReminderMinutes', 60);

    const idleFor = (now - this.lastEditAt) / 60000;
    if (idleFor >= idleMinutes && !this.idleAnnounced) {
      this.idleAnnounced = true;
      this.stats.breakStreak();
      this.listener('idle', {});
      return;
    }

    if (breakMinutes <= 0) return;
    const streak = this.stats.streakMinutes(now);
    if (streak >= breakMinutes && streak !== this.breakAnnouncedForStreak) {
      this.breakAnnouncedForStreak = streak;
      this.listener('breakReminder', { minutes: streak });
    }
  }

  dispose(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.git.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}

const basename = (uri: vscode.Uri): string => {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] ?? uri.path;
};
