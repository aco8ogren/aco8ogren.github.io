// js/leaf_sim/quiver.js
import * as THREE from 'three';

export class QuiverRenderer {
    constructor(opts = {}) {
        this.nx = opts.nx ?? 36;
        this.ny = opts.ny ?? 256;
        this.nz = opts.nz ?? 1;

        // For nz === 1 we use a single plane at z_slice; for nz > 1 we ignore z_slice
        this.z = opts.z_slice ?? 0;

        this.scale = opts.scale ?? 0.08;
        this.maxLen = opts.max_len ?? 6.0;
        this.throttle = Math.max(1, opts.throttle ?? 2);

        this.shaftRadius = opts.shaftRadius ?? 0.05;
        this.headRadius = opts.headRadius ?? 0.20;
        this.headRatio = opts.headRatio ?? 0.25;

        this.color = opts.color ?? 0x6ad1ff;
        this.opacity = opts.opacity ?? 0.4;
        this.renderOrder = opts.renderOrder ?? 10;

        this.headsEnabled = (opts.headsEnabled ?? true);

        // lazies
        this.scene = null;
        this.count = this.nx * this.ny * this.nz;     // <<< fix: include nz
        this._bases = null; // Float32Array of xyz base points
        this._frame = 0;

        // THREE objects
        this.group = null;
        this.shaft = null; // InstancedMesh (cylinder)
        this.head = null;  // InstancedMesh (cone), optional

        // geometries/materials
        this._geomShaft = null;
        this._geomHead = null;
        this._mat = null;

        // temps (no per-frame alloc)
        this._p = new THREE.Vector3();
        this._u = new THREE.Vector3();
        this._q = new THREE.Quaternion();
        this._m = new THREE.Matrix4();
        this._hide = new THREE.Matrix4().makeScale(0, 0, 0);

        // avoid Y antiparallel degeneracy in setFromUnitVectors
        this._Y_UP_EPS = new THREE.Vector3(1e-9, 1, 1e-9).normalize();
    }

    // Build a regular grid of bases across the domain; 3 floats per instance
    _makeBases(space) {
        const Lx = space.L.x, Ly = space.L.y, Lz = space.L.z;
        const dx = (this.nx > 1) ? Lx / (this.nx - 1) : 0;
        const dy = (this.ny > 1) ? Ly / (this.ny - 1) : 0;
        const dz = (this.nz > 1) ? Lz / (this.nz - 1) : 0;

        const N = this.nx * this.ny * this.nz;
        const bases = new Float32Array(N * 3);

        let w = 0;
        for (let k = 0; k < this.nz; k++) {
            const z = (this.nz > 1) ? (k * dz) : this.z; // plane vs volume
            for (let j = 0; j < this.ny; j++) {
                for (let i = 0; i < this.nx; i++) {
                    bases[w++] = i * dx;
                    bases[w++] = j * dy;
                    bases[w++] = z;
                }
            }
        }
        return bases;
    }

    // Recompute bases when domain size changes (instance count unchanged)
    reseed(space) {
        if (!this.group) return;
        this._bases = this._makeBases(space);
    }

    begin(scene, space) {
        this.scene = scene;

        // precompute base grid (plane if nz=1, otherwise volume)
        this._bases = this._makeBases(space);

        // shared material
        this._mat = new THREE.MeshBasicMaterial({
            color: this.color, transparent: true, opacity: this.opacity, depthWrite: false
        });

        // cylinder along +Y, unit height (we scale per-instance)
        this._geomShaft = new THREE.CylinderGeometry(
            this.shaftRadius, this.shaftRadius, 1, 8, 1, true
        );
        // cone along +Y, unit height (we scale per-instance)
        this._geomHead = new THREE.ConeGeometry(this.headRadius, 1, 12);

        // create meshes
        const N = this.count;
        this.shaft = new THREE.InstancedMesh(this._geomShaft, this._mat, N);
        this.shaft.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.shaft.renderOrder = this.renderOrder;
        this.shaft.frustumCulled = false;

        this.group = new THREE.Group();
        this.group.add(this.shaft);

        if (this.headsEnabled) {
            this.head = new THREE.InstancedMesh(this._geomHead, this._mat, N);
            this.head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.head.renderOrder = this.renderOrder + 1;
            this.head.frustumCulled = false;
            this.group.add(this.head);
        }

        this.scene.add(this.group);

        // initialize hidden
        for (let k = 0; k < N; k++) {
            this.shaft.setMatrixAt(k, this._hide);
            if (this.head) this.head.setMatrixAt(k, this._hide);
        }
        this.shaft.instanceMatrix.needsUpdate = true;
        if (this.head) this.head.instanceMatrix.needsUpdate = true;
    }

    update(sampleVelocity) {
        if (!this.group) return;
        if ((this._frame++ % this.throttle) !== 0) return;

        const N = this.count;
        const scale = this.scale;
        const maxLen = this.maxLen;
        const half = 0.5;
        const headRatio = this.headRatio;

        let r = 0;
        for (let idx = 0; idx < N; idx++) {
            // base point
            const bx = this._bases[r++], by = this._bases[r++], bz = this._bases[r++];
            this._p.set(bx, by, bz);

            // velocity + magnitude
            sampleVelocity(this._p, this._u);
            const mag = this._u.length();

            if (mag <= 1e-12) {
                // hide this instance
                this.shaft.setMatrixAt(idx, this._hide);
                if (this.head) this.head.setMatrixAt(idx, this._hide);
                continue;
            }

            // direction & displayed lengths
            const invMag = 1 / mag;
            this._u.multiplyScalar(invMag);
            const dispLen = Math.min(maxLen, mag * scale);
            const headLen = headRatio * dispLen;
            const shaftLen = Math.max(0, dispLen - headLen);

            // orientation quaternion from slightly-tilted Y to dir
            this._q.setFromUnitVectors(this._Y_UP_EPS, this._u);

            // --- shaft transform ---
            this._m.makeRotationFromQuaternion(this._q);
            this._m.scale(new THREE.Vector3(1, shaftLen, 1));
            const sx = bx + this._u.x * (shaftLen * half);
            const sy = by + this._u.y * (shaftLen * half);
            const sz = bz + this._u.z * (shaftLen * half);
            this._m.setPosition(sx, sy, sz);
            this.shaft.setMatrixAt(idx, this._m);

            // --- head transform (tip cone) ---
            if (this.head && this.head.visible) {
                this._m.makeRotationFromQuaternion(this._q);
                this._m.scale(new THREE.Vector3(1, headLen, 1));
                const hx = bx + this._u.x * (shaftLen + headLen * half);
                const hy = by + this._u.y * (shaftLen + headLen * half);
                const hz = bz + this._u.z * (shaftLen + headLen * half);
                this._m.setPosition(hx, hy, hz);
                this.head.setMatrixAt(idx, this._m);
            }
        }

        this.shaft.instanceMatrix.needsUpdate = true;
        if (this.head) this.head.instanceMatrix.needsUpdate = true;
    }

    setVisible(v) { if (this.group) this.group.visible = !!v; }
    toggleHeadVisibility() { if (this.head) this.head.visible = !this.head.visible; }
    toggleVisibility() { this.shaft.visible = !this.shaft.visible; if (!this.shaft.visible) { this.head.visible = false } }

    end() {
        if (!this.group) return;
        this.scene.remove(this.group);
        this.shaft?.geometry?.dispose?.();
        this.head?.geometry?.dispose?.();
        this._mat?.dispose?.();
        this._geomShaft = null;
        this._geomHead = null;
        this._mat = null;
        this.group = null; this.shaft = null; this.head = null;
        this._bases = null; this.scene = null;
    }

    hud_block(ctx = {}) {
        return `Quiver:
  grid = ${this.nx}×${this.ny}×${this.nz}
  visible = ${!!this.group}`;
    }

}
