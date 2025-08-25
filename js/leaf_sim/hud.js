/*
 * @Author: alex 
 * @Date: 2025-08-25 13:23:58 
 * @Last Modified by:   alex 
 * @Last Modified time: 2025-08-25 13:23:58 
 */
// js/leaf_sim/hud.js
import * as THREE from 'three';

/**
 * HUD orchestrator: manages a <pre> element and calls hud_block(ctx)
 * on each registered provider.
 */
export class HudOrchestrator {
  /**
   * @param {Object} [opts]
   * @param {HTMLElement} [opts.container=document.body]
   * @param {boolean} [opts.startVisible=true]
   * @param {number}  [opts.precision=3]
   * @param {'tl'|'tr'|'bl'|'br'} [opts.corner='tl']
   */
  constructor(opts = {}) {
    this._providers = [];              // objects with hud_block(ctx)
    this._ctx = { t: 0, prec: opts.precision ?? 3 };

    this.el = document.createElement('pre');
    Object.assign(this.el.style, {
      position: 'fixed',
      margin: '0',
      padding: '8px 10px',
      background: 'rgba(0,0,128,0.6)',
      color: '#cde',
      font: '12px/1.3 monospace',
      borderRadius: '8px',
      pointerEvents: 'none',
      zIndex: 1000,                 // raise above scene
      whiteSpace: 'pre-wrap',
      maxWidth: '40vw',             // prevent one super long line
      maxHeight: '90vh',            // don’t overflow screen
      overflow: 'auto',             // scroll if too long
    });
    (opts.container || document.body).appendChild(this.el);

    this._place(opts.corner ?? 'tl');
    this.visible = (opts.startVisible ?? true);
    this._syncHidden();

    // shared scratch if providers want it
    this._tmp = { v: new THREE.Vector3(), q: new THREE.Quaternion() };
  }

  // ----- Context management -----
  setContext(partial = {}) { Object.assign(this._ctx, partial); }
  set time(t) { this._ctx.t = +t || 0; }
  get time() { return this._ctx.t; }

  // ----- Provider management -----
  add(provider) { if (provider && !this._providers.includes(provider)) this._providers.push(provider); }
  remove(provider) { const i = this._providers.indexOf(provider); if (i !== -1) this._providers.splice(i, 1); }
  clear() { this._providers.length = 0; }

  // ----- Visibility -----
  show() { this.visible = true; this._syncHidden(); }
  hide() { this.visible = false; this._syncHidden(); }
  toggle() { this.visible = !this.visible; this._syncHidden(); }

  // ----- Main update -----
  update() {
    if (!this.visible) return;
    const ctx = this._ctx;
    ctx._tmp = this._tmp;

    const blocks = [];
    for (const p of this._providers) {
      try {
        const s = p?.hud_block?.(ctx);
        if (s) blocks.push(s);
      } catch (err) {
        blocks.push(`[hud error in ${p?.constructor?.name || 'provider'}]`);
      }
    }
    this.el.textContent = blocks.join('\n\n');
  }

  // ----- internals -----
  _place(corner) {
    const s = this.el.style; s.top = s.right = s.bottom = s.left = '';
    if (corner === 'tr') { s.top = '0.5%'; s.right = '0.5%'; }
    else if (corner === 'bl') { s.bottom = '0.5%'; s.left = '0.5%'; }
    else if (corner === 'br') { s.bottom = '0.5%'; s.right = '0.5%'; }
    else { s.top = '0.5%'; s.left = '0.5%'; }
  }
  _syncHidden() { this.el.hidden = !this.visible; }
}
