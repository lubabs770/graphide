import { GraphScene } from './scene/index';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../src/bus/types';

const vscode = acquireVsCodeApi();

function post(msg: WebviewToHostMessage) {
  vscode.postMessage(msg);
}

const container = document.getElementById('canvas-container')!;
const progress  = document.getElementById('progress')!;

const scene = new GraphScene(container, post);

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as HostToWebviewMessage;
  switch (msg.type) {
    case 'graph.reset':
      scene.applyReset(msg.nodes, msg.edges);
      break;
    case 'graph.patch':
      scene.applyPatch(msg.nodes, msg.edges);
      break;
    case 'node.highlight':
      scene.highlightNode(msg.id);
      scene.flyTo(msg.id);
      break;
    case 'filter.update':
      scene.setFilters(msg.filters);
      break;
    case 'clusters.toggle':
      scene.setClustersVisible(msg.visible);
      break;
    case 'lines.toggle':
      scene.setLinesVisible(msg.visible);
      break;
    case 'index.progress': {
      const pct = msg.total > 0 ? Math.round((msg.indexed / msg.total) * 100) : 0;
      progress.textContent = `Indexing… ${pct}% (${msg.indexed}/${msg.total})`;
      progress.classList.toggle('visible', msg.indexed < msg.total);
      break;
    }
  }
});

post({ type: 'ready' });
