import * as THREE from 'three';
import type { GraphNode } from '../../src/bus/types';

// SymbolKind → hex color (VS Code Dark+ palette)
// vscode.SymbolKind values: File=0, Module=1, Class=4, Method=5, Function=11,
//   Variable=12, Constant=13, Interface=7, Enum=9, TypeParameter=25
const KIND_COLOR: Record<number, number> = {
  11: 0x61afef, // Function
  5:  0x61afef, // Method
  4:  0xe5c07b, // Class
  7:  0xc678dd, // Interface
  25: 0xc678dd, // TypeParameter
  1:  0x98c379, // Module
  0:  0x98c379, // File
  12: 0xabb2bf, // Variable
  13: 0xabb2bf, // Constant
  9:  0xe5c07b, // Enum
};
const DEFAULT_COLOR = 0xabb2bf;
const UNUSED_COLOR  = 0xe06c75;

const MIN_RADIUS = 3;
const MAX_RADIUS = 18;

export class NodeManager {
  private scene: THREE.Scene;
  private meshes = new Map<string, THREE.Mesh>();
  private nodeData = new Map<string, GraphNode>();
  private geo = new THREE.SphereGeometry(1, 12, 8); // unit sphere, scaled per node

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  upsert(nodes: GraphNode[]) {
    for (const node of nodes) {
      this.nodeData.set(node.id, node);
      if (this.meshes.has(node.id)) {
        this.updateMesh(node);
      } else {
        this.addMesh(node);
      }
    }
  }

  clear() {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      (mesh.material as THREE.MeshLambertMaterial).dispose();
    }
    this.meshes.clear();
    this.nodeData.clear();
  }

  pulse(id: string) {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    const original = mat.emissive.getHex();
    mat.emissive.setHex(0xffffff);
    setTimeout(() => mat.emissive.setHex(original), 300);
  }

  getPosition(id: string): THREE.Vector3 | undefined {
    return this.meshes.get(id)?.position;
  }

  syncPositions(updates: { id: string; x: number; y: number; z: number }[]) {
    for (const { id, x, y, z } of updates) {
      const mesh = this.meshes.get(id);
      if (mesh) mesh.position.set(x, y, z);
    }
  }

  allNodes(): Map<string, GraphNode> {
    return this.nodeData;
  }

  getMesh(id: string): THREE.Mesh | undefined {
    return this.meshes.get(id);
  }

  applyVisibility(predicate: (node: GraphNode) => boolean) {
    for (const [id, node] of this.nodeData) {
      const mesh = this.meshes.get(id);
      if (mesh) mesh.visible = predicate(node);
    }
  }

  private addMesh(node: GraphNode) {
    const mat = new THREE.MeshLambertMaterial({
      color: this.colorFor(node),
      emissive: 0x000000,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    const r = this.radiusFor(node);
    mesh.scale.setScalar(r);

    // Initial position: layout engine will settle these on the first tick
    mesh.position.set(
      (Math.random() - 0.5) * 400,
      (Math.random() - 0.5) * 400,
      node.depth * -80,
    );

    mesh.userData = { nodeId: node.id };
    this.scene.add(mesh);
    this.meshes.set(node.id, mesh);
  }

  private updateMesh(node: GraphNode) {
    const mesh = this.meshes.get(node.id)!;
    (mesh.material as THREE.MeshLambertMaterial).color.setHex(this.colorFor(node));
    mesh.scale.setScalar(this.radiusFor(node));
  }

  private colorFor(node: GraphNode): number {
    if (node.referenceCount === 0) return UNUSED_COLOR;
    return KIND_COLOR[node.kind] ?? DEFAULT_COLOR;
  }

  private radiusFor(node: GraphNode): number {
    const refs = Math.max(node.referenceCount, 0);
    return Math.min(MIN_RADIUS + Math.sqrt(refs) * 1.5, MAX_RADIUS);
  }
}
