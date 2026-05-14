import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NodeManager } from './nodes';
import { EdgeManager } from './edges';
import { LodManager } from './lod';
import { ClusterManager } from './clusters';
import { LayoutEngine } from './layout';
import { Interaction } from '../controls/interaction';
import type { GraphNode, GraphEdge, FilterState, WebviewToHostMessage } from '../../src/bus/types';

// Maps FilterState.kinds keys → VS Code SymbolKind numbers
const KIND_GROUPS: Record<keyof FilterState['kinds'], number[]> = {
  function:  [5, 8, 11],   // Method, Constructor, Function
  class:     [4, 22],       // Class, Struct
  interface: [7, 10],       // Field, Interface
  type:      [25],          // TypeParameter
  variable:  [6, 12, 13],   // Property, Variable, Constant
  enum:      [9, 21],       // Enum, EnumMember
};

// How long to wait after the last patch before rebuilding the layout.
// Batches rapid patch bursts during indexing into a single simulation restart.
const LAYOUT_DEBOUNCE_MS = 400;

// Milliseconds between simulation ticks. 33ms ≈ 30fps of layout work,
// keeping the CPU free for the extension host's indexing work.
const LAYOUT_TICK_INTERVAL_MS = 33;

export class GraphScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private nodeManager: NodeManager;
  private edgeManager: EdgeManager;
  private lodManager: LodManager;
  private clusterManager: ClusterManager;
  private layout: LayoutEngine;
  private interaction: Interaction;
  private animFrame = 0;
  private clustersVisible = false;

  // Dirty-render state — only call renderer.render when something changed
  private renderDirty = true;
  private layoutRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLayoutTick = 0;

  constructor(container: HTMLElement, postMessage: (msg: WebviewToHostMessage) => void) {
    // Use the VS Code background color for the canvas clear color
    const bgColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';
    const clearColor = new THREE.Color(bgColor);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(clearColor);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
    this.camera.position.set(0, 0, 500);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 5000;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 1, 1);
    this.scene.add(dir);

    this.nodeManager = new NodeManager(this.scene);
    this.edgeManager = new EdgeManager(this.scene);
    this.lodManager = new LodManager(this.camera, this.nodeManager, this.edgeManager);
    this.clusterManager = new ClusterManager(this.scene);
    this.layout = new LayoutEngine();

    this.interaction = new Interaction(
      this.camera,
      this.renderer,
      this.nodeManager,
      this.edgeManager,
      postMessage,
      (id) => this.flyTo(id),
      () => { this.renderDirty = true; },
    );

    // Pinch-to-zoom only: block regular two-finger scroll from zooming.
    // macOS trackpad pinch sends wheel events with ctrlKey=true.
    this.renderer.domElement.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true, passive: false });

    window.addEventListener('resize', () => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.renderDirty = true;
    });

    this.animate();
  }

  applyReset(nodes: GraphNode[], edges: GraphEdge[]) {
    this.nodeManager.clear();
    this.edgeManager.clear();
    this.clusterManager.clear();
    this.applyPatch(nodes, edges);
  }

  applyPatch(nodes: GraphNode[], edges: GraphEdge[]) {
    this.nodeManager.upsert(nodes);
    this.edgeManager.upsert(edges, this.nodeManager);
    if (this.clustersVisible) this.clusterManager.rebuild(this.nodeManager.allNodes());
    this.renderDirty = true;

    // Debounce: absorb rapid patch bursts during indexing — only restart the
    // simulation after patches stop arriving for LAYOUT_DEBOUNCE_MS.
    if (this.layoutRebuildTimer !== null) clearTimeout(this.layoutRebuildTimer);
    this.layoutRebuildTimer = setTimeout(() => {
      this.layoutRebuildTimer = null;
      const allNodes = [...this.nodeManager.allNodes().values()];
      const allEdges = this.edgeManager.allEdges() as GraphEdge[];
      this.layout.rebuild(allNodes, allEdges);
    }, LAYOUT_DEBOUNCE_MS);
  }

  setFilters(filters: FilterState) {
    const visibleKinds = new Set<number>();
    for (const [key, enabled] of Object.entries(filters.kinds) as [keyof FilterState['kinds'], boolean][]) {
      if (enabled) KIND_GROUPS[key].forEach(k => visibleKinds.add(k));
    }

    const visibleNodes = new Set<string>();
    this.nodeManager.applyVisibility(node => {
      const kindOk = visibleKinds.size === 0 || visibleKinds.has(node.kind);
      const depthOk = node.depth >= filters.minDepth && node.depth <= filters.maxDepth;
      const usageOk = !filters.hideUnused || node.referenceCount > 0;
      const visible = kindOk && depthOk && usageOk;
      if (visible) visibleNodes.add(node.id);
      return visible;
    });

    this.edgeManager.applyVisibility((source, target, kind) => {
      return (filters.edges[kind as keyof FilterState['edges']] ?? true) &&
             visibleNodes.has(source) &&
             visibleNodes.has(target);
    });

    this.renderDirty = true;
  }

  setClustersVisible(visible: boolean) {
    this.clustersVisible = visible;
    if (visible) {
      this.clusterManager.rebuild(this.nodeManager.allNodes());
      this.clusterManager.updateCentroids(this.nodeManager);
    } else {
      this.clusterManager.clear();
    }
    this.renderDirty = true;
  }

  setLinesVisible(visible: boolean) {
    this.edgeManager.setLinesVisible(visible);
    this.renderDirty = true;
  }

  highlightNode(id: string) {
    this.nodeManager.pulse(id);
    this.renderDirty = true;
  }

  flyTo(id: string) {
    const pos = this.nodeManager.getPosition(id);
    if (!pos) return;
    const target = pos.clone();
    const from = this.camera.position.clone();
    const to = target.clone().add(new THREE.Vector3(0, 0, 100));
    let t = 0;
    const fly = () => {
      t = Math.min(t + 0.03, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.camera.position.lerpVectors(from, to, ease);
      this.controls.target.lerpVectors(from, target, ease);
      this.controls.update();
      this.renderDirty = true;
      if (t < 1) requestAnimationFrame(fly);
    };
    fly();
  }

  private animate() {
    this.animFrame = requestAnimationFrame(() => this.animate());

    // OrbitControls.update() returns true if the camera moved this frame
    const cameraMoved = this.controls.update();
    if (cameraMoved) this.renderDirty = true;

    // Throttle layout ticks — don't run the force simulation every rAF frame.
    // This caps layout CPU to ~30fps worth of n-body work while leaving
    // headroom for the extension host and the rest of the browser.
    const now = performance.now();
    if (!this.layout.isSettled() && now - this.lastLayoutTick >= LAYOUT_TICK_INTERVAL_MS) {
      this.lastLayoutTick = now;
      if (this.layout.tick()) {
        const updates: { id: string; x: number; y: number; z: number }[] = [];
        for (const id of this.nodeManager.allNodes().keys()) {
          const pos = this.layout.getPosition(id);
          if (pos) updates.push({ id, ...pos });
        }
        this.nodeManager.syncPositions(updates);
        this.edgeManager.updatePositions(this.nodeManager);
        if (this.clustersVisible) this.clusterManager.updateCentroids(this.nodeManager);
        this.renderDirty = true;
      }
    }

    // Only call the GPU when something actually changed
    if (this.renderDirty) {
      this.lodManager.update();
      this.renderer.render(this.scene, this.camera);
      this.renderDirty = false;
    }
  }

  dispose() {
    if (this.layoutRebuildTimer !== null) clearTimeout(this.layoutRebuildTimer);
    cancelAnimationFrame(this.animFrame);
    this.renderer.dispose();
  }
}
