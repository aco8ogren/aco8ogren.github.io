// js/util.js

// Clone a <template> block N times into a target container
export function copyElementNTimes(ele_id_to_copy, n, container_to_copy_into) {
    const tpl = document.getElementById(ele_id_to_copy);
    const target = document.getElementById(container_to_copy_into);
    if (!tpl || !target) return;

    const frag = document.createDocumentFragment();

    for (let i = 1; i <= n; i++) {
        const clone = tpl.content.cloneNode(true);                 // deep clone
        clone.querySelectorAll('[data-idx]').forEach(el => {
            el.textContent = i;                                      // e.g., 1, 2, 3...
        });
        clone.querySelectorAll('[data-total]').forEach(el => {
            el.textContent = n;                                      // optional: total count
        });
        frag.appendChild(clone);
    }

    target.appendChild(frag);
}

/**
 * num2str(x, p) — MATLAB-like, but minimal.
 * - x: number | 1D array | 2D array (array of arrays / TypedArray)
 * - p: significant digits (default 6)
 */
function num2str(x, p = 6) {
  const P = (Number.isFinite(p) && p > 0) ? (p | 0) : 6;

  const A = toMatrix(x);
  const S = A.map(row => row.map(v => fmt(v, P)));

  // column widths
  const nCols = Math.max(0, ...S.map(r => r.length));
  const colW = new Array(nCols).fill(0);
  for (const r of S) for (let j = 0; j < r.length; j++) colW[j] = Math.max(colW[j], r[j].length);

  // right-align columns
  return S.map(r => r.map((s, j) => s.padStart(colW[j])).join(' ')).join('\n');

  // ---- helpers ----
  function toMatrix(val) {
    if (Array.isArray(val) || ArrayBuffer.isView(val)) {
      if (Array.isArray(val) && val.length && Array.isArray(val[0])) {
        return val.map(row => Array.from(row, Number));
      }
      return [Array.from(val, Number)];
    }
    return [[Number(val)]];
  }

  function fmt(v, p) {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v < 0 ? '-Inf' : 'Inf';
    const sAbs = Math.abs(v).toPrecision(p);

    // trim trailing zeros/point if not exponential
    let s = (/[eE]/).test(sAbs)
      ? sAbs
      : sAbs.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'').replace(/\.$/,'');

    if (v < 0 || Object.is(v, -0)) s = '-' + s;
    return s;
  }
}


export function randomUniformByRange(min, max) {
    return Math.random() * (max - min) + min
}

