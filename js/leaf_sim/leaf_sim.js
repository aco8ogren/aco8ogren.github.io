// js/leaf_sim/leaf_sim.js
import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { compute_forces_and_moments } from './forces.js';
import { newtons } from './integrator.js';
import { attach_view } from './viewport.js';
import { Swirl, spawn_swirl } from './swirl.js';

console.log('leaf_sim + three.js booting');

/* flags */
const isUseOrbitControls = false;

/* -------------------- TUNABLE PARAMS -------------------- */
const debug_params = {
    is_draw_swirl: false,
    is_draw_air_velocity_2d: true,
    is_draw_leaves_together: true,
};

const space = { L: [60, 500, 80] };
// const space = { L: [400, 200, 40] };
const [Lx, Ly, Lz] = space.L;

const sim_params = {
    dt: 1 / 120,
    rho_air: 1.2,
    g: 9.81,
    n_leaves: 120,
};

const leaf_params = {
    R: 0.75,
    rho: 2.0,
    Cd_perpendicular: 2.0,
    Cd_parallel: 0.3,
    Cn_max: 0.5,
    aCoP: 0.25,
    alpha_init: 0.0,
    fade_in_speed: 0.02,
    fade_out_speed: 0.02,
};

// --- camera params
const cam_params = {
    projection: 'perspective', // 'orthographic', 'perspective'
    view: 'immersive' // 'global', 'immersive'
}

// --- leaf lifecycle (spawn/despawn) ---
const leaf_lifecycle = {
    target_count: sim_params.n_leaves * 2, // aim to keep about this many leaves alive
    lambda_base: 10,        // base spawn rate [leaves/sec] when there are 0 leaves
    out_padding: 5,        // [m] extra boundary beyond [0..L] that triggers fade-out
};

/* ----------------------------- AMBIENT WIND ----------------------------- */
// background
const omega_wind = 1 / 20;   // [Hz]
const gamma_wind = 1 / 10;   // [1/m]
const v_air_amp = 20;
function v_air_at(x /* THREE.Vector3 */, t) {
    const u = v_air_amp * Math.sin(2 * Math.PI * gamma_wind * x.y) * Math.sin(2 * Math.PI * omega_wind * t);
    return new THREE.Vector3(u, 0, 0);
}

// swirls
const nSwirlMax = 4;
const lambdaSwirlBase = 0.5; // swirls/sec at zero occupancy

const swirl_params = {
    radius_limits: [5, 10],                          // [m]
    velocity_limits: [v_air_amp / 2, v_air_amp * 1.5],   // [m/s]
    life_limits: [4, 10],                            // [s] plateau (excl. rise/fall)
    rise_time: 1,                                    // [s]
    fall_time: 1,                                    // [s]
};

// --- quiver (air-velocity debug overlay) ---
const quiver_params = {
    nx: 60,                // grid columns
    ny: 512,                // grid rows
    nz: 1,                 // grid slices in z (set >1 in the future for 3D quiver)
    z_slice: space.L[2] / 2,            // z-plane for nz=1
    scale: 0.05,            // meters per (m/s) displayed
    max_len: 6,            // clamp displayed arrow length (m)
    shaft_radius: 0.05,    // visual thickness
    head_radius: 0.2,    // cone radius (visual)
    head_ratio: 0.25,    // head length as fraction of total arrow length
    color: 0x6ad1ff,
    alpha: 0.4,
};

let quiver_inst = null;    // { shaft: InstancedMesh, head: InstancedMesh, count }
const _q_fromY = new THREE.Quaternion(); // temp
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _scale = new THREE.Vector3();

/* ------------------------------ HUD (debug) ----------------------------- */
const hud = document.createElement('pre');
hud.style.position = 'fixed';
hud.style.top = '0.5%';
hud.style.left = '0.5%';
hud.style.margin = '0';
hud.style.padding = '8px 10px';
hud.style.background = 'rgba(0,0,128,0.6)';
hud.style.color = '#cde';
hud.style.font = '1px/1.3 monospace';
hud.style.borderRadius = '8px';
hud.style.pointerEvents = 'none';
hud.style.zIndex = '10';
hud.textContent = 'booting…';
document.body.appendChild(hud);

/* --------------------------- THREE.JS SCENE SETUP -------------------------- */
const view_container = document.createElement('div');
view_container.style.position = 'fixed';
view_container.style.left = '0.5%';
view_container.style.bottom = '0.5%';
view_container.style.width = '99%';
view_container.style.height = '83%';
view_container.style.border = '1px solid #1d2733';
view_container.style.borderRadius = '8px';
view_container.style.overflow = 'visible';
view_container.style.background = '#0b0e13';
view_container.style.zIndex = '0';
document.body.appendChild(view_container);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0x0b0e13, 1);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';
view_container.appendChild(renderer.domElement);

function make_camera(mode) {
    // arguments don't matter - defaults get overwritten by attach_view anyway
    if (mode === 'perspective') {
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 5000); // fov=40° default
        return cam;
    } else {
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000);
        return cam;
    }
}

const scene = new THREE.Scene();
let cam = make_camera(cam_params.projection)
scene.add(cam);

cam.position.set(Lx / 2, Ly / 2, -10);
cam.lookAt(Lx / 2, Ly / 2, 0);
cam.updateProjectionMatrix();

const view = attach_view(renderer, cam, view_container, { space, mode: cam_params.view });

/* -------------------- SCROLL → CAMERA (immersive only) -------------------- */
/**
 * Map page scroll (0..scrollRange px) → camera travel in scene units.
 * Tweak TRAVEL_Y to taste (how far camera moves for a full-page scroll).
 */


// Use the overlay panel as the scroll source
const SCROLL_SRC = document.getElementById('text-overlay-element')
console.log(SCROLL_SRC.tagName)

const SCROLL = {
    baseCamY: cam.position.y,                     // starting Y (usually Ly/2)
    travelY: 0.2 * Ly,                            // how many meters to move for full page scroll
    scrollRange: 1,                               // pixels of scrollable height (computed)
};

// Call this whenever canvas size or camera FOV/pose changes.
function computeMetersPerCssPx(camera, renderer, z_text_meters_camspace) {
  const H_css_px = renderer.domElement.clientHeight; // CSS pixels
  if (camera.isPerspectiveCamera) {
    const fovy = camera.fov * Math.PI / 180; // radians
    return (2 * z_text_meters_camspace * Math.tan(fovy / 2)) / H_css_px;
  } else if (camera.isOrthographicCamera) {
    const top = camera.top; // world meters
    return (2 * top) / H_css_px;
  } else {
    return 0;
  }
}

function computeScrollRange() {
    SCROLL.scrollRange = Math.max(
        1,
        SCROLL_SRC.scrollHeight - SCROLL_SRC.clientHeight
    );
}

function getScrollFrac(el) {
  const range = Math.max(1, el.scrollHeight - el.clientHeight);
  return Math.min(1, Math.max(0, el.scrollTop / range));
}

function updateCamFromScroll() {
  if (view.get_mode && view.get_mode() !== 'immersive') return;

  const frac = getScrollFrac(SCROLL_SRC);
  cam.position.y = SCROLL.baseCamY - frac * SCROLL.travelY; // or minus if you prefer
  cam.lookAt(Lx/2, cam.position.y, 0);
}

// Init + listeners
computeScrollRange();
updateCamFromScroll();

SCROLL_SRC.addEventListener('scroll', updateCamFromScroll, { passive: true });
window.addEventListener('resize', updateCamFromScroll);
updateCamFromScroll(); // initial sync

SCROLL_SRC.addEventListener('scroll', () => console.log('SCROLL_SRC scrollTop=', SCROLL_SRC.scrollTop));

// window.addEventListener('scroll', () => console.log('window scroll fired'));
// document.addEventListener('scroll', (e) => {
//   if (e.target !== document) console.log('element scroll fired:', e.target);
// }, true); // capture so you see element-level scrolls

// console.log('controls:', { enableZoom: controls.enableZoom, enablePan: controls.enablePan });


if (isUseOrbitControls) {
    // ... after scene & cam are created and added
    const controls = new OrbitControls(cam, renderer.domElement);

    // rotate around scene center
    controls.target.set(Lx / 2, Ly / 2, 0);

    // only MMB rotates; disable zoom/pan
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
}

// keep camera pose user-driven (see viewport.js guard below)
cam.userData.lockPose = true;

window.addEventListener('keydown', (e) => {
    if (e.key === 'g') {
        view.set_mode('global');
        updateCamFromScroll(); // keep camera coherent on mode change
        return;
    }
    if (e.key === 'i') {
        view.set_mode('immersive');
        updateCamFromScroll(); // keep camera coherent on mode change
        return;
    }

    // Projection hotkeys (idempotent)
    if (e.key === 'o') { // force ORTHOGRAPHIC
        if (!cam.isOrthographicCamera) {
            scene.remove(cam);
            cam = make_camera('orthographic');
            scene.add(cam);
            view.swap_camera(cam, 'orthographic'); // if your swap_camera only takes (cam), extra arg is ignored
            console.log('projection → orthographic');
        }
        return;
    }

    if (e.key === 'p') { // force PERSPECTIVE
        if (!cam.isPerspectiveCamera) {
            scene.remove(cam);
            cam = make_camera('perspective');
            scene.add(cam);
            view.swap_camera(cam, 'perspective');  // ok if swap_camera(cam) in your build
            console.log('projection → perspective');
        }
        return;
    }
});



function add_domain_box() {
    const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(Lx, Ly, Lz));
    const mat = new THREE.LineBasicMaterial({ color: 0x2a3646 });
    const wire = new THREE.LineSegments(geom, mat);
    wire.position.set(Lx / 2, Ly / 2, Lz / 2);
    scene.add(wire);
    return wire;
}

function hud_camera_info() {
    const rect = renderer.domElement.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const proj = cam.isOrthographicCamera ? 'orthographic' : 'perspective';
    const mode = view.get_mode(); // 'global' | 'immersive'

    let first_two_lines = '';

    if (cam.isOrthographicCamera) {
        const fw = cam.right - cam.left;
        const fh = cam.top - cam.bottom;
        const pxmx = (w / fw).toFixed(2);
        const pxmy = (h / fh).toFixed(2);
        first_two_lines = `projection=${proj}  mode=${mode}\ncanvas=${w | 0}×${h | 0}px  frustum=${fw.toFixed(2)}×${fh.toFixed(2)}m  px/m=(${pxmx}, ${pxmy})`;
    } else if (cam.isPerspectiveCamera) {
        // perspective: report px/m at z=0 (the look-at plane)
        const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
        const d = Math.abs(cam.position.z); // we position camera to look at z=0
        const visibleH = 2 * d * tan;
        const visibleW = visibleH * (w / h);
        const pxmx = (w / visibleW).toFixed(2);
        const pxmy = (h / visibleH).toFixed(2);
        first_two_lines = `projection=${proj}  mode=${mode}\ncanvas=${w | 0}×${h | 0}px  vis@z=0=${visibleW.toFixed(2)}×${visibleH.toFixed(2)}m  px/m@z=0=(${pxmx}, ${pxmy})`;
    }

    // Camera position and direction
    const posStr = `[${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)}]`;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir); // unit vector the camera is facing
    const dirStr = `[${dir.x.toFixed(3)}, ${dir.y.toFixed(3)}, ${dir.z.toFixed(3)}]`;

    return `${first_two_lines}\ncam position = ${posStr}   cam dir = ${dirStr}`;
}

function make_quiver_instanced() {
    const { nx, ny, nz, shaft_radius, head_radius, color } = quiver_params;
    const count = nx * ny * nz;

    // Base geometries are aligned along +Y (Three's default for Cylinder/Cone)
    const shaftGeom = new THREE.CylinderGeometry(shaft_radius, shaft_radius, 1, 6, 1, true);
    const headGeom = new THREE.ConeGeometry(head_radius, 1, 12, 1, true);

    // Materials
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: quiver_params.alpha });

    // Instanced meshes
    const shaft = new THREE.InstancedMesh(shaftGeom, mat, count);
    const head = new THREE.InstancedMesh(headGeom, mat, count);
    shaft.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // prevent the whole batch from being culled when the origin is off‑screen
    shaft.frustumCulled = false;
    head.frustumCulled = false;

    // // Slightly raise render order so it sits above wireframe box
    // shaft.renderOrder = 10;
    // head.renderOrder = 11;

    scene.add(shaft);
    scene.add(head);

    return { shaft, head, count };
}

function init_quiver() {
    if (!debug_params.is_draw_air_velocity_2d || quiver_inst) return;
    quiver_inst = make_quiver_instanced();
    update_quiver(S.t); // initialize transforms
}

// Compute grid sample position for (i,j,k)
function quiver_sample_pos(i, j, k) {
    const { nx, ny, nz, z_slice } = quiver_params;
    const dx = Lx / (nx - 1);
    const dy = Ly / (ny - 1);
    const dz = (nz > 1) ? ((space.L[2]) / (nz - 1)) : 0;
    const z = (nz === 1) ? z_slice : k * dz;
    _pos.set(i * dx, j * dy, z);
    return _pos;
}

// Write one instance transform (shaft or head) given base, dir(+Y→dir), and lengths
function set_instance_transform(mesh, index, base, dir, len, isHead) {
    // Split arrow length into shaft/head based on head_ratio
    const headLen = Math.max(0, len * quiver_params.head_ratio);
    const shaftLen = Math.max(0, len - headLen);

    // Orientation: rotate +Y to 'dir'
    _q_fromY.setFromUnitVectors(new THREE.Vector3(1e-9, 1, 1e-9).normalize(), dir); // tiny eps avoids NaN when dir≈-Y

    // Choose which segment we’re writing
    if (isHead) {
        // Head is a cone of length headLen whose base touches shaft tip
        // Center of cone (local) is at +Y * (headLen/2)
        _tmp.copy(dir).multiplyScalar(shaftLen + headLen * 0.5);
        const center = _tmp.add(base);
        _mat.compose(
            center,
            _q_fromY,
            _scale.set(1, headLen, 1) // scale along Y for length, X/Z for radius already in geometry
        );
    } else {
        // Shaft is a cylinder of length shaftLen centered at +Y*(shaftLen/2) from base
        _tmp.copy(dir).multiplyScalar(shaftLen * 0.5);
        const center = _tmp.add(base);
        _mat.compose(
            center,
            _q_fromY,
            _scale.set(1, shaftLen, 1)
        );
    }
    mesh.setMatrixAt(index, _mat);
}

// Compute velocity field at point p and map to arrow length
function velocity_at(p, t, out) {
    out.copy(v_air_at(p, t));
    for (const swirl of S.swirls) out.add(swirl.eval_velocity_at(p));
    return out; // Vector3
}

function update_quiver(t) {
    if (!debug_params.is_draw_air_velocity_2d || !quiver_inst) return;
    const { nx, ny, nz, scale, max_len } = quiver_params;
    const { shaft, head, count } = quiver_inst;

    let idx = 0;
    for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++, idx++) {
                const p = quiver_sample_pos(i, j, k).clone();

                // Direction & magnitude
                const u = velocity_at(p, t, _dir).clone();
                const mag = u.length();

                if (mag <= 1e-9) {
                    // Hide by zero-scaling both instances
                    _mat.identity();
                    shaft.setMatrixAt(idx, _mat);
                    head.setMatrixAt(idx, _mat);
                    continue;
                }

                // Display length (scaled & clamped)
                const dispLen = Math.min(max_len, mag * scale);

                // Unit direction
                u.multiplyScalar(1 / mag);

                // Set shaft/head transforms
                set_instance_transform(shaft, idx, p, u, dispLen, false);
                set_instance_transform(head, idx, p, u, dispLen, true);
            }
        }
    }
    shaft.count = head.count = Math.min(idx, count);
    shaft.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
}


// // quiver things
// let quiver_group = null;
// let quiver_geom = null;
// let quiver_positions = null; // Float32Array view into geometry (dynamic)

// function make_quiver_grid() {
//   // Build a regular grid covering [0..Lx] × [0..Ly] on z = z_slice.
//   const { nx, ny } = quiver_params;
//   const nSegments = nx * ny;          // one segment (base→tip) per grid cell
//   const nVerts = nSegments * 2;       // 2 verts per segment

//   const geom = new THREE.BufferGeometry();
//   const pos = new Float32Array(nVerts * 3);
//   geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
//   geom.computeBoundingSphere();

//   const mat = new THREE.LineBasicMaterial({ color: 0x6ad1ff, transparent: true, opacity: 0.9 });

//   const group = new THREE.LineSegments(geom, mat);
//   group.renderOrder = 10; // draw over domain box
//   return { group, geom, pos };
// }

// function init_quiver() {
//   if (!debug_params.is_draw_air_velocity_2d || quiver_group) return;
//   const q = make_quiver_grid();
//   quiver_group = q.group;
//   quiver_geom = q.geom;
//   quiver_positions = q.pos;
//   scene.add(quiver_group);
//   update_quiver(0); // initialize positions
// }

// function update_quiver(t) {
//   if (!debug_params.is_draw_air_velocity_2d || !quiver_group) return;

//   const { nx, ny, z_slice, scale, max_len } = quiver_params;
//   const dx = Lx / (nx - 1);
//   const dy = Ly / (ny - 1);

//   let ptr = 0;
//   const p = new THREE.Vector3();
//   const u = new THREE.Vector3();

//   for (let j = 0; j < ny; j++) {
//     for (let i = 0; i < nx; i++) {
//       // base point
//       p.set(i * dx, j * dy, z_slice);

//       // velocity = ambient + all swirls at this point
//       u.copy(v_air_at(p, t));
//       for (const swirl of S.swirls) {
//         u.add(swirl.eval_velocity_at(p));
//       }

//       // scale + clamp displayed arrow length
//       const mag = u.length();
//       const disp = (mag > 0) ? Math.min(max_len, mag * scale) / (mag || 1) : 0;
//       const tip = new THREE.Vector3().copy(p).addScaledVector(u, disp);

//       // write segment [base, tip] into buffer
//       quiver_positions[ptr++] = p.x;
//       quiver_positions[ptr++] = p.y;
//       quiver_positions[ptr++] = p.z;

//       quiver_positions[ptr++] = tip.x;
//       quiver_positions[ptr++] = tip.y;
//       quiver_positions[ptr++] = tip.z;
//     }
//   }
//   quiver_geom.attributes.position.needsUpdate = true;
// }

function poisson(lambda) {
    // Knuth’s algorithm
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
}

/* ------------------------------- SIM SCAFFOLD ------------------------------ */
function spawn_leaf() {
    const { L } = space;

    // Position & velocity
    const x = new THREE.Vector3(Math.random() * L[0], Math.random() * L[1], 0.2 * L[2] + 0.8 * Math.random() * L[2]);
    const v = new THREE.Vector3(0, 0, 0);

    // Orientation: rotate ẑ → random direction (MATLAB vec_to_quat equivalent)
    const zhat = new THREE.Vector3(0, 0, 1);
    const n0 = new THREE.Vector3().randomDirection();
    const q = new THREE.Quaternion().setFromUnitVectors(zhat, n0);
    const normal = zhat.clone().applyQuaternion(q);

    const R = leaf_params.R;
    const mass = Math.PI * R * R * leaf_params.rho;
    const moment_of_inertia = 0.5 * mass * R * R; // thin disk

    const omega = new THREE.Vector3(0, 0, 0);

    // Mesh
    const geom = new THREE.CircleGeometry(R, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0x66aa33, transparent: true, opacity: leaf_params.alpha_init });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(x);
    mesh.quaternion.copy(q);
    scene.add(mesh);

    return {
        x, v, q, omega, normal,
        R,
        rho: leaf_params.rho,
        mass,
        moment_of_inertia,
        alpha: leaf_params.alpha_init,
        fading_in: true,
        fading_out: false,
        fade_in_speed: leaf_params.fade_in_speed,
        fade_out_speed: leaf_params.fade_out_speed,
        Cd_perpendicular: leaf_params.Cd_perpendicular,
        Cd_parallel: leaf_params.Cd_parallel,
        Cn_max: leaf_params.Cn_max,
        aCoP: leaf_params.aCoP,
        is_alive: true,
        mesh,
    };
}

function init_sim() {
    return {
        t: 0,
        leaves: Array.from({ length: sim_params.n_leaves }, spawn_leaf),
        swirls: [],
    };
}

function step_sim(state) {
    state.t += sim_params.dt;

    // --- spawn leaves ---
    {
        const deficit = Math.max(0, leaf_lifecycle.target_count - state.leaves.length);
        if (deficit > 0) {
            // Scale spawn intensity by how far we are from target (0..1)
            const occ = deficit / Math.max(1, leaf_lifecycle.target_count);
            const lambda = leaf_lifecycle.lambda_base * occ * sim_params.dt;
            const nSpawn = Math.min(deficit, poisson(lambda));
            for (let s = 0; s < nSpawn; s++) state.leaves.push(spawn_leaf());
        }
    }

    // --- spawn swirls ---
    const swirlOcc = 1 - (state.swirls.length / nSwirlMax);
    const lambdaSwirl = Math.max(0, swirlOcc) * lambdaSwirlBase * sim_params.dt;
    const nSpawn = poisson(lambdaSwirl);
    for (let i = 0; i < nSpawn; i++) {
        state.swirls.push(spawn_swirl(space.L, swirl_params));
    }

    // --- advance & cull swirls ---
    for (let i = state.swirls.length - 1; i >= 0; i--) {
        const alive = state.swirls[i].tick(sim_params.dt);
        // remove after envelope fully fades out
        if (!alive && state.swirls[i].life <= 0) state.swirls.splice(i, 1);
    }

    const toRemove = [];
    for (let idx = 0; idx < state.leaves.length; idx++) {
        const leaf = state.leaves[idx];

        // Air velocity at leaf position
        const v_air = v_air_at(leaf.x, state.t);
        for (const swirl of state.swirls) {
            v_air.add(swirl.eval_velocity_at(leaf.x));
        }

        // Forces & moments
        const { F, M } = compute_forces_and_moments(leaf, v_air, sim_params.rho_air);

        // Integrate one step
        newtons(leaf, F, M, sim_params.dt);

        // Runtime sanity checks
        const qn = Math.hypot(leaf.q.x, leaf.q.y, leaf.q.z, leaf.q.w);
        if (!Number.isFinite(qn) || Math.abs(qn - 1) > 1e-3) console.warn('Quaternion off‑unit', qn, leaf);
        if (!Number.isFinite(leaf.x.x + leaf.x.y + leaf.x.z) ||
            !Number.isFinite(leaf.v.x + leaf.v.y + leaf.v.z)) {
            console.error('Non‑finite state detected', leaf);
        }

        // --- bounds check → start fade-out if outside padded domain ---
        const pad = leaf_lifecycle.out_padding;
        const out =
            (leaf.x.x < -pad) || (leaf.x.x > Lx + pad) ||
            (leaf.x.y < -pad) || (leaf.x.y > Ly + pad) ||
            (leaf.x.z < 0 - pad) || (leaf.x.z > Lz + pad);

        if (out && !leaf.fading_out) {
            leaf.fading_out = true;
            leaf.fading_in = false; // stop fade-in if it was still happening
        }

        // --- fade alpha ---
        if (leaf.fading_in) {
            leaf.alpha = Math.min(1, leaf.alpha + leaf.fade_in_speed);
            if (leaf.alpha >= 1) leaf.fading_in = false;
        }
        if (leaf.fading_out) {
            leaf.alpha = Math.max(0, leaf.alpha - leaf.fade_out_speed);
            if (leaf.alpha <= 0) {
                toRemove.push(idx); // queue for removal after loop
            }
        }

        // Sync mesh
        leaf.mesh.position.copy(leaf.x);
        leaf.mesh.quaternion.copy(leaf.q);
        leaf.mesh.material.opacity = Math.max(0, Math.min(1, leaf.alpha));
    }

    // --- cull fully faded leaves (back-to-front) ---
    for (let i = toRemove.length - 1; i >= 0; i--) {
        const idx = toRemove[i];
        const leaf = state.leaves[idx];
        scene.remove(leaf.mesh);
        leaf.mesh.geometry.dispose();
        leaf.mesh.material.dispose();
        state.leaves.splice(idx, 1);
    }

    return state;
}

/* ------------------------------- RUN LOOP ---------------------------------- */
let S = init_sim();

// setup
add_domain_box();
init_quiver();

const DT = sim_params.dt;
const MAX_FRAME = 0.1;
const MAX_STEPS_PER_FRAME = 24;

const N_HISTORY = 60;
let substep_history = Array(N_HISTORY).fill(0);

let prev_ms = performance.now();
let acc = 0;
let fps_ema = 60;

function update_hud(substep_stats = null) {
    if (!S.leaves.length) { hud.textContent = 'no leaves'; return; }
    const L0 = S.leaves[0];

    const substeps_line = substep_stats
        ? `substeps (last ${N_HISTORY}): inst=${substep_stats.inst} | avg=${substep_stats.avg.toFixed(2)} | `
        + `min=${substep_stats.min} | max=${substep_stats.max}\n`
        : '';

    hud.textContent =
        hud_camera_info() + '\n\n' +

        substeps_line +
        `t = ${S.t.toFixed(3)} s\n\n` +

        '--- leaf 1 ---\n' +

        `x0 = [${L0.x.x.toFixed(2)}, ${L0.x.y.toFixed(2)}, ${L0.x.z.toFixed(2)}]\n` +
        `v0 = [${L0.v.x.toFixed(2)}, ${L0.v.y.toFixed(2)}, ${L0.v.z.toFixed(2)}]\n` +
        `alpha0 = ${L0.alpha.toFixed(2)}\n` +
        `q0 = [${L0.q.w.toFixed(3)}, ${L0.q.x.toFixed(3)}, ${L0.q.y.toFixed(3)}, ${L0.q.z.toFixed(3)}]\n` +
        `|v0| = ${L0.v.length().toFixed(2)} m/s\n` +
        `|ω0| = ${L0.omega.length().toFixed(2)} rad/s\n\n` +

        `swirls = ${S.swirls.length} / ${nSwirlMax}\n` +
        `leaves = ${S.leaves.length} / ${leaf_lifecycle.target_count}\n`;
}

function loop(now_ms) {
    const raw_dt = Math.min(MAX_FRAME, (now_ms - prev_ms) / 1000);
    prev_ms = now_ms;
    acc += raw_dt;

    let steps_this_frame = 0;
    while (acc >= DT && steps_this_frame < MAX_STEPS_PER_FRAME) {
        S = step_sim(S);
        acc -= DT;
        steps_this_frame++;
    }
    update_quiver(S.t);

    substep_history.shift();
    substep_history.push(steps_this_frame);

    const sum = substep_history.reduce((a, b) => a + b, 0);
    const avg = sum / N_HISTORY;
    const min = Math.min(...substep_history);
    const max = Math.max(...substep_history);

    update_hud({ inst: steps_this_frame, avg, min, max });

    if (isUseOrbitControls) {
        controls.update();
    }
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('leaf_sim running; leaves:', S.leaves.length);
