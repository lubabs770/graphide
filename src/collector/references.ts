import * as vscode from 'vscode';
import type { GraphNode, GraphEdge } from '../bus/types';
import { serializeRange } from '../bus/types';

export async function enrichWithReferences(
  nodes: GraphNode[],
  existingNodes: Map<string, GraphNode>,
): Promise<{ updatedNodes: GraphNode[]; edges: GraphEdge[] }> {
  const edges: GraphEdge[] = [];
  const updatedNodes: GraphNode[] = [];

  for (const node of nodes) {
    const uri = vscode.Uri.parse(node.uri);
    const position = new vscode.Position(node.range.startLine, node.range.startCharacter);

    let refs: vscode.Location[] = [];
    try {
      refs = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        position,
      ) ?? [];
    } catch {
      // LSP might not be ready yet — best effort
    }

    // Exclude the definition site itself from reference count
    const refCount = refs.filter(r => {
      const sameFile = r.uri.toString() === node.uri;
      const sameLine = r.range.start.line === node.range.startLine;
      return !(sameFile && sameLine);
    }).length;

    updatedNodes.push({ ...node, referenceCount: refCount });

    // Build reference edges: find which node in existingNodes the reference
    // points to, emit an edge. This is a best-effort lookup — we match by
    // uri + line proximity.
    for (const ref of refs) {
      const refUri = ref.uri.toString();
      for (const [targetId, targetNode] of existingNodes) {
        if (
          targetNode.uri === refUri &&
          Math.abs(targetNode.range.startLine - ref.range.start.line) <= 1 &&
          targetId !== node.id
        ) {
          edges.push({ source: node.id, target: targetId, kind: 'references' });
          break;
        }
      }
    }
  }

  return { updatedNodes, edges };
}
