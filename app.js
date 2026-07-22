// ---- Diagram themes ----
// Each theme is a Mermaid config plus an `exportBg`: the solid colour painted
// behind the diagram when "Transparent" is off. It must match the theme, or a
// dark-theme diagram (light text) would vanish on a white export. `darkPreview`
// tells the canvas to show a dark backdrop so light-ink themes stay visible.
//
// htmlLabels stays false in every theme: Mermaid's default foreignObject labels
// rasterize unreliably onto canvas and clip descenders; native SVG <text> does
// not, and still supports <br/>.
const THEME_BASE = {
  startOnLoad: false,
  securityLevel: 'loose',
  htmlLabels: false,
  flowchart: { htmlLabels: false, useMaxWidth: false }
};

const THEMES = {
  scales: {
    label: 'Scales',
    exportBg: '#FFFFFF',
    darkPreview: false,
    config: {
      theme: 'base',
      themeVariables: {
        background: '#FFFFFF', primaryColor: '#FFFFFF', primaryTextColor: '#0D273D',
        primaryBorderColor: '#3E6985', secondaryColor: '#E7ECF0', tertiaryColor: '#CDD7DF',
        lineColor: '#3E6985', textColor: '#0D273D',
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px'
      }
    }
  },
  classic: {
    label: 'Classic',
    exportBg: '#FFFFFF',
    darkPreview: false,
    config: { theme: 'default', themeVariables: { fontFamily: 'Inter, system-ui, sans-serif' } }
  },
  dark: {
    label: 'Dark',
    exportBg: '#1E1E28',
    darkPreview: true,
    config: { theme: 'dark', darkMode: true, themeVariables: { fontFamily: 'Inter, system-ui, sans-serif' } }
  },
  neutral: {
    label: 'Neutral',
    exportBg: '#FFFFFF',
    darkPreview: false,
    config: { theme: 'neutral', themeVariables: { fontFamily: 'Inter, system-ui, sans-serif' } }
  }
};

const THEME_KEY = 'scales.theme';
let currentTheme = 'scales';

function initMermaid(key) {
  const t = THEMES[key] || THEMES.scales;
  mermaid.initialize(Object.assign({}, THEME_BASE, t.config));
}

// Solid background used for exports (and dark-preview) under the active theme.
function activeExportBg() {
  return (THEMES[currentTheme] || THEMES.scales).exportBg;
}

const codeInput = document.getElementById('code-input');
const preview = document.getElementById('preview');
const zoomWrapper = document.getElementById('zoom-wrapper');
const errorBanner = document.getElementById('error-banner');
const scaleSelect = document.getElementById('scale-select');
const scaleLabel = document.getElementById('scale-label');
const formatSelect = document.getElementById('format-select');
const themeSelect = document.getElementById('theme-select');
const transparentCheckbox = document.getElementById('transparent-bg');
const downloadBtn = document.getElementById('download-btn');
const copyBtn = document.getElementById('copy-btn');
const gutter = document.getElementById('gutter');
const nodeCount = document.getElementById('node-count');

let renderCounter = 0;
// Renders are async, so a slow one must never overwrite a newer result.
// Each call takes a ticket; only the newest ticket may touch the DOM.
let renderTicket = 0;

// When a render fails, Mermaid injects a "Syntax error in text" graphic into a
// temporary div appended to <body> and never removes it — so it piles up on
// screen forever. Sweep away anything it left outside our preview wrapper.
function cleanupMermaidArtifacts() {
  document.querySelectorAll('[id^="dmermaid-diagram-"], svg[id^="mermaid-diagram-"]')
    .forEach((el) => { if (!zoomWrapper.contains(el)) el.remove(); });
}

// `preserveView` keeps the current zoom/pan (used while typing).
async function renderDiagram(code, preserveView) {
  const ticket = ++renderTicket;
  if (!code.trim()) {
    zoomWrapper.innerHTML = '';
    errorBanner.style.display = 'none';
    return;
  }
  const id = `mermaid-diagram-${renderCounter++}`;
  try {
    const { svg } = await mermaid.render(id, code);
    cleanupMermaidArtifacts();
    if (ticket !== renderTicket) return; // a newer keystroke already won
    zoomWrapper.innerHTML = svg;
    errorBanner.style.display = 'none';
    const svgEl = zoomWrapper.querySelector('svg');
    if (svgEl) {
      Interactions.attach(svgEl, code);
      PanZoom.refresh(preserveView);
    }
    updateStatus();
  } catch (err) {
    cleanupMermaidArtifacts();
    if (ticket !== renderTicket) return;
    // Keep the last good diagram on screen; just surface the parse error.
    errorBanner.innerHTML = '<b>Error</b>';
    errorBanner.append(err.message || String(err));
    errorBanner.style.display = 'block';
  }
}

// Line numbers beside the editor, kept in sync with content and scrolling.
function updateGutter() {
  const lines = codeInput.value.split('\n').length;
  let s = '';
  for (let i = 1; i <= lines; i++) s += i + '\n';
  gutter.textContent = s;
  gutter.scrollTop = codeInput.scrollTop;
}
codeInput.addEventListener('scroll', () => { gutter.scrollTop = codeInput.scrollTop; });

function updateStatus() {
  const svg = zoomWrapper.querySelector('svg');
  const n = svg ? svg.querySelectorAll('g.node').length : 0;
  nodeCount.textContent = n ? `${n} nodes` : '';
}

// Re-render helper used by the interactive code edits (shape swap, arrow color).
function reRender() { renderDiagram(codeInput.value, true); }

// ---- Auto-save ----
// Kept in localStorage so an accidental refresh doesn't destroy someone's work.
// This is local to the browser only — nothing is ever transmitted anywhere.
// Every access is guarded: localStorage throws in private mode and when the
// quota is exceeded, and losing auto-save must never break the editor.
const STORAGE_KEY = 'scales.diagram';

function saveCode() {
  try { localStorage.setItem(STORAGE_KEY, codeInput.value); } catch (e) { /* not fatal */ }
}
function loadSavedCode() {
  try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
}
function clearSavedCode() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* not fatal */ }
}

// Writing on every keystroke is wasteful; a short debounce is plenty to
// survive a refresh. The same debounce upserts the diagram into history.
let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveCode(); snapshotToHistory(); }, 300);
}

// ---- Diagram history ----
// A short list of recent diagrams, in localStorage (never transmitted). Each
// diagram the user works on is ONE entry, identified by currentEntryId and
// updated live as they type — so history holds distinct diagrams, not one row
// per keystroke. "New Diagram" starts a fresh entry; the old one stays.
const HISTORY_KEY = 'scales.history';
const HISTORY_MAX = 12;
let currentEntryId = null;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
}
function persistHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* not fatal */ }
}
function newEntryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function snapshotToHistory() {
  const code = codeInput.value;
  if (!code.trim()) return;
  if (!currentEntryId) currentEntryId = newEntryId();
  let list = loadHistory()
    .filter((e) => e.id !== currentEntryId && e.code !== code); // drop old self + exact twins
  list.unshift({ id: currentEntryId, code, ts: Date.now() });
  if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
  persistHistory(list);
  renderHistory();
}

function loadHistoryEntry(id) {
  const entry = loadHistory().find((e) => e.id === id);
  if (!entry) return;
  if (currentEntryId) snapshotToHistory(); // keep the outgoing diagram
  currentEntryId = entry.id;                // continue editing this one
  codeInput.value = entry.code;
  updateGutter();
  saveCode();
  renderDiagram(entry.code);
  renderHistory();
}

function deleteHistoryEntry(id) {
  persistHistory(loadHistory().filter((e) => e.id !== id));
  if (id === currentEntryId) currentEntryId = null;
  renderHistory();
}

function relativeTime(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}

// A readable label for a history entry. The first line is usually the diagram
// type declaration ("flowchart TD", "graph TB", "sequenceDiagram"), which is
// identical across most diagrams — so prefer the first line of actual content.
const DECL_RE = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|gitGraph|journey|mindmap|timeline|quadrantChart|%%)/i;
function firstLine(code) {
  const lines = code.split('\n').map((l) => l.trim()).filter((l) => l);
  const line = lines.find((l) => !DECL_RE.test(l)) || lines[0] || 'Untitled';
  return line.length > 30 ? line.slice(0, 29) + '…' : line;
}

const historyList = document.getElementById('history-list');

function renderHistory() {
  if (!historyList) return;
  const list = loadHistory();
  historyList.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'hist-empty';
    empty.textContent = 'No recent diagrams yet';
    historyList.appendChild(empty);
    return;
  }
  for (const e of list) {
    const item = document.createElement('div');
    item.className = 'hist-item' + (e.id === currentEntryId ? ' active' : '');
    item.title = 'Open this diagram';

    const open = document.createElement('button');
    open.className = 'hist-open';
    open.innerHTML =
      `<span class="hist-title"></span><span class="hist-time"></span>`;
    open.querySelector('.hist-title').textContent = firstLine(e.code);
    open.querySelector('.hist-time').textContent = relativeTime(e.ts);
    open.addEventListener('click', () => loadHistoryEntry(e.id));

    const del = document.createElement('button');
    del.className = 'hist-del';
    del.title = 'Remove from history';
    del.textContent = '×';
    del.addEventListener('click', (ev) => { ev.stopPropagation(); deleteHistoryEntry(e.id); });

    item.appendChild(open);
    item.appendChild(del);
    historyList.appendChild(item);
  }
}

const clearHistoryBtn = document.getElementById('clear-history');
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    persistHistory([]);
    currentEntryId = null;
    renderHistory();
    Interactions.toast('History cleared');
  });
}

// Live: render on every keystroke, keeping the user's zoom/pan.
codeInput.addEventListener('input', () => {
  updateGutter();
  scheduleSave();
  renderDiagram(codeInput.value, true);
});

// A pending debounce would be lost if the tab closes first.
window.addEventListener('beforeunload', saveCode);

// Clearing is destructive, so it is offered back as an undo rather than
// guarded behind a confirm dialog.
document.getElementById('new-diagram').addEventListener('click', () => {
  const previous = codeInput.value;
  const previousId = currentEntryId;
  if (previous.trim()) snapshotToHistory(); // finalise the outgoing diagram
  currentEntryId = null;                    // next edits start a fresh entry
  codeInput.value = '';
  updateGutter();
  saveCode();
  renderDiagram('');
  updateStatus();
  codeInput.focus();

  if (previous.trim()) {
    Interactions.toast('Diagram cleared', 'Undo', () => {
      currentEntryId = previousId;
      codeInput.value = previous;
      updateGutter();
      saveCode();
      renderDiagram(previous);
    });
  }
});

document.getElementById('copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeInput.value);
    Interactions.toast('Code copied');
  } catch (err) {
    Interactions.toast('Copy failed');
  }
});

function svgToDataUrl(svgEl) {
  const serialized = new XMLSerializer().serializeToString(svgEl);
  const encoded = encodeURIComponent(serialized)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

// Build a clean copy of the diagram for export.
// The live SVG carries inline width/height from the zoom controls, so the clone
// is restored to its natural viewBox size — on-screen zoom can never affect
// what gets exported. `embedBg` paints a white rect into the SVG itself, which
// is how an SVG file gets a background (a canvas fill is used for PNG instead).
function buildExportSvg(embedBg) {
  const live = preview.querySelector('svg');
  if (!live) {
    errorBanner.textContent = 'Nothing to export yet — paste some Mermaid code first.';
    errorBanner.style.display = 'block';
    return null;
  }
  const bv = live.viewBox && live.viewBox.baseVal && live.viewBox.baseVal.width
    ? live.viewBox.baseVal
    : null;
  const rect = live.getBoundingClientRect();
  // Mermaid viewBoxes commonly start negative (e.g. "-8 -8 66 134"), so the
  // background rect must honour the viewBox origin, not assume 0,0.
  const raw = bv
    ? { x: bv.x, y: bv.y, width: bv.width, height: bv.height }
    : { x: 0, y: 0, width: rect.width, height: rect.height };

  // Mermaid sizes its viewBox to geometry centres, so thick strokes and
  // arrowheads sitting on the boundary get shaved off. Breathing room fixes it.
  const PAD = 12;
  const vb = {
    x: raw.x - PAD,
    y: raw.y - PAD,
    width: raw.width + PAD * 2,
    height: raw.height + PAD * 2
  };

  const clone = live.cloneNode(true);
  clone.style.width = '';
  clone.style.height = '';
  clone.style.maxWidth = 'none';
  clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
  clone.setAttribute('width', vb.width);
  clone.setAttribute('height', vb.height);

  if (embedBg) {
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', vb.x);
    bg.setAttribute('y', vb.y);
    bg.setAttribute('width', vb.width);
    bg.setAttribute('height', vb.height);
    bg.setAttribute('fill', activeExportBg());
    clone.insertBefore(bg, clone.firstChild);
  }
  return { clone, vb };
}

// Rasterize the diagram to a PNG canvas at the chosen scale.
async function renderCanvas() {
  const built = buildExportSvg(false); // PNG fills the canvas instead
  if (!built) return null;
  const { clone, vb } = built;

  const exportScale = Number(scaleSelect.value);
  const transparent = transparentCheckbox.checked;

  const width = Math.ceil(vb.width * exportScale);
  const height = Math.ceil(vb.height * exportScale);

  const img = new Image();
  img.src = svgToDataUrl(clone);
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!transparent) { ctx.fillStyle = activeExportBg(); ctx.fillRect(0, 0, width, height); }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function triggerDownload(href, filename, revoke) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function exportToPng() {
  const canvas = await renderCanvas();
  if (!canvas) return;
  triggerDownload(canvas.toDataURL('image/png'), 'diagram.png', false);
}

// SVG is already vector, so the scale multiplier does not apply. Transparency
// is achieved by simply not embedding the white background rect.
function exportToSvg() {
  const built = buildExportSvg(!transparentCheckbox.checked);
  if (!built) return;
  const markup = new XMLSerializer().serializeToString(built.clone);
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(URL.createObjectURL(blob), 'diagram.svg', true);
}

async function copyToClipboard() {
  // SVG has no reliable image/svg+xml clipboard support across browsers,
  // so it is copied as markup text instead.
  if (formatSelect.value === 'svg') {
    const built = buildExportSvg(!transparentCheckbox.checked);
    if (!built) return;
    const markup = new XMLSerializer().serializeToString(built.clone);
    try {
      await navigator.clipboard.writeText(markup);
      Interactions.toast('SVG markup copied to clipboard.');
    } catch (err) {
      Interactions.toast('Copy failed — use Download instead.');
    }
    return;
  }

  const canvas = await renderCanvas();
  if (!canvas) return;
  if (!navigator.clipboard || !window.ClipboardItem) {
    Interactions.toast('Clipboard not supported here — use Download instead.');
    return;
  }
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    Interactions.toast('PNG copied to clipboard.');
  } catch (err) {
    Interactions.toast('Copy failed — use Download instead.');
  }
}

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

// Keep the toolbar honest about which options apply to the chosen format.
function syncFormatUI() {
  const isSvg = formatSelect.value === 'svg';
  downloadBtn.textContent = isSvg ? 'Download SVG' : 'Download PNG';
  downloadBtn.title = `Download ${isSvg ? 'SVG' : 'PNG'}  (${MOD}+S)`;
  scaleLabel.classList.toggle('disabled', isSvg);
  scaleLabel.title = isSvg ? 'Scale applies to PNG only — SVG is vector' : '';
}

formatSelect.addEventListener('change', syncFormatUI);

// ---- Theme ----
// Re-initialises Mermaid with the chosen theme, updates the canvas backdrop so
// light-ink themes stay visible, re-renders, and remembers the choice.
function applyTheme(key, opts) {
  if (!THEMES[key]) key = 'scales';
  currentTheme = key;
  initMermaid(key);
  preview.classList.toggle('dark', THEMES[key].darkPreview);
  if (themeSelect) themeSelect.value = key;
  try { localStorage.setItem(THEME_KEY, key); } catch (e) { /* not fatal */ }
  if (!opts || opts.rerender !== false) renderDiagram(codeInput.value, true);
}

if (themeSelect) themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

downloadBtn.addEventListener('click', () => {
  const run = formatSelect.value === 'svg'
    ? Promise.resolve().then(exportToSvg)
    : exportToPng();
  Promise.resolve(run).catch(err => {
    errorBanner.textContent = `Export failed: ${err.message || err}`;
    errorBanner.style.display = 'block';
  });
});
copyBtn.addEventListener('click', () => copyToClipboard());

// ---- Keyboard shortcuts ----
// Only Ctrl/Cmd combos are used, so they fire reliably even while the code
// editor (a textarea) has focus, and don't clash with normal typing.
//   Ctrl/Cmd + S  →  download in the current format (overrides browser Save)
//   Ctrl/Cmd + 0  →  fit the diagram to the view
window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const key = e.key.toLowerCase();

  if (key === 's') {
    e.preventDefault();
    downloadBtn.click();
  } else if (key === '0') {
    e.preventDefault();
    PanZoom.fit();
  }
});

// Advertise the fit shortcut on its button tooltip.
document.getElementById('reset-view').title = `Fit to view  (${MOD}+0)`;

// Keep the diagram fitted when the window resizes.
window.addEventListener('resize', () => PanZoom.fit());

Interactions.init({ codeInput, onCodeChange: reRender });
PanZoom.init();
syncFormatUI();

// Restore the saved theme (initialises Mermaid) without an extra render — the
// render at the end of load handles it.
let savedTheme = 'scales';
try { savedTheme = localStorage.getItem(THEME_KEY) || 'scales'; } catch (e) { /* ignore */ }
applyTheme(savedTheme, { rerender: false });

// Restore the last session's work. An empty saved value is ignored so a
// cleared editor doesn't override the starter diagram on a fresh visit.
const restored = loadSavedCode();
if (restored && restored.trim()) codeInput.value = restored;

// If the restored diagram matches the newest history entry, keep editing that
// entry instead of spawning a duplicate on the next keystroke.
const topHistory = loadHistory()[0];
if (restored && topHistory && topHistory.code === restored) currentEntryId = topHistory.id;

renderHistory();
updateGutter();
renderDiagram(codeInput.value);
