import * as vscode from 'vscode';
import type { ActivityDetail, ActivityKind } from './reactions';

/**
 * Reads source-control state from the built-in git extension. There is no event
 * for "a commit happened", so this diffs repository state: HEAD moving while the
 * working tree shrinks is a commit, HEAD's branch name changing is a switch.
 */

type GitChange = { uri: vscode.Uri };

type GitRepositoryState = {
  HEAD?: { name?: string; commit?: string };
  workingTreeChanges: GitChange[];
  indexChanges: GitChange[];
  mergeChanges: GitChange[];
  onDidChange: vscode.Event<void>;
};

type GitRepository = { rootUri: vscode.Uri; state: GitRepositoryState };

type GitApi = {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
};

type Snapshot = {
  commit: string | undefined;
  branch: string | undefined;
  pendingChanges: number;
  hadConflicts: boolean;
};

export class GitWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly snapshots = new Map<string, Snapshot>();

  constructor(private readonly listener: (kind: ActivityKind, detail: ActivityDetail) => void) {}

  async start(): Promise<void> {
    const extension = vscode.extensions.getExtension<{ getAPI(version: number): GitApi }>(
      'vscode.git'
    );
    if (!extension) {
      console.log('[doraemon] git extension unavailable, skipping source-control reactions');
      return;
    }

    try {
      const exports = extension.isActive ? extension.exports : await extension.activate();
      const api = exports.getAPI(1);

      for (const repository of api.repositories) this.track(repository);
      this.disposables.push(api.onDidOpenRepository((repo) => this.track(repo)));
    } catch (err) {
      console.error('[doraemon] could not attach to the git extension:', err);
    }
  }

  private snapshotOf(repository: GitRepository): Snapshot {
    const state = repository.state;
    return {
      commit: state.HEAD?.commit,
      branch: state.HEAD?.name,
      pendingChanges: state.workingTreeChanges.length + state.indexChanges.length,
      hadConflicts: state.mergeChanges.length > 0,
    };
  }

  private track(repository: GitRepository): void {
    const key = repository.rootUri.toString();
    this.snapshots.set(key, this.snapshotOf(repository));

    this.disposables.push(
      repository.state.onDidChange(() => {
        const previous = this.snapshots.get(key);
        const current = this.snapshotOf(repository);
        this.snapshots.set(key, current);
        if (!previous) return;

        if (current.hadConflicts && !previous.hadConflicts) {
          this.listener('gitConflict', {});
          return;
        }

        if (current.branch !== previous.branch && current.branch) {
          this.listener('gitBranchSwitch', { branch: current.branch });
          return;
        }

        // A new commit on the same branch, with staged work now gone.
        const committed =
          current.commit !== previous.commit &&
          previous.commit !== undefined &&
          current.pendingChanges < previous.pendingChanges;

        if (committed) this.listener('gitCommit', {});
      })
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    this.snapshots.clear();
  }
}
