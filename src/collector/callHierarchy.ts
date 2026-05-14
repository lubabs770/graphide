import * as vscode from 'vscode';
import type { GraphNode, GraphEdge } from '../bus/types';

export async function enrichWithCallHierarchy(
  nodes: GraphNode[],
): Promise<{ updatedNodes: GraphNode[]; edges: GraphEdge[] }> {
  const edges: GraphEdge[] = [];
  const updatedNodes: GraphNode[] = [];
  const depthMap = new Map<string, number>();

  for (const node of nodes) {
    const uri = vscode.Uri.parse(node.uri);
    const position = new vscode.Position(node.range.startLine, node.range.startCharacter);

    let items: vscode.CallHierarchyItem[] = [];
    try {
      items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        'vscode.prepareCallHierarchy',
        uri,
        position,
      ) ?? [];
    } catch {
      updatedNodes.push(node);
      continue;
    }

    if (items.length === 0) {
      updatedNodes.push(node);
      continue;
    }

    const item = items[0];

    // Incoming calls = who calls this node → depth is callee depth + 1
    let incomingCalls: vscode.CallHierarchyIncomingCall[] = [];
    try {
      incomingCalls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
        'vscode.provideIncomingCalls',
        item,
      ) ?? [];
    } catch {}

    for (const call of incomingCalls) {
      const callerUri = call.from.uri.toString();
      const callerId = `${callerUri}::${call.from.name}::${call.from.range.start.line}`;
      edges.push({ source: callerId, target: node.id, kind: 'call' });
    }

    // Outgoing calls = who this node calls → emit call edges, track depth
    let outgoingCalls: vscode.CallHierarchyOutgoingCall[] = [];
    try {
      outgoingCalls = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
        'vscode.provideOutgoingCalls',
        item,
      ) ?? [];
    } catch {}

    for (const call of outgoingCalls) {
      const calleeUri = call.to.uri.toString();
      const calleeId = `${calleeUri}::${call.to.name}::${call.to.range.start.line}`;
      edges.push({ source: node.id, target: calleeId, kind: 'call' });
    }

    const depth = depthMap.get(node.id) ?? 0;
    updatedNodes.push({ ...node, depth });

    for (const call of outgoingCalls) {
      const calleeUri = call.to.uri.toString();
      const calleeId = `${calleeUri}::${call.to.name}::${call.to.range.start.line}`;
      const current = depthMap.get(calleeId);
      if (current === undefined || current < depth + 1) {
        depthMap.set(calleeId, depth + 1);
      }
    }
  }

  // Apply depth map to any nodes that got depth updates from outgoing calls above
  return {
    updatedNodes: updatedNodes.map(n => ({
      ...n,
      depth: depthMap.has(n.id) ? depthMap.get(n.id)! : n.depth,
    })),
    edges,
  };
}
