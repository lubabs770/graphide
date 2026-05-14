import * as THREE from 'three';
import type { NodeManager } from './nodes';
import type { EdgeManager } from './edges';

const DIST_CLOSE = 150;
const DIST_MID   = 600;
const DIST_FAR   = 2000;  // start fading
const DIST_GONE  = 5000;  // minimum opacity reached (never fully hidden)
const MIN_NODE_OPACITY = 0.12;
const MIN_EDGE_OPACITY = 0.06;

export class LodManager {
  private camera: THREE.PerspectiveCamera;
  private nodes: NodeManager;
  private edges: EdgeManager;
  private labelContainer: HTMLElement;

  constructor(camera: THREE.PerspectiveCamera, nodes: NodeManager, edges: EdgeManager) {
    this.camera = camera;
    this.nodes = nodes;
    this.edges = edges;

    this.labelContainer = document.createElement('div');
    this.labelContainer.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;width:100%;height:100%;overflow:hidden;';
    document.getElementById('root')?.appendChild(this.labelContainer);
  }

  update() {
    const dist = this.camera.position.length();

    // Nodes: fade but never fully disappear
    const rawNodeAlpha = dist < DIST_FAR
      ? 1
      : 1 - Math.min((dist - DIST_FAR) / (DIST_GONE - DIST_FAR), 1);
    const nodeAlpha = Math.max(rawNodeAlpha, MIN_NODE_OPACITY);

    // Edges: fade faster than nodes but also never fully vanish
    const rawEdgeAlpha = dist < DIST_MID
      ? 0.35
      : 0.35 * Math.max(1 - (dist - DIST_MID) / (DIST_FAR - DIST_MID), 0);
    const edgeAlpha = Math.max(rawEdgeAlpha, MIN_EDGE_OPACITY);

    this.applyNodeAlpha(nodeAlpha);
    this.applyEdgeAlpha(edgeAlpha);
  }

  private applyNodeAlpha(alpha: number) {
    const visible = alpha > 0.01;
    for (const id of this.nodes.allNodes().keys()) {
      const mesh = this.nodes.getMesh(id);
      if (!mesh) continue;
      mesh.visible = visible;
      if (visible) {
        const mat = mesh.material as THREE.MeshLambertMaterial;
        mat.transparent = alpha < 0.99;
        mat.opacity = alpha;
      }
    }
  }

  private applyEdgeAlpha(alpha: number) {
    this.edges.setGlobalOpacity(alpha);
  }
}
