/* Drooid Site-Wide Search — powered by Fuse.js */
(function(){
  /* ── Load Fuse.js from CDN then initialise ── */
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fuse.js/7.0.0/fuse.min.js';
  script.onload = initSearch;
  document.head.appendChild(script);

  /* ── Inject modal HTML ── */
  const modalHTML = `
<div id="drooid-search-modal" role="dialog" aria-modal="true" aria-label="Site search" style="display:none">
  <div id="drooid-search-overlay"></div>
  <div id="drooid-search-box">
    <div id="drooid-search-top">
      <svg id="drooid-search-icon" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="drooid-search-input" type="text" placeholder="Search Drooid… (pages, blog, clients)" autocomplete="off" spellcheck="false">
      <button id="drooid-search-close" aria-label="Close search">ESC</button>
    </div>
    <div id="drooid-search-results"></div>
    <div id="drooid-search-footer">
      <span>↑↓ navigate</span><span>↵ open</span><span>ESC close</span>
      <span style="margin-left:auto">Powered by <strong>Drooid Search</strong></span>
    </div>
  </div>
</div>
<style>
#drooid-search-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px}
#drooid-search-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);cursor:pointer}
#drooid-search-box{position:relative;width:100%;max-width:640px;background:#fff;border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,.18);overflow:hidden;z-index:1;margin:0 16px}
[data-theme="dark"] #drooid-search-box{background:#131b2e;border:1px solid rgba(255,255,255,.08)}
#drooid-search-top{display:flex;align-items:center;padding:16px 20px;gap:12px;border-bottom:1px solid #e2e4ea}
[data-theme="dark"] #drooid-search-top{border-color:rgba(255,255,255,.08)}
#drooid-search-icon{color:#888;flex-shrink:0}
#drooid-search-input{flex:1;font-size:17px;border:none;outline:none;background:transparent;color:#0f1117;font-family:inherit}
[data-theme="dark"] #drooid-search-input{color:#f0f0f0}
#drooid-search-input::placeholder{color:#aaa}
#drooid-search-close{font-size:11px;font-weight:600;color:#888;background:#f0f0f0;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;flex-shrink:0}
[data-theme="dark"] #drooid-search-close{background:rgba(255,255,255,.1);color:#aaa}
#drooid-search-results{max-height:420px;overflow-y:auto}
.drooid-sr-empty{padding:32px;text-align:center;color:#888;font-size:14px}
.drooid-sr-group{padding:8px 20px 4px;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em}
.drooid-sr-item{display:flex;align-items:center;gap:14px;padding:12px 20px;cursor:pointer;transition:.15s;text-decoration:none;color:inherit}
.drooid-sr-item:hover,.drooid-sr-item.active{background:#f5f3ff}
[data-theme="dark"] .drooid-sr-item:hover,[data-theme="dark"] .drooid-sr-item.active{background:rgba(99,102,241,.12)}
.drooid-sr-icon{width:36px;height:36px;border-radius:10px;background:#ece9fe;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px}
.drooid-sr-icon.blog{background:#ccfbf1}
.drooid-sr-icon.client{background:#fef3c7}
.drooid-sr-icon.page{background:#ece9fe}
.drooid-sr-meta{flex:1;min-width:0}
.drooid-sr-title{font-size:14px;font-weight:600;color:#0f1117;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-theme="dark"] .drooid-sr-title{color:#f0f0f0}
.drooid-sr-section{font-size:12px;color:#888;margin-top:2px}
.drooid-sr-arrow{color:#ccc;font-size:16px;flex-shrink:0}
#drooid-search-footer{display:flex;gap:16px;padding:10px 20px;border-top:1px solid #e2e4ea;font-size:11px;color:#aaa;background:#fafbfc}
[data-theme="dark"] #drooid-search-footer{background:#0c1525;border-color:rgba(255,255,255,.06)}
#drooid-search-footer span{display:flex;align-items:center;gap:4px}
</style>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  /* ── Fuse instance ── */
  let fuse, activeIndex = -1, results = [];

  function initSearch() {
    if (typeof DROOID_SEARCH_INDEX === 'undefined') return;
    fuse = new Fuse(DROOID_SEARCH_INDEX, {
      keys: [
        { name: 'title',   weight: 0.5 },
        { name: 'tags',    weight: 0.3 },
        { name: 'content', weight: 0.15 },
        { name: 'section', weight: 0.05 }
      ],
      threshold: 0.35,
      includeScore: true,
      minMatchCharLength: 2
    });
  }

  /* ── Open / Close ── */
  function openSearch() {
    const modal = document.getElementById('drooid-search-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('drooid-search-input').focus(), 50);
    renderResults('');
  }

  function closeSearch() {
    document.getElementById('drooid-search-modal').style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('drooid-search-input').value = '';
    activeIndex = -1;
  }

  /* ── Render results ── */
  function getIcon(section) {
    if (section && section.toLowerCase().includes('blog')) return { cls: 'blog', icon: '✍️' };
    if (section && section.toLowerCase().includes('client')) return { cls: 'client', icon: '⭐' };
    return { cls: 'page', icon: '📄' };
  }

  function renderResults(query) {
    const container = document.getElementById('drooid-search-results');
    activeIndex = -1;

    if (!fuse || !query.trim()) {
      // Show default suggestions grouped
      const pages = DROOID_SEARCH_INDEX.filter(i => i.section === 'Page' || i.section === 'Blog');
      container.innerHTML = `<div class="drooid-sr-group">Quick links</div>` +
        pages.map((item, i) => {
          const ic = getIcon(item.section);
          return `<a class="drooid-sr-item" href="${item.url}" data-idx="${i}">
            <div class="drooid-sr-icon ${ic.cls}">${ic.icon}</div>
            <div class="drooid-sr-meta"><div class="drooid-sr-title">${item.title}</div><div class="drooid-sr-section">${item.section}</div></div>
            <span class="drooid-sr-arrow">›</span></a>`;
        }).join('');
      results = pages;
      return;
    }

    results = fuse.search(query).slice(0, 12).map(r => r.item);

    if (!results.length) {
      container.innerHTML = `<div class="drooid-sr-empty">No results for "<strong>${query}</strong>"<br><small>Try: services, legacy, COBOL, dental, ETF, AI agent</small></div>`;
      return;
    }

    // Group by section
    const groups = {};
    results.forEach(item => {
      const g = item.section.split('·')[0].trim();
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    });

    container.innerHTML = Object.entries(groups).map(([group, items]) =>
      `<div class="drooid-sr-group">${group}</div>` +
      items.map((item, i) => {
        const ic = getIcon(item.section);
        const globalIdx = results.indexOf(item);
        return `<a class="drooid-sr-item" href="${item.url}" data-idx="${globalIdx}">
          <div class="drooid-sr-icon ${ic.cls}">${ic.icon}</div>
          <div class="drooid-sr-meta"><div class="drooid-sr-title">${item.title}</div><div class="drooid-sr-section">${item.section}</div></div>
          <span class="drooid-sr-arrow">›</span></a>`;
      }).join('')
    ).join('');
  }

  /* ── Keyboard navigation ── */
  function updateActive(newIdx) {
    const items = document.querySelectorAll('.drooid-sr-item');
    items.forEach(el => el.classList.remove('active'));
    if (newIdx >= 0 && newIdx < items.length) {
      items[newIdx].classList.add('active');
      items[newIdx].scrollIntoView({ block: 'nearest' });
    }
    activeIndex = newIdx;
  }

  /* ── Event listeners ── */
  document.getElementById('drooid-search-input').addEventListener('input', e => {
    renderResults(e.target.value);
  });

  document.getElementById('drooid-search-input').addEventListener('keydown', e => {
    const items = document.querySelectorAll('.drooid-sr-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); updateActive(Math.min(activeIndex + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); updateActive(Math.max(activeIndex - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); items[activeIndex].click(); closeSearch(); }
    else if (e.key === 'Escape') closeSearch();
  });

  document.getElementById('drooid-search-overlay').addEventListener('click', closeSearch);
  document.getElementById('drooid-search-close').addEventListener('click', closeSearch);
  document.getElementById('drooid-search-results').addEventListener('click', () => closeSearch());

  // CMD+K / Ctrl+K shortcut
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closeSearch();
  });

  /* ── Expose globally ── */
  window.openSearch = openSearch;
  window.closeSearch = closeSearch;
})();
