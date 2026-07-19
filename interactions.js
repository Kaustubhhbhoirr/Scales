// interactions.js — click-to-code navigation, flowchart shape swapping,
// and flowchart arrow coloring. All code edits are text rewrites on the
// textarea, followed by a re-render.

const Interactions = (() => {
  // open delimiter -> close delimiter, longest tokens listed first for matching
  const SHAPES = [
    { key: 'rectangle',     label: 'Rect',      open: '[',  close: ']'  },
    { key: 'rounded',       label: 'Rounded',   open: '(',  close: ')'  },
    { key: 'stadium',       label: 'Stadium',   open: '([', close: '])' },
    { key: 'subroutine',    label: 'Subroit.',  open: '[[', close: ']]' },
    { key: 'database',      label: 'Database',  open: '[(', close: ')]' },
    { key: 'circle',        label: 'Circle',    open: '((', close: '))' },
    { key: 'diamond',       label: 'Diamond',   open: '{',  close: '}'  },
    { key: 'hexagon',       label: 'Hexagon',   open: '{{', close: '}}' },
    { key: 'parallelogram', label: 'Parallel.', open: '[/', close: '/]' },
  ];

  let codeInput, popup, onCodeChange;

  function init(deps) {
    codeInput = deps.codeInput;
    onCodeChange = deps.onCodeChange;
    popup = document.getElementById('ctx-popup');
    // clicking anywhere outside the popup closes it
    document.addEventListener('mousedown', (e) => {
      if (popup.style.display === 'block' && !popup.contains(e.target)) hidePopup();
    });
  }

  function diagramType(code) {
    const first = code.trim().split('\n')[0].trim().toLowerCase();
    if (first.startsWith('flowchart') || first.startsWith('graph')) return 'flowchart';
    return first.split(/\s|-/)[0] || 'unknown';
  }

  // Wire click handlers onto the freshly rendered SVG.
  function attach(svgEl, code) {
    const type = diagramType(code);
    svgEl.style.cursor = 'pointer';
    svgEl.addEventListener('click', (e) => {
      if (PanZoom.didPan()) return; // it was a pan gesture, not a selection
      const info = classify(e.target, type);
      if (!info) return;
      e.stopPropagation();
      showPopup(e.clientX, e.clientY, info, type);
    });
  }

  // Figure out what the user clicked: a flowchart node, a flowchart edge,
  // or a generic labelled element in any other diagram type.
  function classify(target, type) {
    if (type === 'flowchart') {
      const nodeG = target.closest('g.node, g[id^="flowchart-"]');
      if (nodeG && nodeG.id) {
        const m = nodeG.id.match(/^flowchart-(.+?)-\d+$/);
        if (m) return { kind: 'flnode', id: m[1], label: textOf(nodeG) };
      }
      const path = target.closest('.edgePaths path, path.flowchart-link');
      if (path) {
        const paths = Array.from(document.querySelectorAll('#preview .edgePaths path, #preview path.flowchart-link'));
        const idx = paths.indexOf(path);
        if (idx >= 0) return { kind: 'fledge', edgeIndex: idx };
      }
    }
    // generic: nearest group with visible text
    const g = target.closest('g');
    const label = textOf(g || target);
    if (label) return { kind: 'generic', label };
    return null;
  }

  function textOf(el) {
    if (!el) return '';
    const t = (el.textContent || '').trim();
    return t.split('\n')[0].trim();
  }

  // ---- popup UI ----
  function showPopup(x, y, info, type) {
    popup.innerHTML = '';
    const jump = document.createElement('button');
    jump.textContent = '↧ Jump to code';
    jump.style.width = '100%';
    jump.addEventListener('click', () => {
      jumpToCode(info.id || info.label);
      hidePopup();
    });

    if (info.kind === 'flnode') {
      const h = document.createElement('h4');
      h.textContent = 'Change shape';
      popup.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'shape-grid';
      SHAPES.forEach((s) => {
        const b = document.createElement('button');
        b.textContent = s.label;
        b.title = s.key;
        b.addEventListener('click', () => {
          rewriteNodeShape(info.id, s);
          hidePopup();
        });
        grid.appendChild(b);
      });
      popup.appendChild(grid);
      const row = document.createElement('div');
      row.className = 'row';
      row.appendChild(jump);
      popup.appendChild(row);
    } else if (info.kind === 'fledge') {
      const h = document.createElement('h4');
      h.textContent = 'Arrow color';
      popup.appendChild(h);
      const row = document.createElement('div');
      row.className = 'row';
      const color = document.createElement('input');
      color.type = 'color';
      color.value = '#ff0000';
      const apply = document.createElement('button');
      apply.textContent = 'Apply';
      apply.addEventListener('click', () => {
        setLinkColor(info.edgeIndex, color.value);
        hidePopup();
      });
      row.appendChild(color);
      row.appendChild(apply);
      popup.appendChild(row);
      const row2 = document.createElement('div');
      row2.className = 'row';
      row2.appendChild(jump);
      popup.appendChild(row2);
    } else {
      popup.appendChild(jump);
    }

    popup.style.display = 'block';
    // keep the popup within the viewport
    const pw = popup.offsetWidth, ph = popup.offsetHeight;
    let left = x + 8, top = y + 8;
    if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight) top = window.innerHeight - ph - 8;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  function hidePopup() { popup.style.display = 'none'; }

  // ---- code operations ----

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Locate a node definition: <id><open>label<close>. Tries multi-char
  // delimiters before single-char ones so [( / ([ / {{ match correctly.
  function findNodeDef(code, id) {
    const re = new RegExp(
      '(?<![\\w-])' + escapeRe(id) +
      '(\\[\\(|\\(\\[|\\[\\[|\\(\\(|\\{\\{|\\[/|\\[|\\(|\\{)'
    );
    const m = re.exec(code);
    if (!m) return null;
    const open = m[1];
    const shape = SHAPES.find((s) => s.open === open);
    if (!shape) return null;
    const openEnd = m.index + id.length + open.length;
    const closeIdx = code.indexOf(shape.close, openEnd);
    if (closeIdx < 0) return null;
    return {
      start: m.index,
      afterClose: closeIdx + shape.close.length,
      label: code.slice(openEnd, closeIdx),
    };
  }

  function rewriteNodeShape(id, shape) {
    const code = codeInput.value;
    const def = findNodeDef(code, id);
    if (!def) {
      toast("Couldn't locate this node in the code — edit it manually.");
      return;
    }
    const replacement = id + shape.open + def.label + shape.close;
    codeInput.value = code.slice(0, def.start) + replacement + code.slice(def.afterClose);
    onCodeChange();
  }

  // Append or replace a `linkStyle <index> stroke:<color>` directive.
  function setLinkColor(edgeIndex, color) {
    let code = codeInput.value.replace(/\s+$/, '');
    const style = `linkStyle ${edgeIndex} stroke:${color},stroke-width:2px;`;
    const existing = new RegExp('^linkStyle\\s+' + edgeIndex + '\\b.*$', 'm');
    if (existing.test(code)) {
      code = code.replace(existing, style);
    } else {
      code = code + '\n' + style;
    }
    codeInput.value = code;
    onCodeChange();
  }

  function jumpToCode(needle) {
    if (!needle) return;
    const code = codeInput.value;
    let idx = code.indexOf(needle);
    if (idx < 0) {
      // try first word of a multi-word label
      const word = needle.split(/\s+/)[0];
      idx = code.indexOf(word);
    }
    if (idx < 0) { toast('Not found in code.'); return; }
    // select the line containing the match
    const lineStart = code.lastIndexOf('\n', idx) + 1;
    let lineEnd = code.indexOf('\n', idx);
    if (lineEnd < 0) lineEnd = code.length;
    codeInput.focus();
    codeInput.setSelectionRange(lineStart, lineEnd);
    // scroll the selected line into view
    const before = code.slice(0, lineStart);
    const lineNo = (before.match(/\n/g) || []).length;
    const lineHeight = 13 * 1.5; // font-size * line-height from CSS
    codeInput.scrollTop = Math.max(0, lineNo * lineHeight - codeInput.clientHeight / 2);
  }

  // ---- toast ----
  // An optional action turns the toast into an undo prompt, which needs
  // pointer events and a longer dwell so it can actually be clicked.
  let toastTimer;
  function toast(msg, actionLabel, onAction) {
    const el = document.getElementById('toast');
    el.textContent = '';
    el.append(msg);
    const interactive = Boolean(actionLabel && onAction);
    if (interactive) {
      const b = document.createElement('button');
      b.className = 'toast-action';
      b.textContent = actionLabel;
      b.addEventListener('click', () => {
        onAction();
        el.classList.remove('show');
      });
      el.append(b);
    }
    el.style.pointerEvents = interactive ? 'auto' : 'none';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), interactive ? 7000 : 2600);
  }

  return { init, attach, toast };
})();
