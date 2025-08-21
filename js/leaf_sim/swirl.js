
// js/leaf_sim/swirl.js

/*
 * Localized Gaussian vortex with smooth on/off envelope (Three.js types).
 * Matches MATLAB Swirl.advance and eval_swirl_at_point behavior.
 * 
 * @Author: alex 
 * @Date: 2025-08-18 14:17:55 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-20 15:27:31
 */

import * as THREE from 'three';

// temps
const _r_vec = new THREE.Vector3();
const _r_para = new THREE.Vector3();
const _r_perp = new THREE.Vector3();
const _r_hat = new THREE.Vector3();
const _t_hat = new THREE.Vector3();

// smooth half-step (same behavior shape as MATLAB's flc2hs)
function flc2hs(x, s) {
  const d = s;
  if (x <= -d) return 0;
  if (x >= d) return 1;
  const r = x / d;
  return 0.5 + 0.9375 * r - 0.625 * (r ** 3) + 0.1875 * (r ** 5);
}

export class Swirl {
  /**
   * @param {Object} opts
   * @param {THREE.Vector3} [opts.center=new THREE.Vector3()]
   * @param {THREE.Vector3} [opts.axis=new THREE.Vector3(0,0,1)]  // will be normalized
   * @param {number} [opts.R=1]       // core radius [m]
   * @param {number} [opts.U0=1]      // peak tangential speed [m/s]
   * @param {number} [opts.duration=6]
   * @param {number} [opts.rise_time=1]
   * @param {number} [opts.fall_time=1]
   */
  constructor({
    center = new THREE.Vector3(0, 0, 0),
    axis = new THREE.Vector3(0, 0, 1),
    R = 1,
    U0 = 1,
    duration = 6,
    rise_time = 1,
    fall_time = 1,
  } = {}) {
    this.center = center.clone();
    this.axis = axis.clone().normalize();
    if (this.axis.lengthSq() === 0) this.axis.set(0, 0, 1);
    this.R = R;
    this.U0 = U0;

    this.duration = duration;
    this.rise_time = rise_time;
    this.fall_time = fall_time;
    this.local_time = 0;
    this.life = 0;  // [0..1], envelope multiplier
  }

  /** Advance internal clock and update life envelope. Returns whether still “alive”. */
  tick(dt) {
    this.local_time += dt;
    const t = this.local_time;
    const tf = this.duration;
    const on = flc2hs(t - this.rise_time / 2, this.rise_time / 2);
    const off = flc2hs((tf - t) - this.fall_time / 2, this.fall_time / 2);
    this.life = Math.max(0, Math.min(1, on * off));
    return this.local_time <= this.duration;
  }

  /**
   * Evaluate air velocity at world point x (Vector3).
   * Mirrors MATLAB eval_swirl_at_point: tangential to axis, Gaussian in r. 
   * Returns a THREE.Vector3.
   */
  // inside class Swirl
  /**
   * Evaluate air velocity at world point x into 'out' (no allocations).
   * Returns 'out'.
   */
  velocity(x, out) {
    // r_vec: displacement from center
    _r_vec.subVectors(x, this.center);

    // Split into components parallel and perpendicular to axis
    _r_para.copy(this.axis).multiplyScalar(_r_vec.dot(this.axis));
    _r_perp.subVectors(_r_vec, _r_para);

    const r = _r_perp.length();
    if (r < 1e-9 || this.R <= 0 || this.U0 === 0 || this.life <= 0) {
      return out.set(0, 0, 0);
    }

    _r_hat.copy(_r_perp).multiplyScalar(1 / r);
    _t_hat.crossVectors(this.axis, _r_hat); // tangential direction

    const env = this.U0 * Math.exp(-0.5 * (r / this.R) * (r / this.R)) * this.life;
    return out.copy(_t_hat).multiplyScalar(env);
  }
}

/**
 * Helper to spawn a swirl inside a [Lx,Ly,Lz] domain, matching your prior JS behavior.
 * Returns a Swirl with Vector3 fields.
 */
export function spawn_swirl(space_L, params) {
  const [Lx, Ly, Lz] = space_L;
  const center = new THREE.Vector3(Math.random() * Lx, Math.random() * Ly, 0.5 * Lz);
  const axis = new THREE.Vector3(0, 0, 1);

  const lerp = (a, b, t) => a * (1 - t) + b * t;
  const R = lerp(params.radius_limits[0], params.radius_limits[1], Math.random());
  const U0 = lerp(params.velocity_limits[0], params.velocity_limits[1], Math.random());
  const dur = lerp(params.life_limits[0], params.life_limits[1], Math.random());

  return new Swirl({
    center, axis, R, U0,
    duration: dur,
    rise_time: params.rise_time,
    fall_time: params.fall_time,
  });
}
