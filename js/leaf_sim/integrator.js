// js/leaf_sim/integrator.js
import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

/**
 * Symplectic Euler integration (MATLAB newtons.m port).
 * All state vectors/quaternions are THREE types.
 */
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
