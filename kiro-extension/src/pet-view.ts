import * as vscode from 'vscode';
import { petResourceRoots, renderPetHtml } from './pet-html';
import type { HostMessage, WebviewMessage } from './protocol';

/** Doraemon docked in the sidebar. */
export class PetViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'doraemon.pet';

  private view: vscode.WebviewView | undefined;
  private readonly pokedEmitter = new vscode.EventEmitter<void>();
  readonly onPoked = this.pokedEmitter.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: petResourceRoots(this.extensionUri),
    };

    view.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message?.type === 'poked') this.pokedEmitter.fire();
    });

    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });

    view.webview.html = renderPetHtml(view.webview, this.extensionUri);
  }

  post(message: HostMessage): void {
    // No view yet, or the panel is collapsed: dropping is correct here, the
    // webview re-initialises itself when it becomes visible again.
    void this.view?.webview.postMessage(message);
  }

  get isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  dispose(): void {
    this.pokedEmitter.dispose();
  }
}

/**
 * Doraemon in an editor tab, so it can be moved into an auxiliary window and
 * live outside the IDE frame on the desktop.
 */
export class PetPanel implements vscode.Disposable {
  private static readonly viewType = 'doraemon.petPanel';

  private panel: vscode.WebviewPanel | undefined;
  private readonly pokedEmitter = new vscode.EventEmitter<void>();
  readonly onPoked = this.pokedEmitter.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  static readonly serializerViewType = PetPanel.viewType;

  /**
   * Takes ownership of a panel the editor restored from a previous session.
   * Without this a reloaded window shows a dead "Doraemon" tab, which looks
   * exactly like the pet failing to move to the desktop.
   */
  adopt(panel: vscode.WebviewPanel): void {
    this.panel?.dispose();
    this.panel = panel;
    this.wire(panel);
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: petResourceRoots(this.extensionUri),
    };
    panel.webview.html = renderPetHtml(panel.webview, this.extensionUri);
  }

  private wire(panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message?.type === 'poked') this.pokedEmitter.fire();
    });

    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined;
    });
  }

  /**
   * Opens the pet as an editor tab and pushes it into its own OS window.
   * Returns false if the host has no auxiliary-window support.
   */
  async openInWindow(): Promise<boolean> {
    if (this.panel) {
      this.panel.reveal(undefined, false);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        PetPanel.viewType,
        'Doraemon',
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: petResourceRoots(this.extensionUri),
        }
      );

      this.wire(this.panel);
      this.panel.webview.html = renderPetHtml(this.panel.webview, this.extensionUri);
    }

    try {
      // Detaches the active editor into a separate desktop window.
      await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
      return true;
    } catch (err) {
      console.error('[doraemon] could not move the pet into a new window:', err);
      return false;
    }
  }

  post(message: HostMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  close(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  dispose(): void {
    this.close();
    this.pokedEmitter.dispose();
  }
}
