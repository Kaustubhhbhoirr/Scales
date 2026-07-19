// Themed to match the paper/ink palette — Mermaid's stock theme renders nodes
// in lavender, which fights the warm editorial look.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  // Mermaid defaults to HTML labels inside <foreignObject>. Browsers rasterize
  // foreignObject content unreliably when an SVG is drawn onto a canvas —
  // descenders get clipped or the text vanishes entirely. Native SVG <text>
  // exports correctly everywhere, and still supports <br/> line breaks.
  htmlLabels: false,
  flowchart: { htmlLabels: false, useMaxWidth: false },
  theme: 'base',
  themeVariables: {
    background: '#FFFFFF',
    primaryColor: '#FBF9F5',
    primaryTextColor: '#1A1A1A',
    primaryBorderColor: '#C4552D',
    secondaryColor: '#F5F1EA',
    tertiaryColor: '#F1ECE4',
    lineColor: '#8A8177',
    textColor: '#1A1A1A',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px'
  }
});

const codeInput = document.getElementById('code-input');
const preview = document.getElementById('preview');
const zoomWrapper = document.getElementById('zoom-wrapper');
const errorBanner = document.getElementById('error-banner');
const scaleSelect = document.getElementById('scale-select');
const scaleLabel = document.getElementById('scale-label');
const formatSelect = document.getElementById('format-select');
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

// Live: render on every keystroke, keeping the user's zoom/pan.
codeInput.addEventListener('input', () => {
  updateGutter();
  renderDiagram(codeInput.value, true);
});

document.getElementById('new-diagram').addEventListener('click', () => {
  codeInput.value = '';
  updateGutter();
  renderDiagram('');
  updateStatus();
  codeInput.focus();
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
    bg.setAttribute('fill', '#ffffff');
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
  if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
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

// Keep the toolbar honest about which options apply to the chosen format.
function syncFormatUI() {
  const isSvg = formatSelect.value === 'svg';
  downloadBtn.textContent = isSvg ? 'Download SVG' : 'Download PNG';
  scaleLabel.classList.toggle('disabled', isSvg);
  scaleLabel.title = isSvg ? 'Scale applies to PNG only — SVG is vector' : '';
}

formatSelect.addEventListener('change', syncFormatUI);

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

// Keep the diagram fitted when the window resizes.
window.addEventListener('resize', () => PanZoom.fit());

Interactions.init({ codeInput, onCodeChange: reRender });
PanZoom.init();
syncFormatUI();
updateGutter();

renderDiagram(codeInput.value);
