# Graph IDE

A VS Code extension that visualizes your codebase as a live, interactive 3D graph. Symbols become nodes, relationships become edges — all driven by the Language Server Protocol.

## What it does

Open any supported project and Graph IDE indexes your workspace in the background, building a force-directed 3D graph where:

- **Nodes** are symbols (functions, classes, interfaces, types, enums, variables)
- **Edges** are relationships (calls, imports, extends, implements, references)
- **Depth** maps to call hierarchy — deeper functions sit further back on the Z axis
- **Size** reflects reference count — heavily-used symbols are larger

The graph stays in sync with your editor. Click a symbol in the editor and the graph highlights it. Double-click a node in the graph and the editor navigates to it.

## Supported languages

TypeScript, JavaScript (+ JSX/TSX/MJS/CJS), Python, Go, Rust, Java, Kotlin, Swift, C, C++, C#

Any language with a VS Code language server that supports `DocumentSymbol`, `References`, and `CallHierarchy` will work.

## Getting started

1. Clone the repo and install dependencies:
   ```
   git clone <repo-url> && cd graphide
   npm install
   ```

2. Build and launch:
   ```
   npm run build
   ```
   Then press **F5** in VS Code to open the Extension Development Host.

3. The graph opens automatically when a supported workspace is detected. You can also open it manually:
   **Cmd+Shift+P → "Graph IDE: Open Graph"**

## Commands

| Command | What it does |
|---------|-------------|
| Graph IDE: Open Graph | Open the 3D graph panel |
| Graph IDE: Re-index Workspace | Clear cache and re-index all files |
| Graph IDE: Stop Indexing | Kill the background indexer |
| Graph IDE: Toggle Edge Lines | Hide/show edges (hover still reveals per-node edges) |
| Graph IDE: Toggle Cluster Spheres | Show/hide wireframe spheres grouping files |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `graphIde.crawlConcurrency` | `5` | Files indexed concurrently |
| `graphIde.depthSpacing` | `80` | Z-axis spacing between call depth levels |
| `graphIde.nodeSizeScale` | `1.0` | Scale factor for node size |
| `graphIde.showLines` | `true` | Show edge lines globally |
| `graphIde.showClusters` | `false` | Show cluster wireframe spheres |

## Controls

| Input | Action |
|-------|--------|
| Click + drag | Orbit |
| Pinch | Zoom |
| Right-click + drag | Pan |
| Hover node | Show label, highlight edges |
| Single-click node | Reveal symbol in editor |
| Double-click node | Navigate to symbol |
| Right-click node | Context menu (Go to Definition, Find References, Copy Name) |

## Sidebar

The **Graph IDE** sidebar has three panels:

- **Views** — preset filters (All Symbols, Files & Modules, Functions, Classes & Interfaces, Call Graph)
- **Filters** — toggle visibility by symbol kind and edge type
- **Index Status** — shows indexing progress

## Architecture

```
src/                      Extension host (Node.js)
  extension.ts            Activation, commands, bidirectional sync
  collector/              Two-pass indexer (fast symbols → deep enrichment)
  graph/                  In-memory graph store with patch events
  sidebar/                TreeDataProviders for filters, views, status
  webview/                Panel lifecycle, HTML shell, message routing

webview-src/              Webview (browser, Three.js)
  scene/                  3D rendering, layout, LOD, clusters
  controls/               Mouse interaction, context menu
  main.ts                 Message router
```

The extension host indexes the workspace and maintains the graph. The webview renders it in 3D. They communicate over `postMessage` with a typed message bus (`src/bus/types.ts`).

## Development

```bash
npm run build           # one-shot build (extension + webview)
npm run build:watch     # watch mode
npm run typecheck       # tsc --noEmit
npm run test            # vitest
```
