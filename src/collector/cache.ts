import * as vscode from 'vscode';
import type { GraphNode, GraphEdge } from '../bus/types';

export interface FileCacheEntry {
  mtime: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const CACHE_KEY = 'graphIde.fileCache.v1';

export class CollectorCache {
  private cache: Map<string, FileCacheEntry>;
  private ctx: vscode.ExtensionContext;

  constructor(ctx: vscode.ExtensionContext) {
    this.ctx = ctx;
    const stored = ctx.workspaceState.get<Record<string, FileCacheEntry>>(CACHE_KEY, {});
    this.cache = new Map(Object.entries(stored));
  }

  get(uri: string, mtime: number): FileCacheEntry | undefined {
    const entry = this.cache.get(uri);
    return entry?.mtime === mtime ? entry : undefined;
  }

  set(uri: string, entry: FileCacheEntry) {
    this.cache.set(uri, entry);
    // Persist async — don't await, best-effort
    this.flush();
  }

  invalidate(uri: string) {
    this.cache.delete(uri);
    this.flush();
  }

  private flush() {
    const obj = Object.fromEntries(this.cache.entries());
    this.ctx.workspaceState.update(CACHE_KEY, obj);
  }

  clear() {
    this.cache.clear();
    this.ctx.workspaceState.update(CACHE_KEY, {});
  }
}
