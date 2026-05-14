import * as vscode from 'vscode';
import type { GraphNode } from '../bus/types';
import { serializeRange } from '../bus/types';

export async function extractSymbols(uri: vscode.Uri): Promise<GraphNode[]> {
  let rawSymbols: vscode.DocumentSymbol[];
  try {
    const result = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri,
    );
    if (!result || result.length === 0) return [];
    rawSymbols = result;
  } catch {
    return [];
  }

  const nodes: GraphNode[] = [];
  const moduleId = uri.toString();

  function flatten(symbols: vscode.DocumentSymbol[], parentDepth = 0) {
    for (const sym of symbols) {
      const id = `${moduleId}::${sym.name}::${sym.range.start.line}`;
      nodes.push({
        id,
        label: sym.name,
        kind: sym.kind,
        uri: uri.toString(),
        range: serializeRange(sym.range),
        referenceCount: 0, // filled in by references.ts pass
        depth: parentDepth,  // overridden by callHierarchy.ts pass
        moduleId,
      });
      if (sym.children.length > 0) {
        flatten(sym.children, parentDepth + 1);
      }
    }
  }

  flatten(rawSymbols);
  return nodes;
}
