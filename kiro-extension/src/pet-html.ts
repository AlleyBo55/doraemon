import * as vscode from 'vscode';

const nonce = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
};

/** Resource roots a pet webview is allowed to load from. */
export const petResourceRoots = (extensionUri: vscode.Uri): vscode.Uri[] => [
  vscode.Uri.joinPath(extensionUri, 'media'),
  vscode.Uri.joinPath(extensionUri, 'dist'),
];

/** Shared markup for both the sidebar view and the pop-out window. */
export function renderPetHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
  );
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pet.css'));
  const spriteBase = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'dora-sprites')
  );

  const scriptNonce = nonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${scriptNonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Doraemon</title>
</head>
<body>
  <div id="stage" role="img" aria-label="Doraemon companion">
    <div id="bubble" class="bubble" role="status" aria-live="polite" hidden></div>
    <img id="sprite" alt="" draggable="false" />
  </div>
  <script nonce="${scriptNonce}">window.__DORA_SPRITE_BASE__ = "${spriteBase}";</script>
  <script nonce="${scriptNonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
