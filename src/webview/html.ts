import * as vscode from 'vscode';

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
  );

  const nonce = generateNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src 'unsafe-inline';
             img-src ${webview.cspSource} blob: data:;
             connect-src 'none';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Graph IDE</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: var(--vscode-editor-background, #1e1e1e); }
    #root { width: 100%; height: 100%; position: relative; }
    #canvas-container { width: 100%; height: 100%; }
    #progress {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.6);
      color: #abb2bf;
      font: 12px monospace;
      padding: 4px 12px;
      border-radius: 4px;
      display: none;
      pointer-events: none;
    }
    #progress.visible { display: block; }
    #tooltip {
      position: absolute;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      font: var(--vscode-editor-font-size, 13px)/1.4 var(--vscode-editor-font-family, Menlo, Monaco, 'Courier New', monospace);
      padding: 4px 8px;
      border-radius: 3px;
      pointer-events: none;
      display: none;
      max-width: 400px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 2px 8px rgba(0,0,0,0.36);
      z-index: 100;
    }
  </style>
</head>
<body>
  <div id="root">
    <div id="canvas-container"></div>
    <div id="progress"></div>
    <div id="tooltip"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
