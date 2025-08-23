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
 * @Last Modified time: 2025-08-22 18:00:42
 */
import * as THREE from 'three';
import { CylindricalDomain, RectangularDomain } from './domain.js';

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
        this._damp = { lambda: 24, eps: 1e-3 };   // λ [1/s]; higher = snappier. eps = settle tolerance.
        this._target = new THREE.Vector3(NaN, NaN, NaN);
        this._settled = true;                    // public: true when camera ≈ target

        // pan directions (+1/-1). Default Y = -1 to match your existing “invert Y” feel.
        this.panDir = { x: +1, y: -1 };

        // scroll sources (DOM elements or window), optional per-axis
        this.scrollEls = { x: null, y: null };

        // derived: visible width/height at z = lookZ (perspective)
        this._vis = { w: 0, h: 0 };

        // derived: pan window
        this._pan = {
            x: { min: 0, max: 0, base: 0, travel: 0 },
            y: { min: 0, max: 0, base: 0, travel: 0 },
        };

        // bind handlers once
        this._onResize = this.fit.bind(this);

        // observe container + window
        this._ro = new ResizeObserver(this._onResize);
        this._ro.observe(container);
        window.addEventListener('resize', this._onResize, { passive: true });

        // initial fit
        this.fit();
    }

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
        if (x === +1 || x === -1) this.panDir.x = x;
        if (y === +1 || y === -1) this.panDir.y = y;
        this.syncCameraToScroll();
    }
    setDomain(domain) {
        this.domain = domain;
        this.fit();
    }

    // kwargs-like setter: call with view.setScrollSource({ x: el }) or view.setScrollSource({ y: el })
    setScrollSource({ x = undefined, y = undefined } = {}) {
        // detach old listeners when axis provided
        if (x !== undefined) this._swapScrollEl('x', x);
        if (y !== undefined) this._swapScrollEl('y', y);
        // recompute pan windows and snap camera to current progress
        this._recomputePanWindows();
        this.syncCameraToScroll();
    }

    _swapScrollEl(axis, el) {
        const old = this.scrollEls[axis];
        if (old) {
            const handler = axis === 'x' ? this._onScrollX : this._onScrollY;
            old.removeEventListener('scroll', handler);
        }
        this.scrollEls[axis] = el;
        if (el) {
            const handler = axis === 'x' ? this._onScrollX : this._onScrollY;
            el.addEventListener('scroll', handler, { passive: true });
        }
    }

    fit() {
        // otherwise we think a little bit
        const w = Math.max(1, Math.floor(this.container.clientWidth)); // [px]
        const h = Math.max(1, Math.floor(this.container.clientHeight)); // [px]
        const aspect = w / h; // [-]

        // keep renderer + camera aspect in sync
        if (this.renderer && this.renderer.setSize) this.renderer.setSize(w, h, false);
        if ('aspect' in this.cam) this.cam.aspect = aspect;

        if (this.projection === 'perspective' && typeof this.cam.updateProjectionMatrix === 'function') {
            this.cam.updateProjectionMatrix();
        }

        // --- new: scope='distance' behavior ---
        if (this.scope === 'distance') {
            if (this.projection !== 'perspective') {
                console.warn('[View] scope="distance" is only defined for perspective cameras.');
                // We’ll early-out but still try to keep camera sane.
            }

            // Visible extents at the look plane for given distance & FOV
            if (this.projection === 'perspective' && this.cam.fov != null) {
                const d = this.distance;
                const fovRad = (this.cam.fov * Math.PI) / 180;
                const visH = 2 * d * Math.tan(fovRad / 2);
                const visW = visH * this.cam.aspect;
                this._vis = { w: visW, h: visH };
            } else {
                // Orthographic or unknown: fall back to container pixels as "vis"
                this._vis = { w: w, h: h };
            }

            // place camera on -Z side of look plane
            this.cam.position.z = this.lookZ - this.distance;

            // recompute pan windows against the domain and snap to current scroll
            this._updateTargetFromScroll
            this._recomputePanWindows();
            this.syncCameraToScroll();
            return;
        }



        // Choose half-extents by mode
        let halfW, halfH;
        if (this.scope === 'global') {
            if (aspect >= domain_aspect) { halfH = 0.5 * L.y; halfW = halfH * aspect; }
            else { halfW = 0.5 * L.x; halfH = halfW / aspect; }
            this.cam.position.y = cy; // center vertically in global
        } else if (this.scope === 'immersive') { // immersive
            if (aspect >= domain_aspect) { halfW = 0.5 * L.x; halfH = halfW / aspect; }
            else { halfH = 0.5 * L.y; halfW = halfH * aspect; }
        }

        // Apply to camera
        if (this.cam.isOrthographicCamera) {
            this.cam.left = -halfW;
            this.cam.right = +halfW;
            this.cam.bottom = -halfH;
            this.cam.top = +halfH;
            this.cam.near = 0.01;
            this.cam.far = 10000;
            this.cam.updateProjectionMatrix();

            this.cam.position.set(cx, this.cam.position.y, -1);
            this.cam.lookAt(cx, this.cam.position.y, 0);
        } else if (this.cam.isPerspectiveCamera) {
            this.cam.aspect = aspect;

            const tan = Math.tan(THREE.MathUtils.degToRad(this.cam.fov * 0.5));
            const needH = 2 * halfH;
            const needW = 2 * halfW;
            const dH = needH / (2 * tan);
            const dW = needW / (2 * tan * aspect);
            const d = Math.max(dH, dW);

            this.cam.near = 0.01;
            this.cam.far = 10000;
            this.cam.updateProjectionMatrix();

            this.cam.position.set(cx, this.cam.position.y, -d);
            this.cam.lookAt(cx, this.cam.position.y, 0);
        }

        // Renderer size
        this.renderer.setSize(w, h, true);
    }

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
        this._updateTargetFromScroll();
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

        const px = this._pan.x.travel > 0 ? this._progressFromEl(this.scrollEls.x, 'x') : 0.5;
        const py = this._pan.y.travel > 0 ? this._progressFromEl(this.scrollEls.y, 'y') : 0.5;

        const camX = this._pan.x.base + this.panDir.x * (px * this._pan.x.travel);
        const camY = this._pan.y.base + this.panDir.y * (py * this._pan.y.travel);

        const Lx = this.domain?.L?.x ?? 0;
        const Ly = this.domain?.L?.y ?? 0;

        this._target.set(
            Number.isFinite(camX) ? camX : Lx * 0.5,
            Number.isFinite(camY) ? camY : Ly * 0.5,
            this.lookZ - this.distance
        );
    }


    syncCameraToScroll(dtSec = 0) {
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


    // tiny helper for HUD
    debugPan() { return { vis: this._vis, x: this._pan.x, y: this._pan.y }; }



    get_scope() { return this.scope; }

    set_scope(new_scope) {
        if (new_scope !== 'global' && new_scope !== 'immersive') {
            throw new Error('"scope" must be "global" or "immersive"');
        }
        this.scope = new_scope;
        this.fit();
    }

    set_domain(new_domain) {
        this.domain = new_domain;
        this.fit();
    }

    swap_camera(newCam) {
        this.cam = newCam;
        this.fit();
    }

    detach() {
        this._ro?.disconnect?.();
        window.removeEventListener('resize', this.onResize);
    }

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

        // Unified visible extents (world meters) + px/m
        let visLabel = 'vis';
        let visW = NaN, visH = NaN;

        if (this.cam?.isOrthographicCamera) {
            // Ortho: visible size IS the frustum size in world units
            visLabel = 'frustum';
            visW = (this.cam.right - this.cam.left);
            visH = (this.cam.top - this.cam.bottom);
        } else {
            // Perspective: visible size at the look plane (z=0 by convention)
            visLabel = 'vis@z=0';
            const d = Math.abs(this.cam?.position?.z ?? 0);
            const fov = THREE.MathUtils.degToRad(this.cam?.fov ?? 40);
            const visH_at_plane = 2 * d * Math.tan(fov * 0.5);
            visH = visH_at_plane;
            visW = visH * (w / Math.max(1, h));
        }

        const pxmX = (w && visW) ? (w / visW) : NaN;
        const pxmY = (h && visH) ? (h / visH) : NaN;

        // Camera pose
        this.cam?.getWorldDirection?.(dir);
        const pos = this.cam?.position || { x: NaN, y: NaN, z: NaN };

        // Pan window (already computed by View)
        const pan = this.debugPan?.() || { vis: { w: NaN, h: NaN }, x: {}, y: {} };
        const panLine = (axis) =>
            `  pan.${axis}: base=${f(pan[axis].base)}  min=${f(pan[axis].min)}  max=${f(pan[axis].max)}  travel=${f(pan[axis].travel)}`;

        return [
            `View:`,
            `  projection=${proj}`,
            `  scope=${scope}`,
            `  canvas=${w}×${h}px`,
            `  ${visLabel}=${f(visW)}×${f(visH)}m  px/m=(${f(pxmX)}, ${f(pxmY)})`,
            `  cam pos=[${f(pos.x)}, ${f(pos.y)}, ${f(pos.z)}]  dir=[${f(dir.x)}, ${f(dir.y)}, ${f(dir.z)}]`,
            `  visW=${f(pan.vis.w)}  visH=${f(pan.vis.h)}`,
            panLine('x'),
            panLine('y'),
        ].join('\n');
    }




}
