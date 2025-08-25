// js/leaf_sim/leafModel.js
import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';

export class LeafModel {
  /**
   * @param {string} modelUrl Path to GLB relative to this module, e.g. './graphics/build/maple_leaf.glb'
   */
  constructor(modelUrl = './graphics/build/maple_leaf.glb') {
    this.modelUrl = modelUrl;

    // Public props:
    this.leaf_mesh_group = new THREE.Group(); // Group of meshes (prototype view)
    this.srcRadius = 1;                       // Bounding sphere radius of source model

    // Internals:
    this._loader = new GLTFLoader();
    this._ready = false;
    this._failed = false;
    this._protos = []; // [{ name, geometry, materialTemplate }]
  }

  get ready()  { return this._ready; }
  get failed() { return this._failed; }

  async load() {
    if (this._ready || this._failed) return this;

    const url = new URL(this.modelUrl, import.meta.url).href;

    // Proper Promise wrapper around callback-style GLTFLoader.load
    let gltf;
    try {
      gltf = await new Promise((resolve, reject) => {
        this._loader.load(url, resolve, undefined, reject);
      });
    } catch (err) {
      console.warn('[LeafModel] Failed to load:', err);
      this._failed = true;
      return this;
    }

    const src = gltf.scene || gltf.scenes?.[0];
    if (!src) {
      console.warn('[LeafModel] GLB has no scene');
      this._failed = true;
      return this;
    }

    // Build lightweight prototypes
    const protos = [];
    src.traverse(o => {
      if (o.isMesh) {
        o.geometry?.computeBoundingSphere?.();
        protos.push({
          name: o.name || '',
          geometry: o.geometry,
          materialTemplate: new THREE.MeshBasicMaterial({ color: 0x66aa33 }),
        });
      }
    });
    this._protos = protos;

    // Size reference
    const sphere = new THREE.Box3().setFromObject(src).getBoundingSphere(new THREE.Sphere());
    this.srcRadius = 0.5*sphere.radius || 1; // the 0.5 is a hacky magic number - make this process more robust. I'm figuring out the size of the mesh (using a bounding sphere) then later using this info to scale my desired radius.

    // Construct the public prototype group (shares geometry + source materials)
    const g = new THREE.Group();
    for (const p of protos) {
      const m = new THREE.Mesh(p.geometry, p.materialTemplate);
      m.name = p.name;
      m.castShadow = false;
      m.receiveShadow = false;
      g.add(m);
    }
    this.leaf_mesh_group = g;

    this._ready = true;
    return this;
  }

  /**
   * Make a new instance (group) sharing geometry, cloning materials so opacity/tint can vary per leaf.
   */
  instantiateLeaf({ color, opacity = 1, targetRadius = this.srcRadius, materialOpts = {} } = {}) {
    if (!this._ready || this._failed) {
      throw new Error('[LeafModel] instantiateLeaf() called before model loaded or after failure.');
    }

    const grp = new THREE.Group();
    for (const p of this._protos) {
      const mat = p.materialTemplate.clone();
      if (color !== undefined) mat.color?.set?.(color);
      Object.assign(mat, materialOpts);
      mat.transparent = opacity < 1 || mat.transparent === true;
      mat.opacity = opacity;

      const mesh = new THREE.Mesh(p.geometry, mat);
      mesh.name = p.name;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      grp.add(mesh);
    }

    const s = targetRadius > 0 ? (targetRadius / this.srcRadius) : 1;
    grp.scale.setScalar(s);
    return grp;
  }
}
