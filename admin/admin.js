/* KJ Pictures — interface d'administration */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = (rel) => `../${rel}`;
  const fmt = (n) => Number(n).toLocaleString('fr-FR');
  let data = { categories: [], photos: [], packages: [], studio: [], currency: 'FCFA' };

  /* ---------- Réseau ---------- */
  async function api(path, { method = 'GET', body, form } = {}) {
    const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'kj-admin' } };
    if (form) opts.body = form;
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(`../api/${path}`, opts);
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && path.startsWith('admin/')) { showLogin(); throw new Error(json.error || 'Session expirée'); }
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    return json;
  }

  let toastTimer;
  function toast(msg, type = 'ok') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast is-on is-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
  }
  const fail = (e) => toast(e.message, 'err');

  /* ---------- Connexion ---------- */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#loginForm [name=password]').focus(); }
  async function showApp() {
    $('#login').hidden = true; $('#app').hidden = false;
    await reload();
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target); btn.disabled = true;
    $('#loginError').textContent = '';
    try {
      await api('login', { method: 'POST', body: { password: e.target.password.value } });
      e.target.reset();
      await showApp();
    } catch (err) { $('#loginError').textContent = err.message; }
    btn.disabled = false;
  });
  $('#logout').addEventListener('click', async () => { await api('logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  /* ---------- Onglets ---------- */
  function openTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
    try { sessionStorage.setItem('kj-tab', name); } catch {}
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => openTab(t.dataset.tab)));
  try { const saved = sessionStorage.getItem('kj-tab'); if (saved && $(`.tab[data-tab="${saved}"]`)) openTab(saved); } catch {}

  async function reload() {
    data = await api('content');
    renderAll();
  }
  function renderAll() { renderCatSelects(); renderPhotos(); renderCats(); renderPacks(); renderStudio(); }

  /* ---------- Glisser-déposer ---------- */
  const sortables = {};
  function makeSortable(key, el, list, opts = {}) {
    if (sortables[key]) sortables[key].destroy();
    sortables[key] = Sortable.create(el, {
      animation: 180, delay: 180, delayOnTouchOnly: true, ...opts,
      onEnd: async (ev) => {
        if (ev.oldIndex === ev.newIndex) return;
        const ids = $$('[data-id]', el).map(n => n.dataset.id);
        try {
          await api(`admin/order/${list}`, { method: 'PUT', body: { ids } });
          const byId = new Map(data[list].map(x => [x.id, x]));
          data[list] = ids.map(id => byId.get(id));
          toast('Ordre enregistré');
          if (list === 'photos') renderPhotos();
          if (list === 'categories') renderCatSelects();
        } catch (e) { fail(e); reload(); }
      }
    });
  }

  /* ---------- Zones d'envoi ---------- */
  function setupDrop(form, endpoint, onDone) {
    const drop = $('.drop', form), input = $('input[type=file]', form), info = $('[data-files]', form);
    const show = () => { info.textContent = input.files.length ? `${input.files.length} fichier(s) sélectionné(s)` : ''; };
    input.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', e => { e.preventDefault(); input.files = e.dataTransfer.files; show(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.files.length) return toast('Choisissez au moins une image.', 'err');
      const btn = $('button[type=submit]', form);
      btn.disabled = true; btn.textContent = 'Envoi en cours…';
      try {
        const res = await api(endpoint, { method: 'POST', form: new FormData(form) });
        toast(`${res.added.length} photo(s) ajoutée(s)${res.failed.length ? ` · ${res.failed.length} refusée(s)` : ''}`, res.failed.length ? 'err' : 'ok');
        input.value = ''; show();
        onDone(res.added);
      } catch (err) { fail(err); }
      btn.disabled = false; btn.textContent = 'Envoyer';
    });
  }
  setupDrop($('#photoUpload'), 'admin/photos', (added) => { data.photos.unshift(...added); renderPhotos(); renderCats(); });
  setupDrop($('#studioUpload'), 'admin/studio', (added) => { data.studio.unshift(...added); renderStudio(); $('#studioUpload [name=caption]').value = ''; });

  /* ---------- Photos ---------- */
  const catOptions = (sel) => data.categories.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
  function renderCatSelects() {
    const up = $('#uploadCat'), prev = up.value;
    up.innerHTML = catOptions(prev);
    const f = $('#photoFilter'), fv = f.value;
    f.innerHTML = `<option value="all">Toutes les catégories</option>` + data.categories.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('');
    f.value = data.categories.some(c => c.id === fv) ? fv : 'all';
  }
  $('#photoFilter').addEventListener('change', renderPhotos);

  function renderPhotos() {
    const filter = $('#photoFilter').value;
    const list = data.photos.filter(p => filter === 'all' || p.cat === filter);
    const grid = $('#photoGrid');
    $('#photoTotal').textContent = `${list.length} photo(s)`;
    $('#reorderHint').hidden = filter === 'all';
    grid.innerHTML = list.length ? list.map((p, i) => `
      <div class="tile" data-id="${esc(p.id)}">
        <span class="tile__num">${i + 1}</span>
        <img src="${esc(url(p.thumb))}" alt="" loading="lazy">
        <button class="tile__del" data-del title="Supprimer">🗑</button>
        <div class="tile__bar"><select data-cat aria-label="Catégorie">${catOptions(p.cat)}</select></div>
      </div>`).join('') : '<p class="empty">Aucune photo dans cette catégorie.</p>';
    if (filter === 'all' && list.length) makeSortable('photos', grid, 'photos', { filter: 'select, button', preventOnFilter: false });
    else if (sortables.photos) { sortables.photos.destroy(); delete sortables.photos; }
  }
  $('#photoGrid').addEventListener('change', async (e) => {
    if (!e.target.matches('[data-cat]')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      const p = await api(`admin/photos/${encodeURIComponent(id)}`, { method: 'PATCH', body: { cat: e.target.value } });
      Object.assign(data.photos.find(x => x.id === id), p);
      toast('Catégorie modifiée');
      renderCats();
      if ($('#photoFilter').value !== 'all') renderPhotos();
    } catch (err) { fail(err); }
  });
  $('#photoGrid').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-del]')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm('Supprimer définitivement cette photo du site ?')) return;
    try {
      await api(`admin/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      data.photos = data.photos.filter(x => x.id !== id);
      renderPhotos(); renderCats();
      toast('Photo supprimée');
    } catch (err) { fail(err); }
  });

  /* ---------- Catégories ---------- */
  function renderCats() {
    const el = $('#catList');
    el.innerHTML = data.categories.map(c => {
      const n = data.photos.filter(p => p.cat === c.id).length;
      return `<li class="row" data-id="${esc(c.id)}">
        <span class="row__grip" title="Glisser pour réordonner">⠿</span>
        <input value="${esc(c.label)}" maxlength="60" data-label aria-label="Nom de la catégorie">
        <span class="row__meta">${n} photo(s)</span>
        <button class="btn btn--ghost btn--sm" data-save>Renommer</button>
        <button class="btn btn--danger btn--sm" data-del>Supprimer</button>
      </li>`;
    }).join('') || '<li class="empty">Aucune catégorie.</li>';
    makeSortable('categories', el, 'categories', { handle: '.row__grip' });
  }
  $('#catForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const c = await api('admin/categories', { method: 'POST', body: { label: e.target.label.value } });
      data.categories.push(c);
      e.target.reset();
      renderCats(); renderCatSelects();
      toast(`Catégorie « ${c.label} » ajoutée`);
    } catch (err) { fail(err); }
  });
  $('#catList').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id, cat = data.categories.find(c => c.id === id);
    if (e.target.closest('[data-save]')) {
      try {
        const c = await api(`admin/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: { label: $('[data-label]', row).value } });
        cat.label = c.label;
        renderCatSelects(); renderPhotos();
        toast('Catégorie renommée');
      } catch (err) { fail(err); }
    }
    if (e.target.closest('[data-del]')) {
      const used = data.photos.filter(p => p.cat === id).length;
      let moveTo;
      if (used) {
        const others = data.categories.filter(c => c.id !== id);
        if (!others.length) return toast('Créez une autre catégorie avant de supprimer celle-ci.', 'err');
        const choice = prompt(`${used} photo(s) sont dans « ${cat.label} ».\nDans quelle catégorie les déplacer ? Tapez le numéro :\n\n${others.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}`);
        if (choice === null) return;
        const target = others[Number(choice) - 1];
        if (!target) return toast('Numéro invalide.', 'err');
        moveTo = target.id;
      } else if (!confirm(`Supprimer la catégorie « ${cat.label} » ?`)) return;
      try {
        await api(`admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE', body: { moveTo } });
        if (moveTo) data.photos.forEach(p => { if (p.cat === id) p.cat = moveTo; });
        data.categories = data.categories.filter(c => c.id !== id);
        renderAll();
        toast('Catégorie supprimée');
      } catch (err) { fail(err); }
    }
  });

  /* ---------- Packages ---------- */
  function renderPacks() {
    const el = $('#packList');
    el.innerHTML = data.packages.map(p => `
      <article class="pack${p.highlight ? ' pack--hl' : ''}" data-id="${esc(p.id)}">
        <span class="pack__grip" title="Glisser pour réordonner">⠿</span>
        ${p.highlight ? '<span class="pack__badge">Populaire</span>' : ''}
        <h3>${esc(p.name)}</h3>
        <div class="pack__price">${fmt(p.price)} <small>${esc(data.currency)}</small></div>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
        <ul>${(p.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        <div class="pack__actions">
          <button class="btn btn--ghost btn--sm" data-edit>Modifier</button>
          <button class="btn btn--danger btn--sm" data-del>Supprimer</button>
        </div>
      </article>`).join('') || '<p class="empty">Aucun package. La section est masquée sur le site tant qu\'il n\'y en a pas.</p>';
    makeSortable('packages', el, 'packages', { handle: '.pack__grip' });
  }
  const modal = $('#packModal'), pform = $('#packForm');
  let editing = null;
  function openPack(p) {
    editing = p ? p.id : null;
    $('#packTitle').textContent = p ? 'Modifier le package' : 'Nouveau package';
    pform.name.value = p?.name || '';
    pform.price.value = p?.price ?? '';
    pform.description.value = p?.description || '';
    pform.items.value = (p?.items || []).join('\n');
    pform.highlight.checked = !!p?.highlight;
    modal.showModal();
  }
  $('#newPack').addEventListener('click', () => openPack(null));
  $('#packList').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const p = data.packages.find(x => x.id === card.dataset.id);
    if (e.target.closest('[data-edit]')) openPack(p);
    if (e.target.closest('[data-del]')) {
      if (!confirm(`Supprimer le package « ${p.name} » ?`)) return;
      try {
        await api(`admin/packages/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
        data.packages = data.packages.filter(x => x.id !== p.id);
        renderPacks(); toast('Package supprimé');
      } catch (err) { fail(err); }
    }
  });
  pform.addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const body = {
      name: pform.name.value, price: pform.price.value, description: pform.description.value,
      items: pform.items.value, highlight: pform.highlight.checked
    };
    try {
      if (editing) {
        const p = await api(`admin/packages/${encodeURIComponent(editing)}`, { method: 'PUT', body });
        data.packages = data.packages.map(x => (x.id === editing ? p : x));
      } else {
        data.packages.push(await api('admin/packages', { method: 'POST', body }));
      }
      modal.close();
      renderPacks();
      toast('Package enregistré');
    } catch (err) { fail(err); }
  });

  /* ---------- Studio ---------- */
  function renderStudio() {
    const el = $('#studioGrid');
    el.innerHTML = data.studio.map(s => `
      <div class="tile" data-id="${esc(s.id)}">
        <img src="${esc(url(s.thumb))}" alt="" loading="lazy">
        <button class="tile__del" data-del title="Supprimer">🗑</button>
        <div class="tile__bar"><input data-caption value="${esc(s.caption || '')}" maxlength="120" placeholder="Légende…" aria-label="Légende"></div>
      </div>`).join('') || '<p class="empty">Aucune photo du studio pour l\'instant. La partie « Studio &amp; matériel » apparaîtra sur le site dès la première photo.</p>';
    makeSortable('studio', el, 'studio', { filter: 'input, button', preventOnFilter: false });
  }
  $('#studioGrid').addEventListener('change', async (e) => {
    if (!e.target.matches('[data-caption]')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      const s = await api(`admin/studio/${encodeURIComponent(id)}`, { method: 'PATCH', body: { caption: e.target.value } });
      Object.assign(data.studio.find(x => x.id === id), s);
      toast('Légende enregistrée');
    } catch (err) { fail(err); }
  });
  $('#studioGrid').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-del]')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm('Supprimer cette photo du studio ?')) return;
    try {
      await api(`admin/studio/${encodeURIComponent(id)}`, { method: 'DELETE' });
      data.studio = data.studio.filter(x => x.id !== id);
      renderStudio(); toast('Photo supprimée');
    } catch (err) { fail(err); }
  });

  /* ---------- Compte ---------- */
  $('#pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('admin/password', { method: 'POST', body: { current: e.target.current.value, next: e.target.next.value } });
      e.target.reset();
      toast('Mot de passe mis à jour');
    } catch (err) { fail(err); }
  });

  /* ---------- Démarrage ---------- */
  api('me').then(r => (r.authenticated ? showApp() : showLogin())).catch(() => {
    showLogin();
    $('#loginError').textContent = "Serveur injoignable : l'admin ne fonctionne que sur le serveur Node (pas sur GitHub Pages).";
  });
})();
