import * as vscode from 'vscode';
import { extractSymbols } from './symbols';
import { enrichWithReferences } from './references';
import { enrichWithCallHierarchy } from './callHierarchy';
import { CollectorCache } from './cache';
import type { GraphStore } from '../graph/index';

const SUPPORTED_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'cs',
];

const GLOB = `**/*.{${SUPPORTED_EXTENSIONS.join(',')}}`;

// Exclude vendored / generated / dependency trees — they explode the file count
const EXCLUDE_GLOB = '{**/node_modules/**,**/dist/**,**/build/**,**/out/**,**/.git/**,**/vendor/**,**/.cache/**,**/pkg/mod/**}';

// Path segments that mark non-source trees — checked against every uri so
// files opened from these dirs are also excluded (findFiles glob alone isn't enough)
const EXCLUDED_PATH_SEGMENTS = [
  '/node_modules/',
  '/dist/',
  '/build/',
  '/out/',
  '/.git/',
  '/vendor/',
  '/.cache/',
  '/pkg/mod/',
];

export class Collector {
  private cache: CollectorCache;
  private graph: GraphStore;
  private queue: vscode.Uri[] = [];
  private running = 0;
  private concurrency: number;
  private onProgress: (indexed: number, total: number) => void;
  private disposables: vscode.Disposable[] = [];

  constructor(
    ctx: vscode.ExtensionContext,
    graph: GraphStore,
    onProgress: (indexed: number, total: number) => void,
  ) {
    this.cache = new CollectorCache(ctx);
    this.graph = graph;
    this.onProgress = onProgress;
    this.concurrency = vscode.workspace.getConfiguration('graphIde').get('crawlConcurrency', 2);
  }

  async start() {
    // Open documents get full enrichment (they have an active LSP already)
    for (const doc of vscode.workspace.textDocuments) {
      if (this.isSupported(doc.uri)) {
        await this.indexFile(doc.uri, true);
      }
    }

    // Background crawl: symbols only — fast pass, no workspace-wide LSP calls
    const files = await vscode.workspace.findFiles(GLOB, EXCLUDE_GLOB);
    this.graph.setTotalFiles(files.length);
    this.queue = files.filter(uri => !this.graph.isIndexed(uri.toString()));
    this.drain();

    // On open: enrich newly opened files with references + call hierarchy
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (this.isSupported(doc.uri)) {
          this.reindexFile(doc.uri, true);
        }
      })
    );

    // On save: re-enrich the saved file
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        if (this.isSupported(doc.uri)) {
          this.reindexFile(doc.uri, true);
        }
      })
    );
  }

  stop() {
    this.queue = [];
    this.running = 0;
  }

  async reindexAll() {
    this.cache.clear();
    const files = await vscode.workspace.findFiles(GLOB, EXCLUDE_GLOB);
    this.graph.setTotalFiles(files.length);
    this.queue = [...files];
    this.drain();
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }

  private isSupported(uri: vscode.Uri): boolean {
    const ext = uri.path.split('.').pop() ?? '';
    if (!SUPPORTED_EXTENSIONS.includes(ext)) return false;
    const p = uri.path;
    return !EXCLUDED_PATH_SEGMENTS.some(seg => p.includes(seg));
  }

  private drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const uri = this.queue.shift()!;
      this.running++;
      this.indexFile(uri, false).finally(() => {
        this.running--;
        this.onProgress(this.graph.stats.indexedFiles, this.graph.stats.totalFiles);
        // Small delay between files so the language server can breathe
        setTimeout(() => this.drain(), 60);
      });
    }
  }

  private async reindexFile(uri: vscode.Uri, deep: boolean) {
    this.cache.invalidate(uri.toString());
    this.graph.removeFile(uri.toString());
    await this.indexFile(uri, deep);
  }

  private async indexFile(uri: vscode.Uri, deep: boolean): Promise<void> {
    const uriStr = uri.toString();

    let mtime = 0;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      mtime = stat.mtime;
    } catch {
      return;
    }

    // Cache is keyed by uri+mtime+deep so a fast-indexed file still gets
    // re-enriched when opened (different cache key).
    const cacheKey = deep ? `${uriStr}:deep` : uriStr;
    const cached = this.cache.get(cacheKey, mtime);
    if (cached) {
      this.graph.patch(cached.nodes, cached.edges);
      this.graph.markFileIndexed(uriStr);
      return;
    }

    const symbols = await extractSymbols(uri);
    if (symbols.length === 0) {
      this.graph.markFileIndexed(uriStr);
      return;
    }

    if (!deep) {
      // Fast path: just symbols, no LSP enrichment
      this.cache.set(cacheKey, { mtime, nodes: symbols, edges: [] });
      this.graph.patch(symbols, []);
      this.graph.markFileIndexed(uriStr);
      return;
    }

    // Deep path: call hierarchy + reference counts (only for open/saved files)
    const { updatedNodes: callNodes, edges: callEdges } = await enrichWithCallHierarchy(symbols);
    const { updatedNodes: finalNodes, edges: refEdges } = await enrichWithReferences(
      callNodes,
      this.graph.snapshot().nodes.reduce((m, n) => m.set(n.id, n), new Map()),
    );
    const allEdges = [...callEdges, ...refEdges];

    this.cache.set(cacheKey, { mtime, nodes: finalNodes, edges: allEdges });
    this.graph.patch(finalNodes, allEdges);
    this.graph.markFileIndexed(uriStr);
  }
}
