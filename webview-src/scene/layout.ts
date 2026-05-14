import { forceSimulation, forceLink, forceManyBody, forceCenter, forceZ } from 'd3-force-3d';
import type { GraphNode, GraphEdge } from '../../src/bus/types';

const DEPTH_Z_SPACING = 80;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sim = any;

interface SimNode {
  id: string;
  depth: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  index?: number;
}

export class LayoutEngine {
  private sim: Sim = null;
  private simNodes: SimNode[] = [];
  private posCache = new Map<string, { x: number; y: number; z: number }>();

  rebuild(graphNodes: GraphNode[], graphEdges: GraphEdge[]) {
    const nodeSet = new Set(graphNodes.map(n => n.id));

    this.simNodes = graphNodes.map(n => {
      const saved = this.posCache.get(n.id);
      return {
        id: n.id,
        depth: n.depth,
        x: saved?.x ?? (Math.random() - 0.5) * 400,
        y: saved?.y ?? (Math.random() - 0.5) * 400,
        z: saved?.z ?? n.depth * -DEPTH_Z_SPACING,
        vx: 0, vy: 0, vz: 0,
      };
    });

    const simLinks = graphEdges
      .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target }));

    this.sim = forceSimulation(this.simNodes, 3)
      .force('link', forceLink(simLinks).id((d: SimNode) => d.id).distance(80).strength(0.4))
      .force('charge', forceManyBody().strength(-80))
      .force('center', forceCenter(0, 0, 0))
      .force('z-depth', forceZ().z((d: SimNode) => d.depth * -DEPTH_Z_SPACING).strength(0.9))
      .alphaDecay(0.015)
      .stop();
  }

  // Returns true while the simulation is still running
  tick(): boolean {
    if (!this.sim) return false;
    if (this.sim.alpha() <= this.sim.alphaMin()) return false;

    this.sim.tick();

    for (const n of this.simNodes) {
      this.posCache.set(n.id, { x: n.x, y: n.y, z: n.z });
    }
    return true;
  }

  // Returns settled or live positions; undefined if node not yet placed
  getPosition(id: string): { x: number; y: number; z: number } | undefined {
    return this.posCache.get(id);
  }

  isSettled(): boolean {
    return !this.sim || this.sim.alpha() <= this.sim.alphaMin();
  }
}
