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

