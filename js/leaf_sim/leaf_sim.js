
// js/leaf_sim/leaf_sim.js

/*
 * @Author: alex 
 * @Date: 2025-08-18 14:16:14 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-20 18:32:26
 */

import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { compute_forces_and_moments } from './forces.js';
import { newtons } from './integrator.js';
import { View } from './view.js';
import { Swirl, spawn_swirl } from './swirl.js';
import { RectangularDomain, CylindricalDomain } from './domain.js';
import { Leaf } from './leaf.js';
import { PerLeafRenderer } from './renderer.js';
import { QuiverRenderer } from './quiver.js';
import { AirBackgroundSwirl } from './air.js';

console.log('imports successful');

/* -------------------- INPUT -------------------- */
let domain_wire = null

const debug_params = {
    is_draw_air_velocity_2d: true,
};

const L = new THREE.Vector3(60, 500, 80);
const domain_padding_frac = new THREE.Vector3(0.1, 0.1, 0.1);
const domain = new RectangularDomain(L, domain_padding_frac);

// --- air parameters ---
const air_params = {
    density: 1.2, // [kg/m^3]
    background: null, // (pos, t, out) --> THREE.Vector3()
    swirls: [],
}

// --- simulation parameters ---
const sim_params = {
    dt: 1 / 120, // [s]
    g: 9.81, // [m/s^2]
};

// --- leaf properties ---
const leaf_params = {
    R: 0.75,
    rho: 2.0,
    Cd_perpendicular: 2.0,
    Cd_parallel: 0.3,
    Cn_max: 0.5,
    aCoP: 0.25,
    alpha_init: 0.0,
    fade_in_speed: 1, // [alpha/s]
    fade_out_speed: 1, // [alpha/s]
};

// --- leaf population ---
const leaf_population_params = {
    n_init: 500,  // [-]
    n_max: NaN,   // max number of leaves
    lambda_base: 0,     // base spawn rate [leaves/sec] when there are 0 leaves
};
leaf_population_params.n_max = leaf_population_params.n_init * 2;

// --- air velocity ---
const v_air_amp = 20;

// --- background velocity field ---
const background_params = {
    omega: 1 / 20,   // [Hz]
    gamma: 1 / 10,   // [1/m]
}

// --- swirl properties ---
const swirl_params = {
    radius_limits: [5, 10],                              // [m]
    velocity_limits: [v_air_amp / 2, v_air_amp * 1.5],   // [m/s]
    life_limits: [4, 10],                                // [s] plateau (excl. rise/fall)
    rise_time: 1,                                        // [s]
    fall_time: 1,                                        // [s]
};

// --- swirl population ---
const swirl_population_params = {
    n_init: 0,
    n_max: 4,
    lambda_base: 0.5, // base spawn rate [swirls/sec] when there are 0 swirls
}

// --- camera params ---
const cam_params = {
    projection: 'perspective', // 'orthographic', 'perspective'
    scope: 'immersive' // 'global', 'immersive'
}

/* ----------------------------- AIR ----------------------------- */
// temp
const _vel = new THREE.Vector3();

// air
const air = new AirBackgroundSwirl(air_params);

// background
function v_air_background(pos, t, out) {
    let b = background_params;
    const u = v_air_amp * Math.sin(2 * Math.PI * b.gamma * pos.y) * Math.sin(2 * Math.PI * b.omega * t);
    return out.set(u, 0, 0);
}
air.setBackground(v_air_background);

// swirls


// --- quiver (air-velocity debug overlay) ---
const quiver_params = {
    nx: 60,                // grid columns
    ny: 512,                // grid rows
    nz: 1,                 // grid slices in z (set >1 in the future for 3D quiver)
    z_slice: domain.L.z / 2,            // z-plane for nz=1
    scale: 0.05,            // meters per (m/s) displayed
    max_len: 6,            // clamp displayed arrow length (m)
    shaft_radius: 0.05,    // visual thickness
    head_radius: 0.2,    // cone radius (visual)
    head_ratio: 0.25,    // head length as fraction of total arrow length
    color: 0x6ad1ff,
    alpha: 0.4,
    update_every_n_frames: 2, // only update quivers every n frames
};

let quiver_inst = null;    // { shaft: InstancedMesh, head: InstancedMesh, count }
const _q_fromY = new THREE.Quaternion(); // temp
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _scale = new THREE.Vector3();

// --- quiver performance cache ---
const Y_UP_EPS = new THREE.Vector3(1e-9, 1, 1e-9).normalize(); // reused; no per-instance alloc
let quiver_grid = null;           // Float32Array of size count*3 (x,y,z per instance)
let _quiver_frame = 0;            // throttle counter


/* ------------------------------ HUD (debug) ----------------------------- */
const hud = document.createElement('pre');
hud.style.position = 'fixed';
hud.style.top = '0.5%';
hud.style.left = '0.5%';
hud.style.margin = '0';
hud.style.padding = '8px 10px';
hud.style.background = 'rgba(0,0,128,0.6)';
hud.style.color = '#cde';
hud.style.font = '12px/1.3 monospace';
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
renderer.setClearColor(0x0b0e13, 1);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';
view_container.appendChild(renderer.domElement);

function make_camera(scope) {
    // arguments don't matter - defaults get overwritten by attach_view anyway
    if (scope === 'perspective') {
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

const leafRenderer = new PerLeafRenderer();
leafRenderer.begin(scene);

// const view = attach_view(renderer, cam, view_container, domain, cam_params.scope);
const view = new View(renderer, cam, view_container, domain, cam_params.scope);

const quiver = new QuiverRenderer(quiver_params);
quiver.begin(scene, domain);
quiver.setVisible(debug_params.is_draw_air_velocity_2d);

/* -------------------- SCROLL → CAMERA (immersive only) -------------------- */



// 1) Robust scroll source (works on desktop & mobile)
const SCROLL_SRC = (document.getElementById('text-overlay-element') ?? document.scrollingElement) || document.documentElement;

console.log('SCROLL_SRC = ' + SCROLL_SRC.tagName)

// 2) Mapping state
const SCROLL = {
    maxY: NaN,
    minY: NaN,
    baseCamY: NaN,             // camera y at top of page
    travelY: NaN,              // how far cam.y moves from top→bottom
    dir: -1,                 // +1: text & scene move together, -1: invert
};

// 3) Compute visible height of the scene (world meters) with current camera
function viewHeightWorld() {
    if (cam.isOrthographicCamera) {
        return (cam.top - cam.bottom);
    } else {
        // perspective: visible height at z=0 (where we look)
        const d = Math.abs(cam.position.z); // camera is at -d looking toward z=0 // walrus
        const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
        return 2 * d * tan;
    }
}

// 4) Recompute mapping whenever size/projection changes
function recomputeScrollMapping() {
    const vh = viewHeightWorld();
    // Keep camera centered within [0..Ly]; let it traverse only what fits
    const minY = vh * 0.5; // [m]
    const maxY = domain.L.y - vh * 0.5; // [m]
    SCROLL.minY = minY;
    SCROLL.maxY = maxY;
    SCROLL.baseCamY = (SCROLL.dir >= 0) ? minY : maxY; // [m]
    SCROLL.travelY = Math.max(0, maxY - minY); // [m]
}

// 5) Normalized scroll progress [0..1]
function scrollProgress() {
    const range = Math.max(1, SCROLL_SRC.scrollHeight - SCROLL_SRC.clientHeight);
    return THREE.MathUtils.clamp(SCROLL_SRC.scrollTop / range, 0, 1);
}

// 6) Apply mapping (immersive only)
function syncCameraToScroll() {
    if (view.get_scope() !== 'immersive') return;
    const p = scrollProgress(); // 0..1
    console.log(`scroll prog = ${p.toFixed(3)}`)
    cam.position.y = SCROLL.baseCamY + SCROLL.dir * (p * SCROLL.travelY);
    cam.lookAt(domain.L.x / 2, cam.position.y, 0);
    console.log(`sync set cam.position.y = ${cam.position.y}`)
}

// 6) Re-size domain based on size of content
function setDomainSizeFromContent() {

    domain.L.set()
}

// Wire it up
recomputeScrollMapping();
syncCameraToScroll();

SCROLL_SRC.addEventListener('scroll', syncCameraToScroll, { passive: true });
window.addEventListener('resize', () => { view.fit?.(); recomputeScrollMapping(); syncCameraToScroll(); }, { passive: true });

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        recomputeScrollMapping();
        syncCameraToScroll();
    }, { passive: true });
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'g') {
        view.set_scope('global');
        recomputeScrollMapping();
        syncCameraToScroll();
        return;
    }
    if (e.key === 'i') {
        view.set_scope('immersive');
        recomputeScrollMapping();
        syncCameraToScroll();
        return;
    }

    // Projection hotkeys (idempotent)
    if (e.key === 'o') { // force ORTHOGRAPHIC
        if (!cam.isOrthographicCamera) {
            scene.remove(cam);
            cam = make_camera('orthographic');
            scene.add(cam);
            view.swap_camera(cam, 'orthographic'); // if your swap_camera only takes (cam), extra arg is ignored
            recomputeScrollMapping();
            syncCameraToScroll();
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
            recomputeScrollMapping();
            syncCameraToScroll();
            console.log('projection → perspective');
        }
        return;
    }

    // quiver hotkeys
    if (e.key === 'h' && !e.repeat) {
        quiver.toggleHeadVisibility();
    }
    if (e.key === 'q' && !e.repeat) {
        quiver.toggleVisibility();
    }
});

function add_domain_box() {
    const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(domain.L.x, domain.L.y, domain.L.z));
    const mat = new THREE.LineBasicMaterial({ color: 0x2a3646 });
    const wire = new THREE.LineSegments(geom, mat);
    wire.position.set(domain.L.x / 2, domain.L.y / 2, domain.L.z / 2);
    scene.add(wire);
    return wire;
}

// Rebuild the wire using current domain (dispose old resources)
function refreshDomainWire() {
    if (domain_wire) {
        scene.remove(domain_wire);
        domain_wire.geometry?.dispose?.();
        domain_wire.material?.dispose?.();
    }
    domain_wire = add_domain_box();
}

function hud_camera_info() {
    const rect = renderer.domElement.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const proj = cam.isOrthographicCamera ? 'orthographic' : 'perspective';
    const scope = view.get_scope(); // 'global' | 'immersive'

    let first_two_lines = '';

    if (cam.isOrthographicCamera) {
        const fw = cam.right - cam.left;
        const fh = cam.top - cam.bottom;
        const pxmx = (w / fw).toFixed(2);
        const pxmy = (h / fh).toFixed(2);
        first_two_lines = `projection=${proj}  scope=${scope}\ncanvas=${w | 0}×${h | 0}px  frustum=${fw.toFixed(2)}×${fh.toFixed(2)}m  px/m=(${pxmx}, ${pxmy})`;
    } else if (cam.isPerspectiveCamera) {
        // perspective: report px/m at z=0 (the look-at plane)
        const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
        const d = Math.abs(cam.position.z); // we position camera to look at z=0
        const visibleH = 2 * d * tan;
        const visibleW = visibleH * (w / h);
        const pxmx = (w / visibleW).toFixed(2);
        const pxmy = (h / visibleH).toFixed(2);
        first_two_lines = `projection=${proj}  scope=${scope}\ncanvas=${w | 0}×${h | 0}px  vis@z=0=${visibleW.toFixed(2)}×${visibleH.toFixed(2)}m  px/m@z=0=(${pxmx}, ${pxmy})`;
    }

    // Camera position and direction
    const posStr = `[${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)}]`;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir); // unit vector the camera is facing
    const dirStr = `[${dir.x.toFixed(3)}, ${dir.y.toFixed(3)}, ${dir.z.toFixed(3)}]`;

    return `${first_two_lines}\ncam position = ${posStr}   cam dir = ${dirStr}`;
}



function poisson(lambda) {
    // Knuth’s algorithm
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
}

/* ------------------------------- SIM SCAFFOLD ------------------------------ */
function init_leaves() {
    const leaves = [];
    for (let i = 0; i < leaf_population_params.n_init; i += 1) {
        // const leaf = Leaf.spawn(domain.L, leaf_params, /* scene */ null);
        const leaf = new Leaf(leaf_params, domain, /* scene */ null)
        leafRenderer.add_leaf(leaf);
        leaves.push(leaf);
    }
    return leaves;
}


function step_sim() {
    t += sim_params.dt;

    // --- spawn leaves ---
    {
        const deficit = Math.max(0, leaf_population_params.n_max - leaves.length);
        if (deficit > 0) {
            // Scale spawn intensity by how far we are from target (0..1)
            const occ = deficit / Math.max(1, leaf_population_params.n_max);
            const lambda = leaf_population_params.lambda_base * occ * sim_params.dt;
            const nSpawn = Math.min(deficit, poisson(lambda));
            for (let s = 0; s < nSpawn; s++) {
                const leaf = Leaf.spawn(domain.L, leaf_params, null);
                leafRenderer.add_leaf(leaf);
                leaves.push(leaf);
            };
        }
    }

    // --- spawn swirls ---
    const swirlOcc = 1 - (air.swirls.length / swirl_population_params.n_max);
    const lambdaSwirl = Math.max(0, swirlOcc) * swirl_population_params.lambda_base * sim_params.dt;
    const nSpawn = poisson(lambdaSwirl);
    for (let i = 0; i < nSpawn; i++) {
        const swirl = spawn_swirl(domain.L, swirl_params);
        air.addSwirl(swirl)
    }

    // --- advance & cull swirls ---
    for (let i = air.swirls.length - 1; i >= 0; i--) {
        const s = air.swirls[i];
        const alive = s.tick(sim_params.dt);
        if (!alive && s.life <= 0) air.removeSwirl(s);
    }

    const toRemove = [];
    for (let idx = 0; idx < leaves.length; idx++) {
        const leaf = leaves[idx];

        const v_air = air.velocity(leaf.x, t, _vel.set(0, 0, 0));

        // Forces & moments
        compute_forces_and_moments(leaf, v_air, air.density, leaf.F, leaf.M);

        // Integrate one step
        newtons(leaf, leaf.F, leaf.M, sim_params.dt);

        // Runtime sanity checks
        const qn = Math.hypot(leaf.q.x, leaf.q.y, leaf.q.z, leaf.q.w);
        if (!Number.isFinite(qn) || Math.abs(qn - 1) > 1e-3) console.warn('Quaternion off‑unit', qn, leaf);
        if (!Number.isFinite(leaf.x.x + leaf.x.y + leaf.x.z) ||
            !Number.isFinite(leaf.v.x + leaf.v.y + leaf.v.z)) {
            console.error('Non‑finite state detected', leaf);
        }

        // --- bounds check → start fade-out if outside padded domain ---
        if (!domain.contains(leaf.x) && !leaf.fading_out) {
            leaf.fading_out = true;
            leaf.fading_in = false; // stop fade-in if it was still happening
        }

        // --- fade alpha ---
        const faded = leaf.update_alpha(sim_params.dt);
        if (faded) {
            leaf.respawn(domain, leaf_params)
            leafRenderer.update_leaf(leaf);
            // toRemove.push(idx)
        }

        // Sync mesh
        leafRenderer.update_leaf(leaf);
    }

    // --- cull fully faded leaves (back-to-front) ---
    for (let i = toRemove.length - 1; i >= 0; i--) {
        const idx = toRemove[i];
        const leaf = leaves[idx];
        leafRenderer.remove_leaf(leaf);
        leaves.splice(idx, 1);
    }

    return;
}

/* ------------------------------- RUN LOOP ---------------------------------- */
let t = 0;
const leaves = init_leaves();

// setup
domain_wire = add_domain_box();

const DT = sim_params.dt;
const MAX_FRAME = 0.1;
const MAX_STEPS_PER_FRAME = 24;

const N_HISTORY = 60;
let substep_history = Array(N_HISTORY).fill(0);

let prev_ms = performance.now();
let acc = 0;

function hud_quiver_info() {
    if (!quiver) {
        return 'quiver = off'
    } else {
        return `quiver = on  nx = ${quiver.nx} ny = ${quiver.ny} nz = ${quiver.nz}  `
    }
}

function update_hud(substep_stats = null) {
    if (!leaves.length) { hud.textContent = 'no leaves'; return; }
    const L0 = leaves[0];

    const substeps_line = substep_stats
        ? `substeps (last ${N_HISTORY}): inst=${substep_stats.inst} | avg=${substep_stats.avg.toFixed(2)} | `
        + `min=${substep_stats.min} | max=${substep_stats.max}\n`
        : '';

    hud.textContent =
        hud_camera_info() + '\n\n' +

        `SCROLL.minY = ${SCROLL.minY}\n` +
        `SCROLL.maxY = ${SCROLL.maxY}\n` +
        `SCROLL.travelY = ${SCROLL.travelY}\n` +
        `SCROLL.baseCamY = ${SCROLL.baseCamY}\n` +
        `SCROLL.dir = ${SCROLL.dir}\n\n` +

        hud_quiver_info() + '\n\n' +

        substeps_line +
        `t = ${t.toFixed(3)} s\n\n` +

        '--- leaf 1 ---\n' +

        `x0 = [${L0.x.x.toFixed(2)}, ${L0.x.y.toFixed(2)}, ${L0.x.z.toFixed(2)}]\n` +
        `v0 = [${L0.v.x.toFixed(2)}, ${L0.v.y.toFixed(2)}, ${L0.v.z.toFixed(2)}]\n` +
        `alpha0 = ${L0.alpha.toFixed(2)}\n` +
        `q0 = [${L0.q.w.toFixed(3)}, ${L0.q.x.toFixed(3)}, ${L0.q.y.toFixed(3)}, ${L0.q.z.toFixed(3)}]\n` +
        `|v0| = ${L0.v.length().toFixed(2)} m/s\n` +
        `|ω0| = ${L0.omega.length().toFixed(2)} rad/s\n\n` +

        `swirls = ${air.swirls.length} / ${swirl_population_params.n_max}\n` +
        `leaves = ${leaves.length} / ${leaf_population_params.n_max}\n`;

}

function loop(now_ms) {
    const raw_dt = Math.min(MAX_FRAME, (now_ms - prev_ms) / 1000);
    prev_ms = now_ms;
    acc += raw_dt;

    let steps_this_frame = 0;
    while (acc >= DT && steps_this_frame < MAX_STEPS_PER_FRAME) {
        step_sim();
        acc -= DT;
        steps_this_frame++;
    }

    quiver.update((p, out) => air.velocity(p, t, out));

    substep_history.shift();
    substep_history.push(steps_this_frame);

    const sum = substep_history.reduce((a, b) => a + b, 0);
    const avg = sum / N_HISTORY;
    const min = Math.min(...substep_history);
    const max = Math.max(...substep_history);

    update_hud({ inst: steps_this_frame, avg, min, max });

    renderer.render(scene, cam);
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('leaf_sim running; leaves:', leaves.length);
