// js/leaf_sim/leaf.js
/*
 * @Author: alex
 * @Date: 2025-08-18 14:17:56
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-24 23:59:00
 */

import * as THREE from 'three';
import { randomUniformByRange } from '../util.js';
import { LeafModel } from './leafModel.js';

const _vec = new THREE.Vector3();
const _z_hat = new THREE.Vector3(0, 0, 1); // the assumed unit normal of the leaf mesh

export class Leaf {
  constructor(params = {}, domain = null, scene = null) {
    // --- position ---
    if (params.x instanceof THREE.Vector3) {
      this.x = params.x.clone();
    } else if (domain) {
      this.x = new THREE.Vector3();
      this.randomize_position(domain); // safe no-op if null
    } else {
      throw Error('Must supply either params.x or domain');
    }

    // --- orientation ---
    if (params.q instanceof THREE.Quaternion) {
      this.q = params.q.clone().normalize();
    } else if (params.normal instanceof THREE.Vector3) {
      params.normal.normalize();
      this.q = new THREE.Quaternion().setFromUnitVectors(_z_hat, params.normal).normalize();
    } else {
      this.q = new THREE.Quaternion();
      this.randomize_orientation();
    }

    // --- velocity ---
    this.v = (params.v instanceof THREE.Vector3) ? params.v.clone() : new THREE.Vector3(0, 0, 0);

    // --- angular velocity ---
    this.omega = (params.omega instanceof THREE.Vector3) ? params.omega.clone() : new THREE.Vector3(0, 0, 0);  // rad/s

    // --- unit normal ---
    this.normal = _z_hat.clone().applyQuaternion(this.q);          // world unit normal

    // --- physical ---
    this.R = Number.isFinite(params.R) ? params.R : NaN;  // m
    this.area = Math.PI * this.R * this.R; // m^2
    this.rho = Number.isFinite(params.rho) ? params.rho : NaN;   // kg/m^2
    this.mass = this.area * this.rho; // kg
    this.moment_of_inertia = 0.5 * this.mass * this.R * this.R; // [kg*m^2], thin disk

    // --- aero coeffs ---
    this.Cd_perpendicular = (params.Cd_perpendicular ?? NaN);
    this.Cd_parallel = (params.Cd_parallel ?? NaN);
    this.Cn_max = (params.Cn_max ?? NaN);
    this.aCoP = (params.aCoP ?? NaN);

    // --- forces and moments ---
    this.F = new THREE.Vector3();
    this.M = new THREE.Vector3();

    // --- lifecycle / viz ---
    this.alpha = (params.alpha ?? 0.0);
    this.fading_in = !!(params.fading_in ?? true);
    this.fading_out = !!(params.fading_out ?? false);
    this.fade_in_speed = (params.fade_in_speed);
    this.fade_out_speed = (params.fade_out_speed);
    this.is_alive = (params.is_alive ?? true);

    // --- mesh (optional) ---
    this.mesh = null;
    if (scene && params.mesh !== false) {
      this.mesh = Leaf._make_mesh(this.R, this.alpha);
      this.mesh.position.copy(this.x);
      this.mesh.quaternion.copy(this.q);
      scene.add(this.mesh);

      // --- for batch drawing (in the future) ---
      this.tile_id = -1;   // -1 = unknown/unassigned (used only by a tiled renderer)
    }
  }

  // ---------- GLB master hook ----------
  static async prepareModel(modelUrl = './graphics/build/maple_leaf.glb') {
    if (!Leaf._model) Leaf._model = new LeafModel(modelUrl);
    if (!Leaf._model.ready && !Leaf._model.failed) await Leaf._model.load();
    return Leaf._model;
  }

  // ---------- factories ----------
  /** Empty placeholder (no mesh). Fill fields later as you wish. */
  static empty() { return new Leaf(); }

  // ---------- per-frame helpers ----------
  update_alpha(dt) {
    if (this.fading_in) {
      this.alpha = Math.min(1, this.alpha + this.fade_in_speed * dt);
      if (this.alpha >= 1) this.fading_in = false;
    }
    if (this.fading_out) {
      this.alpha = Math.max(0, this.alpha - this.fade_out_speed * dt);
      if (this.alpha <= 0) return true;
    }
    return false;
  }

  /** Keep GPU mesh aligned with CPU state. */
  sync_mesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.x);
    this.mesh.quaternion.copy(this.q);
    Leaf._set_opacity(this.mesh, Math.max(0, Math.min(1, this.alpha)));
  }

  randomize_position(domain, where = null) {
    const L = domain.L;
    const f = domain.padding_fraction;
    if ((where) && (where === 'top-ish')) {
      this.x.set(
        randomUniformByRange(0, L.x),
        randomUniformByRange(0, L.y),
        randomUniformByRange(0.9 * L.z, (1 + f.z) * L.z),
      );
    } else {
      this.x.set(
        randomUniformByRange(0, L.x),
        randomUniformByRange(0, L.y),
        randomUniformByRange(-f.z * L.z, (1 + f.z) * L.z),
      );
    }
  }

  randomize_orientation() {
    const zhat = new THREE.Vector3(0, 0, 1);
    const n0 = new THREE.Vector3().randomDirection();
    this.q.setFromUnitVectors(zhat, n0);
  }

  respawn(domain, params = {}, sceneIfNone = null) {
    const L = domain.L;

    // --- randomize pose like spawn() ---
    this.randomize_position(domain, 'top-ish');
    this.v.set(0, 0, 0);
    this.omega.set(0, 0, 0);

    const zhat = new THREE.Vector3(0, 0, 1);
    const n0 = new THREE.Vector3().randomDirection();
    this.q.setFromUnitVectors(zhat, n0).normalize();
    this.normal.set(0, 0, 1).applyQuaternion(this.q);

    // --- physical/aero (allow overrides; otherwise keep current) ---
    const oldR = (Number.isFinite(this.R) && this.R > 0) ? this.R : 1;
    const newR = Number.isFinite(params.R) ? params.R : this.R;
    const newRho = Number.isFinite(params.rho) ? params.rho : this.rho;

    this.R = newR;
    this.rho = newRho;
    this.area = Math.PI * this.R * this.R;
    this.mass = this.area * this.rho;
    this.moment_of_inertia = 0.5 * this.mass * this.R * this.R;

    if (params.Cd_perpendicular != null) this.Cd_perpendicular = params.Cd_perpendicular;
    if (params.Cd_parallel != null) this.Cd_parallel = params.Cd_parallel;
    if (params.Cn_max != null) this.Cn_max = params.Cn_max;
    if (params.aCoP != null) this.aCoP = params.aCoP;

    // --- lifecycle / fade ---
    this.alpha = (params.alpha_init ?? 0.0);
    this.fading_in = true;
    this.fading_out = false;
    this.is_alive = true;

    // forces/moments reset
    this.F.set(0, 0, 0);
    this.M.set(0, 0, 0);

    // --- mesh reuse (no new Mesh) ---
    if (this.mesh) {
      // Prefer scaling over swapping geometry to avoid allocations:
      const s = (Number.isFinite(newR) && newR > 0) ? (newR / oldR) : 1;
      if (s !== 1) this.mesh.scale.multiplyScalar(s);

      Leaf._set_opacity(this.mesh, this.alpha);
    } else if (sceneIfNone) {
      // If headless until now, create a mesh/group now (GLB if available)
      this.mesh = Leaf._make_mesh(this.R, this.alpha);
      sceneIfNone.add(this.mesh);
    }

    this.sync_mesh(); // position/quaternion/opacity → GPU
    return this;
  }

  /** Remove from scene & free per-leaf GPU materials (keep shared geometry intact). */
  dispose(scene) {
    if (!this.mesh) return;
    scene.remove(this.mesh);

    const m = this.mesh;
    if (m.isMesh) {
      // Only dispose geometry if it was created as a per-leaf primitive
      if (m.geometry?.userData?._leafOwnedPrimitive) m.geometry.dispose?.();
      m.material?.dispose?.();
    } else {
      m.traverse(o => { if (o.isMesh) o.material?.dispose?.(); });
    }
    this.mesh = null;
  }

  // ---------- internals ----------
  static _set_opacity(rootOrMesh, a) {
    const alpha = Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 0;
    if (!rootOrMesh) return;
    if (rootOrMesh.isMesh) {
      if (rootOrMesh.material) {
        rootOrMesh.material.transparent = true;
        rootOrMesh.material.opacity = alpha;
      }
      return;
    }
    rootOrMesh.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.transparent = true;
        o.material.opacity = alpha;
      }
    });
  }

  static _make_mesh(R, alpha) {
    const mdl = Leaf._model;
    if (mdl && mdl.ready && !mdl.failed) {
      // Use GLB group
      return mdl.instantiateLeaf({ targetRadius: R, opacity: alpha });
    }
    // Primitive fallback
    console.log('made a circle')
    const geom = new THREE.CircleGeometry(R, 24);
    geom.userData._leafOwnedPrimitive = true;
    const mat = new THREE.MeshBasicMaterial({ color: 0x66aa33, transparent: true, opacity: alpha });
    return new THREE.Mesh(geom, mat);
  }

  hud_block(ctx = {}) {
    return `Leaf:
  pos = [${this.x.x.toFixed(2)}, ${this.x.y.toFixed(2)}, ${this.x.z.toFixed(2)}]
  v   = [${this.v.x.toFixed(2)}, ${this.v.y.toFixed(2)}, ${this.v.z.toFixed(2)}]
  alpha = ${this.alpha.toFixed(2)}`;
  }
}

// Static backing for the shared GLB model
Leaf._model = null;
