/*
 * @Author: alex 
 * @Date: 2025-08-25 13:23:50 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-25 15:03:02
 */
// js/leaf_sim/renderer.js
import * as THREE from 'three';
import { Leaf } from './leaf.js';

export class PerLeafRenderer {
  constructor(opts = {}) {
    this.material_opts = (opts.materialOpts ?? {}); // kept for future per-instance overrides
    this.scene = null;
  }

  async begin(scene) {
    this.scene = scene;
    return this;
  }

  add_leaf(leaf) {
    // Ensure pose is synced on first add
    this.scene.add(leaf.mesh);
    leaf.mesh.position.copy(leaf.x);
    leaf.mesh.quaternion.copy(leaf.q);
  }

  update_leaf(leaf) {
    leaf.mesh.position.copy(leaf.x);
    leaf.mesh.quaternion.copy(leaf.q);
    Leaf._set_opacity(leaf.mesh, leaf.alpha);
  }

  remove_leaf(leaf) {
    this.scene.remove(leaf.mesh);
    // Leave GPU disposal to leaf.dispose(scene) when the lifecycle ends
  }
}
