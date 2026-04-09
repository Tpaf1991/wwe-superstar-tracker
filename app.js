// ============================================================
//  WWE 2K25 — SUPERSTAR MODE — app.js
//
//  GUIA DE PERSONALIZACIÓN (texto visible en la app):
//  ─────────────────────────────────────────────────
//  Títulos de secciones:     index.html → busca <h1> y <h3>
//  Nombre de la app:         index.html → logo-wwe / logo-sub
//  Textos del formulario:    index.html → <label> dentro de #match-form
//  Nombres de meses/semanas: app.js     → MONTHS / WEEKS (líneas 5-6)
//  Placeholder catálogos:    index.html → placeholder="..." en cat-*
//  Textos de botones:        index.html → busca btn-save / btn-cancel
// ============================================================

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WEEKS  = ['Semana 1','Semana 2','Semana 3','Semana 4'];

// ---- State ----
let state = {
  currentMonth: parseInt(localStorage.getItem('lastMonth') ?? '0', 10),
  currentYear:  Math.max(1, parseInt(localStorage.getItem('lastYear')  ?? '1', 10)),
  matches: [],
  catalogs: {
    wrestlers:    [],
    types:        [],
    brands:       [],
    titles:       [],
    divisions:    [],
    winners:      [],
    rivalactions: []
  },
  editingMatchId: null,
  pendingDay: null,
  pendingDeleteId: null,
  pendingImageFile: null,
  pendingImageURL: null,
  addCatCallback: null
};

// ---- Firestore / Storage refs ----
const matchesRef  = db.collection('matches');
const catalogsRef = db.collection('catalogs');

// ============================================================
//  INIT
// ============================================================
async function init() {
  await loadCatalogs();
  await loadMatches();
  renderCalendar();
  renderHistory();
  renderStats();
  renderCatalogs();
  updateSidebarMeta();
  setupNavigation();
  setupSidebarToggle();
  setupThemeToggle();
  setupCalendarNav();
  setupModal();
  setupDayDetailModal();
  setupCatalogEditors();
  setupConfirmModal();
  setupAddCatModal();
}

// ============================================================
//  NAVIGATION
// ============================================================
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
      if (btn.dataset.view === 'stats') renderStats();
      closeSidebar();
    });
  });
}

// ============================================================
//  SIDEBAR TOGGLE (mobile)
// ============================================================
function setupSidebarToggle() {
  const toggle   = document.getElementById('menu-toggle');
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  toggle.addEventListener('click', () => {
    const isOpen = sidebar.classList.contains('open');
    isOpen ? closeSidebar() : openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('visible');
  document.getElementById('menu-toggle').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('visible');
  document.getElementById('menu-toggle').classList.remove('open');
}

// ============================================================
//  THEME TOGGLE (dark / light)
// ============================================================
const MOON_SVG = `<path d="M17 12.5A7 7 0 0 1 9.5 3a7.002 7.002 0 0 0 0 14 7 7 0 0 0 7.5-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
const SUN_SVG  = `<path d="M10 3v1M10 16v1M3 10H2M18 10h-1M5.22 5.22l-.71-.71M15.49 15.49l-.71-.71M5.22 14.78l-.71.71M15.49 4.51l-.71.71M13 10a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;

function setupThemeToggle() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.body.classList.contains('light') ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });

  const mobileBtn = document.getElementById('theme-toggle-mobile');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      const next = document.body.classList.contains('light') ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem('theme', next);
    });
  }
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light', isLight);

  const label    = document.getElementById('theme-label');
  const iconD    = document.getElementById('theme-icon');
  const iconM    = document.getElementById('theme-icon-mobile');
  const svgInner = isLight ? MOON_SVG : SUN_SVG;

  if (label) label.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
  if (iconD) iconD.innerHTML = svgInner;
  if (iconM) iconM.innerHTML = svgInner;
}

// ============================================================
//  FIREBASE: LOAD / SAVE
// ============================================================
async function loadMatches() {
  const snap = await matchesRef.orderBy('sortKey').get();
  state.matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveMatch(data) {
  if (state.editingMatchId) {
    await matchesRef.doc(state.editingMatchId).update(data);
    const idx = state.matches.findIndex(m => m.id === state.editingMatchId);
    if (idx >= 0) state.matches[idx] = { id: state.editingMatchId, ...data };
  } else {
    const docRef = await matchesRef.add(data);
    state.matches.push({ id: docRef.id, ...data });
    state.matches.sort((a,b) => (a.sortKey||'').localeCompare(b.sortKey||''));
  }
  await renumberMatches();
}

async function deleteMatch(id) {
  await matchesRef.doc(id).delete();
  state.matches = state.matches.filter(m => m.id !== id);
  await renumberMatches();
}

async function renumberMatches() {
  const sorted = [...state.matches].sort((a,b) => (a.sortKey||'').localeCompare(b.sortKey||''));
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].num = i + 1;
    await matchesRef.doc(sorted[i].id).update({ num: i + 1 });
  }
  state.matches = sorted;
}

async function loadCatalogs() {
  const snap = await catalogsRef.get();
  snap.docs.forEach(d => {
    if (state.catalogs[d.id] !== undefined) {
      state.catalogs[d.id] = d.data().items || [];
    }
  });
}

async function saveCatalog(key) {
  // Keep sorted alphabetically
  state.catalogs[key].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  await catalogsRef.doc(key).set({ items: state.catalogs[key] });
}

// Auto-add a value to catalog if not already present, then save
async function ensureInCatalog(key, value) {
  if (!value || value === '' || state.catalogs[key].includes(value)) return;
  state.catalogs[key].push(value);
  await saveCatalog(key);
}

// ============================================================
//  IMAGE — Cloudinary unsigned upload
//  Config is read from window.CLOUDINARY_CLOUD_NAME and
//  window.CLOUDINARY_UPLOAD_PRESET (set in firebase-config.js)
// ============================================================
async function uploadToCloudinary(file) {
  const cloud  = window.CLOUDINARY_CLOUD_NAME;
  const preset = window.CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || !preset) throw new Error('Cloudinary no configurado. Revisa firebase-config.js');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', preset);
  fd.append('folder', 'wwe-superstar');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body: fd
  });
  if (!res.ok) throw new Error('Error al subir imagen a Cloudinary');
  const data = await res.json();
  return data.secure_url;
}

function setupImageUpload() {
  const area    = document.getElementById('image-upload-area');
  const input   = document.getElementById('f-image');
  const preview = document.getElementById('image-preview-img');
  const placeholder = document.getElementById('image-placeholder');
  const removeBtn   = document.getElementById('img-remove');

  area.addEventListener('click', (e) => {
    if (e.target === removeBtn || removeBtn.contains(e.target)) return;
    input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    state.pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      removeBtn.classList.remove('hidden');
      area.classList.add('has-image');
    };
    reader.readAsDataURL(file);
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.pendingImageFile  = null;
    state.pendingImageURL   = null;
    input.value = '';
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'block';
    removeBtn.classList.add('hidden');
    area.classList.remove('has-image');
  });
}

function resetImageUpload(existingURL) {
  const preview = document.getElementById('image-preview-img');
  const placeholder = document.getElementById('image-placeholder');
  const removeBtn   = document.getElementById('img-remove');
  const area        = document.getElementById('image-upload-area');

  state.pendingImageFile = null;
  state.pendingImageURL  = existingURL || null;
  document.getElementById('f-image').value = '';

  if (existingURL) {
    preview.src = existingURL;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.classList.remove('hidden');
    area.classList.add('has-image');
  } else {
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'block';
    removeBtn.classList.add('hidden');
    area.classList.remove('has-image');
  }
}

// ============================================================
//  DATE HELPERS
// ============================================================
function makeSortKey(year, month, day) {
  return `${String(year).padStart(4,'0')}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function formatDateLabel(year, month, day) {
  return `Día ${day} · ${MONTHS[month]} · Año ${year}`;
}

function getResultClass(match) {
  if (isPromo(match)) return 'promo';
  const rivals  = match.vs || [];
  const winners = match.winners || [];
  if (winners.length === 0) return 'draw';
  const userWon = winners.length > 0 && !winners.some(w => rivals.includes(w));
  return userWon ? 'win' : 'loss';
}

function isPromo(match) {
  return match.type && match.type.includes('Promo');
}

// ============================================================
//  CALENDAR
// ============================================================
function setupCalendarNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 0) {
      state.currentMonth = 11;
      state.currentYear--;
      if (state.currentYear < 1) state.currentYear = 1;
    }
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    renderCalendar();
  });

  // Year scroll: click label to open picker, or use mouse wheel
  const yearEl = document.getElementById('cal-year-title');
  yearEl.style.cursor = 'pointer';
  yearEl.title = 'Clic para cambiar año';

  yearEl.addEventListener('click', openYearPicker);
  yearEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.currentYear += e.deltaY < 0 ? 1 : -1;
    if (state.currentYear < 1) state.currentYear = 1;
    renderCalendar();
  }, { passive: false });
}

function openYearPicker() {
  const existing = document.getElementById('year-picker-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'year-picker-overlay';
  overlay.style.cssText = `position:fixed;inset:0;z-index:800;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);`;

  const box = document.createElement('div');
  box.style.cssText = `background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius);padding:20px;width:280px;max-width:90vw;`;

  const title = document.createElement('p');
  title.textContent = 'Ir al año';
  title.style.cssText = `font-family:var(--font-head);font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;color:var(--text);`;
  box.appendChild(title);

  // Determine year range: 1 to max match year + 2
  const maxYear = Math.max(state.currentYear, ...state.matches.map(m => m.year || 1), 1);
  const years = Array.from({ length: maxYear + 2 }, (_, i) => i + 1);

  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:240px;overflow-y:auto;`;

  years.forEach(y => {
    const btn = document.createElement('button');
    btn.textContent = `Año ${y}`;
    const isActive = y === state.currentYear;
    btn.style.cssText = `background:${isActive ? 'var(--accent)' : 'var(--bg3)'};color:${isActive ? 'var(--bg)' : 'var(--text-sec)'};border:1px solid ${isActive ? 'var(--accent)' : 'var(--border2)'};border-radius:var(--radius-sm);padding:7px 4px;font-family:var(--font-body);font-size:12px;cursor:pointer;transition:all .12s;`;
    btn.addEventListener('click', () => {
      state.currentYear = y;
      renderCalendar();
      overlay.remove();
    });
    grid.appendChild(btn);
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Cancelar';
  closeBtn.style.cssText = `margin-top:12px;background:none;border:1px solid var(--border2);color:var(--text-sec);padding:8px 16px;border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13px;cursor:pointer;width:100%;`;
  closeBtn.addEventListener('click', () => overlay.remove());

  box.appendChild(grid);
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Scroll active year into view
  setTimeout(() => {
    const active = grid.querySelector(`button[style*="var(--accent)"]`);
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, 50);
}

function renderCalendar() {
  document.getElementById('cal-month-title').textContent = MONTHS[state.currentMonth];
  document.getElementById('cal-year-title').textContent  = `Año ${state.currentYear}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const monthMatches = state.matches.filter(m => m.month === state.currentMonth && m.year === state.currentYear);

  for (let week = 0; week < 4; week++) {
    const lbl = document.createElement('div');
    lbl.className = 'cal-week-label';
    lbl.textContent = WEEKS[week];
    grid.appendChild(lbl);

    for (let dow = 0; dow < 7; dow++) {
      const day  = week * 7 + dow + 1;
      const cell = document.createElement('div');
      cell.className = 'cal-cell';

      const numDiv = document.createElement('div');
      numDiv.className = 'cal-cell-num';
      numDiv.textContent = day;
      cell.appendChild(numDiv);

      const dayMatches = monthMatches.filter(m => m.day === day);
      if (dayMatches.length > 0) {
        cell.classList.add('has-match');
        const dots = document.createElement('div');
        dots.className = 'cal-dots';
        dayMatches.forEach(m => {
          const dot = document.createElement('div');
          dot.className = 'cal-dot ' + getResultClass(m);
          dots.appendChild(dot);
        });
        cell.appendChild(dots);

        if (dayMatches.length === 1) {
          const preview = document.createElement('div');
          preview.className = 'cal-match-preview';
          preview.textContent = dayMatches[0].vs?.join(' vs ') || dayMatches[0].type?.join(', ') || '';
          cell.appendChild(preview);
        }
      }

      cell.addEventListener('click', () => openDayModal(day, state.currentMonth, state.currentYear));
      grid.appendChild(cell);
    }
  }
}

// ============================================================
//  DAY MODAL
// ============================================================
function openDayModal(day, month, year) {
  state.pendingDay = { day, month, year };
  const dayMatches = state.matches.filter(m => m.day === day && m.month === month && m.year === year);
  dayMatches.length > 0
    ? showDayDetailModal(dayMatches, day, month, year)
    : openMatchForm(null, day, month, year);
}

function showDayDetailModal(matches, day, month, year) {
  const overlay = document.getElementById('day-detail-overlay');
  document.getElementById('day-detail-title').textContent = formatDateLabel(year, month, day);
  const body = document.getElementById('day-detail-body');
  body.innerHTML = '';

  matches.forEach(m => {
    const rc  = getResultClass(m);
    const labelMap = { win:'Vic', loss:'Der', draw:'Emp', promo:'Promo' };
    const div = document.createElement('div');
    div.className = 'mini-match';
    div.innerHTML = `
      <div class="mini-match-info">
        <div class="mini-match-title">${isPromo(m) ? 'PROMO' : (m.vs?.join(' vs ') || 'Sin rival')}</div>
        <div class="mini-match-sub">${m.type?.join(', ') || ''} ${m.brand ? '· ' + m.brand : ''}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        <span class="match-result-badge ${rc}">${labelMap[rc]}</span>
        <button class="btn-icon" onclick="viewMatch('${m.id}')">Ver</button>
        <button class="btn-icon" onclick="editMatch('${m.id}')">Editar</button>
        <button class="btn-icon del" onclick="confirmDelete('${m.id}')">×</button>
      </div>`;
    body.appendChild(div);
  });

  document.getElementById('btn-day-add').onclick = () => {
    overlay.classList.add('hidden');
    openMatchForm(null, day, month, year);
  };
  document.getElementById('day-detail-close').onclick = () => overlay.classList.add('hidden');
  overlay.classList.remove('hidden');
}

function setupDayDetailModal() {
  document.getElementById('day-detail-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
}

// ============================================================
//  MATCH FORM MODAL
// ============================================================
function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('btn-save').addEventListener('click', handleSave);
  document.getElementById('f-rating').addEventListener('input', e => {
    document.getElementById('star-display').textContent = '★ ' + (e.target.value / 2).toFixed(1);
  });
  setupImageUpload();
}

function openMatchForm(matchId, day, month, year) {
  state.editingMatchId = matchId;
  const match = matchId ? state.matches.find(m => m.id === matchId) : null;

  if (match) { day = match.day; month = match.month; year = match.year; }

  document.getElementById('modal-title').textContent    = match ? 'Editar lucha' : 'Agregar lucha';
  document.getElementById('modal-date-label').textContent = formatDateLabel(year, month, day);

  // Smart selects (single value, dropdown, auto-add)
  initSmartSelect('ss-brand',          'brands',       match?.brand        || '');
  initSmartSelect('ss-division',       'divisions',    match?.division     || '');
  initSmartSelect('ss-rivalry',        'wrestlers',    match?.rivalry      || '');
  initSmartSelect('ss-rivalry-action', 'rivalactions', match?.rivalryAction|| '');

  // Multi selects
  initMultiSelect('ms-type',    'types',     match?.type    || []);
  initMultiSelect('ms-vs',      'wrestlers', match?.vs      || []);
  initMultiSelect('ms-titles',  'titles',    match?.titles  || []);
  initMultiSelect('ms-winners', 'winners',   match?.winners || []);

  // Rating
  const rv = match ? Math.round((match.rating || 0) * 2) : 0;
  document.getElementById('f-rating').value = rv;
  document.getElementById('star-display').textContent = '★ ' + (rv / 2).toFixed(1);

  // Comment
  document.getElementById('f-comment').value = match?.comment || '';

  // Image
  resetImageUpload(match?.imageURL || null);

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editingMatchId = null;
  state.pendingImageFile = null;
  state.pendingImageURL  = null;
}

async function handleSave() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    let { day, month, year } = state.pendingDay || {};
    if (state.editingMatchId && !day) {
      const m = state.matches.find(x => x.id === state.editingMatchId);
      day = m.day; month = m.month; year = m.year;
    }

    const types   = getMultiSelected('ms-type');
    const vs      = getMultiSelected('ms-vs');
    const titles  = getMultiSelected('ms-titles');
    const winners = getMultiSelected('ms-winners');
    const brand         = getSmartSelectVal('ss-brand');
    const division      = getSmartSelectVal('ss-division');
    const rivalry       = getSmartSelectVal('ss-rivalry');
    const rivalryAction = getSmartSelectVal('ss-rivalry-action');

    // Auto-feed catalogs with any new values
    for (const v of vs)      await ensureInCatalog('wrestlers', v);
    for (const v of winners) await ensureInCatalog('winners', v);
    for (const v of types)   await ensureInCatalog('types', v);
    for (const v of titles)  await ensureInCatalog('titles', v);
    await ensureInCatalog('brands',       brand);
    await ensureInCatalog('divisions',    division);
    await ensureInCatalog('wrestlers',    rivalry);
    await ensureInCatalog('rivalactions', rivalryAction);

    // Handle image
    let imageURL = state.pendingImageURL || null;
    if (state.pendingImageFile) {
      imageURL = await uploadToCloudinary(state.pendingImageFile);
    }

    const data = {
      day, month, year,
      sortKey: makeSortKey(year, month, day),
      type: types, vs, titles, winners,
      brand, division, rivalry, rivalryAction,
      rating: parseFloat(document.getElementById('f-rating').value) / 2,
      comment: document.getElementById('f-comment').value.trim(),
      imageURL: imageURL || '',
      num: 0
    };

    await saveMatch(data);
    // Remember last-edited month/year so calendar opens there next time
    state.currentMonth = month;
    state.currentYear  = year;
    localStorage.setItem('lastMonth', month);
    localStorage.setItem('lastYear',  year);
    closeModal();
    document.getElementById('day-detail-overlay').classList.add('hidden');
    renderCalendar();
    renderHistory();
    renderStats();
    renderCatalogs();
    updateSidebarMeta();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar lucha';
  }
}

// ============================================================
//  EDIT / DELETE
// ============================================================
function editMatch(id) {
  document.getElementById('day-detail-overlay').classList.add('hidden');
  openMatchForm(id, null, null, null);
}
window.editMatch = editMatch;

function viewMatch(id) {
  document.getElementById('day-detail-overlay').classList.add('hidden');
  const m = state.matches.find(x => x.id === id);
  if (!m) return;
  const rc = getResultClass(m);
  const labelMap = { win:'Victoria', loss:'Derrota', draw:'Empate', promo:'Promo' };
  const stars = m.rating > 0 ? '★'.repeat(Math.round(m.rating)) + ' ' + m.rating.toFixed(1) : 'Sin calificación';

  const overlay = document.getElementById('view-match-overlay');
  document.getElementById('vm-title').textContent    = isPromo(m) ? 'PROMO' : (m.vs?.length > 0 ? 'vs ' + m.vs.join(' & ') : 'Sin rival');
  document.getElementById('vm-date').textContent     = formatDateLabel(m.year, m.month, m.day);
  document.getElementById('vm-result').textContent   = labelMap[rc];
  document.getElementById('vm-result').className     = 'match-result-badge ' + rc;
  document.getElementById('vm-type').textContent     = m.type?.join(', ') || '—';
  document.getElementById('vm-brand').textContent    = m.brand || '—';
  document.getElementById('vm-division').textContent = m.division || '—';
  document.getElementById('vm-titles').textContent   = m.titles?.join(', ') || '—';
  document.getElementById('vm-winners').textContent  = m.winners?.join(', ') || '—';
  document.getElementById('vm-rivalry').textContent  = m.rivalry || '—';
  document.getElementById('vm-action').textContent   = m.rivalryAction || '—';
  document.getElementById('vm-rating').textContent   = stars;
  document.getElementById('vm-comment').textContent  = m.comment || '—';
  document.getElementById('vm-num').textContent      = '#' + String(m.num||0).padStart(3,'0');

  const imgWrap = document.getElementById('vm-image-wrap');
  if (m.imageURL) {
    imgWrap.innerHTML = `<img src="${m.imageURL}" alt="Imagen del combate" style="width:100%;max-height:260px;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border);">`;
    imgWrap.style.display = 'block';
  } else {
    imgWrap.innerHTML = '';
    imgWrap.style.display = 'none';
  }

  overlay.dataset.matchId = id;
  overlay.classList.remove('hidden');
}
window.viewMatch = viewMatch;

function confirmDelete(id) {
  state.pendingDeleteId = id;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}
window.confirmDelete = confirmDelete;

function setupConfirmModal() {
  // View match modal: edit button + backdrop close
  const vmOverlay = document.getElementById('view-match-overlay');
  document.getElementById('vm-edit-btn').addEventListener('click', () => {
    const id = vmOverlay.dataset.matchId;
    vmOverlay.classList.add('hidden');
    if (id) editMatch(id);
  });
  vmOverlay.addEventListener('click', e => {
    if (e.target === vmOverlay) vmOverlay.classList.add('hidden');
  });

  document.getElementById('confirm-no').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.add('hidden');
    state.pendingDeleteId = null;
  });
  document.getElementById('confirm-yes').addEventListener('click', async () => {
    if (state.pendingDeleteId) {
      await deleteMatch(state.pendingDeleteId);
      state.pendingDeleteId = null;
    }
    document.getElementById('confirm-overlay').classList.add('hidden');
    document.getElementById('day-detail-overlay').classList.add('hidden');
    renderCalendar();
    renderHistory();
    renderStats();
    updateSidebarMeta();
  });
}

// ============================================================
//  ADD-TO-CATALOG MODAL (inline prompt)
// ============================================================
function setupAddCatModal() {
  const overlay = document.getElementById('add-cat-overlay');
  const input   = document.getElementById('add-cat-input');

  document.getElementById('add-cat-close').addEventListener('click',  () => overlay.classList.add('hidden'));
  document.getElementById('add-cat-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('add-cat-confirm').addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) return;
    overlay.classList.add('hidden');
    if (state.addCatCallback) await state.addCatCallback(val);
    state.addCatCallback = null;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-cat-confirm').click();
  });
}

function openAddCatModal(title, label, callback) {
  document.getElementById('add-cat-title').textContent = title;
  document.getElementById('add-cat-label').textContent = label;
  document.getElementById('add-cat-input').value = '';
  state.addCatCallback = callback;
  document.getElementById('add-cat-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('add-cat-input').focus(), 50);
}

// ============================================================
//  SMART SELECT — single value, alphabetical dropdown, + add
// ============================================================
function initSmartSelect(containerId, catalogKey, selectedValue) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';

  let current = selectedValue || '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'smart-select-btn' + (current ? '' : ' placeholder');
  btn.textContent = current || '— ninguna —';

  const dropdown = document.createElement('div');
  dropdown.className = 'smart-select-dropdown';

  function buildDropdown() {
    dropdown.innerHTML = '';
    const sorted = [...state.catalogs[catalogKey]].sort((a,b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    // Empty option
    const none = document.createElement('div');
    none.className = 'ss-option' + (current === '' ? ' selected' : '');
    none.textContent = '— ninguna —';
    none.addEventListener('mousedown', e => {
      e.preventDefault();
      current = '';
      btn.textContent = '— ninguna —';
      btn.classList.add('placeholder');
      dropdown.classList.remove('open');
    });
    dropdown.appendChild(none);

    sorted.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'ss-option' + (opt === current ? ' selected' : '');
      div.textContent = opt;
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        current = opt;
        btn.textContent = opt;
        btn.classList.remove('placeholder');
        dropdown.classList.remove('open');
      });
      dropdown.appendChild(div);
    });

    // Add new option
    const addOpt = document.createElement('div');
    addOpt.className = 'ss-option add-new';
    addOpt.innerHTML = '+ Agregar nuevo';
    addOpt.addEventListener('mousedown', e => {
      e.preventDefault();
      dropdown.classList.remove('open');
      const labels = {
        brands: 'Marca / Evento', divisions: 'División', wrestlers: 'Luchador',
        rivalactions: 'Acción de rivalidad', types: 'Tipo de lucha',
        titles: 'Campeonato', winners: 'Ganador'
      };
      openAddCatModal(`Agregar a ${labels[catalogKey] || catalogKey}`, labels[catalogKey] || 'Nombre', async (val) => {
        await ensureInCatalog(catalogKey, val);
        current = val;
        btn.textContent = val;
        btn.classList.remove('placeholder');
        renderCatalogs();
        buildDropdown();
      });
    });
    dropdown.appendChild(addOpt);
  }

  btn.addEventListener('click', () => {
    const isOpen = dropdown.classList.contains('open');
    // Close all other dropdowns
    document.querySelectorAll('.smart-select-dropdown.open, .ms-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) {
      buildDropdown();
      dropdown.classList.add('open');
    }
  });

  btn.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('open'), 150));

  wrap._getValue = () => current;
  buildDropdown();
  wrap.appendChild(btn);
  wrap.appendChild(dropdown);
}

function getSmartSelectVal(containerId) {
  const wrap = document.getElementById(containerId);
  return wrap._getValue ? wrap._getValue() : '';
}

// ============================================================
//  MULTI SELECT — multiple values, alphabetical dropdown, + add
// ============================================================
function initMultiSelect(containerId, catalogKey, selectedItems) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  let items = [...selectedItems];

  function render() {
    // Keep tags and input, rebuild
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

    items.forEach(item => {
      const tag = document.createElement('span');
      tag.className = 'ms-tag';
      tag.innerHTML = `${escHtml(item)} <button type="button">×</button>`;
      tag.querySelector('button').addEventListener('click', e => {
        e.stopPropagation();
        items = items.filter(i => i !== item);
        render();
      });
      wrap.appendChild(tag);
    });

    const inputWrap = document.createElement('div');
    inputWrap.className = 'ms-input-wrap';

    const input = document.createElement('input');
    input.className = 'ms-input';
    input.placeholder = items.length === 0 ? 'Seleccionar…' : '';

    const dropdown = document.createElement('div');
    dropdown.className = 'ms-dropdown';

    function buildDropdown(filter) {
      dropdown.innerHTML = '';
      const sorted = [...state.catalogs[catalogKey]]
        .filter(o => !items.includes(o) && o.toLowerCase().includes((filter||'').toLowerCase()))
        .sort((a,b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      sorted.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'ms-option';
        div.textContent = opt;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          items.push(opt);
          render();
        });
        dropdown.appendChild(div);
      });

      // Add new
      const addOpt = document.createElement('div');
      addOpt.className = 'ms-option add-new';
      addOpt.textContent = '+ Agregar nuevo';
      addOpt.addEventListener('mousedown', e => {
        e.preventDefault();
        dropdown.classList.remove('open');
        const labels = {
          wrestlers: 'Luchador', types: 'Tipo de lucha', titles: 'Campeonato',
          winners: 'Ganador', brands: 'Marca', divisions: 'División', rivalactions: 'Acción'
        };
        openAddCatModal(`Agregar a ${labels[catalogKey] || catalogKey}`, labels[catalogKey] || 'Nombre', async (val) => {
          await ensureInCatalog(catalogKey, val);
          items.push(val);
          renderCatalogs();
          render();
        });
      });
      dropdown.appendChild(addOpt);

      dropdown.classList.toggle('open', sorted.length > 0 || true);
    }

    input.addEventListener('input',  e => buildDropdown(e.target.value));
    input.addEventListener('focus',  () => buildDropdown(input.value));
    input.addEventListener('blur',   () => setTimeout(() => dropdown.classList.remove('open'), 150));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) {
        const val = input.value.trim();
        if (!items.includes(val)) { items.push(val); }
        input.value = '';
        dropdown.classList.remove('open');
        render();
      }
    });

    inputWrap.appendChild(input);
    inputWrap.appendChild(dropdown);
    wrap.appendChild(inputWrap);
    wrap._getSelected = () => items;
  }

  wrap._getSelected = () => items;
  render();
}

function getMultiSelected(containerId) {
  const wrap = document.getElementById(containerId);
  return wrap._getSelected ? [...wrap._getSelected()] : [];
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
//  HISTORY
// ============================================================
function renderHistory() {
  const brandFilter  = document.getElementById('filter-brand').value;
  const typeFilter   = document.getElementById('filter-type').value;
  const resultFilter = document.getElementById('filter-result').value;

  // Repopulate filter selects
  const brands = ['', ...new Set(state.matches.map(m => m.brand).filter(Boolean))].sort();
  const cb = document.getElementById('filter-brand').value;
  document.getElementById('filter-brand').innerHTML =
    brands.map(b => `<option value="${b}" ${b===cb?'selected':''}>${b||'Todas las marcas'}</option>`).join('');

  const types = ['', ...new Set(state.matches.flatMap(m => m.type||[]).filter(Boolean))].sort();
  const ct = document.getElementById('filter-type').value;
  document.getElementById('filter-type').innerHTML =
    types.map(t => `<option value="${t}" ${t===ct?'selected':''}>${t||'Todos los tipos'}</option>`).join('');

  let filtered = [...state.matches].reverse();
  if (brandFilter)  filtered = filtered.filter(m => m.brand === brandFilter);
  if (typeFilter)   filtered = filtered.filter(m => m.type?.includes(typeFilter));
  if (resultFilter) filtered = filtered.filter(m => getResultClass(m) === resultFilter);

  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No hay luchas registradas aún.<br>Haz clic en un día del calendario para agregar la primera.</p></div>';
  } else {
    filtered.forEach(m => {
      const rc = getResultClass(m);
      const labelMap = { win:'Victoria', loss:'Derrota', draw:'Empate', promo:'Promo' };
      const titleStr = isPromo(m) ? 'PROMO' : (m.vs?.length > 0 ? 'vs ' + m.vs.join(' & ') : 'Sin rival');
      const stars    = m.rating > 0 ? '★ ' + m.rating.toFixed(1) : '';

      const card = document.createElement('div');
      card.className = `match-card ${rc}`;
      card.innerHTML = `
        <div class="match-num">#${String(m.num||0).padStart(3,'0')}</div>
        <div class="match-info">
          <div class="match-title">${escHtml(titleStr)}</div>
          <div class="match-meta">
            ${(m.type||[]).map(t=>`<span class="match-tag">${escHtml(t)}</span>`).join('')}
            ${m.brand ? `<span class="match-tag">${escHtml(m.brand)}</span>` : ''}
            ${(m.titles||[]).length > 0 ? `<span class="match-tag" style="color:var(--accent);">🏆 ${escHtml(m.titles.join(', '))}</span>` : ''}
            ${m.rivalry ? `<span class="match-tag" style="color:var(--promo);">Rivalidad: ${escHtml(m.rivalry)}</span>` : ''}
          </div>
          ${m.comment ? `<div class="match-comment">${escHtml(m.comment)}</div>` : ''}
          ${m.imageURL ? `<img class="match-thumb" src="${m.imageURL}" alt="Imagen del combate" loading="lazy">` : ''}
        </div>
        <div class="match-right">
          <span class="match-result-badge ${rc}">${labelMap[rc]}</span>
          ${stars ? `<span class="match-stars">${stars}</span>` : ''}
          <span class="match-date-label">${formatDateLabel(m.year, m.month, m.day)}</span>
          <div class="match-actions">
            <button class="btn-icon" onclick="viewMatch('${m.id}')">Ver</button>
            <button class="btn-icon" onclick="editMatch('${m.id}')">Editar</button>
            <button class="btn-icon del" onclick="confirmDelete('${m.id}')">Eliminar</button>
          </div>
        </div>`;
      list.appendChild(card);
    });
  }

  ['filter-brand','filter-type','filter-result'].forEach(id => {
    document.getElementById(id).onchange = renderHistory;
  });
}

// ============================================================
//  STATS
// ============================================================
function renderStats() {
  const real   = state.matches.filter(m => !isPromo(m));
  const total  = real.length;
  const wins   = real.filter(m => getResultClass(m) === 'win').length;
  const losses = real.filter(m => getResultClass(m) === 'loss').length;
  const draws  = real.filter(m => getResultClass(m) === 'draw').length;
  const rated  = real.filter(m => m.rating > 0);
  const avg    = rated.length > 0 ? (rated.reduce((s,m)=>s+m.rating,0)/rated.length).toFixed(2) : '—';
  const winPct = total > 0 ? Math.round(wins/total*100) : 0;

  // ── General summary ──
  document.getElementById('stat-general').innerHTML = `
    <div class="stat-card-item"><div class="sc-label">Luchas</div><div class="sc-val">${total}</div></div>
    <div class="stat-card-item"><div class="sc-label">Victorias</div><div class="sc-val win">${wins}</div></div>
    <div class="stat-card-item"><div class="sc-label">% Victoria</div><div class="sc-val gold">${winPct}%</div></div>
    <div class="stat-card-item"><div class="sc-label">Rating prom.</div><div class="sc-val gold">${avg==='—'?'—':'★'+avg}</div></div>
    <div class="stat-card-item"><div class="sc-label">Derrotas</div><div class="sc-val loss">${losses}</div></div>
    <div class="stat-card-item"><div class="sc-label">Empates</div><div class="sc-val">${draws}</div></div>`;

  // ── By type (bar list) ──
  const typeEl = document.getElementById('stat-by-type');
  typeEl.innerHTML = '';
  const byType = {};
  real.forEach(m => {
    (m.type||[]).forEach(t => {
      if (!byType[t]) byType[t] = { total:0, wins:0 };
      byType[t].total++;
      if (getResultClass(m)==='win') byType[t].wins++;
    });
  });
  Object.entries(byType).sort((a,b)=>b[1].total-a[1].total).forEach(([type,data]) => {
    const pct = Math.round(data.wins/data.total*100);
    typeEl.innerHTML += `<div class="bar-item">
      <div class="bar-header"><span class="bar-label">${escHtml(type)} (${data.total})</span><span class="bar-pct">${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill win" style="width:${pct}%"></div></div>
    </div>`;
  });
  if (!typeEl.innerHTML) typeEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin datos aún</p>';

  // ── By brand (bar list in stat-by-brand + chart in chart-brand) ──
  const byBrand = {};
  state.matches.forEach(m => { if (m.brand) byBrand[m.brand] = (byBrand[m.brand]||0)+1; });

  // Rivalries
  const rivEl = document.getElementById('stat-rivalries');
  rivEl.innerHTML = '';
  const rivals = {};
  real.forEach(m => {
    if (m.rivalry) {
      if (!rivals[m.rivalry]) rivals[m.rivalry] = { total:0, wins:0, losses:0, draws:0 };
      rivals[m.rivalry].total++;
      const rc = getResultClass(m);
      if (rc==='win')  rivals[m.rivalry].wins++;
      else if (rc==='loss') rivals[m.rivalry].losses++;
      else rivals[m.rivalry].draws++;
    }
  });
  Object.entries(rivals).sort((a,b)=>b[1].total-a[1].total).forEach(([rival,data]) => {
    rivEl.innerHTML += `<div class="rivalry-item">
      <span class="rivalry-name">${escHtml(rival)}</span>
      <span style="display:flex;gap:6px;align-items:center;">
        <span style="color:var(--win);font-size:12px;">${data.wins}V</span>
        <span style="color:var(--text-ter);font-size:11px;">·</span>
        <span style="color:var(--loss);font-size:12px;">${data.losses}D</span>
        <span style="color:var(--text-ter);font-size:11px;">·</span>
        <span style="color:var(--draw);font-size:12px;">${data.draws}E</span>
      </span>
    </div>`;
  });
  if (!rivEl.innerHTML) rivEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin rivalidades aún</p>';

  // Title days
  const titlesEl = document.getElementById('stat-titles');
  titlesEl.innerHTML = '';
  const titleDays = calcTitleDays();
  Object.entries(titleDays).forEach(([title,days]) => {
    titlesEl.innerHTML += `<div class="title-item">
      <span class="title-name">${escHtml(title)}</span>
      <span class="title-days">${days} días</span>
    </div>`;
  });
  if (!titlesEl.innerHTML) titlesEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin títulos aún</p>';

  // Charts
  renderCharts(real, wins, losses, draws, byBrand);
}

function renderCharts(real, wins, losses, draws, byBrand) {
  // ── Donut: V/D/E ──
  const donutEl = document.getElementById('chart-wld');
  if (donutEl) {
    const total = wins + losses + draws;
    if (total === 0) {
      donutEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;text-align:center;padding:20px 0;">Sin datos aún</p>';
    } else {
      const pctW = Math.round(wins/total*100);
      const pctL = Math.round(losses/total*100);
      const pctD = Math.round(draws/total*100);
      const seg = (val, offset, color) => {
        if (val === 0) return '';
        const dash = val/total*100;
        const gap  = 100 - dash;
        return `<circle cx="20" cy="20" r="15" fill="none" stroke="${color}" stroke-width="8"
          stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}"
          style="transform:rotate(-90deg);transform-origin:20px 20px"/>`;
      };
      const wOff = 0;
      const lOff = -(wins/total*100);
      const dOff = -((wins+losses)/total*100);
      donutEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <svg viewBox="0 0 40 40" width="100" height="100" style="flex-shrink:0;">
            ${seg(wins,   wOff, 'var(--win)')}
            ${seg(losses, lOff, 'var(--loss)')}
            ${seg(draws,  dOff, 'var(--draw)')}
            <text x="20" y="18" text-anchor="middle" font-size="6" fill="var(--text)" font-family="var(--font-head)" font-weight="700">${total}</text>
            <text x="20" y="25" text-anchor="middle" font-size="3.5" fill="var(--text-ter)" font-family="var(--font-body)">luchas</text>
          </svg>
          <div style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:100px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="display:flex;align-items:center;gap:6px;color:var(--win);"><span style="width:8px;height:8px;border-radius:50%;background:var(--win);display:inline-block;"></span>Victorias</span>
              <span style="font-family:var(--font-head);font-size:16px;font-weight:700;color:var(--win);">${wins}<span style="font-size:11px;font-family:var(--font-body);font-weight:400;color:var(--text-ter);margin-left:4px;">${pctW}%</span></span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="display:flex;align-items:center;gap:6px;color:var(--loss);"><span style="width:8px;height:8px;border-radius:50%;background:var(--loss);display:inline-block;"></span>Derrotas</span>
              <span style="font-family:var(--font-head);font-size:16px;font-weight:700;color:var(--loss);">${losses}<span style="font-size:11px;font-family:var(--font-body);font-weight:400;color:var(--text-ter);margin-left:4px;">${pctL}%</span></span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="display:flex;align-items:center;gap:6px;color:var(--draw);"><span style="width:8px;height:8px;border-radius:50%;background:var(--draw);display:inline-block;"></span>Empates</span>
              <span style="font-family:var(--font-head);font-size:16px;font-weight:700;color:var(--draw);">${draws}<span style="font-size:11px;font-family:var(--font-body);font-weight:400;color:var(--text-ter);margin-left:4px;">${pctD}%</span></span>
            </div>
          </div>
        </div>`;
    }
  }

  // ── Horizontal bars: matches per brand (in chart-brand) ──
  const brandChartEl = document.getElementById('chart-brand');
  if (brandChartEl) {
    const brandEntries = Object.entries(byBrand).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (brandEntries.length === 0) {
      brandChartEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin datos aún</p>';
    } else {
      const maxVal = brandEntries[0][1];
      brandChartEl.innerHTML = brandEntries.map(([brand,count]) => {
        const pct = Math.round(count/maxVal*100);
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:12px;color:var(--text-sec);width:90px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(brand)}">${escHtml(brand)}</span>
          <div style="flex:1;background:var(--bg4);border-radius:99px;height:8px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:99px;transition:width .4s;"></div>
          </div>
          <span style="font-size:12px;font-weight:600;color:var(--text);min-width:20px;text-align:right;">${count}</span>
        </div>`;
      }).join('');
    }
  }

  // ── Sparkline: rating over time (in chart-rating) ──
  const sparkEl = document.getElementById('chart-rating');
  if (sparkEl) {
    const ratedMatches = real.filter(m => m.rating > 0).sort((a,b)=>(a.sortKey||'').localeCompare(b.sortKey||''));
    if (ratedMatches.length < 2) {
      sparkEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Se necesitan al menos 2 luchas calificadas</p>';
    } else {
      const W = 300, H = 80, pad = 10;
      const ratings = ratedMatches.map(m => m.rating);
      const minR  = Math.min(...ratings);
      const maxR  = Math.max(...ratings);
      const range = maxR - minR || 1;
      const pts   = ratings.map((r,i) => {
        const x = pad + (i/(ratings.length-1))*(W-pad*2);
        const y = H - pad - ((r-minR)/range)*(H-pad*2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const avg  = ratings.reduce((s,r)=>s+r,0)/ratings.length;
      const avgY = H - pad - ((avg-minR)/range)*(H-pad*2);
      sparkEl.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible;">
          <line x1="${pad}" y1="${avgY.toFixed(1)}" x2="${W-pad}" y2="${avgY.toFixed(1)}" stroke="var(--border2)" stroke-width="1" stroke-dasharray="3 3"/>
          <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          ${ratings.map((r,i)=>{
            const x = pad + (i/(ratings.length-1))*(W-pad*2);
            const y = H - pad - ((r-minR)/range)*(H-pad*2);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--accent)"/>`;
          }).join('')}
          <text x="${pad}" y="${H+2}" font-size="9" fill="var(--text-ter)" font-family="var(--font-body)">${minR.toFixed(1)}★</text>
          <text x="${W-pad}" y="${H+2}" font-size="9" fill="var(--text-ter)" font-family="var(--font-body)" text-anchor="end">${maxR.toFixed(1)}★</text>
          <text x="${W/2}" y="10" font-size="9" fill="var(--text-sec)" font-family="var(--font-body)" text-anchor="middle">prom. ★${avg.toFixed(2)}</text>
        </svg>`;
    }
  }
}

function calcTitleDays() {
  const sorted = [...state.matches].sort((a,b)=>(a.sortKey||'').localeCompare(b.sortKey||''));
  const active = {}, total = {};
  sorted.forEach(m => {
    const held  = m.titles || [];
    const dayN  = (m.year-1)*12*28 + m.month*28 + m.day;
    Object.keys(active).forEach(t => {
      if (!held.includes(t)) { total[t] = (total[t]||0) + (dayN - active[t]); delete active[t]; }
    });
    held.forEach(t => { if (!active[t]) active[t] = dayN; });
  });
  const today = (state.currentYear-1)*12*28 + state.currentMonth*28 + 28;
  Object.keys(active).forEach(t => { total[t] = (total[t]||0) + (today - active[t]); });
  return total;
}

// ============================================================
//  CATALOGS VIEW
// ============================================================
function renderCatalogs() {
  const cats = [
    { id:'cat-wrestlers',    key:'wrestlers'    },
    { id:'cat-types',        key:'types'        },
    { id:'cat-brands',       key:'brands'       },
    { id:'cat-titles',       key:'titles'       },
    { id:'cat-divisions',    key:'divisions'    },
    { id:'cat-winners',      key:'winners'      },
    { id:'cat-rivalactions', key:'rivalactions' }
  ];
  cats.forEach(({ id, key }) => {
    const card   = document.getElementById(id);
    const listEl = card.querySelector('.cat-list');
    listEl.innerHTML = '';
    const sorted = [...state.catalogs[key]].sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'}));
    sorted.forEach(item => {
      const div = document.createElement('div');
      div.className = 'cat-item';
      div.innerHTML = `<span>${escHtml(item)}</span><button data-key="${key}" data-item="${escHtml(item)}">×</button>`;
      div.querySelector('button').addEventListener('click', async () => {
        state.catalogs[key] = state.catalogs[key].filter(i => i !== item);
        await saveCatalog(key);
        renderCatalogs();
      });
      listEl.appendChild(div);
    });
  });
}

function setupCatalogEditors() {
  const cats = [
    { id:'cat-wrestlers',    key:'wrestlers'    },
    { id:'cat-types',        key:'types'        },
    { id:'cat-brands',       key:'brands'       },
    { id:'cat-titles',       key:'titles'       },
    { id:'cat-divisions',    key:'divisions'    },
    { id:'cat-winners',      key:'winners'      },
    { id:'cat-rivalactions', key:'rivalactions' }
  ];
  cats.forEach(({ id, key }) => {
    const card  = document.getElementById(id);
    const input = card.querySelector('input');
    const btn   = card.querySelector('.cat-add button');
    const add   = async () => {
      const val = input.value.trim();
      if (!val) return;
      await ensureInCatalog(key, val);
      input.value = '';
      renderCatalogs();
    };
    btn.addEventListener('click', add);
    input.addEventListener('keydown', e => { if (e.key==='Enter') add(); });
  });
}

// ============================================================
//  SIDEBAR META
// ============================================================
function updateSidebarMeta() {
  const real  = state.matches.filter(m => !isPromo(m));
  const wins  = real.filter(m => getResultClass(m)==='win').length;
  const losses= real.filter(m => getResultClass(m)==='loss').length;
  const rated = real.filter(m => m.rating > 0);
  const avg   = rated.length > 0 ? (rated.reduce((s,m)=>s+m.rating,0)/rated.length).toFixed(1) : '—';
  document.getElementById('meta-total').textContent  = real.length;
  document.getElementById('meta-wins').textContent   = wins;
  document.getElementById('meta-losses').textContent = losses;
  document.getElementById('meta-rating').textContent = avg==='—' ? '—' : '★'+avg;
}

// ============================================================
//  START
// ============================================================
init();
