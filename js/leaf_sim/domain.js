
// js/leaf_sim/domain.js

/*
 * @Author: alex 
 * @Date: 2025-08-18 14:17:48 
 * @Last Modified by: alex
 * @Last Modified time: 2025-08-20 11:25:28
 */

import * as THREE from 'three';

export class Domain {
  // Required interface:
  // contains(p), sample_point(), padding_frac, get_size_vec()
  constructor(padding_fraction = new THREE.Vector3(0,0,0)) {
    this.padding_fraction = padding_fraction;
  }
  contains(_p) { throw new Error('Domain.contains not implemented'); }
  sample_point() { throw new Error('Domain.sample_point not implemented'); }
  get_size_vec() { throw new Error('Domain.get_size_vec not implemented'); }
}

export class RectangularDomain extends Domain {
  // axis-aligned box: [0,L.x]×[0,L.y]×[0,L.z]
  constructor(L, padding_frac) {
    super(padding_frac);
    this.L = new THREE.Vector3(L.x,L.y,L.z);
  }
  contains(position, padding_fraction) {

    const frac = (padding_fraction && padding_fraction.isVector3) ? padding_fraction : this.padding_fraction;

    const p = position;
    return (p.x >= -frac.x*this.L.x && p.x <= this.L.x*(1 + frac.x) &&
            p.y >= -frac.y*this.L.y && p.y <= this.L.y*(1 + frac.y) &&
            p.z >= -frac.z*this.L.z && p.z <= this.L.z*(1 + frac.z));
  }
  sample_point() {
    return new THREE.Vector3(
      Math.random() * this.L.x,
      Math.random() * this.L.y,
      Math.random() * this.L.z
    );
  }
  get_size_vec() { return new THREE.Vector3(this.L.x, this.L.y, this.L.z); }
}

export class CylindricalDomain extends Domain {
  // z-aligned finite cylinder, center (cx,cy,0), radius R, height H with z∈[0,H]
  // padding_fraction: Vector3 as fractions of [R, R, H] just like RectangularDomain
  constructor(R, H, cx = 0, cy = 0, padding_fraction = new THREE.Vector3(0,0,0)) {
    super(padding_fraction);
    this.R = R; this.H = H; this.cx = cx; this.cy = cy;
  }

  contains(position, padding_fraction) {
    const frac = (padding_fraction && padding_fraction.isVector3)
      ? padding_fraction
      : this.padding_fraction;

    const pr = Math.max(frac.x, frac.y); // radial fraction
    const pz = frac.z;                   // vertical fraction

    const Rp = this.R * (1 + pr);
    const zMin = -pz * this.H;
    const zMax = (1 + pz) * this.H;

    const dx = position.x - this.cx;
    const dy = position.y - this.cy;
    const r2 = dx*dx + dy*dy;

    return (r2 <= Rp*Rp) && (position.z >= zMin) && (position.z <= zMax);
  }

  sample_point() {
    // Uniform over disk area in XY, uniform along Z
    const r = Math.sqrt(Math.random()) * this.R;
    const theta = 2 * Math.PI * Math.random();
    const x = this.cx + r * Math.cos(theta);
    const y = this.cy + r * Math.sin(theta);
    const z = Math.random() * this.H;
    return new THREE.Vector3(x, y, z);
  }

  get_size_vec() { return new THREE.Vector3(2*this.R, 2*this.R, this.H); }
}
