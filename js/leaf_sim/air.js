/*
 * @Author: alex 
 * @Date: 2025-08-25 13:23:36 
 * @Last Modified by:   alex 
 * @Last Modified time: 2025-08-25 13:23:36 
 */
// js/leaf_sim/air.js
import * as THREE from 'three';

/** Scratch for summing field contributions without allocations */
const _vec = new THREE.Vector3();

/** @typedef {(pos:THREE.Vector3, t:number, out:THREE.Vector3)=>THREE.Vector3} VelocityField */
/** @typedef {import('./swirl.js').Swirl} Swirl */

export class Air {
    /**
     * @param {Object} [params]
     * @param {number} [params.density]
     * @param {VelocityField[]} [params.velocity_fields]
     */
    constructor(params = {}) {
        this.density = params.density ?? NaN;
        /** @type {VelocityField[]} */
        this.velocity_fields = Array.isArray(params.velocity_fields)
            ? params.velocity_fields.slice()
            : [];
    }

    static empty() { return new Air(); }

    /**
     * Evaluate all velocity fields and sum into `out`.
     * Signature matches each field: (pos, t, out) -> out
     * @param {THREE.Vector3} pos
     * @param {number} t
     * @param {THREE.Vector3} out
     * @returns {THREE.Vector3}
     */
    velocity(pos, t, out) {
        out.set(0, 0, 0);
        for (const field of this.velocity_fields) {
            field(pos, t, _vec.set(0, 0, 0));
            out.add(_vec);                     // accumulate
        }
        return out;
    }

    /** Optional helpers (chainable) */
    addField(fn) { this.velocity_fields.push(fn); return this; }
    clearFields() { this.velocity_fields.length = 0; return this; }
}

export class AirBackgroundSwirl extends Air {
    /**
     * @param {Object} [params]
     * @param {number} [params.density]
     * @param {VelocityField|null} [params.background]  // (pos,t,out)=>out
     * @param {Swirl[]} [params.swirls]
     */
    constructor(params = {}) {
        super(params);
        /** @type {VelocityField|null} */
        this.background = params.background ?? null;
        /** @type {Swirl[]} */
        this.swirls = Array.isArray(params.swirls) ? params.swirls.slice() : [];
        this.update_velocity_fields();
    }

    /**
     * Rebuild `velocity_fields` from `background` and `swirls`.
     * - `background(pos,t,out)` is used directly if present.
     * - Each `swirl` is adapted to (pos,t,out) by ignoring `t` and calling
     *   `swirl.eval_velocity_at(pos, out)`.
     * @returns {this}
     */
    update_velocity_fields() {
        /** @type {VelocityField[]} */
        const fields = [];

        if (this.background) {
            fields.push((pos, t, out) => this.background(pos, t, out));
        }

        if (this.swirls.length) {
            for (const swirl of this.swirls) {
                fields.push((pos, _t, out) => {
                    // Some swirls may not depend on time; ignore `t` here.
                    out.set(0, 0, 0);
                    swirl.velocity(pos, out);
                    return out;
                });
            }
        }

        this.velocity_fields = fields;
        return this;
    }

    /** Setters that keep fields in sync (chainable) */
    setBackground(fn) {
        if (typeof fn !== 'function') {
            throw new TypeError('setBackground expects (pos,t,out)=>THREE.Vector3');
        }
        this.background = fn;
        return this.update_velocity_fields();
    }

    /** @param {Swirl} s */
    addSwirl(s) {
        this.swirls.push(s);
        return this.update_velocity_fields();
    }

    /** @param {Swirl} s */
    removeSwirl(s) {
        const i = this.swirls.indexOf(s);
        if (i !== -1) this.swirls.splice(i, 1);
        return this.update_velocity_fields();
    }

    clearSwirls() {
        this.swirls.length = 0;
        return this.update_velocity_fields();
    }

    hud_block(ctx = {}) {
        return `Air:
  density = ${this.density}
  swirls = ${this.swirls.length}`;
    }

}
