import type * as vscode from 'vscode';

// ── Shared domain types ──────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  kind: number; // vscode.SymbolKind (number so it serializes over postMessage)
  uri: string;
  range: SerializedRange;
  referenceCount: number;
  depth: number;
  moduleId: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: 'import' | 'call' | 'implements' | 'extends' | 'references';
}

export interface SerializedRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface FilterState {
  kinds: {
    function: boolean;
    class: boolean;
    interface: boolean;
    type: boolean;
    variable: boolean;
    enum: boolean;
  };
  edges: {
    call: boolean;
    import: boolean;
    extends: boolean;
    implements: boolean;
  };
  hideUnused: boolean;
  minDepth: number;
  maxDepth: number;
}

export const DEFAULT_FILTERS: FilterState = {
  kinds: {
    function: true,
    class: true,
    interface: true,
    type: true,
    variable: false,
    enum: true,
  },
  edges: {
    call: true,
    import: true,
    extends: true,
    implements: true,
  },
  hideUnused: false,
  minDepth: 0,
  maxDepth: 20,
};

// ── Host → Webview messages ──────────────────────────────────────────────────

export interface GraphPatchMessage {
  type: 'graph.patch';
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphResetMessage {
  type: 'graph.reset';
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeHighlightMessage {
  type: 'node.highlight';
  id: string;
}

export interface IndexProgressMessage {
  type: 'index.progress';
  indexed: number;
  total: number;
}

export interface FilterUpdateMessage {
  type: 'filter.update';
  filters: FilterState;
}

export interface ClustersToggleMessage {
  type: 'clusters.toggle';
  visible: boolean;
}

export interface LinesToggleMessage {
  type: 'lines.toggle';
  visible: boolean;
}

export type HostToWebviewMessage =
  | GraphPatchMessage
  | GraphResetMessage
  | NodeHighlightMessage
  | IndexProgressMessage
  | FilterUpdateMessage
  | ClustersToggleMessage
  | LinesToggleMessage;

// ── Webview → Host messages ──────────────────────────────────────────────────

export interface NodeNavigateMessage {
  type: 'node.navigate';
  uri: string;
  range: SerializedRange;
}

export interface NodeHoverMessage {
  type: 'node.hover';
  uri: string;
  range: SerializedRange;
}

export interface FilterChangeMessage {
  type: 'filter.change';
  filters: FilterState;
}

export interface ReadyMessage {
  type: 'ready';
}

export type WebviewToHostMessage =
  | NodeNavigateMessage
  | NodeHoverMessage
  | FilterChangeMessage
  | ReadyMessage;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function serializeRange(range: vscode.Range): SerializedRange {
  return {
    startLine: range.start.line,
    startCharacter: range.start.character,
    endLine: range.end.line,
    endCharacter: range.end.character,
  };
}

export function deserializeRange(r: SerializedRange): vscode.Range {
  const vscode = require('vscode') as typeof import('vscode');
  return new vscode.Range(r.startLine, r.startCharacter, r.endLine, r.endCharacter);
}
