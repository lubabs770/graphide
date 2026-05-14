import * as vscode from 'vscode';
import { DEFAULT_FILTERS, type FilterState } from './filters';
import type { GraphStore } from '../graph/index';

type TreeItem = vscode.TreeItem;

// Each section of the sidebar is a separate TreeDataProvider so VS Code renders
// them as independent collapsible panels in the activity bar view.

// ── Preset views ─────────────────────────────────────────────────────────────

interface ViewPreset {
  label: string;
  icon: string;
  filters: FilterState;
}

const PRESETS: ViewPreset[] = [
  {
    label: 'All Symbols',
    icon: '$(symbol-misc)',
    filters: DEFAULT_FILTERS,
  },
  {
    label: 'Files & Modules',
    icon: '$(file-code)',
    filters: {
      ...DEFAULT_FILTERS,
      kinds: { function: false, class: false, interface: false, type: false, variable: false, enum: false },
      edges: { call: false, import: true, extends: false, implements: false },
    },
  },
  {
    label: 'Functions',
    icon: '$(symbol-method)',
    filters: {
      ...DEFAULT_FILTERS,
      kinds: { function: true, class: false, interface: false, type: false, variable: false, enum: false },
      edges: { call: true, import: false, extends: false, implements: false },
    },
  },
  {
    label: 'Classes & Interfaces',
    icon: '$(symbol-class)',
    filters: {
      ...DEFAULT_FILTERS,
      kinds: { function: false, class: true, interface: true, type: true, variable: false, enum: true },
      edges: { call: false, import: false, extends: true, implements: true },
    },
  },
  {
    label: 'Call Graph',
    icon: '$(type-hierarchy)',
    filters: {
      ...DEFAULT_FILTERS,
      kinds: { function: true, class: false, interface: false, type: false, variable: false, enum: false },
      edges: { call: true, import: false, extends: false, implements: false },
      hideUnused: true,
    },
  },
];

export class ViewsProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private onSelectCallbacks: Array<(f: FilterState) => void> = [];

  onSelect(cb: (f: FilterState) => void) { this.onSelectCallbacks.push(cb); }

  getTreeItem(element: TreeItem): TreeItem { return element; }

  getChildren(): TreeItem[] {
    return PRESETS.map(preset => {
      const item = new vscode.TreeItem(`${preset.icon} ${preset.label}`);
      item.command = {
        command: 'graphIde.applyView',
        title: '',
        arguments: [preset.filters],
      };
      return item;
    });
  }
}

export class FiltersProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private filters: FilterState = { ...DEFAULT_FILTERS, kinds: { ...DEFAULT_FILTERS.kinds }, edges: { ...DEFAULT_FILTERS.edges } };
  private onChangeCallbacks: Array<(f: FilterState) => void> = [];

  onChange(cb: (f: FilterState) => void) {
    this.onChangeCallbacks.push(cb);
  }

  getFilters(): FilterState { return this.filters; }

  getTreeItem(element: TreeItem): TreeItem { return element; }

  getChildren(element?: TreeItem): TreeItem[] {
    if (element) return [];

    const items: TreeItem[] = [];

    const kindEntries: [keyof FilterState['kinds'], string][] = [
      ['function', 'Functions'],
      ['class', 'Classes'],
      ['interface', 'Interfaces'],
      ['type', 'Types'],
      ['variable', 'Variables'],
      ['enum', 'Enums'],
    ];
    for (const [key, label] of kindEntries) {
      items.push(this.makeCheckbox(`kind.${key}`, label, this.filters.kinds[key]));
    }

    items.push(this.makeSeparator());

    const edgeEntries: [keyof FilterState['edges'], string][] = [
      ['call', 'Calls'],
      ['import', 'Imports'],
      ['extends', 'Extends'],
      ['implements', 'Implements'],
    ];
    for (const [key, label] of edgeEntries) {
      items.push(this.makeCheckbox(`edge.${key}`, label, this.filters.edges[key]));
    }

    items.push(this.makeSeparator());
    items.push(this.makeCheckbox('hideUnused', 'Hide unused symbols', this.filters.hideUnused));

    return items;
  }

  toggle(id: string) {
    if (id.startsWith('kind.')) {
      const key = id.slice(5) as keyof FilterState['kinds'];
      this.filters.kinds[key] = !this.filters.kinds[key];
    } else if (id.startsWith('edge.')) {
      const key = id.slice(5) as keyof FilterState['edges'];
      this.filters.edges[key] = !this.filters.edges[key];
    } else if (id === 'hideUnused') {
      this.filters.hideUnused = !this.filters.hideUnused;
    }
    this._onDidChangeTreeData.fire(undefined);
    this.onChangeCallbacks.forEach(cb => cb(this.filters));
  }

  refresh() { this._onDidChangeTreeData.fire(undefined); }

  private makeCheckbox(id: string, label: string, checked: boolean): TreeItem {
    const item = new vscode.TreeItem(`${checked ? '$(check)' : '$(circle-outline)'} ${label}`);
    item.id = id;
    item.command = { command: 'graphIde.toggleFilter', title: '', arguments: [id] };
    return item;
  }

  private makeSeparator(): TreeItem {
    const item = new vscode.TreeItem('─────────────');
    item.id = `sep-${Math.random()}`;
    return item;
  }
}

export class StatusProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private indexed = 0;
  private total = 0;
  private graph: GraphStore;

  constructor(graph: GraphStore) {
    this.graph = graph;
  }

  getTreeItem(element: TreeItem): TreeItem { return element; }

  getChildren(): TreeItem[] {
    const { nodeCount, edgeCount, indexedFiles, totalFiles } = this.graph.stats;
    const done = indexedFiles >= totalFiles && totalFiles > 0;

    const items: TreeItem[] = [];

    if (!done && totalFiles > 0) {
      const pct = Math.round((this.indexed / this.total) * 100);
      items.push(new vscode.TreeItem(`Indexing… ${pct}% (${this.indexed}/${this.total} files)`));
    } else {
      items.push(new vscode.TreeItem(`${nodeCount} symbols · ${edgeCount} edges`));
      items.push(new vscode.TreeItem(`${indexedFiles} files indexed`));
    }

    const reindex = new vscode.TreeItem('$(refresh) Re-index workspace');
    reindex.command = { command: 'graphIde.reindex', title: '' };
    items.push(reindex);

    return items;
  }

  update(indexed: number, total: number) {
    this.indexed = indexed;
    this.total = total;
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh() { this._onDidChangeTreeData.fire(undefined); }
}
