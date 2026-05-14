import * as THREE from 'three';
import type { NodeManager } from '../scene/nodes';
import type { EdgeManager } from '../scene/edges';
import type { WebviewToHostMessage } from '../../src/bus/types';

const CONTEXT_MENU_ID = 'graph-context-menu';
const DRAG_THRESHOLD = 5;

export class Interaction {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hovered: string | null = null;
  private tooltip: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private nodes: NodeManager;
  private edges: EdgeManager;
  private postMessage: (msg: WebviewToHostMessage) => void;
  private onFlyTo: (id: string) => void;
  private onDirty: () => void;
  private contextMenu: HTMLElement;
  private downPos: { x: number; y: number } | null = null;

  constructor(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    nodes: NodeManager,
    edges: EdgeManager,
    postMessage: (msg: WebviewToHostMessage) => void,
    onFlyTo: (id: string) => void,
    onDirty: () => void,
  ) {
    this.camera = camera;
    this.renderer = renderer;
    this.nodes = nodes;
    this.edges = edges;
    this.postMessage = postMessage;
    this.onFlyTo = onFlyTo;
    this.onDirty = onDirty;
    this.tooltip = document.getElementById('tooltip') as HTMLElement;
    this.contextMenu = this.buildContextMenu();

    renderer.domElement.addEventListener('mousedown', e => { this.downPos = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('mousemove', e => this.onMouseMove(e));
    renderer.domElement.addEventListener('click', e => this.onClick(e));
    renderer.domElement.addEventListener('dblclick', () => this.onDblClick());
    renderer.domElement.addEventListener('contextmenu', e => this.onContextMenu(e));
    document.addEventListener('click', () => this.hideContextMenu());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hideContextMenu(); });
  }

  private onMouseMove(e: MouseEvent) {
    this.hideContextMenu();

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const meshes: THREE.Mesh[] = [];
    for (const id of this.nodes.allNodes().keys()) {
      const m = this.nodes.getMesh(id);
      if (m && m.visible) meshes.push(m);
    }

    const hits = this.raycaster.intersectObjects(meshes);

    if (hits.length > 0) {
      const nodeId = hits[0].object.userData.nodeId as string;

      if (nodeId !== this.hovered) {
        this.hovered = nodeId;
        this.edges.highlightEdgesFor(nodeId);
        this.onDirty();

        const node = this.nodes.allNodes().get(nodeId);
        if (node) {
          this.tooltip.textContent = node.label;
          this.tooltip.style.display = 'block';
        }
      }

      this.tooltip.style.left = `${e.clientX + 14}px`;
      this.tooltip.style.top  = `${e.clientY - 10}px`;
    } else {
      if (this.hovered) {
        this.edges.resetOpacity();
        this.hovered = null;
        this.onDirty();
      }
      this.tooltip.style.display = 'none';
    }
  }

  private onClick(e: MouseEvent) {
    if (e.detail > 1) return;
    if (this.downPos) {
      const dx = e.clientX - this.downPos.x;
      const dy = e.clientY - this.downPos.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    }
    if (!this.hovered) return;
    const node = this.nodes.allNodes().get(this.hovered);
    if (!node) return;
    this.postMessage({ type: 'node.hover', uri: node.uri, range: node.range });
  }

  private onDblClick() {
    if (!this.hovered) return;
    const node = this.nodes.allNodes().get(this.hovered);
    if (!node) return;
    this.postMessage({ type: 'node.navigate', uri: node.uri, range: node.range });
    this.onFlyTo(this.hovered);
  }

  private onContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (!this.hovered) return;
    const node = this.nodes.allNodes().get(this.hovered);
    if (!node) return;

    this.contextMenu.style.left = `${e.clientX}px`;
    this.contextMenu.style.top  = `${e.clientY}px`;
    this.contextMenu.style.display = 'block';
    this.contextMenu.dataset.nodeId = this.hovered;
  }

  private hideContextMenu() {
    this.contextMenu.style.display = 'none';
  }

  private buildContextMenu(): HTMLElement {
    const existing = document.getElementById(CONTEXT_MENU_ID);
    if (existing) return existing;

    const menu = document.createElement('div');
    menu.id = CONTEXT_MENU_ID;
    menu.style.cssText = `
      position: fixed; display: none; z-index: 1000;
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 4px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      min-width: 180px;
      font: 13px var(--vscode-font-family, -apple-system, sans-serif);
      color: var(--vscode-menu-foreground, #cccccc);
      overflow: hidden;
    `;

    const items: { label: string; action: (nodeId: string) => void }[] = [
      {
        label: 'Go to Definition',
        action: (id) => {
          const node = this.nodes.allNodes().get(id);
          if (node) this.postMessage({ type: 'node.navigate', uri: node.uri, range: node.range });
        },
      },
      {
        label: 'Find All References',
        action: (id) => {
          const node = this.nodes.allNodes().get(id);
          if (node) this.postMessage({ type: 'node.navigate', uri: node.uri, range: node.range });
        },
      },
      { label: '─', action: () => {} },
      {
        label: 'Copy Symbol Name',
        action: (id) => {
          const node = this.nodes.allNodes().get(id);
          if (node) navigator.clipboard.writeText(node.label);
        },
      },
    ];

    for (const item of items) {
      const el = document.createElement('div');
      if (item.label === '─') {
        el.style.cssText = 'height: 1px; background: var(--vscode-menu-separatorBackground, #3e4451); margin: 4px 0;';
      } else {
        el.textContent = item.label;
        el.style.cssText = 'padding: 6px 14px; cursor: pointer;';
        el.addEventListener('mouseenter', () => { el.style.background = 'var(--vscode-menu-selectionBackground, #094771)'; });
        el.addEventListener('mouseleave', () => { el.style.background = ''; });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const nodeId = menu.dataset.nodeId ?? '';
          item.action(nodeId);
          this.hideContextMenu();
        });
      }
      menu.appendChild(el);
    }

    document.body.appendChild(menu);
    return menu;
  }
}
