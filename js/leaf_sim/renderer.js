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
    if (!leaf.mesh) {
      leaf.mesh = Leaf._make_mesh(leaf.R, Number.isFinite(leaf.alpha) ? leaf.alpha : 0);
      this.scene.add(leaf.mesh);
    }
    // Ensure pose is synced on first add
    leaf.mesh.position.copy(leaf.x);
    leaf.mesh.quaternion.copy(leaf.q);
  }

  update_leaf(leaf) {
    if (!leaf.mesh) return;
    leaf.mesh.position.copy(leaf.x);
    leaf.mesh.quaternion.copy(leaf.q);
    Leaf._set_opacity(leaf.mesh, leaf.alpha);
  }

  remove_leaf(leaf) {
    if (!leaf.mesh) return;
    this.scene.remove(leaf.mesh);
    // Leave GPU disposal to leaf.dispose(scene) when the lifecycle ends
  }
}
