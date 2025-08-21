
// js/leaf_sim/integrator.js

/*
 * Symplectic Euler integration (MATLAB newtons.m port).
 * All state vectors/quaternions are THREE types.
 * @Author: alex 
 * @Date: 2025-08-18 14:17:58 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-18 15:33:32
 */

import * as THREE from 'three';

export function newtons(leaf, F, M, dt) {
  // ---- Linear dynamics ----
  const a = F.clone().multiplyScalar(1 / leaf.mass);
  leaf.v.addScaledVector(a, dt);
  leaf.x.addScaledVector(leaf.v, dt);

  // ---- Rotational dynamics (thin disk: scalar I) ----
  if (!(leaf.moment_of_inertia > 0 && Number.isFinite(leaf.moment_of_inertia))) {
    throw new Error('Invalid moment_of_inertia');
  }
  const alpha = M.clone().multiplyScalar(1 / leaf.moment_of_inertia);
  leaf.omega.addScaledVector(alpha, dt);

  const omega_mag = leaf.omega.length();
  if (omega_mag > 1e-8) {
    const rot_axis = leaf.omega.clone().multiplyScalar(1 / omega_mag); // unit axis
    const dq = new THREE.Quaternion().setFromAxisAngle(rot_axis, omega_mag * dt);
    // q_new = dq ⊗ q_old
    leaf.q.premultiply(dq).normalize();
  }

  // ---- Update normal from quaternion ----
  leaf.normal.set(0, 0, 1).applyQuaternion(leaf.q);

  return leaf;
}
