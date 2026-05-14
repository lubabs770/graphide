import * as vscode from 'vscode';
import { GraphStore } from './graph/index';
import { Collector } from './collector/index';
import { GraphPanel } from './webview/panel';
import { FiltersProvider, StatusProvider, ViewsProvider } from './sidebar/provider';

export function activate(ctx: vscode.ExtensionContext) {
  const graph = new GraphStore();
  const filters = new FiltersProvider();
  const views = new ViewsProvider();
  const status = new StatusProvider(graph);

  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('graphIde.filters', filters),
    vscode.window.registerTreeDataProvider('graphIde.views', views),
    vscode.window.registerTreeDataProvider('graphIde.status', status),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphIde.applyView', (filterState) => {
      GraphPanel.currentPanel?.post({ type: 'filter.update', filters: filterState });
    })
  );

  // Toggle filter command (called by filter tree items)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphIde.toggleFilter', (id: string) => {
      filters.toggle(id);
      GraphPanel.currentPanel?.post({
        type: 'filter.update',
        filters: filters.getFilters(),
      });
    })
  );

  // Open graph command
  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphIde.openGraph', () => {
      GraphPanel.createOrShow(ctx.extensionUri, graph, filters);
    })
  );

  // Re-index command
  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphIde.reindex', () => {
      collector.reindexAll();
    })
  );

  // Stop indexing command
  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphIde.stopIndexing', () => {
      collector.stop();
      vscode.window.showInformationMessage('Graph IDE: Indexing stopped.');
    })
  );

  // Toggle cluster spheres
  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphIde.toggleClusters', () => {
      const config = vscode.workspace.getConfiguration('graphIde');
      const current = config.get<boolean>('showClusters', false);
      config.update('showClusters', !current, vscode.ConfigurationTarget.Global);
      GraphPanel.currentPanel?.post({ type: 'clusters.toggle', visible: !current });
    })
  );

  // Toggle edge lines
  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphIde.toggleLines', () => {
      const config = vscode.workspace.getConfiguration('graphIde');
      const current = config.get<boolean>('showLines', true);
      config.update('showLines', !current, vscode.ConfigurationTarget.Global);
      GraphPanel.currentPanel?.post({ type: 'lines.toggle', visible: !current });
    })
  );

  // Bidirectional: editor cursor → graph highlight
  ctx.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(e => {
      const panel = GraphPanel.currentPanel;
      if (!panel) return;
      const pos = e.selections[0]?.active;
      if (!pos) return;
      const uri = e.textEditor.document.uri.toString();
      // Find the node closest to the cursor position
      const snapshot = graph.snapshot();
      const match = snapshot.nodes.find(n =>
        n.uri === uri &&
        n.range.startLine <= pos.line &&
        n.range.endLine >= pos.line
      );
      if (match) panel.highlightNode(match.id);
    })
  );

  // Start collector
  const collector = new Collector(ctx, graph, (indexed, total) => {
    status.update(indexed, total);
    GraphPanel.currentPanel?.sendProgress(indexed, total);
  });

  // Auto-open graph on activation if workspace has files
  vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,go,rs}', '{**/node_modules/**}', 1)
    .then(files => {
      if (files.length > 0) {
        GraphPanel.createOrShow(ctx.extensionUri, graph, filters);
      }
    });

  collector.start();
  ctx.subscriptions.push({ dispose: () => collector.dispose() });
}

export function deactivate() {}
