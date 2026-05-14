import type { GraphNode, GraphEdge } from '../bus/types';
import { makeEmptyGraph, type Graph } from './types';

export class GraphStore {
  private graph: Graph = makeEmptyGraph();
  private listeners: Array<(patch: { nodes: GraphNode[]; edges: GraphEdge[] }) => void> = [];

  onPatch(cb: (patch: { nodes: GraphNode[]; edges: GraphEdge[] }) => void) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  reset(nodes: GraphNode[], edges: GraphEdge[]) {
    this.graph.nodes.clear();
    this.graph.edges = [];
    this.applyPatch(nodes, edges);
  }

  patch(nodes: GraphNode[], edges: GraphEdge[]) {
    this.applyPatch(nodes, edges);
    this.listeners.forEach(l => l({ nodes, edges }));
  }

  setTotalFiles(total: number) {
    this.graph.totalFiles = total;
  }

  markFileIndexed(uri: string) {
    this.graph.indexedFiles.add(uri);
  }

  removeFile(uri: string) {
    const toRemove = new Set<string>();
    for (const [id, node] of this.graph.nodes) {
      if (node.uri === uri) toRemove.add(id);
    }
    toRemove.forEach(id => this.graph.nodes.delete(id));
    this.graph.edges = this.graph.edges.filter(
      e => !toRemove.has(e.source) && !toRemove.has(e.target)
    );
    this.graph.indexedFiles.delete(uri);
  }

  snapshot(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: [...this.graph.nodes.values()],
      edges: [...this.graph.edges],
    };
  }

  isIndexed(uri: string): boolean {
    return this.graph.indexedFiles.has(uri);
  }

  get stats() {
    return {
      nodeCount: this.graph.nodes.size,
      edgeCount: this.graph.edges.length,
      indexedFiles: this.graph.indexedFiles.size,
      totalFiles: this.graph.totalFiles,
    };
  }

  private applyPatch(nodes: GraphNode[], edges: GraphEdge[]) {
    for (const node of nodes) {
      this.graph.nodes.set(node.id, node);
    }
    // Edges: deduplicate by source+target+kind
    const edgeKey = (e: GraphEdge) => `${e.source}::${e.target}::${e.kind}`;
    const existing = new Set(this.graph.edges.map(edgeKey));
    for (const edge of edges) {
      if (!existing.has(edgeKey(edge))) {
        this.graph.edges.push(edge);
        existing.add(edgeKey(edge));
      }
    }
  }
}
