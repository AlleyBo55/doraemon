import * as vscode from 'vscode';
import type { ActivityDetail, ActivityKind } from './reactions';

/**
 * Bridge for Kiro agent lifecycle.
 *
 * The agent extension exposes no API, but Kiro hooks can run shell commands, so
 * hooks drop a small JSON file and this watches it. A file is used rather than a
 * socket because hook commands are plain strings with no way to discover a port.
 */

export const STATE_DIR = '.kiro/doraemon';
export const STATE_FILE = 'agent-state.json';
export const STATE_RELATIVE = `${STATE_DIR}/${STATE_FILE}`;

/** What the agent is doing, as reported by a hook. */
export type AgentPhase = 'thinking' | 'working' | 'confirm' | 'done' | 'failed';

type AgentReport = {
  state?: string;
  /** Short human summary, shown in the bubble. */
  message?: string;
  /** Tool or step name, used when no message is given. */
  tool?: string;
};

const PHASE_TO_KIND: Record<AgentPhase, ActivityKind> = {
  thinking: 'agentThinking',
  working: 'agentWorking',
  confirm: 'agentAwaitingConfirmation',
  done: 'agentDone',
  failed: 'agentFailed',
};

const isPhase = (value: unknown): value is AgentPhase =>
  typeof value === 'string' && value in PHASE_TO_KIND;

/** Phases that mean the agent is mid-flight and should be watched for a stall. */
const IN_FLIGHT: ReadonlySet<AgentPhase> = new Set(['thinking', 'working']);

export class AgentStateWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastPayload = '';
  private stallTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly listener: (kind: ActivityKind, detail: ActivityDetail) => void
  ) {}

  /**
   * Kiro exposes no "waiting for your approval" hook trigger, so it is inferred:
   * the agent went quiet mid-task and never reported finishing. A slow tool looks
   * the same from out here, so the wording stays a suspicion rather than a claim.
   */
  private armStallTimer(): void {
    this.clearStallTimer();

    const seconds = vscode.workspace
      .getConfiguration('doraemon')
      .get<number>('agentStallSeconds', 25);
    if (seconds <= 0) return;

    this.stallTimer = setTimeout(() => {
      this.stallTimer = undefined;
      this.listener('agentAwaitingConfirmation', {
        message: 'Kiro has gone quiet. It may be waiting for you. Click me to check.',
      });
    }, seconds * 1000);
  }

  private clearStallTimer(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = undefined;
    }
  }

  start(): void {
    // A relative pattern per folder, so multi-root workspaces all report.
    const watch = (folder: vscode.WorkspaceFolder): void => {
      const pattern = new vscode.RelativePattern(folder, STATE_RELATIVE);
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      const handle = (uri: vscode.Uri) => void this.onReport(uri);
      watcher.onDidCreate(handle);
      watcher.onDidChange(handle);

      this.disposables.push(watcher);
    };

    for (const folder of vscode.workspace.workspaceFolders ?? []) watch(folder);

    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.added) watch(folder);
      })
    );
  }

  private async onReport(uri: vscode.Uri): Promise<void> {
    let raw: string;
    try {
      raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
    } catch {
      return;
    }

    // Editors often fire create and change for one write.
    const fingerprint = raw.trim();
    if (!fingerprint || fingerprint === this.lastPayload) return;
    this.lastPayload = fingerprint;

    let report: AgentReport;
    try {
      report = JSON.parse(fingerprint) as AgentReport;
    } catch {
      console.warn('[doraemon] agent state file is not valid JSON');
      return;
    }

    if (!isPhase(report.state)) return;

    if (IN_FLIGHT.has(report.state)) {
      this.armStallTimer();
    } else {
      this.clearStallTimer();
    }

    this.listener(PHASE_TO_KIND[report.state], {
      message: typeof report.message === 'string' ? report.message : undefined,
      taskName: typeof report.tool === 'string' ? report.tool : undefined,
    });
  }

  dispose(): void {
    this.clearStallTimer();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}
