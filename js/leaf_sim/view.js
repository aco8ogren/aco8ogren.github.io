// js/leaf_sim/viewport.js
/*
 * View fitter for THREE cameras with two modes:
 *   - 'global'    : show the entire domain [0..L.x]×[0..Ly]
 *   - 'immersive' : fill the container (crop the other axis; like CSS background-size: cover)
 *
 * Critical rule: neutral camera transform + offset frustum centered on the domain.
 * Requires: domain.L = THREE.Vector3(L.x,Ly,Lz).
 *
 * @Author: alex
 * @Date: 2025-08-18 14:17:50
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-23 16:16:07
 */
import * as THREE from 'three';

// view.js
export class View {
    constructor(renderer, cam, container, domain, scope = 'immersive', projection = 'perspective') {
        this.renderer = renderer;
        this.cam = cam;
        this.container = container;
        this.domain = domain;

        // --- new: view/camera mode state ---
        this.scope = scope;            // 'distance' | 'immersive' | 'global'
        this.projection = projection;       // 'perspective' | 'orthographic'
        this.lookZ = 0;                // scene plane we "look at"
        this.distance = 10;               // meters (only used for scope='distance' + perspective)

        // Damping + settle state
        this._damp = { lambda: 512, eps: 1e-3 };   // λ [1/s]; higher = snappier. eps = settle tolerance.
        this._target = new THREE.Vector3(NaN, NaN, NaN);
        this._settled = true;                    // public: true when camera ≈ target

        // pan directions (+1/-1). Default Y = -1 to match your existing “invert Y” feel.
        this.panDir = { x: +1, y: -1 };

        // scroll sources (DOM elements or window), optional per-axis
        this.scrollEls = { x: [], y: [] };

        // derived: visible width/height at z = lookZ (perspective)
        this._vis = { w: 0, h: 0 };

        // derived: pan window
        this._pan = {
            x: { min: 0, max: 0, base: 0, travel: 0 },
            y: { min: 0, max: 0, base: 0, travel: 0 },
        };

        // progress mode
        this._progressModeX = 'local'; // 'local' assesses scroll progress from current scroller, 'global' assesses scroll progress from longest element - 'global' not yet implemented TODO
        this._progressModeY = 'local'; // 'local' assesses scroll progress from current scroller, 'global' assesses scroll progress from longest element - 'global' not yet implemented TODO

        // bind handlers once
        this._onResize = this.fit.bind(this);

        // observe container + window
        this._ro = new ResizeObserver(this._onResize);
        this._ro.observe(container);
        window.addEventListener('resize', this._onResize, { passive: true });

        // initial fit
        this.fit();
    }

    // listeners
    _onScrollX = () => { this._updateTargetFromScroll(); this._settled = false; };
    _onScrollY = () => { this._updateTargetFromScroll(); this._settled = false; };

    // setters
    setScope(scope) {
        this.scope = scope;
        this.fit();
    }
    setProjection(p) {
        this.projection = p;
        this.fit();
    }
    setDistance(dMeters) {
        this.distance = Math.max(0.0001, +dMeters || 0.0001);
        this.fit();
    }
    setPanDir({ x, y } = {}) {
        if (x === +1 || x === -1) {
            this.panDir.x = x;
        } else {
            throw new Error('invalid pan direction for x')
        }
        if (y === +1 || y === -1) {
            this.panDir.y = y;
        } else {
            throw new Error('invalid pan direction for x')
        }
        this._updateTargetFromScroll();
    }
    setDomain(domain) {
        this.domain = domain;
        this.fit();
    }
    setScrollSource({ x = undefined, y = undefined } = {}) {
        const attachAll = (axis, arr) => {
            // detach old
            const old = this.scrollEls[axis];
            if (Array.isArray(old)) {
                const handler = axis === 'x' ? this._onScrollX : this._onScrollY;
                for (const el of old) el?.removeEventListener?.('scroll', handler);
            }
            // set new (always an array)
            const next = Array.isArray(arr) ? arr.filter(Boolean) : (arr ? [arr] : []);
            this.scrollEls[axis] = next;
            // attach new
            const handler = axis === 'x' ? this._onScrollX : this._onScrollY;
            for (const el of next) el.addEventListener('scroll', handler, { passive: true });
        };

        if (x !== undefined) attachAll('x', x);
        if (y !== undefined) attachAll('y', y);

        this._recomputePanWindows();
        this._updateTargetFromScroll();
        this._settled = false;
    }
    setDamping(lambda, eps = this._damp.eps) {
        const L = Number(lambda);
        const E = Number(eps);
        if (Number.isFinite(L) && L > 0) this._damp.lambda = L;
        if (Number.isFinite(E) && E >= 0) this._damp.eps = E;
        return this;
    }
    swap_camera(newCam) {
        this.cam = newCam;
        this.fit();
    }
    fit() {
        // Canvas + aspect
        const w = Math.max(1, Math.floor(this.container.clientWidth));  // [px]
        const h = Math.max(1, Math.floor(this.container.clientHeight)); // [px]
        const aspect = w / h;

        // Sync renderer + camera aspect
        if (this.renderer?.setSize) this.renderer.setSize(w, h, false);
        if ('aspect' in this.cam) this.cam.aspect = aspect;

        // Enforce simplified contract
        if (this.scope !== 'distance') {
            throw new Error('not yet implemented: fit() for scope != "distance"');
        }
        if (this.projection !== 'perspective') {
            throw new Error('not yet implemented: fit() for non-perspective projection');
        }
        if (typeof this.cam.fov !== 'number' || !isFinite(this.cam.fov)) {
            throw new Error('expected a THREE.PerspectiveCamera with numeric .fov');
        }

        // Visible extents at the look plane for given distance & FOV
        const d = this.distance;
        const fovRad = THREE.MathUtils.degToRad(this.cam.fov);
        const visH = 2 * d * Math.tan(fovRad / 2);
        const visW = visH * aspect;
        this._vis = { w: visW, h: visH };

        // Update projection + place camera on -Z side of look plane
        if (typeof this.cam.updateProjectionMatrix === 'function') this.cam.updateProjectionMatrix();
        this.cam.position.z = this.lookZ - d;

        // Recompute pan windows against the domain, then refresh target
        this._recomputePanWindows();
        this._updateTargetFromScroll();
    }


    detach() {
        this._ro?.disconnect?.();
        window.removeEventListener('resize', this._onResize);
    }

    // scroll mapping helpers
    _recomputePanWindows() {
        const visW = this._vis.w;
        const visH = this._vis.h;

        // clamp visible window to domain (if view is larger than domain, travel = 0 and we center)
        const minX = 0.5 * visW;
        const maxX = Math.max(minX, this.domain.L.x - 0.5 * visW);
        const minY = 0.5 * visH;
        const maxY = Math.max(minY, this.domain.L.y - 0.5 * visH);

        const travelX = Math.max(0, maxX - minX);
        const travelY = Math.max(0, maxY - minY);

        const baseX = this.panDir.x >= 0 ? minX : maxX;
        const baseY = this.panDir.y >= 0 ? minY : maxY;

        this._pan = {
            x: { min: minX, max: maxX, base: baseX, travel: travelX },
            y: { min: minY, max: maxY, base: baseY, travel: travelY },
        };
    }

    _progressFromEl(el, axis) {
        if (!el) return 0; // default start

        // window fallback
        if (el === window || el === document || el === document.scrollingElement) {
            if (axis === 'y') {
                const doc = document.scrollingElement || document.documentElement;
                const max = (doc.scrollHeight - doc.clientHeight) || 1;
                return Math.min(1, Math.max(0, doc.scrollTop / max));
            } else {
                const doc = document.scrollingElement || document.documentElement;
                const max = (doc.scrollWidth - doc.clientWidth) || 1;
                return Math.min(1, Math.max(0, doc.scrollLeft / max));
            }
        }

        // element scroll
        if (axis === 'y') {
            const max = (el.scrollHeight - el.clientHeight) || 1;
            return Math.min(1, Math.max(0, el.scrollTop / max));
        } else {
            const max = (el.scrollWidth - el.clientWidth) || 1;
            return Math.min(1, Math.max(0, el.scrollLeft / max));
        }
    }
    _updateTargetFromScroll() {
        if (this.scope !== 'distance') return;

        const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
        const lerp = (a, b, t) => a + (b - a) * t;

        // 0..1 progress for a single element on an axis
        const pEl = (el, axis) => this._progressFromEl(el, axis);

        // Average horizontal progress (0..1) across all X scrollers.
        // This gives us a stable horizontal "cursor" to pick neighbors for Y.
        let posX01 = 0;
        if (this.scrollEls.x.length) {
            let sum = 0;
            for (const el of this.scrollEls.x) sum += pEl(el, 'x');
            posX01 = sum / this.scrollEls.x.length;
        }

        // Symmetric px:
        // - if 0: px = 0
        // - if 1: px = that element's x-progress
        // - if >=2: find left/right neighbors by index and lerp
        let px = 0;
        {
            const arr = this.scrollEls.x;
            const n = arr.length;
            if (n === 1) {
                px = pEl(arr[0], 'x');
            } else if (n >= 2) {
                const pos = posX01 * (n - 1);          // 0..(n-1)
                const i0 = clamp(Math.floor(pos), 0, n - 1);
                const i1 = clamp(i0 + 1, 0, n - 1);
                const t = i1 === i0 ? 0 : (pos - i0);
                const p0 = pEl(arr[i0], 'x');
                const p1 = pEl(arr[i1], 'x');
                px = lerp(p0, p1, t);
            } // else (n===0) px stays 0
        }

        // Symmetric py (driven by horizontal cursor posX01 for neighbor choice):
        let py = 0;
        {
            const arr = this.scrollEls.y;
            const m = arr.length;
            if (m === 1) {
                py = pEl(arr[0], 'y');
            } else if (m >= 2) {
                const pos = posX01 * (m - 1);          // 0..(m-1)
                const j0 = clamp(Math.floor(pos), 0, m - 1);
                const j1 = clamp(j0 + 1, 0, m - 1);
                const t = j1 === j0 ? 0 : (pos - j0);
                const y0 = pEl(arr[j0], 'y');
                const y1 = pEl(arr[j1], 'y');
                py = lerp(y0, y1, t);
            } // else (m===0) py stays 0
        }

        // Map to camera target
        const camX = this._pan.x.travel > 0 ? (this._pan.x.base + this.panDir.x * (px * this._pan.x.travel)) : this._pan.x.base;
        const camY = this._pan.y.travel > 0 ? (this._pan.y.base + this.panDir.y * (py * this._pan.y.travel)) : this._pan.y.base;

        const Lx = this.domain.L.x, Ly = this.domain.L.y;
        this._target.set(
            Number.isFinite(camX) ? camX : Lx * 0.5,
            Number.isFinite(camY) ? camY : Ly * 0.5,
            this.lookZ - this.distance
        );
    }

    // runtime
    syncCameraToScroll(dtSec = 0) {
        // this should *ONLY* ever get called in the base render loop
        // use other functions to update camera's target position. This bad boy just instructs the camera to follow that target in a smooth way.
        if (this.scope !== 'distance') return this._settled = true;

        // Always refresh target from current scroll position
        this._updateTargetFromScroll();

        // Clamp dt to avoid giant jumps on tab-switch/frame hiccups
        const dt = Math.max(0, Math.min(0.1, +dtSec || 0));

        // If no dt (e.g., event tick), just declare not-settled and bail
        if (dt === 0) { this._settled = false; return false; }

        const { lambda, eps } = this._damp;

        // Exponential damping (frame-rate independent)
        const nx = THREE.MathUtils.damp(this.cam.position.x, this._target.x, lambda, dt);
        // const nx = this._target.x;
        const ny = THREE.MathUtils.damp(this.cam.position.y, this._target.y, lambda, dt);

        this.cam.position.x = nx;
        this.cam.position.y = ny;
        this.cam.position.z = this.lookZ - this.distance;

        this.cam.lookAt(this.cam.position.x, this.cam.position.y, this.lookZ);

        const doneX = Math.abs(nx - this._target.x) <= eps;
        const doneY = Math.abs(ny - this._target.y) <= eps;

        // Public flag other systems can check
        this._settled = (doneX && doneY);
        return this._settled;
    }


    // debug
    hud_block(ctx = {}) {
        const prec = ctx.prec ?? 3;
        const f = (x) => Number.isFinite(x) ? x.toFixed(prec) : '—';
        const dir = this._hudTmpDir || (this._hudTmpDir = new THREE.Vector3());

        // Canvas px
        const rect = this.renderer?.domElement?.getBoundingClientRect?.();
        const w = rect ? (rect.width | 0) : 0;
        const h = rect ? (rect.height | 0) : 0;

        // Projection/scope
        const proj = this.cam?.isOrthographicCamera ? 'orthographic' : 'perspective';
        const scope = this.scope;

        // Visible extents (authoritative from View.fit)
        const visW = this._vis?.w ?? NaN;
        const visH = this._vis?.h ?? NaN;
        const visLabel = this.cam?.isOrthographicCamera ? 'frustum' : 'vis@z=lookZ';

        const pxmX = (w && visW) ? (w / visW) : NaN;
        const pxmY = (h && visH) ? (h / visH) : NaN;


        // Camera pose
        this.cam?.getWorldDirection?.(dir);
        const pos = this.cam?.position || { x: NaN, y: NaN, z: NaN };

        // Pan window (read directly)
        const panX = this._pan?.x ?? { base: NaN, min: NaN, max: NaN, travel: NaN };
        const panY = this._pan?.y ?? { base: NaN, min: NaN, max: NaN, travel: NaN };
        const panLine = (axis, p) =>
            `  pan.${axis}: base=${f(p.base)}  min=${f(p.min)}  max=${f(p.max)}  travel=${f(p.travel)}`;

        return [
            `View:`,
            `  projection=${proj}`,
            `  scope=${scope}`,
            `  canvas=${w}×${h}px`,
            `  ${visLabel}=${f(visW)}×${f(visH)}m  px/m=(${f(pxmX)}, ${f(pxmY)})`,
            `  cam pos=[${f(pos.x)}, ${f(pos.y)}, ${f(pos.z)}]  dir=[${f(dir.x)}, ${f(dir.y)}, ${f(dir.z)}]`,
            `  visW=${f(visW)}  visH=${f(visH)}`,
            `  settled=${this._settled}`,
            `  length(scrollEls.x)=${this.scrollEls.x.length}`,
            `  length(scrollEls.y)=${this.scrollEls.y.length}`,
            panLine('x', panX),
            panLine('y', panY),
        ].join('\n');
    }
}
