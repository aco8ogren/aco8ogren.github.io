/*
 * @Author: alex 
 * @Date: 2025-09-19 19:28:19 
 * @Last Modified by:   alex 
 * @Last Modified time: 2025-09-19 19:28:19 
 */
// animations.js
// Smoothly animate <details> open/close using a height transition.
// Works for ANY details; will auto-wrap content into a single panel if needed.

export function attachSmoothDisclosure(detailsEl, {
  summarySelector = 'summary',
  panelSelector = '.filters-panel, .collapsible-panel', // try these first
  duration = 280,
  easing = 'cubic-bezier(.2,.7,.2,1)',
} = {}) {
  if (!detailsEl) return;

  const summary = detailsEl.querySelector(summarySelector);
  if (!summary) return;

  // Find an existing panel, or auto-wrap all siblings after <summary>
  let panel = typeof panelSelector === 'string'
    ? detailsEl.querySelector(panelSelector)
    : panelSelector; // allow passing an element directly

  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'collapsible-panel';
    const frag = document.createDocumentFragment();
    // move everything after summary into the wrapper
    while (summary.nextSibling) frag.appendChild(summary.nextSibling);
    panel.appendChild(frag);
    detailsEl.appendChild(panel);
  }

  // Respect reduced-motion
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  panel.style.overflow = 'hidden';
  panel.style.transition = reduceMotion ? 'none' : `height ${duration}ms ${easing}`;
  panel.style.height = detailsEl.open ? 'auto' : '0px';
  // expose visual state immediately for CSS
  detailsEl.dataset.state = detailsEl.open ? 'open' : 'closed';

  let animating = false;

  summary.addEventListener('click', (e) => {
  // If something downstream already canceled (e.g., a control inside summary), do nothing.
  if (e.defaultPrevented) return;

  // If the click originated on an interactive child inside <summary>,
  // prevent the native <details> toggle and bail.
  if (e.target.closest('button, a, input, select, textarea, label, [role="button"], [data-no-toggle]')) {
    e.preventDefault();
    return;
  }

  // We’re handling the toggle animation ourselves.
  e.preventDefault();
  if (animating) return;
  animating = true;

  const done = () => { animating = false; };

  if (detailsEl.open) {
    // CLOSE
    detailsEl.dataset.state = 'closed';
    panel.style.height = panel.scrollHeight + 'px';
    void panel.getBoundingClientRect(); // force reflow
    panel.style.height = '0px';

    const onEnd = () => { detailsEl.open = false; done(); };
    reduceMotion ? onEnd() : panel.addEventListener('transitionend', onEnd, { once: true });
  } else {
    // OPEN
    detailsEl.dataset.state = 'open';
    detailsEl.open = true;
    panel.style.height = '0px';
    void panel.getBoundingClientRect(); // force reflow
    panel.style.height = panel.scrollHeight + 'px';

    const onEnd = () => { panel.style.height = 'auto'; done(); };
    reduceMotion ? onEnd() : panel.addEventListener('transitionend', onEnd, { once: true });
  }
});

  // Expose a small API (useful if inner content height changes while open)
  return {
    recalc() {
      if (!detailsEl.open) return;
      // If we’re in the “auto” resting state, briefly snap to pixel height to avoid jump
      const wasAuto = panel.style.height === 'auto';
      if (wasAuto) panel.style.height = panel.scrollHeight + 'px';
      // next frame, restore auto
      requestAnimationFrame(() => { panel.style.height = 'auto'; });
    }
  };
}

export function attachSmoothDisclosures(root = document, opts) {
  root.querySelectorAll('details').forEach(d => attachSmoothDisclosure(d, opts));
}
