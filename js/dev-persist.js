/*
 * @Author: alex 
 * @Date: 2025-09-18 17:52:48 
 * @Last Modified by:   alex 
 * @Last Modified time: 2025-09-18 17:52:48 
 */
// js/dev-persist.js
const KEY = (s) => `dev:${location.pathname}:${s}`;

function keyForEl(el) {
    return el.dataset.persistKey || el.id || el.getAttribute('name') || el.className || el.tagName;
}

function saveScroll(targets) {
    const out = {};
    for (const el of targets) {
        if (el === window) out.window = { x: window.scrollX, y: window.scrollY };
        else out[keyForEl(el)] = { x: el.scrollLeft, y: el.scrollTop };
    }
    sessionStorage.setItem(KEY('scroll'), JSON.stringify(out));
}

function restoreScroll(targets) {
    const raw = sessionStorage.getItem(KEY('scroll'));
    if (!raw) return;
    const data = JSON.parse(raw);
    // Restore after layout settles
    requestAnimationFrame(() => {
        for (const el of targets) {
            if (el === window) {
                const w = data.window; if (w) window.scrollTo(w.x, w.y);
            } else {
                const k = keyForEl(el), s = data[k];
                if (s) { el.scrollLeft = s.x; el.scrollTop = s.y; }
            }
        }
    });
}

function saveDetailsState(roots) {
    const state = {};
    roots.forEach(root => {
        root.querySelectorAll('details[data-persist-open], details[data-dev]').forEach((d, i) => {
            state[d.id || d.dataset.persistKey || i] = !!d.open;
        });
    });
    sessionStorage.setItem(KEY('details'), JSON.stringify(state));
}

function restoreDetailsState(roots) {
    const raw = sessionStorage.getItem(KEY('details'));
    if (!raw) return;
    const state = JSON.parse(raw);
    roots.forEach(root => {
        root.querySelectorAll('details[data-persist-open], details[data-dev]').forEach((d, i) => {
            const k = d.id || d.dataset.persistKey || i;
            if (k in state) d.open = !!state[k];
        });
    });
}

// Simple throttle
function throttle(fn, ms) {
    let t = 0, id = null;
    return (...args) => {
        const now = performance.now();
        if (now - t >= ms) { t = now; fn(...args); }
        else {
            clearTimeout(id);
            id = setTimeout(() => { t = performance.now(); fn(...args); }, ms);
        }
    };
}

// DEV FOCUS: remember a selector and auto-scroll it into view on every load
export const devFocus = {
    save(selector) { localStorage.setItem(KEY('focus'), selector || ''); },
    run() {
        const sel = localStorage.getItem(KEY('focus'));
        const el = sel ? document.querySelector(sel) : document.querySelector('[data-dev-focus]');
        if (!el) return;
        // center it without smooth animation
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    }
};

/**
 * Persist scroll & details across reloads.
 * opts.scroll: array of selectors or 'window'
 * opts.detailsRoots: array of selectors whose subtrees contain details to persist
 */
export function persistDevState(opts = {}) {
    const scrollTargets = (opts.scroll || [])
        .map(s => s === 'window' ? window : document.querySelectorAll(s))
        .flatMap(n => (n instanceof NodeList ? Array.from(n) : [n]))
        .filter(Boolean);

    const detailRoots = (opts.detailsRoots || ['body'])
        .map(s => document.querySelector(s))
        .filter(Boolean);

    // RESTORE as early as possible (after first layout tick)
    restoreDetailsState(detailRoots);
    restoreScroll(scrollTargets);
    devFocus.run();

    // SAVE on interaction
    const onScroll = throttle(() => saveScroll(scrollTargets), 100);
    scrollTargets.forEach(el => {
        (el === window ? window : el).addEventListener('scroll', onScroll, { passive: true });
    });

    const onToggle = throttle(() => saveDetailsState(detailRoots), 50);
    detailRoots.forEach(root => {
        root.addEventListener('toggle', (e) => {
            if (e.target.tagName === 'DETAILS') onToggle();
        });
    });

    // Final safety nets
    addEventListener('visibilitychange', () => { if (document.hidden) saveScroll(scrollTargets); });
    addEventListener('beforeunload', () => { saveScroll(scrollTargets); saveDetailsState(detailRoots); });
}
