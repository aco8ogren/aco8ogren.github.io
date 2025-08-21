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
 * @Last Modified time: 2025-08-20 14:06:44
 */
import * as THREE from 'three';

export class View {
    constructor(renderer, cam, container, domain, scope = 'immersive') {
        this.renderer = renderer;
        this.cam = cam;
        this.container = container;
        this.domain = domain;
        this.scope = scope;

        // Bind once
        this.onResize = this.fit.bind(this);

        // Observe container + window
        this._ro = new ResizeObserver(this.onResize);
        this._ro.observe(container);
        window.addEventListener('resize', this.onResize, { passive: true });

        this.fit();
    }

    // ----- public API (matches your current usage) -----
    fit() {
        const w = Math.max(1, Math.floor(this.container.clientWidth));
        const h = Math.max(1, Math.floor(this.container.clientHeight));
        const container_aspect = w / h;

        const L = this.domain.L;              // THREE.Vector3
        const cx = 0.5 * L.x, cy = 0.5 * L.y;
        const domain_aspect = L.x / L.y;

        // Choose half-extents by mode
        let halfW, halfH;
        if (this.scope === 'global') {
            if (container_aspect >= domain_aspect) { halfH = 0.5 * L.y; halfW = halfH * container_aspect; }
            else { halfW = 0.5 * L.x; halfH = halfW / container_aspect; }
            this.cam.position.y = cy; // center vertically in global
        } else { // immersive
            if (container_aspect >= domain_aspect) { halfW = 0.5 * L.x; halfH = halfW / container_aspect; }
            else { halfH = 0.5 * L.y; halfW = halfH * container_aspect; }
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
            this.cam.aspect = container_aspect;

            const tan = Math.tan(THREE.MathUtils.degToRad(this.cam.fov * 0.5));
            const needH = 2 * halfH;
            const needW = 2 * halfW;
            const dH = needH / (2 * tan);
            const dW = needW / (2 * tan * container_aspect);
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
}
