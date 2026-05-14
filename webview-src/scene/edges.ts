import * as THREE from 'three';
import type { GraphEdge } from '../../src/bus/types';
import type { NodeManager } from './nodes';

const EDGE_COLORS: Record<GraphEdge['kind'], number> = {
  call:       0x61afef,
  import:     0x98c379,
  extends:    0xe5c07b,
  implements: 0xc678dd,
  references: 0x56b6c2,
};

export class EdgeManager {
  private scene: THREE.Scene;
  private lines = new Map<string, THREE.Line>();
  private linesVisible = true;
  private filterPredicate: ((source: string, target: string, kind: GraphEdge['kind']) => boolean) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  upsert(edges: GraphEdge[], nodes: NodeManager) {
    for (const edge of edges) {
      const key = `${edge.source}::${edge.target}::${edge.kind}`;
      if (this.lines.has(key)) continue;

      const srcPos = nodes.getPosition(edge.source);
      const dstPos = nodes.getPosition(edge.target);
      if (!srcPos || !dstPos) continue;

      const geo = new THREE.BufferGeometry().setFromPoints([srcPos, dstPos]);
      const mat = new THREE.LineBasicMaterial({
        color: EDGE_COLORS[edge.kind] ?? 0x555555,
        opacity: 0.35,
        transparent: true,
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { edgeKey: key, source: edge.source, target: edge.target, kind: edge.kind };
      line.visible = this.linesVisible;
      this.scene.add(line);
      this.lines.set(key, line);
    }
  }

  updatePositions(nodes: NodeManager) {
    for (const line of this.lines.values()) {
      const srcPos = nodes.getPosition(line.userData.source as string);
      const dstPos = nodes.getPosition(line.userData.target as string);
      if (!srcPos || !dstPos) continue;
      const positions = line.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, srcPos.x, srcPos.y, srcPos.z);
      positions.setXYZ(1, dstPos.x, dstPos.y, dstPos.z);
      positions.needsUpdate = true;
    }
  }

  setLinesVisible(visible: boolean) {
    this.linesVisible = visible;
    if (visible) {
      this.resetOpacity();
    } else {
      for (const line of this.lines.values()) {
        line.visible = false;
      }
    }
  }

  highlightEdgesFor(nodeId: string) {
    for (const line of this.lines.values()) {
      const connected =
        line.userData.source === nodeId || line.userData.target === nodeId;
      if (this.linesVisible) {
        (line.material as THREE.LineBasicMaterial).opacity = connected ? 0.9 : 0.05;
      } else {
        line.visible = connected;
        if (connected) (line.material as THREE.LineBasicMaterial).opacity = 0.9;
      }
    }
  }

  applyVisibility(predicate: (source: string, target: string, kind: GraphEdge['kind']) => boolean) {
    this.filterPredicate = predicate;
    if (!this.linesVisible) return;
    for (const line of this.lines.values()) {
      line.visible = predicate(
        line.userData.source as string,
        line.userData.target as string,
        line.userData.kind as GraphEdge['kind'],
      );
    }
  }

  allEdges(): { source: string; target: string; kind: GraphEdge['kind'] }[] {
    return [...this.lines.values()].map(line => ({
      source: line.userData.source as string,
      target: line.userData.target as string,
      kind: line.userData.kind as GraphEdge['kind'],
    }));
  }

  setGlobalOpacity(opacity: number) {
    if (!this.linesVisible) return;
    const visible = opacity > 0.01;
    for (const line of this.lines.values()) {
      line.visible = visible;
      if (visible) {
        (line.material as THREE.LineBasicMaterial).opacity = opacity;
      }
    }
  }

  resetOpacity() {
    for (const line of this.lines.values()) {
      if (this.linesVisible) {
        line.visible = true;
        (line.material as THREE.LineBasicMaterial).opacity = 0.35;
      } else {
        line.visible = false;
      }
    }
  }

  clear() {
    for (const line of this.lines.values()) {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.LineBasicMaterial).dispose();
    }
    this.lines.clear();
  }
}
