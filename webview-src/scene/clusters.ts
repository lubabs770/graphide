import * as THREE from 'three';
import type { GraphNode } from '../../src/bus/types';
import type { NodeManager } from './nodes';

// Draws a transparent sphere per module/file grouping, visible at far zoom.
export class ClusterManager {
  private scene: THREE.Scene;
  private spheres = new Map<string, THREE.Mesh>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  rebuild(nodes: Map<string, GraphNode>) {
    // Group nodes by moduleId
    const groups = new Map<string, GraphNode[]>();
    for (const node of nodes.values()) {
      const grp = groups.get(node.moduleId) ?? [];
      grp.push(node);
      groups.set(node.moduleId, grp);
    }

    // Remove clusters that no longer exist
    for (const [id, mesh] of this.spheres) {
      if (!groups.has(id)) {
        this.scene.remove(mesh);
        this.spheres.delete(id);
      }
    }

    // Add or update clusters
    for (const [moduleId, moduleNodes] of groups) {
      if (!this.spheres.has(moduleId)) {
        const geo = new THREE.SphereGeometry(1, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x98c379,
          transparent: true,
          opacity: 0.04,
          wireframe: true,
        });
        const sphere = new THREE.Mesh(geo, mat);
        this.scene.add(sphere);
        this.spheres.set(moduleId, sphere);
      }

      // Center = centroid of member node positions (will be set by layout pass)
      // For now just position at centroid of initial random positions
      const sphere = this.spheres.get(moduleId)!;
      sphere.scale.setScalar(40 + moduleNodes.length * 5);
    }
  }

  // Called each layout tick to keep cluster spheres centered on their members
  updateCentroids(nodes: NodeManager) {
    const groups = new Map<string, GraphNode[]>();
    for (const node of nodes.allNodes().values()) {
      const grp = groups.get(node.moduleId) ?? [];
      grp.push(node);
      groups.set(node.moduleId, grp);
    }

    for (const [moduleId, sphere] of this.spheres) {
      const memberNodes = groups.get(moduleId);
      if (!memberNodes) continue;

      const centroid = new THREE.Vector3();
      let count = 0;
      for (const node of memberNodes) {
        const pos = nodes.getPosition(node.id);
        if (pos) { centroid.add(pos); count++; }
      }
      if (count > 0) {
        centroid.divideScalar(count);
        sphere.position.copy(centroid);
      }
    }
  }

  clear() {
    for (const mesh of this.spheres.values()) {
      this.scene.remove(mesh);
    }
    this.spheres.clear();
  }
}
