// View fitter for THREE.OrthographicCamera with two modes:
//   - 'global'    : show the entire domain [0..Lx]×[0..Ly] (letter/pillar-box if needed)
//   - 'immersive' : fill the container (crop the other axis; like CSS background-size: cover)
//
// Critical rule: neutral camera transform + offset frustum centered on the domain.
// Requires: opts.space.L = [Lx, Ly, ...].

import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

export function attach_view(renderer, cam, container, opts) {
    // keep a mutable ref we can replace later
    let _cam = cam;

    const state = {
        space: opts.space,
        mode: (opts.mode === 'immersive') ? 'immersive' : 'global',
    };

    function fit() {
        const w = Math.max(1, container.clientWidth | 0);
        const h = Math.max(1, container.clientHeight | 0);
        const aspect = w / h;

        const Lx = Number(state.space.L[0]);
        const Ly = Number(state.space.L[1]);
        const cx = 0.5 * Lx, cy = 0.5 * Ly;
        const domain_aspect = Lx / Ly;

        let halfW, halfH;
        if (state.mode === 'global') {
            if (aspect >= domain_aspect) { halfH = 0.5 * Ly; halfW = halfH * aspect; }
            else { halfW = 0.5 * Lx; halfH = halfW / aspect; }
        } else { // immersive
            if (aspect >= domain_aspect) { halfW = 0.5 * Lx; halfH = halfW / aspect; }
            else { halfH = 0.5 * Ly; halfW = halfH * aspect; }
        }

        if (_cam.isOrthographicCamera) {
            _cam.left = -halfW;
            _cam.right = +halfW;
            _cam.bottom = -halfH;
            _cam.top = +halfH;
            _cam.near = 0.01;
            _cam.far = 10000;
            _cam.updateProjectionMatrix();

            if (!_cam.userData.lockPose) {
                _cam.position.set(cx, cy, -1);
                _cam.lookAt(cx, cy, 0);
            }
        } else if (_cam.isPerspectiveCamera) {
            _cam.aspect = aspect;
            const tan = Math.tan(THREE.MathUtils.degToRad(_cam.fov * 0.5));
            const needH = 2 * halfH;
            const needW = 2 * halfW;
            const dH = needH / (2 * tan);
            const dW = needW / (2 * tan * aspect);
            const d = Math.max(dH, dW);

            _cam.near = 0.01;
            _cam.far = 10000;
            _cam.updateProjectionMatrix();

            if (!_cam.userData.lockPose) {
                _cam.position.set(cx, cy, -d);
                _cam.lookAt(cx, cy, 0);
            }
        }

        renderer.setSize(w, h, true);
    }

    const ro = new ResizeObserver(fit);
    ro.observe(container);
    window.addEventListener('resize', fit);
    fit();

    return {
        fit,
        get_mode() { return state.mode; },
        set_mode(m) { if (m !== 'global' && m !== 'immersive') throw Error('mode'); state.mode = m; fit(); },
        set_space(space) { state.space = space; fit(); },

        // detach
        detach() {
            ro.disconnect();
            window.removeEventListener('resize', fit);
        },

        // swap_camera
        swap_camera(newCam) {
            // replace the camera reference the fitter uses
            _cam = newCam;
            // immediately refit to size/aspect and recenter
            fit();
        }
    };
}

