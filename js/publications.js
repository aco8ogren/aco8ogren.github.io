(() => {
    const $ = (s) => document.querySelector(s);

    const elList = $('#publications-list');
    const elSort = $('#pub-sort');
    const elReverse = $('#pub-rev');
    const elSearch = $('#pub-search');
    const elKwBar = $('#pub-kwbar');
    const elKwOps = document.getElementById('kw-ops');
    const elKwAnd = document.getElementById('kw-op-and');
    const elKwOr = document.getElementById('kw-op-or');
    const elKwSummary = document.getElementById('kw-summary');

    const tpl = $('#pub-card-tpl');
    const activeKws = new Set(); // lower-cased active keywords

    let kwOp = 'or'; // default operator


    // If this page doesn't have the UI, bail quietly.
    if (!elList || !elSort || !elReverse || !elSearch || !elKwBar || !tpl) return;
    // if (!elList || !elSort || !elKwBar || !tpl) return;

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
    function toArray(v) {
        if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
        if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
        return [];
    }
    const squish = (s) => norm(s).replace(/[^a-z0-9]/g, '');
    function isSubsequence(needle, haystack) {
        let i = 0, j = 0;
        while (i < needle.length && j < haystack.length) {
            if (needle[i] === haystack[j]) i++;
            j++;
        }
        return i === needle.length;
    }

    // Return true if all chars in `needle` appear in order in `haystack`
    function isSubsequence(needle, haystack) {
        let i = 0, j = 0;
        while (i < needle.length && j < haystack.length) {
            if (needle[i] === haystack[j]) i++;
            j++;
        }
        return i === needle.length;
    }


    function allKeywords(pubs) {
        // case-insensitive de-dupe, preserve first-seen casing
        const seen = new Map();
        for (const p of pubs) {
            for (const kw of [...toArray(p.keywordsVisible), ...toArray(p.keywordsHidden)]) {
                const k = kw.toLowerCase();
                if (!seen.has(k)) seen.set(k, kw);
            }
        }
        return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }


    const sorters = {
        'date-desc': (a, b) => parseDate(b) - parseDate(a),
        'title-asc': (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }),
    };

    function buildKeywordBar(keywords) {
        elKwBar.innerHTML = '';
        for (const label of keywords) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'keyword';
            btn.textContent = label;
            const k = norm(label);

            // init pressed state
            const isActive = activeKws.has(k);
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false'); // for ATs

            btn.addEventListener('click', () => {
                if (activeKws.has(k)) activeKws.delete(k);
                else activeKws.add(k);
                apply();            // re-filter + re-render
                syncKeywordBar();   // repaint bar states
            });
            elKwBar.appendChild(btn);
        }
    }

    function syncKeywordBar() {
        elKwBar.querySelectorAll('button.keyword').forEach(btn => {
            const k = norm(btn.textContent);
            const isActive = activeKws.has(k);
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false'); // for ATs
        });
    }

    function debounce(fn, ms = 150) {
        let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
    }

    function syncKwOpControls() {
        if (!elKwAnd || !elKwOr) return;
        elKwAnd.setAttribute('aria-pressed', kwOp === 'and' ? 'true' : 'false');
        elKwOr.setAttribute('aria-pressed', kwOp === 'or' ? 'true' : 'false');
        elKwAnd.classList.toggle('is-active', kwOp === 'and');
        elKwOr.classList.toggle('is-active', kwOp === 'or');
    }

    function updateFilterSummary() {
        if (!elKwSummary) return;

        const activeLabels = [...elKwBar.querySelectorAll('.keyword[aria-pressed="true"]')]
            .map(b => b.textContent.trim())
            .filter(Boolean);

        const qRaw = (elSearch?.value || '').trim();
        const frag = document.createDocumentFragment();

        frag.append('Showing publications');

        if (activeLabels.length || qRaw) frag.append(' that ');

        // Keywords part (chips)
        if (activeLabels.length) {
            const joiner = kwOp === 'and' ? ' and ' : ' or ';
            frag.append(kwOp === 'and' ? 'match all of ' : 'match any of ');
            activeLabels.forEach((label, i) => {
                const chip = document.createElement('span');
                chip.className = 'keyword kw-badge is-active';
                chip.textContent = label;
                frag.append(chip);
                if (i < activeLabels.length - 1) frag.append(joiner);
            });
        }

        // If both keywords and search are present, join with AND
        if (activeLabels.length && qRaw) frag.append(' and ');

        // Search term part
        if (qRaw) {
            frag.append('contain ');
            const query = document.createElement('span');
            query.className = 'kw-query';
            query.textContent = `"${qRaw}"`;
            frag.append(query);
        }

        frag.append('.');
        elKwSummary.replaceChildren(frag);
    }

    // ---------- TEMPLATING ----------
    function cardNode(p) {
        const frag = tpl.content.cloneNode(true);

        // Row 1
        const elSimple = frag.querySelector('.pub-simple-title');
        const elJournalShort = frag.querySelector('.pub-journal-short');
        const elJournalFull = frag.querySelector('.pub-journal-full');
        elSimple.textContent = p.titleShort || p.title || '';
        elJournalFull.textContent = p.journal || p.journalShort || '';
        elJournalShort.textContent = p.journalShort || p.journal || '';

        // Row 2
        const linkThumb = frag.querySelector('.pub-thumbnail');
        const imgThumb = linkThumb.querySelector('img');
        const linkFull = frag.querySelector('.pub-full-title > a');
        const elAuthors = frag.querySelector('.pub-authors');

        const href = p.pdf || p.url || (p.doi ? `https://doi.org/${p.doi}` : '#');
        linkThumb.href = href;
        linkThumb.setAttribute('aria-label', `Open ${p.titleShort || p.title || 'publication'}`);

        imgThumb.src = p.thumbnail || 'graphics/thumbnails/coconut_flask.svg';
        imgThumb.alt = `Thumbnail for ${p.titleShort || p.title || 'publication'}`;

        linkFull.href = p.doi ? `https://doi.org/${p.doi}` : (p.url || '#');
        linkFull.textContent = p.title || '';

        elAuthors.textContent = (p.authors || []).join(', ');

        // Keywords (visible + conditionally show hidden if active)
        const elKeywords = frag.querySelector('.pub-keywords');
        const kVis = toArray(p.keywordsVisible);
        const kHid = toArray(p.keywordsHidden);

        // Show on the card: visible ∪ (hidden ∩ active)
        const displayKws = [
            ...kVis,
            ...kHid.filter(kw => activeKws.has(norm(kw))),
        ];

        // Build chips
        if (displayKws.length) {
            elKeywords.innerHTML = '';
            for (const label of displayKws) {
                const k = norm(label);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'keyword';
                btn.textContent = label;
                const isActive = activeKws.has(k);
                btn.classList.toggle('is-active', isActive);
                btn.setAttribute('aria-pressed', isActive ? 'true' : 'false'); // for ATs
                btn.addEventListener('click', () => {
                    if (activeKws.has(k)) activeKws.delete(k); else activeKws.add(k);
                    apply();          // will rebuild this card and others
                    syncKeywordBar(); // keep the top bar in sync
                });
                elKeywords.appendChild(btn);
            }
            elKeywords.hidden = false;
        } else {
            elKeywords.hidden = true;
        }


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
        // 1) Parse comma-separated needles; spaces inside a needle are significant
        const needles = (elSearch.value || '')
            .split(',')            // split by comma only
            .map(norm)             // lower/trim
            .filter(Boolean);      // drop empties

        let list = pubs.filter(p => {
            // 2) Build field list (independent checks per field)
            const authorsArr = Array.isArray(p.authors) ? p.authors : (p.authors ? [p.authors] : []);
            const fieldsNorm = [
                p.title, p.titleShort, p.journal, p.journalShort,
                ...authorsArr
            ].map(norm);
            const fieldsSquish = fieldsNorm.map(squish); // a–z/0–9 only

            // 3) One needle matches if ANY single field matches (substring OR subsequence)
            const matchOneNeedle = (needle) => {
                const nSquish = squish(needle);
                for (let i = 0; i < fieldsNorm.length; i++) {
                    if (fieldsNorm[i].includes(needle) || isSubsequence(nSquish, fieldsSquish[i])) return true;
                }
                return false;
            };

            // 4) Combine needles with kwOp (and/or). If no needles, pass.
            const matchesText = needles.length
                ? (kwOp === 'and' ? needles.every(matchOneNeedle) : needles.some(matchOneNeedle))
                : true;

            // 5) Keyword chips filter (unchanged)
            const pubKw = new Set([
                ...toArray(p.keywordsVisible),
                ...toArray(p.keywordsHidden)
            ].map(norm));

            let matchesKw = true;
            if (activeKws.size > 0) {
                const a = [...activeKws];
                matchesKw = (kwOp === 'and') ? a.every(k => pubKw.has(k)) : a.some(k => pubKw.has(k));
            }

            return matchesText && matchesKw;
        });

        // sort (+ optional reverse)
        const sorter = sorters[elSort.value] || sorters['date-desc'];
        list = list.slice().sort(sorter);
        if (elReverse.checked) list.reverse();

        render(list);
        syncKeywordBar();
        updateFilterSummary();
    }

    // ---------- BOOT ----------
    (async () => {
        pubs = await loadData();
        const kws = allKeywords(pubs);   // union of visible+hidden, case-insensitive de-dupe
        buildKeywordBar(kws);

        // Defaults + listeners
        elSort.value = 'date-desc';
        elReverse.checked = false;
        elSort.addEventListener('change', apply);
        elReverse.addEventListener('change', apply);
        elSearch.addEventListener('input', debounce(apply, 180));

        if (elKwAnd && elKwOr) {
            elKwAnd.addEventListener('click', () => { kwOp = 'and'; apply(); syncKwOpControls(); });
            elKwOr.addEventListener('click', () => { kwOp = 'or'; apply(); syncKwOpControls(); });
            syncKwOpControls();
        }


        // First paint
        apply();
    })();
})();