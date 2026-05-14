import * as vscode from 'vscode';
import { getWebviewHtml } from './html';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../bus/types';
import type { GraphStore } from '../graph/index';
import type { FiltersProvider } from '../sidebar/provider';

export class GraphPanel {
  static currentPanel: GraphPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private webviewReady = false;
  private pendingMessages: HostToWebviewMessage[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    graph: GraphStore,
    filtersProvider: FiltersProvider,
  ): GraphPanel {
    const column = vscode.ViewColumn.Beside;

    if (GraphPanel.currentPanel) {
      GraphPanel.currentPanel.panel.reveal(column);
      return GraphPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'graphIde',
      'Graph IDE',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    );

    GraphPanel.currentPanel = new GraphPanel(panel, extensionUri, graph, filtersProvider);
    return GraphPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly graph: GraphStore,
    private readonly filtersProvider: FiltersProvider,
  ) {
    this.panel = panel;
    this.panel.webview.html = getWebviewHtml(panel.webview, extensionUri);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToHostMessage) => this.handleWebviewMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Send full graph when webview signals it's ready
    this.graph.onPatch(patch => {
      this.post({ type: 'graph.patch', ...patch });
    });
  }

  post(message: HostToWebviewMessage) {
    if (!this.webviewReady) {
      this.pendingMessages.push(message);
      return;
    }
    this.panel.webview.postMessage(message);
  }

  highlightNode(id: string) {
    this.post({ type: 'node.highlight', id });
  }

  sendProgress(indexed: number, total: number) {
    this.post({ type: 'index.progress', indexed, total });
  }

  private handleWebviewMessage(msg: WebviewToHostMessage) {
    switch (msg.type) {
      case 'ready': {
        this.webviewReady = true;
        // Flush pending messages, then send current full graph snapshot
        for (const m of this.pendingMessages) {
          this.panel.webview.postMessage(m);
        }
        this.pendingMessages = [];
        const snapshot = this.graph.snapshot();
        if (snapshot.nodes.length > 0) {
          this.panel.webview.postMessage({ type: 'graph.reset', ...snapshot });
        }
        break;
      }
      case 'node.hover': {
        const uri = vscode.Uri.parse(msg.uri);
        const range = new vscode.Range(
          msg.range.startLine, msg.range.startCharacter,
          msg.range.endLine, msg.range.endCharacter,
        );
        vscode.window.showTextDocument(uri, {
          preserveFocus: true,
          preview: true,
          selection: range,
          viewColumn: vscode.ViewColumn.One,
        });
        break;
      }
      case 'node.navigate': {
        const uri = vscode.Uri.parse(msg.uri);
        const range = new vscode.Range(
          msg.range.startLine, msg.range.startCharacter,
          msg.range.endLine, msg.range.endCharacter,
        );
        vscode.window.showTextDocument(uri, { selection: range, preserveFocus: false });
        break;
      }
      case 'filter.change': {
        // Reflect filter state back to sidebar provider
        // (Sidebar is the authoritative source, but webview can push changes too)
        break;
      }
    }
  }

  dispose() {
    GraphPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
