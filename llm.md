# Graph IDE — LLM Context

VS Code extension: live 3D graph of code symbols driven by LSP. Three.js webview + Node.js extension host.

## Key constraint

The user manages multiple git identities. Never run `git commit`, `git push`, or `git tag` without explicit permission.

## Project layout

```
src/                          Extension host (runs in Node.js)
  extension.ts                Entry point. Registers commands, wires collector → graph → panel.
  bus/types.ts                All shared types. Message unions: HostToWebviewMessage, WebviewToHostMessage.
  collector/index.ts          Background indexer. Two-pass: fast (symbols only) then deep (refs + call hierarchy).
  collector/symbols.ts        Calls vscode.executeDocumentSymbolProvider.
  collector/references.ts     Calls vscode.executeReferenceProvider. Enriches nodes with referenceCount.
  collector/callHierarchy.ts  Calls prepareCallHierarchy + incomingCalls. Produces call/extends/implements edges.
  collector/cache.ts          Keyed by uri+mtime+deep. Avoids re-indexing unchanged files.
  graph/index.ts              GraphStore: Map<id, GraphNode>, edges array, patch event emitter.
  sidebar/provider.ts         TreeDataProviders: FiltersProvider, ViewsProvider, StatusProvider.
  webview/panel.ts            WebviewPanel lifecycle. Routes messages. node.hover → showTextDocument(preserveFocus).
  webview/html.ts             HTML shell with VS Code CSS variable theming.

webview-src/                  Webview (runs in browser iframe)
  main.ts                     Message router: HostToWebviewMessage → GraphScene methods.
  scene/index.ts              GraphScene: Three.js setup, dirty-render loop, debounced layout rebuild.
  scene/nodes.ts              NodeManager: upsert/clear/syncPositions/applyVisibility/pulse/getMesh.
  scene/edges.ts              EdgeManager: upsert/updatePositions/highlightEdgesFor/setLinesVisible.
  scene/layout.ts             LayoutEngine: d3-force-3d with forceZ for depth layering. Manual tick control.
  scene/lod.ts                LodManager: opacity fading by camera distance, min opacity floors.
  scene/clusters.ts           ClusterManager: wireframe spheres per moduleId. Off by default.
  controls/interaction.ts     Raycaster hover, click (drag-safe), dblclick, right-click context menu.
```

## Data flow

1. Collector indexes workspace files → produces GraphNode[] and GraphEdge[]
2. GraphStore receives patches → emits onPatch events
3. GraphPanel forwards patches to webview via postMessage
4. Webview main.ts routes to GraphScene which updates NodeManager/EdgeManager
5. LayoutEngine (d3-force-3d) positions nodes → synced back to meshes each tick
6. Dirty-render flag gates GPU work — only renders when something changed

## Types (bus/types.ts)

```
GraphNode { id, label, kind (SymbolKind), uri, range, referenceCount, depth, moduleId }
GraphEdge { source, target, kind: 'import'|'call'|'implements'|'extends'|'references' }
FilterState { kinds: {function,class,interface,type,variable,enum}, edges: {call,import,extends,implements}, hideUnused, minDepth, maxDepth }
```

Node IDs are `uri::name::line` format — splitting on `::` is unsafe (IDs contain multiple `::` segments). Use `userData.source`/`userData.target` on edge meshes.

## Performance patterns

- Crawl concurrency capped at 2 (configurable) with 60ms delay between files to avoid starving tsserver
- Background crawl is symbols-only (no LSP enrichment); deep pass only for open/saved files
- Layout rebuild debounced 400ms to batch rapid indexing patches
- Layout ticks throttled to ~30fps (33ms interval)
- Dirty-render flag: renderer.render() only called when renderDirty=true
- LOD fades nodes/edges by distance but never hides them (MIN_NODE_OPACITY=0.12)

## Excluded paths

`node_modules, dist, build, out, .git, vendor, .cache, pkg/mod` — both in findFiles glob and path-segment check for onDidOpen events.

## Commands

graphIde.openGraph, graphIde.reindex, graphIde.stopIndexing, graphIde.applyView, graphIde.toggleClusters, graphIde.toggleLines

## Settings (graphIde.*)

crawlConcurrency (5), depthSpacing (80), nodeSizeScale (1.0), showClusters (false), showLines (true)

## Build

```bash
npm run build        # esbuild: extension.js + webview.js → dist/
npm run typecheck    # tsc --noEmit
```

Two esbuild entry points: `src/extension.ts` (node, cjs) and `webview-src/main.ts` (browser, iife).

## Supported languages

TS, TSX, JS, JSX, MJS, CJS, Python, Go, Rust, Java, Kotlin, Swift, C, C++, C#
