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
  // Active pointers, so touch drags and two-finger pinch work the same way
  // mouse drags do. Pointer Events cover mouse, touch and pen in one path.
  const pointers = new Map();
  let pinchStartDist = 0, pinchStartScale = 1;

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

    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        // second finger down: start a pinch, stop panning
        const [a, b] = [...pointers.values()];
        pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinchStartScale = scale;
        dragging = false;
        c.classList.remove('panning');
        return;
      }

      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY; startTx = tx; startTy = ty;
      c.classList.add('panning');
      if (c.setPointerCapture) { try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });

    c.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && pinchStartDist > 0) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!dist) return;
        const target = Math.min(MAX, Math.max(MIN, pinchStartScale * (dist / pinchStartDist)));
        // zoom about the midpoint between the fingers
        const rect = container().getBoundingClientRect();
        const px = (a.x + b.x) / 2 - rect.left, py = (a.y + b.y) / 2 - rect.top;
        const ratio = target / scale;
        tx = px - (px - tx) * ratio;
        ty = py - (py - ty) * ratio;
        scale = target;
        moved = true;
        apply();
        return;
      }

      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      tx = startTx + dx; ty = startTy + dy;
      apply();
    });

    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStartDist = 0;
      if (pointers.size === 0) {
        dragging = false;
        c.classList.remove('panning');
      }
    };
    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', endPointer);
    c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') endPointer(e); });

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
