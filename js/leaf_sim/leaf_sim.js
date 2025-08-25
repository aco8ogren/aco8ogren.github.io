
// js/leaf_sim/leaf_sim.js

/*
 * @Author: alex 
 * @Date: 2025-08-18 14:16:14 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-25 14:57:37
 */

import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { compute_forces_and_moments } from './forces.js';
import { newtons } from './integrator.js';
import { View } from './view.js';
import { Swirl, spawn_swirl } from './swirl.js';
import { RectangularDomain, CylindricalDomain } from './domain.js';
import { Leaf } from './leaf.js';
import { MeshModelBank } from './mesh.js';
import { PerLeafRenderer } from './renderer.js';
import { QuiverRenderer } from './quiver.js';
import { AirBackgroundSwirl } from './air.js';
import { HudOrchestrator } from './hud.js';
import { initCamPlot, pushCamSample } from './plot.js';

// load assets
const leafModelBank = new MeshModelBank();
await leafModelBank.prepareMany([
    './js/leaf_sim/graphics/build/maple_leaf_1.glb',
    './js/leaf_sim/graphics/build/maple_leaf_2.glb',
]);

console.log('imports successful');

/* -------------------- INPUT -------------------- */
let domain_wire = null;
let _hudVisible = false;
// hud
const hud = new HudOrchestrator({ startVisible: _hudVisible, precision: 3 });
//

const debug_params = {
    is_draw_air_velocity_2d: false,
};

const L = new THREE.Vector3(180, 500, 80);
const domain_padding_frac = new THREE.Vector3(0.1, 0.1, 0.1);
const domain = new RectangularDomain(L, domain_padding_frac);
hud.add(domain);

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
    scope: 'distance', // 'global', 'immersive', 'distance'. scope = 'distance' may only be used with projection = 'perspective'
    distance: 40, // [m], only relevant for scope = 'distance'. The distance from the camera to the edge of the scene, supplied as a positive value.
}

if ((cam_params.scope === 'distance') && (cam_params.projection === 'orthographic')) {
    Error('Cannot use scope = distance with projection = orthographic')
}

/* ----------------------------- AIR ----------------------------- */
// temp
const _vel = new THREE.Vector3();

// air
const air = new AirBackgroundSwirl(air_params);
hud.add(air);

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

function make_camera(cam_params) {
    if (cam_params.projection === 'perspective') {
        const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 5000); // fov=40° default
        if (cam_params.scope === 'distance') {
            cam.position.set(0, 0, -cam_params.distance)
        }
        return cam;
    } else {
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000);
        return cam;
    }
}

const scene = new THREE.Scene();
let cam = make_camera(cam_params);
hud.add(cam);
scene.add(cam);

const leafRenderer = new PerLeafRenderer({
    modelUrl: './graphics/build/maple_leaf.glb',
    materialOpts: { color: 0x66aa33 }, // optional
});
hud.add(leafRenderer);
await leafRenderer.begin(scene);

// pick a fog/background color (ideally the same so the horizon “disappears”)
// const fogColor = new THREE.Color(0x0f1218);
// scene.background = fogColor;

// // add fog: color, near, far (in world units)
// scene.fog = new THREE.Fog(fogColor, /* near */ 1, /* far */ 150);

function scrollerFor(page) {
    return (
        page.querySelector('[data-camera-scroll-source]') ||
        page.querySelector(':scope .page-body.scroller') ||
        page.querySelector(':scope .scroller')
    );
}

export const view = new View(renderer, cam, view_container, domain, cam_params.scope);
hud.add(view);
view.setScope(cam_params.scope);
view.setProjection(cam_params.projection);
view.setDistance(cam_params.distance);

const strip = document.getElementById('page-strip');
const pages = Array.from(strip.querySelectorAll('.page'));
const scrollers = pages.map(scrollerFor);

view.setPanDir({ x: -1, y: -1 });

// Set scroll sources
console.log(cam.position.y)
view.setScrollSource({ x: strip, y: scrollers });
view._updateTargetFromScroll();
view.cam.position.copy(view._target);
console.log(cam.position.y)

// plot
const chart = initCamPlot('cam-plot'); // null-safe
window.addEventListener('resize', () => chart?.resize(), { passive: true });

// quiver
const quiver = new QuiverRenderer(quiver_params);
hud.add(quiver);
quiver.begin(scene, domain);
quiver.setVisible(debug_params.is_draw_air_velocity_2d);

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        view._updateTargetFromScroll();
    }, { passive: true });
}

// hot keys
window.addEventListener('keydown', (e) => {
    // scope
    if (e.key === 'g') { // global

        return;
    }
    if (e.key === 'i') { // immersive

        return;
    }
    if (e.key === 'i') { // distance

        return;
    }

    // projection
    if (e.key === 'o') { // orthographic
        if (!cam.isOrthographicCamera) {

        }
        return;
    }

    if (e.key === 'p') { // perspective
        if (!cam.isPerspectiveCamera) {

        }
        return;
    }

    // quiver
    if (e.key === 'h' && !e.repeat) {
        quiver.toggleHeadVisibility();
    }
    if (e.key === 'q' && !e.repeat) {
        quiver.toggleVisibility();
    }
    if (e.key === 'z' && !e.repeat) {
        hud.toggle();
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

function poisson(lambda) {
    // Knuth’s algorithm
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
}

/* ------------------------------- SIM SCAFFOLD ------------------------------ */
// 1) Minimal green, unlit material (renders with no lights)
function makeLeafBasic(color = 0x66aa33) {
    return new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,   // looks good from both sides
    });
}

function init_leaves() {
    const leaves = [];

    for (let i = 0; i < leaf_population_params.n_init; i += 1) {
        const leaf = new Leaf(leaf_params, domain, /* scene */ null);

        const mg = leafModelBank.get_random_model();
        if (mg) {
            const green = new THREE.MeshBasicMaterial({ color: 0x66aa33, side: THREE.DoubleSide });
            const mg = leafModelBank.get_random_model();
            const group = mg.instantiate(leaf.R, leaf.alpha, green);
            leaf.mesh = group;
        }

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
hud.add(leaves[0])

// setup
domain_wire = add_domain_box();

const DT = sim_params.dt;
const MAX_FRAME = 0.1;
const MAX_STEPS_PER_FRAME = 24;

const N_HISTORY = 60;
let substep_history = Array(N_HISTORY).fill(0);

let prev_ms = performance.now();
let acc = 0;

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

    // update_hud({ inst: steps_this_frame, avg, min, max });
    hud.setContext({ t, substeps: { inst: steps_this_frame, avg, min, max } });
    hud.update();

    if (!view._settled) view.syncCameraToScroll(sim_params.dt);

    renderer.render(scene, cam);
    pushCamSample(chart, t, cam.position.y);
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('leaf_sim running; leaves:', leaves.length);
