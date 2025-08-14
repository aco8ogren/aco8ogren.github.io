// js/leaf_sim/forces.js
import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

/**
 * MATLAB port of compute_forces_and_moments (Vector3/Quaternion version).
 * Contract (no sloppy fallbacks):
 *  - leaf.v        : THREE.Vector3   (world)
 *  - leaf.normal   : THREE.Vector3   (world, unit; ALWAYS present & kept in sync elsewhere)
 *  - leaf.q        : THREE.Quaternion (x,y,z,w) unit; orientation world←local
 *  - leaf.R, leaf.mass, leaf.aCoP, leaf.Cd_perpendicular, leaf.Cd_parallel, leaf.Cn_max : numbers
 *  - v_air         : THREE.Vector3   (world)
 *  - rho_air       : number
 * Returns: { F: THREE.Vector3, M: THREE.Vector3 }
 */
export function compute_forces_and_moments(leaf, v_air, rho_air) {
  // --- hard preconditions (fail fast) ---
  if (!(leaf.v instanceof THREE.Vector3)) throw new Error('leaf.v must be THREE.Vector3');
  if (!(leaf.normal instanceof THREE.Vector3)) throw new Error('leaf.normal must be THREE.Vector3');
  if (!(leaf.q instanceof THREE.Quaternion)) throw new Error('leaf.q must be THREE.Quaternion');

  const g = 9.81;

  // relative flow
  const v_rel = leaf.v.clone().sub(v_air);
  const V = v_rel.length();

  // If no meaningful aero, gravity only; moment zero (matches MATLAB’s effect since V^2 scales aero) 
  if (V < 1e-12 || !Number.isFinite(V)) {
    return {
      F: new THREE.Vector3(0, -leaf.mass * g, 0),
      M: new THREE.Vector3(0, 0, 0),
    };
  }

  const v_hat = v_rel.clone().multiplyScalar(1 / V);

  // orientation / normal (MATLAB uses n = leaf.normal) 
  const n = leaf.normal; // MUST be unit and synced with q by the integrator

  // angle between flow & leaf normal
  const cosTh = THREE.MathUtils.clamp(n.dot(v_hat), -1, 1);
  const sinTh = n.clone().cross(v_hat).length();

  // coefficients (Cd, Cn) – identical formulas to MATLAB 
  const Cd = leaf.Cd_parallel +
            (leaf.Cd_perpendicular - leaf.Cd_parallel) * (cosTh * cosTh);
  const Cn = leaf.Cn_max * Math.sin(2 * Math.atan2(sinTh, cosTh));

  // aerodynamic forces (drag + normal) 
  const A = Math.PI * leaf.R * leaf.R;
  const qbar = 0.5 * rho_air * (V * V);

  const F_drag   = v_hat.clone().multiplyScalar(-qbar * A * Cd);
  const signCos  = Math.sign(cosTh);
  const F_normal = n.clone().multiplyScalar(-qbar * A * Cn * signCos);

  const F_aero = F_drag.clone().add(F_normal);

  // center-of-pressure shift & moment (project into local, zero z, normalize, back to world) 
  const q_conj = leaf.q.clone().conjugate(); // do NOT mutate leaf.q
  const v_parallel_local = v_hat.clone().applyQuaternion(q_conj);
  v_parallel_local.z = 0;

  const inPlaneLen = Math.hypot(v_parallel_local.x, v_parallel_local.y);
  if (inPlaneLen > 1e-8) v_parallel_local.multiplyScalar(1 / inPlaneLen); else v_parallel_local.set(0,0,0);

  const r_CoP_local = v_parallel_local.multiplyScalar(-leaf.aCoP * leaf.R);
  const r_CoP_world = r_CoP_local.clone().applyQuaternion(leaf.q);

  // aerodynamic moment (about CoM) 
  const M_aero = new THREE.Vector3().copy(r_CoP_world).cross(F_aero);

  // gravity & resultant (gravity acts at CoM → no gravity moment here) 
  const F_grav = new THREE.Vector3(0, -leaf.mass * g, 0);
  const F_total = F_aero.clone().add(F_grav);
  const M_total = M_aero;

  // final sanity
  if (![F_total.x, F_total.y, F_total.z, M_total.x, M_total.y, M_total.z].every(Number.isFinite)) {
    throw new Error('compute_forces_and_moments produced non-finite output');
  }

  return { F: F_total, M: M_total };
}
