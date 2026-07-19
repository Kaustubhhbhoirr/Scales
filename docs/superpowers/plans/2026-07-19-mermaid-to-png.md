# Mermaid → PNG (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single static HTML page where a user pastes Mermaid code, sees a live preview, and downloads a high-resolution PNG — no backend, no signup, zero cost.

**Architecture:** One HTML page (`index.html`) loads Mermaid.js from a CDN and a small app script (`app.js`). `app.js` renders textarea input to SVG via Mermaid, then exports that SVG to PNG by drawing it onto a scaled `<canvas>` and triggering a download.

**Tech Stack:** Plain HTML/CSS/JavaScript, Mermaid.js (CDN `<script>` tag), Canvas API. No build step, no package manager, no server required.

## Global Constraints

- No backend/server code — everything must run client-side in the browser.
- No signup/account/auth of any kind.
- Must work opened directly as a local file (`file://...\index.html`).
- No external cost — Mermaid.js loaded from a free CDN only.
- Background must support both white-fill and transparent PNG export.
- Scale options are exactly 1x / 2x / 4x (per spec — no arbitrary pixel input in v1).

---

### Task 1: Page skeleton and Mermaid live preview

**Files:**
- Create: `index.html`
- Create: `app.js`

**Interfaces:**
- Produces: `renderDiagram(code: string): Promise<void>` in `app.js` — renders Mermaid `code` into the `#preview` div, or shows an error in `#error-banner` on failure. Later tasks (export) read the resulting `<svg>` from `#preview`.

- [ ] **Step 1: Create `index.html` with the page layout**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Mermaid to PNG</title>
<style>
  body { font-family: sans-serif; margin: 0; display: flex; height: 100vh; }
  .pane { flex: 1; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; }
  textarea { flex: 1; font-family: monospace; font-size: 14px; resize: none; }
  #preview-pane { border-left: 1px solid #ccc; overflow: auto; align-items: center; justify-content: center; }
  #preview { max-width: 100%; }
  #error-banner { color: #b00020; background: #fdecea; padding: 8px; margin-bottom: 8px; display: none; white-space: pre-wrap; }
  .controls { display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
  button { padding: 6px 12px; cursor: pointer; }
</style>
</head>
<body>
  <div class="pane">
    <div class="controls">
      <button id="example-flowchart">Load Flowchart Example</button>
      <button id="example-sequence">Load Sequence Example</button>
    </div>
    <textarea id="code-input" placeholder="Paste your Mermaid code here...">flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Ship it]
    B -->|No| D[Debug]
    D --> B</textarea>
  </div>
  <div class="pane" id="preview-pane">
    <div id="error-banner"></div>
    <div id="preview"></div>
    <div class="controls">
      <label>Scale:
        <select id="scale-select">
          <option value="1">1x</option>
          <option value="2" selected>2x</option>
          <option value="4">4x</option>
        </select>
      </label>
      <label><input type="checkbox" id="transparent-bg"> Transparent background</label>
      <button id="download-btn">Download PNG</button>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `app.js` with Mermaid initialization and `renderDiagram`**

```javascript
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const codeInput = document.getElementById('code-input');
const preview = document.getElementById('preview');
const errorBanner = document.getElementById('error-banner');

let renderCounter = 0;

async function renderDiagram(code) {
  if (!code.trim()) {
    preview.innerHTML = '';
    errorBanner.style.display = 'none';
    return;
  }
  const id = `mermaid-diagram-${renderCounter++}`;
  try {
    const { svg } = await mermaid.render(id, code);
    preview.innerHTML = svg;
    errorBanner.style.display = 'none';
  } catch (err) {
    errorBanner.textContent = err.message || String(err);
    errorBanner.style.display = 'block';
  }
}

let debounceTimer;
codeInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => renderDiagram(codeInput.value), 400);
});

renderDiagram(codeInput.value);
```

- [ ] **Step 3: Manually verify live preview**

Open `index.html` directly in a browser (double-click the file, or navigate to `file:///C:/Users/Kaustubh Bhoir/Documents/mermiad2png/index.html`).
Expected: the default flowchart renders in the right pane within ~1 second of the page loading.

Edit the textarea to add a broken line (e.g. `A --> `) and stop typing.
Expected: after ~400ms, the error banner appears with a Mermaid parse error message, and the last valid diagram stays visible underneath it disappearing is acceptable only if Mermaid clears the DOM node itself — banner text must be present either way.

Clear the textarea entirely.
Expected: preview area is blank, no error banner shown.

---

### Task 2: Example loader buttons

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `renderDiagram(code: string)` from Task 1.
- Produces: none consumed by later tasks (buttons are a leaf feature).

- [ ] **Step 1: Add example snippet constants and button wiring to `app.js`**

```javascript
const EXAMPLES = {
  flowchart: `flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Ship it]
    B -->|No| D[Debug]
    D --> B`,
  sequence: `sequenceDiagram
    participant User
    participant Browser
    participant Mermaid
    User->>Browser: Paste code
    Browser->>Mermaid: Render request
    Mermaid-->>Browser: SVG diagram
    Browser-->>User: Show preview`
};

document.getElementById('example-flowchart').addEventListener('click', () => {
  codeInput.value = EXAMPLES.flowchart;
  renderDiagram(codeInput.value);
});

document.getElementById('example-sequence').addEventListener('click', () => {
  codeInput.value = EXAMPLES.sequence;
  renderDiagram(codeInput.value);
});
```

- [ ] **Step 2: Manually verify example buttons**

Reload `index.html` in the browser. Click "Load Sequence Example".
Expected: textarea content replaces with the sequence diagram code, and the preview pane updates to show the rendered sequence diagram immediately (no need to wait for debounce since we call `renderDiagram` directly).

Click "Load Flowchart Example".
Expected: textarea and preview revert to the flowchart example.

---

### Task 3: PNG export (scale + background)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: the rendered `<svg>` element living inside `#preview` (produced by `renderDiagram` in Task 1); `#scale-select` and `#transparent-bg` controls from `index.html` (Task 1).
- Produces: `exportToPng(): Promise<void>` — reads current preview SVG, current scale/background controls, and triggers a PNG file download named `diagram.png`.

- [ ] **Step 1: Add `exportToPng` to `app.js`**

```javascript
const scaleSelect = document.getElementById('scale-select');
const transparentCheckbox = document.getElementById('transparent-bg');
const downloadBtn = document.getElementById('download-btn');

function svgToDataUrl(svgEl) {
  const serialized = new XMLSerializer().serializeToString(svgEl);
  const encoded = encodeURIComponent(serialized)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

async function exportToPng() {
  const svgEl = preview.querySelector('svg');
  if (!svgEl) {
    errorBanner.textContent = 'Nothing to export yet — render a diagram first.';
    errorBanner.style.display = 'block';
    return;
  }

  const scale = Number(scaleSelect.value);
  const transparent = transparentCheckbox.checked;

  const bbox = svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width
    ? svgEl.viewBox.baseVal
    : svgEl.getBoundingClientRect();
  const width = Math.ceil(bbox.width * scale);
  const height = Math.ceil(bbox.height * scale);

  const img = new Image();
  const dataUrl = svgToDataUrl(svgEl);

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!transparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(img, 0, 0, width, height);

  const pngUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = pngUrl;
  link.download = 'diagram.png';
  link.click();
}

downloadBtn.addEventListener('click', () => {
  exportToPng().catch(err => {
    errorBanner.textContent = `Export failed: ${err.message || err}`;
    errorBanner.style.display = 'block';
  });
});
```

- [ ] **Step 2: Manually verify export at each scale**

Reload `index.html`. With the default flowchart showing, set scale to "1x", uncheck transparent, click "Download PNG".
Expected: a `diagram.png` file downloads. Open it — white background, dimensions roughly matching the on-screen SVG size.

Repeat with scale "4x".
Expected: downloaded PNG is ~4x the width/height of the 1x version, and looks sharp (not blurry) when zoomed in.

- [ ] **Step 3: Manually verify transparent background**

Check "Transparent background", click "Download PNG".
Expected: downloaded `diagram.png` has no white fill — opening it over a colored background (e.g. dragging into an image editor or browser tab with a dark background) shows the diagram lines/text with no white box behind them.

- [ ] **Step 4: Manually verify export error path**

Clear the textarea completely (no diagram rendered), click "Download PNG".
Expected: error banner shows "Nothing to export yet — render a diagram first." and no file downloads.

---

### Task 4: Final end-to-end pass

**Files:**
- None (verification only)

- [ ] **Step 1: Full manual walkthrough**

Open `index.html` fresh. Perform, in order:
1. Confirm default flowchart renders on load.
2. Click both example buttons, confirm each renders correctly.
3. Paste a deliberately broken snippet (e.g. `flowchart TD\nA -->`), confirm inline error appears without crashing the page.
4. Fix the snippet, confirm preview recovers.
5. Export at 1x/2x/4x with white background — confirm three PNGs of increasing size.
6. Export with transparent background — confirm no white fill.

Expected: all six checks pass with no console errors (open browser DevTools console to confirm no red errors during the walkthrough).

- [ ] **Step 2: Note completion**

No commit step — this project has no git repository initialized. If the user later wants version control, that's a separate decision (`git init` + first commit) outside this plan's scope.
