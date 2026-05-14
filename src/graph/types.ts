export type { GraphNode, GraphEdge, SerializedRange, FilterState, DEFAULT_FILTERS } from '../bus/types';

export interface Graph {
  nodes: Map<string, import('../bus/types').GraphNode>;
  edges: import('../bus/types').GraphEdge[];
  indexedFiles: Set<string>;
  totalFiles: number;
}

export function makeEmptyGraph(): Graph {
  return {
    nodes: new Map(),
    edges: [],
    indexedFiles: new Set(),
    totalFiles: 0,
  };
}
