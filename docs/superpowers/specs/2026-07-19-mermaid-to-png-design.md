# Mermaid → PNG (v1) Design

## Purpose
Let a user paste Mermaid diagram code and instantly download a high-quality PNG image, with zero cost, no signup, and no backend.

## Scope (v1)
In scope:
- Paste Mermaid code, live preview render
- Export rendered diagram to PNG at selectable resolution (1x/2x/4x)
- Toggle background: white or transparent
- Inline error message on invalid Mermaid syntax
- A few example diagrams (flowchart, sequence) to load with one click

Out of scope (deferred to a future v2 project):
- Visual point-and-click editing of arrows/nodes (color, style, direction, dragging)
- Public hosting/deployment
- Accounts, saving/sharing diagrams, history

## Architecture
Single static page, no backend, no build step required.

- `index.html` — page layout and structure: textarea (code input) on one side, live preview pane on the other, controls row (scale buttons, background toggle, download button), example-loader buttons.
- `mermaid.js` (via CDN `<script>` tag) — parses the textarea content and renders it to inline SVG inside the preview pane.
- `app.js` — small script handling:
  - Debounced re-render on textarea input (~400ms) so typing doesn't lag
  - Catching Mermaid render errors and displaying them inline near the textarea instead of leaving a blank preview
  - Export flow (see below)
  - Wiring up example-loader buttons to prefill the textarea

## Export Flow
1. Take the current rendered SVG element from the preview pane.
2. Read its natural width/height, multiply by the selected scale (1x/2x/4x).
3. Draw the SVG onto an off-screen `<canvas>` sized to the scaled dimensions (via an `Image` loaded from an SVG data URL, or `canvg`-style approach using native `drawImage`).
4. If "white background" is selected, fill the canvas with white before drawing the diagram; if "transparent" is selected, skip the fill.
5. Convert the canvas to a PNG via `canvas.toDataURL('image/png')`.
6. Trigger a download using a temporary `<a download="diagram.png">` link.

## Error Handling
- Invalid Mermaid syntax: catch the exception from Mermaid's render call, show the error message in a small inline banner above/below the preview pane. Do not clear the last valid preview if one exists.
- Empty textarea: show a neutral placeholder/prompt instead of attempting to render.

## Testing
Manual verification (no backend, so no unit test infra needed for v1):
- Paste each example diagram and confirm it renders correctly
- Export at 1x, 2x, 4x and confirm resulting PNG dimensions scale accordingly and look sharp
- Toggle background and confirm transparent vs white output
- Paste intentionally broken Mermaid code and confirm the inline error appears without breaking the page
- Confirm the page works when opened directly as a local file (`file://`) as well as via a simple local server

## Deployment
None for v1 — static files only, run locally (double-click `index.html` or serve via a lightweight local server for testing). Public hosting is a future decision, not part of this spec.
