// View fitter for THREE.OrthographicCamera with two modes:
//   - 'global'    : show the entire domain [0..Lx]×[0..Ly] (letter/pillar-box if needed)
//   - 'immersive' : fill the container (crop the other axis; like CSS background-size: cover)
//
// Critical rule: neutral camera transform + offset frustum centered on the domain.
// Requires: opts.space.L = [Lx, Ly, ...].

export function attach_view(renderer, cam, container, opts) {
  if (!opts || !opts.space || !Array.isArray(opts.space.L) || opts.space.L.length < 2) {
    throw new Error("attach_view: opts.space.L must be [Lx, Ly, ...].");
  }

  const state = {
    space: opts.space,
    mode:  (opts.mode === 'immersive') ? 'immersive' : 'global',
  };

  function fit() {
    const w = Math.max(1, container.clientWidth  | 0);
    const h = Math.max(1, container.clientHeight | 0);
    const aspect = w / h;

    const Lx = Number(state.space.L[0]);
    const Ly = Number(state.space.L[1]);
    if (!(Lx > 0 && isFinite(Lx) && Ly > 0 && isFinite(Ly))) {
      throw new Error("attach_view: space.L entries must be finite positive numbers.");
    }

    const cx = 0.5 * Lx, cy = 0.5 * Ly;
    const domain_aspect = Lx / Ly;

    let halfW, halfH;

    if (state.mode === 'global') {
      // Show ALL of the domain; add gaps on the long axis.
      if (aspect >= domain_aspect) {         // container wider → match height
        halfH = 0.5 * Ly;
        halfW = halfH * aspect;
      } else {                               // container taller → match width
        halfW = 0.5 * Lx;
        halfH = halfW / aspect;
      }
    } else { // 'immersive'
      // Fill container; crop the overflow axis.
      if (aspect >= domain_aspect) {         // container wider → match width, crop top/bottom
        halfW = 0.5 * Lx;
        halfH = halfW / aspect;
      } else {                               // container taller → match height, crop sides
        halfH = 0.5 * Ly;
        halfW = halfH * aspect;
      }
    }

    // // Offset frustum centered on domain midpoint (no camera-world offset)
    // cam.left   = cx - halfW;
    // cam.right  = cx + halfW;
    // cam.bottom = cy - halfH;
    // cam.top    = cy + halfH;
    // cam.near   = 0.01;
    // cam.far    = 10000;
    // cam.updateProjectionMatrix();

    // // Neutral camera transform → frustum defines the view
    // cam.position.set(0, 0, 100);
    // cam.lookAt(0, 0, 0);

    // Frustum coordinates are in camera space (meaning the camera location is the origin)
    cam.left   = - halfW;
    cam.right  = + halfW;
    cam.bottom = - halfH;
    cam.top    = + halfH;
    cam.near   = 0.01;
    cam.far    = 10000;
    cam.updateProjectionMatrix();

    // Position camera to look at scene
    cam.position.set(cx, cy, 100);
    cam.lookAt(cx, cy, 0);

    // Canvas fills the container
    renderer.setSize(w, h, true);
  }

  const ro = new ResizeObserver(fit);
  ro.observe(container);
  window.addEventListener('resize', fit);
  fit();

  return {
    fit,
    get_mode() { return state.mode; },
    set_mode(mode) {
      if (mode !== 'global' && mode !== 'immersive') {
        throw new Error("set_mode: use 'global' or 'immersive'.");
      }
      state.mode = mode;
      fit();
    },
    set_space(space) {
      if (!space || !Array.isArray(space.L) || space.L.length < 2) {
        throw new Error("set_space: space.L must be [Lx, Ly, ...].");
      }
      state.space = space;
      fit();
    },
    detach() {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    },
  };
}
