// panzoom.js — wheel-zoom + drag-pan on the preview container.
//
// Zoom resizes the SVG element itself (width/height in px) rather than using
// a CSS transform: scale(). A transform-scaled SVG gets rasterized once at its
// layout size and then stretched, which looks blurry when zoomed in. Resizing
// the element makes the browser re-render the vector at the new size, so it
// stays sharp at any zoom level. The wrapper still uses translate() for pan.

const PanZoom = (() => {
  const container = () => document.getElementById('preview');
  const wrapper = () => document.getElementById('zoom-wrapper');
  const indicator = () => document.getElementById('zoom-indicator');
  const svgEl = () => wrapper().querySelector('svg');

  let scale = 1, tx = 0, ty = 0;
  let baseW = 0, baseH = 0; // natural diagram size, from the SVG viewBox
  const MIN = 0.1, MAX = 10;

  let dragging = false, moved = false, startX = 0, startY = 0, startTx = 0, startTy = 0;

  function apply() {
    const svg = svgEl();
    if (!svg || !baseW) return;
    svg.style.width = (baseW * scale) + 'px';
    svg.style.height = (baseH * scale) + 'px';
    wrapper().style.transform = `translate(${tx}px, ${ty}px)`;
    indicator().textContent = Math.round(scale * 100) + '%';
  }

  // Measure the diagram's natural size and clear Mermaid's own size caps.
  function measure() {
    const svg = svgEl();
    if (!svg) { baseW = baseH = 0; return; }
    const vb = svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width) {
      baseW = vb.width; baseH = vb.height;
    } else {
      const r = svg.getBoundingClientRect();
      baseW = r.width; baseH = r.height;
    }
    svg.style.maxWidth = 'none';
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }

  // Scale the diagram to sit comfortably inside the preview, and centre it.
  function fit() {
    const svg = svgEl();
    if (!svg || !baseW) return;
    const rect = container().getBoundingClientRect();
    const pad = 24;
    const s = Math.min((rect.width - pad * 2) / baseW, (rect.height - pad * 2) / baseH);
    scale = Math.max(MIN, Math.min(s, 1)); // never blow small diagrams up on load
    tx = (rect.width - baseW * scale) / 2;
    ty = (rect.height - baseH * scale) / 2;
    apply();
  }

  function zoomAt(cx, cy, factor) {
    if (!baseW) return;
    const rect = container().getBoundingClientRect();
    const px = cx - rect.left, py = cy - rect.top;
    const newScale = Math.min(MAX, Math.max(MIN, scale * factor));
    const ratio = newScale / scale;
    // keep whatever is under the cursor pinned in place
    tx = px - (px - tx) * ratio;
    ty = py - (py - ty) * ratio;
    scale = newScale;
    apply();
  }

  function zoomButton(factor) {
    const rect = container().getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function init() {
    const c = container();

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY; startTx = tx; startTy = ty;
      c.classList.add('panning');
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      tx = startTx + dx; ty = startTy + dy;
      apply();
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
      c.classList.remove('panning');
    });

    document.getElementById('zoom-in').addEventListener('click', () => zoomButton(1.25));
    document.getElementById('zoom-out').addEventListener('click', () => zoomButton(1 / 1.25));
    document.getElementById('reset-view').addEventListener('click', fit);
  }

  // Called after every render. `preserve` keeps the user's current zoom/pan —
  // used while they type, so editing a label doesn't yank the view back to fit.
  // The first render (and an explicit sample load) fits instead.
  let hasView = false;
  function refresh(preserve) {
    measure();
    if (!baseW) return;
    if (preserve && hasView) {
      apply();
    } else {
      fit();
      hasView = true;
    }
  }

  function didPan() { return moved; }

  return { init, refresh, fit, didPan };
})();
