/*
 * @Author: alex 
 * @Date: 2025-08-25 13:42:22 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-25 14:54:25
 */
// js/leaf_sim/mesh.js
/*
 * Lightweight GLB mesh asset + bank for three.js
 * - MeshGeometry: one GLB prototype (shared BufferGeometry), per-instance material clones
 * - MeshGeometryBank: deduped loader/cache with pick/get helpers
 *
 * @Author: alex
 * @Date: 2025-08-25
 */

import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';

/**
 * One GLB-backed mesh asset.
 * - Loads once
 * - Shares BufferGeometry among all instances
 * - Returns THREE.Group for each instantiate(), with per-instance materials
 */
export class MeshModel {
  constructor(url, opts = {}) {
    this.url = url;

    // instance state
    this.ready = false;
    this.failed = false;
    this.error = null;

    // prototype storage
    this._proto = {
      // flattened “draw list”: each entry is a single mesh recipe with world-space transform
      meshes: [], // [{ geometry, material, matrix: THREE.Matrix4 }]
      radius: 1,  // bounding sphere radius of the prototype
      center: new THREE.Vector3(), // center of bounding sphere (rarely needed)
    };

    // options
    this._opts = {
      loader: opts.loader || new GLTFLoader(),
      // future: recenter/normalize flags if you want them
    };
  }

  /** Load the GLB and build a flattened draw list sharing geometries. */
  async load() {
    if (this.ready || this.failed) return this;

    try {
      const gltf = await this._opts.loader.loadAsync(this.url);
      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) throw new Error('GLB missing scene');

      // Ensure bounds exist for all meshes
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (o.isMesh) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox?.();
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere?.();
        }
      });

      // Compute overall bounds/radius
      const bbox = new THREE.Box3().setFromObject(root);
      const bs = new THREE.Sphere();
      bbox.getBoundingSphere(bs);

      this._proto.radius = bs.radius || 1;
      this._proto.center.copy(bs.center);

      // Build flattened mesh recipes (share geometry, clone materials later)
      const meshes = [];
      root.traverse((o) => {
        if (o.isMesh) {
          const m = new THREE.Matrix4().copy(o.matrixWorld);
          meshes.push({
            geometry: o.geometry,           // shared across instances
            materialProto: o.material,      // clone per instance
            matrix: m,                      // baked world transform
            name: o.name || '',
            frustumCulled: o.frustumCulled,
            castShadow: o.castShadow,
            receiveShadow: o.receiveShadow,
          });
        }
      });
      if (meshes.length === 0) {
        throw new Error('GLB contains no meshes');
      }
      this._proto.meshes = meshes;

      this.ready = true;
      return this;
    } catch (err) {
      this.failed = true;
      this.error = err;
      throw err;
    }
  }

  /** Bounding radius of the unscaled prototype (meters, scene units). */
  get radius() { return this._proto.radius; }

  /**
   * Create a renderable instance.
   * @param {Object} opts
   * @param {number} [opts.targetRadius]  scale uniformly so bounding radius == targetRadius
   * @param {number} [opts.opacity]       set per-material opacity (0..1)
   * @param {function} [opts.onMaterial]  (mat) => void, hook to tweak cloned materials
   * @returns {THREE.Group}
   */
  instantiate(size, opacity, material) {
    if (!this.ready || this.failed) {
      throw new Error('MeshModel not ready. Call await load() first.');
    }
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error('instantiate(size, opacity, material): size must be a positive number (target bounding radius).');
    }
    if (!Number.isFinite(opacity)) {
      throw new Error('instantiate(size, opacity, material): opacity must be a number (0..1).');
    }
    if (!material || material.isMaterial !== true) {
      throw new Error('instantiate(size, opacity, material): material must be a THREE.Material instance (e.g., new THREE.MeshBasicMaterial(...)).');
    }

    // Clone once per leaf so per-leaf fades/tints don’t affect other leaves.
    const mat = material.clone?.() ?? material;
    const a = Math.max(0, Math.min(1, opacity));
    mat.transparent = true;
    mat.opacity = a;

    const group = new THREE.Group();
    group.name = `MeshModel(${this.url})`;

    // Build children as shallow instances: shared geometry, shared (per-leaf) material
    for (const rec of this._proto.meshes) {
      const mesh = new THREE.Mesh(rec.geometry, mat);
      mesh.name = rec.name;
      mesh.frustumCulled = rec.frustumCulled ?? true;
      mesh.castShadow = !!rec.castShadow;
      mesh.receiveShadow = !!rec.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(rec.matrix); // expect LOCAL transform captured during load()
      group.add(mesh);
    }

    // Normalize size to requested bounding radius
    if (this._proto.radius <= 0) {
      throw new Error('MeshModel prototype radius is zero/invalid; cannot scale to requested size.');
    }
    const s = size / this._proto.radius;
    group.scale.setScalar(s);

    return group;
  }



  /**
   * Best-effort cleanup. Do not call while instances exist that still reference the geometries.
   * By default we only dispose cloned prototype materials (if any were created during load—rare).
   * Geometries are shared; disposing them while instances exist will break rendering.
   */
  dispose({ disposeGeometries = false } = {}) {
    // No per-instance materials live here; instance materials are created in instantiate().
    if (disposeGeometries) {
      for (const rec of this._proto.meshes) {
        rec.geometry?.dispose?.();
      }
    }
  }
}

/**
 * A small asset bank for MeshGeometry.
 * - Dedupes concurrent loads
 * - Stores models under keys (key can be the url)
 * - Lets you set a picker for random/weighted selection
 */
export class MeshModelBank {
  constructor() {
    this._models = new Map();     // key -> MeshGeometry
    this._loaders = new Map();    // key -> Promise<MeshGeometry>
    this._picker = null;          // optional selection fn: (...args) => MeshGeometry
  }

  /**
   * Prepare and cache a model under a key.
   * @param {string} keyOrUrl  key name or url if used as single arg
   * @param {string} [maybeUrl]
   * @param {object} [opts]    passed to MeshGeometry ctor
   */
  async prepare(keyOrUrl, maybeUrl, opts = {}) {
    const key = (maybeUrl ? keyOrUrl : keyOrUrl);
    const url = (maybeUrl ?? keyOrUrl);

    if (this._models.has(key)) return this._models.get(key);

    let p = this._loaders.get(key);
    if (!p) {
      const mg = new MeshModel(url, opts);
      p = mg.load().then(() => {
        this._models.set(key, mg);
        return mg;
      }).catch((e) => {
        // don’t poison future loads
        this._loaders.delete(key);
        throw e;
      });
      this._loaders.set(key, p);
    }
    return p;
  }

  /** Bulk prepare: array of [key, url] or plain url strings (key=url). */
  async prepareMany(items = [], opts = {}) {
    const tasks = items.map(entry =>
      Array.isArray(entry) ? this.prepare(entry[0], entry[1], opts) : this.prepare(entry, entry, opts)
    );
    return Promise.all(tasks);
  }

  get_random_model() {
    const vals = Array.from(this._models.values());
    if (!vals.length) return null;
    return vals[(Math.random() * vals.length) | 0];
  }

  get(key) { return this._models.get(key) ?? null; }
  has(key) { return this._models.has(key); }
  keys() { return Array.from(this._models.keys()); }
  values() { return Array.from(this._models.values()); }
  size() { return this._models.size; }

  /** Provide your own selection logic. Example: size-based, weighted RNG, etc. */
  setPicker(fn) { this._picker = (typeof fn === 'function') ? fn : null; }

  /** Pick a model (default: first available). */
  pick(...args) {
    if (this._picker) return this._picker(this, ...args);
    const it = this._models.values().next();
    return it.done ? null : it.value;
  }

  /**
   * Clear the bank. If dispose=true, calls dispose() on each MeshGeometry
   * (WARNING: disposing shared geometries can break live instances).
   */
  clear(dispose = false) {
    if (dispose) {
      for (const mg of this._models.values()) {
        try { mg.dispose({ disposeGeometries: false }); } catch { /* noop */ }
      }
    }
    this._models.clear();
    this._loaders.clear();
    this._picker = null;
  }
}

/*
 * Usage sketch:
 *
 * import { MeshGeometryBank, DefaultMeshGeometryBank } from './meshGeometry.js';
 *
 * // Boot:
 * await DefaultMeshGeometryBank.prepareMany([
 *   ['maple',  '/graphics/build/maple_leaf.glb'],
 *   ['oak',    '/graphics/build/oak_leaf.glb'],
 *   ['ginkgo', '/graphics/build/ginkgo_leaf.glb'],
 * ]);
 *
 * // Pick & instantiate per leaf:
 * const mg = DefaultMeshGeometryBank.pick(/* maybe use R, wind, page, etc. * /);
 * const group = mg.instantiate({ targetRadius: leaf.R, opacity: leaf.alpha });
 * scene.add(group);
 * group.position.copy(leaf.x);
 * group.quaternion.copy(leaf.q);
 *
 * // Or direct key:
 * const oak = DefaultMeshGeometryBank.get('oak');
 * const g = oak.instantiate({ targetRadius: 0.05, opacity: 0.9 });
 */
