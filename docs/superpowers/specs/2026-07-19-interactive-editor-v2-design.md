# Mermaid → PNG v2: Interactive Editor Design

## Purpose
Extend the v1 export tool so users who paste AI-generated Mermaid code (and may not know the language) can visually explore and lightly edit the diagram: find where things are in the code, swap flowchart node shapes without writing syntax, color arrows, zoom/pan to frame parts, and export cleanly — still zero cost, no signup, client-side only.

## Scope (v2)
In scope:
- Click-to-code navigation for ALL diagram types (click a rendered element → highlight it → "Jump to code" scrolls + highlights the matching textarea line)
- Shape swapping for flowchart nodes (click node → popup shape menu → auto-rewrite that node's bracket syntax in the code)
- Arrow color control for flowcharts (click an edge → color picker → auto-insert/update `linkStyle`)
- Zoom & pan of the preview (mouse wheel zoom, drag to pan, "Reset view" button); export always captures the full diagram at full quality regardless of current zoom
- Layout: narrower/compact code panel so the diagram gets more room
- Transparency visibility: checkerboard behind preview so transparent exports are visibly transparent
- "Copy PNG to clipboard" button (in addition to download)

Out of scope (future):
- Dragging nodes to reposition them
- Shape swapping for non-flowchart diagram types (their Mermaid syntax has no interchangeable shapes — they get click-highlight-and-jump only)
- Editing node label text via the visual layer (still done in the textarea)
- Accounts, saving, sharing, hosting

## Honest Constraints
- Node "shapes" are a flowchart-only concept in Mermaid. Sequence/class/ER/state/etc. do not support swappable shapes, so shape editing is gated to `flowchart`/`graph` diagrams. For all other types, clicking an element still highlights it and jumps to the code line, but shows no shape menu.
- Code rewriting is text-based (regex on the node's id in the textarea). It targets the common single-line node-definition form produced by typical AI output. If a node id cannot be uniquely located, the tool shows a message rather than corrupting the code.

## Architecture
Static page, no backend, no build step. Files:

- `index.html` — layout and controls. Adds: checkerboard preview background, compact code panel, zoom/pan controls (Reset view, zoom indicator), Copy-to-clipboard button, a floating context popup container for shape/arrow actions.
- `app.js` — orchestration + existing render/export (kept from v1, export unchanged in output).
- `interactions.js` — new module for v2 interactive behavior:
  - `attachNodeHandlers(svgEl, diagramType)` — wires click handlers onto rendered nodes/edges.
  - `findNodeIdFromElement(el)` — derives the Mermaid node id from a clicked SVG element (reads element id / class, e.g. `flowchart-A-0` → `A`).
  - `jumpToCode(nodeId)` — finds the first line in the textarea mentioning `nodeId`, scrolls it into view, and highlights it (temporary selection/background).
  - `rewriteNodeShape(nodeId, shapeKey)` — replaces the clicked node's bracket delimiters in the textarea text with the chosen shape's delimiters, then re-renders.
  - `setLinkColor(edgeIndex, color)` — appends/updates a `linkStyle <index> stroke:<color>` line, then re-renders.
- `panzoom.js` — new small module providing wheel-zoom and drag-pan on the preview container via a CSS transform on an inner wrapper. Exposes `resetView()`. Does NOT alter the SVG itself (so export stays full-resolution and unaffected).

## Data Flow
1. `renderDiagram(code)` renders SVG into `#preview` (unchanged from v1).
2. After each successful render, `app.js` calls `attachNodeHandlers(svgEl, diagramType)` and `panzoom` re-initializes on the fresh SVG wrapper.
3. Clicking an element → `findNodeIdFromElement` → show context popup:
   - Always: "Jump to code" (calls `jumpToCode`).
   - If flowchart node: shape options → `rewriteNodeShape`.
   - If flowchart edge: color picker → `setLinkColor`.
4. Any code rewrite updates the textarea value and calls `renderDiagram` again (which re-attaches handlers).
5. Export/copy read the current `#preview svg` at full natural size × scale — zoom/pan transform is on a wrapper, not the SVG, so output is unaffected.

## Shape Mapping (flowchart)
Map a shape key to its delimiter pair, replacing whatever currently wraps the node label:
- rectangle: `[` `]`
- rounded: `(` `)`
- stadium: `([` `])`
- subroutine: `[[` `]]`
- database/cylinder: `[(` `)]`
- circle: `((` `))`
- diamond/decision: `{` `}`
- hexagon: `{{` `}}`
- parallelogram: `[/` `/]`

Rewrite strategy: locate `<nodeId><openDelim>...<closeDelim>` in the code (first occurrence where the node is defined), capture the inner label text, and re-emit `<nodeId><newOpen><label><newClose>`.

## Error Handling
- Node id not found in code (e.g. it was defined via an unusual multi-line form): show a small non-blocking message ("Couldn't locate this node in the code — edit it manually") and do not modify the code.
- Clipboard copy unsupported/blocked: fall back to a message telling the user to use Download instead.
- Invalid Mermaid after a rewrite (should be rare): the existing error banner shows the parse error; last valid preview handling stays as v1.
- Panzoom must never throw if the SVG is missing (empty/error state) — guard on element presence.

## Testing
Manual verification in a real browser (double-click `index.html`), covering:
- All diagram types still render and export (regression on v1).
- Transparent export: checkerboard visible in preview; exported PNG corner pixel has alpha 0.
- Click a flowchart node → shape menu changes shape and code updates correctly for each shape key.
- Click a node in a non-flowchart diagram → only "Jump to code" appears, and it highlights the right line.
- Jump-to-code scrolls/highlights the correct textarea line.
- Arrow color: click edge, pick color, `linkStyle` line appears and edge recolors.
- Zoom/pan: wheel zooms, drag pans, Reset view restores; export still produces the full diagram unaffected by current zoom.
- Copy to clipboard: image pastes into an external app.
- Node-not-found path: shows the message, code untouched.

## Deployment
None — static files, run locally. Public hosting remains a future decision.
