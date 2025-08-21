
// js/leaf_sim/per_leaf_renderer.js

/*
 * @Author: alex 
 * @Date: 2025-08-18 14:17:46 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-18 16:49:04
 */

import * as THREE from 'three';

export class PerLeafRenderer {
  constructor(material_opts = {}) {
    this.material_opts = material_opts;
  }
  begin(scene) { this.scene = scene; }

  add_leaf(leaf) {
    // Geometry/material could be shared across leaves to reduce allocations:
    // For now keep it simple: tiny geometries are cheap; refactor later to shared.
    const geom = new THREE.CircleGeometry(leaf.R, 24);
    const mat  = new THREE.MeshBasicMaterial({
      color: 0x66aa33,
      transparent: true,
      opacity: isFinite(leaf.alpha) ? leaf.alpha : 0,
      ...this.material_opts
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(leaf.x);
    mesh.quaternion.copy(leaf.q);
    this.scene.add(mesh);

    leaf.mesh = mesh;      // attach handle to leaf (state still lives on the leaf)
    leaf.tile_id = -1;     // unused in this renderer
  }

  update_leaf(leaf) {
    if (!leaf.mesh) return;
    leaf.mesh.position.copy(leaf.x);
    leaf.mesh.quaternion.copy(leaf.q);
    leaf.mesh.material.opacity = leaf.alpha; // Math.max(0, Math.min(1, leaf.alpha || 0));
  }

  remove_leaf(leaf) {
    if (!leaf.mesh) return;
    this.scene.remove(leaf.mesh);
    leaf.mesh.geometry?.dispose?.();
    leaf.mesh.material?.dispose?.();
    leaf.mesh = null;
  }

  end() { this.scene = null; }
  frame_finalize() { /* no-op */ }
}
