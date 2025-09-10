(() => {
  const $ = (s) => document.querySelector(s);

  const elList   = $('#publications-list');
  const elSort   = $('#pub-sort');
  const elReverse    = $('#pub-rev');
  const elSearch = $('#pub-search');
  const elCategories   = $('#pub-cat-wrap');
  const tpl      = $('#pub-card-tpl');

  // If this page doesn't have the UI, bail quietly.
  if (!elList || !elSort || !elReverse || !elSearch || !elCategories || !tpl) return;

  let pubs = [];

  // ---------- DATA LOADING ----------
  function getInlineJSON() {
    const tag = document.getElementById('pub-data');
    if (!tag) return null;
    try { return JSON.parse(tag.textContent); } catch { return null; }
  }
  async function fetchJSON() {
    try {
      const resp = await fetch('./data/publications.json', { cache: 'no-store' });
      return resp.ok ? await resp.json() : [];
    } catch { return []; }
  }
  async function loadData() {
    return getInlineJSON() ?? await fetchJSON();
  }

  // ---------- HELPERS ----------
  const norm = (s) => (s ?? '').toString().toLowerCase().trim();
  const parseDate = (p) => new Date(p.date || (p.year ? `${p.year}-01-01` : 0));
  const getCategories = (p) => Array.isArray(p.categories) ? p.categories : (p.category ? [p.category] : []);

  const sorters = {
    'date-desc': (a, b) => parseDate(b) - parseDate(a),
    'category-asc': (a, b) => (getCategories(a)[0] || '').localeCompare((getCategories(b)[0] || ''), undefined, { sensitivity: 'base' }),
  };

  function debounce(fn, ms = 150) {
    let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  }

  // ---------- UI BUILDERS ----------
  function buildCategoryFilters(categories) {
    elCategories.innerHTML = '';
    if (!categories.length) return;

    // "All" checkbox
    const all = document.createElement('label');
    all.style.display = 'inline-flex'; all.style.gap = '.35rem';
    const allBox = Object.assign(document.createElement('input'), { type: 'checkbox', id: 'pub-cat-all', checked: true });
    all.append(allBox, 'All');
    elCategories.appendChild(all);

    // Per-category checkboxes
    for (const cat of categories) {
      const id = `pub-cat-${cat.replace(/\W+/g,'-')}`;
      const lab = document.createElement('label');
      lab.style.display = 'inline-flex'; lab.style.gap = '.35rem';
      const cb = Object.assign(document.createElement('input'), { type: 'checkbox', value: cat, id });
      lab.append(cb, cat);
      elCategories.appendChild(lab);
    }

    // Wiring
    allBox.addEventListener('change', () => {
      elCategories.querySelectorAll('input[type=checkbox]:not(#pub-cat-all)').forEach(b => b.checked = false);
      apply();
    });
    elCategories.addEventListener('change', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'checkbox' && t.id !== 'pub-cat-all') {
        if (t.checked) $('#pub-cat-all').checked = false;
        const any = elCategories.querySelectorAll('input[type=checkbox]:not(#pub-cat-all):checked').length > 0;
        if (!any) $('#pub-cat-all').checked = true;
        apply();
      }
    });
  }

  // ---------- TEMPLATING ----------
  function cardNode(p) {
    const frag = tpl.content.cloneNode(true);

    // Row 1
    const elSimple  = frag.querySelector('.pub-simple-title');
    const elJournal = frag.querySelector('.pub-journal');
    elSimple.textContent  = p.shortTitle || p.title || '';
    elJournal.textContent = p.journalShort || p.journal || '';

    // Row 2
    const linkThumb = frag.querySelector('.pub-thumbnail');
    const imgThumb  = linkThumb.querySelector('img');
    const linkFull  = frag.querySelector('.pub-full-title > a');
    const elAuthors = frag.querySelector('.pub-authors');

    const href = p.pdf || p.url || (p.doi ? `https://doi.org/${p.doi}` : '#');
    linkThumb.href = href;
    linkThumb.setAttribute('aria-label', `Open ${p.shortTitle || p.title || 'publication'}`);

    imgThumb.src = p.thumbnail || 'graphics/thumbnails/coconut_flask.svg';
    imgThumb.alt = `Thumbnail for ${p.shortTitle || p.title || 'publication'}`;

    linkFull.href = p.doi ? `https://doi.org/${p.doi}` : (p.url || '#');
    linkFull.textContent = p.title || '';

    elAuthors.textContent = (p.authors || []).join(', ');

    return frag;
  }

  function render(list) {
    elList.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const p of list) frag.appendChild(cardNode(p));
    elList.appendChild(frag);
  }

  function getActiveCategories() {
    const all = document.getElementById('pub-cat-all');
    if (all && all.checked) return [];
    return Array.from(elCategories.querySelectorAll('input[type=checkbox]:not(#pub-cat-all):checked'))
      .map(cb => cb.value);
  }

  function apply() {
    const q = norm(elSearch.value);
    const activeCats = getActiveCategories();

    // filter
    let list = pubs.filter(p => {
      const hay = [
        p.title, p.shortTitle, p.journal, p.journalShort,
        (p.authors || []).join(' '), ...getCategories(p)
      ].map(norm).join(' | ');
      const matchesText = q ? hay.includes(q) : true;
      const matchesCat  = activeCats.length === 0 ? true : getCategories(p).some(c => activeCats.includes(c));
      return matchesText && matchesCat;
    });

    // sort (+ optional reverse)
    const sorter = sorters[elSort.value] || sorters['date-desc'];
    list = list.slice().sort(sorter);
    if (elReverse.checked) list.reverse();

    render(list);
  }

  // ---------- BOOT ----------
  (async () => {
    pubs = await loadData();

    // Build category filters from data
    const uniqueCategories = Array.from(
      new Set(pubs.flatMap(getCategories).filter(Boolean).map(String))
    ).sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:'base'}));
    buildCategoryFilters(uniqueCategories);

    // Defaults + listeners
    elSort.value = 'date-desc';
    elReverse.checked = false;
    elSort.addEventListener('change', apply);
    elReverse.addEventListener('change', apply);
    elSearch.addEventListener('input', debounce(apply, 180));

    // First paint
    apply();
  })();
})();
