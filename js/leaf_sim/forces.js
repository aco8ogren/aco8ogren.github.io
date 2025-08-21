
// js/leaf_sim/forces.js

/*
 * @Author: alex 
 * @Date: 2025-08-18 14:17:52 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-19 14:21:14
 * 
 * MATLAB port of compute_forces_and_moments (Vector3/Quaternion version).
 *  - leaf.v        : THREE.Vector3   (world)
 *  - leaf.normal   : THREE.Vector3   (world, unit; ALWAYS present & kept in sync elsewhere)
 *  - leaf.q        : THREE.Quaternion (x,y,z,w) unit; orientation world←local
 *  - leaf.R, leaf.mass, leaf.aCoP, leaf.Cd_perpendicular, leaf.Cd_parallel, leaf.Cn_max : numbers
 *  - v_air         : THREE.Vector3   (world)
 *  - rho_air       : number
 * Returns: { F: THREE.Vector3, M: THREE.Vector3 }
 */

import * as THREE from 'three';

// --- module-scoped temporaries to avoid per-call allocations ---
const _v_rel   = new THREE.Vector3();
const _v_hat   = new THREE.Vector3();
const _r_local = new THREE.Vector3();
const _r_world = new THREE.Vector3();
const _Faero   = new THREE.Vector3();
const _Mtmp    = new THREE.Vector3();
const _q_conj  = new THREE.Quaternion();

// true constants
const g = 9.81;

//
export function compute_forces_and_moments(leaf, v_air, rho_air, outF, outM) {
  // // Preconditions (kept for safety)
  // if (!(leaf.v instanceof THREE.Vector3)) throw new Error('leaf.v must be THREE.Vector3');
  // if (!(leaf.normal instanceof THREE.Vector3)) throw new Error('leaf.normal must be THREE.Vector3');
  // if (!(leaf.q instanceof THREE.Quaternion)) throw new Error('leaf.q must be THREE.Quaternion');

  // _v_rel, V^2, 1 / V, and V
  _v_rel.copy(leaf.v).sub(v_air);
  const V2 = _v_rel.lengthSq();
  if (!Number.isFinite(V2) || V2 <= 1e-24) {
    // gravity only (allocate outputs once here)
    outF.set(0, - leaf.mass * g, 0)
    outM.set(0,0,0)
    return
  }
  const V    = Math.sqrt(V2);
  const invV = 1 / V;

  // unit flow direction
  _v_hat.copy(_v_rel).multiplyScalar(invV);

  // normal & angle components (no acos/atan2)
  const n = leaf.normal; // unit, kept in sync elsewhere
  // let cosTh = _v_hat.dot(n);
  // // numerical safety
  // cosTh = Math.max(-1, Math.min(1, cosTh));
  const cosTh = THREE.MathUtils.clamp(_v_hat.dot(n), -1, 1);
  const sinTh = THREE.MathUtils.clamp(Math.sqrt(1 - cosTh * cosTh), 0, 1);
  const signCos = Math.sign(cosTh);

  // Coefficients
  const Cd = leaf.Cd_parallel +
            (leaf.Cd_perpendicular - leaf.Cd_parallel) * (cosTh * cosTh);

  // sin(2θ) = 2 sinθ cosθ  → avoids trig
  const Cn = leaf.Cn_max * (2 * sinTh * cosTh);

  // Aero magnitudes (use V^2 directly for qbar)
  const A    = leaf.area;
  const qbar = 0.5 * rho_air * V2;

  // F_aero = F_drag + F_normal (in world)
  // Use addScaledVector to avoid temporaries
  _Faero.copy(_v_hat).multiplyScalar(-qbar * A * Cd);
  _Faero.addScaledVector(n, -qbar * A * Cn * signCos);

  // Center-of-pressure offset & moment
  _q_conj.copy(leaf.q).conjugate();
  _r_local.copy(_v_hat).applyQuaternion(_q_conj); // flow dir in local
  _r_local.z = 0;                                  // in-plane component only

  const inPlane2 = _r_local.x * _r_local.x + _r_local.y * _r_local.y;
  if (inPlane2 > 1e-16) {
    const invLen = 1 / Math.sqrt(inPlane2);
    _r_local.multiplyScalar(-leaf.aCoP * leaf.R * invLen);
  } else {
    _r_local.set(0, 0, 0);
  }

  _r_world.copy(_r_local).applyQuaternion(leaf.q);
  _Mtmp.crossVectors(_r_world, _Faero);           // M_aero

  outF.set(_Faero.x, _Faero.y - leaf.mass * g, _Faero.z)
  outM.copy(_Mtmp)
  return
}

