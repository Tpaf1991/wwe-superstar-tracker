// ============================================================
//  WWE 2K25 — SUPERSTAR MODE — app.js
// ============================================================

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_PER_MONTH = 28;
const WEEKS = ['Semana 1','Semana 2','Semana 3','Semana 4'];
const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

// ---- State ----
let state = {
  currentMonth: 0,  // 0-11
  currentYear: 1,   // WWE year
  matches: [],
  catalogs: {
    wrestlers: [],
    types: ['Singles','Tag Team','Triple Threat','Fatal 4-Way','Battle Royal','Hell in a Cell','TLC','Ladder','Steel Cage','Last Man Standing','Extreme Rules','Promo'],
    brands: ['Raw','SmackDown','NXT','WrestleMania','SummerSlam','Royal Rumble','Survivor Series','Money in the Bank','Elimination Chamber'],
    titles: ['WWE Championship','Universal Championship','Intercontinental Championship','United States Championship','Raw Tag Team Championship','SmackDown Tag Team Championship','Women\'s Championship','Women\'s Tag Team Championship'],
    // divisions removed — 'División' now reads from titles catalog
    rivalactions: ['Inicio de rivalidad','Ataque post-lucha','Interferencia','Traición','Confrontación verbal','Desafío al título','Fin de rivalidad','Alianza inesperada']
  },
  editingMatchId: null,
  pendingDay: null,
  pendingDeleteId: null
};

// ---- Firestore refs ----
const matchesRef = db.collection('matches');
const catalogsRef = db.collection('catalogs');

// ---- Init ----
async function init() {
  // 1. Setup all UI immediately — buttons and calendar work right away
  setupNavigation();
  setupCalendarNav();
  setupModal();
  setupDayDetailModal();
  setupCatalogEditors();
  setupConfirmModal();
  setupExport();
  renderCalendar(); // empty grid shown instantly

  // 2. Load Firebase data in background
  try {
    await loadCatalogs();
    await loadMatches();
  } catch(err) {
    console.error('Firebase load error:', err);
  }

  // 3. Re-render with real data
  renderCalendar();
  renderHistory();
  renderStats();
  renderCatalogs();
  updateSidebarMeta();
}

// ---- Navigation ----
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
      if (btn.dataset.view === 'stats') renderStats();
    });
  });
}

// ---- Firebase: Load / Save ----
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
  renumberMatches();
}

async function deleteMatch(id) {
  await matchesRef.doc(id).delete();
  state.matches = state.matches.filter(m => m.id !== id);
  renumberMatches();
}

function renumberMatches() {
  // In-memory only — no Firebase writes needed just for display numbering
  const sorted = [...state.matches].sort((a,b) => (a.sortKey||'').localeCompare(b.sortKey||''));
  sorted.forEach((m, i) => { m.num = i + 1; });
  state.matches = sorted;
}

async function loadCatalogs() {
  const snap = await catalogsRef.get();
  if (!snap.empty) {
    snap.docs.forEach(d => {
      if (d.id === 'winners') return; // removed — data goes into wrestlers now
      if (state.catalogs[d.id] !== undefined) {
        state.catalogs[d.id] = d.data().items || state.catalogs[d.id];
      }
    });
  }
}

async function saveCatalog(key) {
  // Always keep catalog sorted A-Z before saving
  state.catalogs[key].sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'}));
  await catalogsRef.doc(key).set({ items: state.catalogs[key] });
}

// ---- Date helpers ----
function makeSortKey(year, month, day) {
  return `${String(year).padStart(4,'0')}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function formatDateLabel(year, month, day) {
  return `Día ${day} · ${MONTHS[month]} · Año ${year}`;
}

function getWeek(day) { return Math.floor((day - 1) / 7); }
function getDayOfWeek(day) { return (day - 1) % 7; }

// ---- Calendar ----
function setupCalendarNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    if (state.currentMonth === 0 && state.currentYear === 1) return;
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    renderCalendar();
  });

  // Click on year label → year picker grid
  const yearEl = document.getElementById('cal-year-title');
  yearEl.style.cursor = 'pointer';
  yearEl.style.textDecoration = 'underline dotted';
  yearEl.title = 'Clic para cambiar año · Scroll para avanzar';
  yearEl.addEventListener('click', openYearPicker);
  yearEl.addEventListener('wheel', e => {
    e.preventDefault();
    state.currentYear += e.deltaY < 0 ? 1 : -1;
    if (state.currentYear < 1) state.currentYear = 1;
    renderCalendar();
  }, { passive: false });
}

function openYearPicker() {
  if (document.getElementById('year-picker-overlay')) {
    document.getElementById('year-picker-overlay').remove();
    return;
  }

  const maxYear = Math.max(state.currentYear, ...state.matches.map(m => m.year || 1), 1) + 3;
  const years = Array.from({ length: maxYear }, (_, i) => i + 1);

  const overlay = document.createElement('div');
  overlay.id = 'year-picker-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:900;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.45);`;

  const box = document.createElement('div');
  box.style.cssText = `
    background:var(--bg2);border:1px solid var(--border2);
    border-radius:var(--radius);padding:20px;
    width:280px;max-width:90vw;
    box-shadow:0 8px 32px rgba(0,0,0,0.18);`;

  const title = document.createElement('p');
  title.textContent = 'Seleccionar año';
  title.style.cssText = `font-family:var(--font-head);font-size:15px;font-weight:700;
    text-transform:uppercase;letter-spacing:.5px;color:var(--text);margin-bottom:12px;`;
  box.appendChild(title);

  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:240px;overflow-y:auto;`;

  years.forEach(y => {
    const btn = document.createElement('button');
    btn.textContent = `Año ${y}`;
    const active = y === state.currentYear;
    btn.style.cssText = `
      background:${active ? 'var(--accent)' : 'var(--bg3)'};
      color:${active ? 'var(--bg)' : 'var(--text-sec)'};
      border:1px solid ${active ? 'var(--accent)' : 'var(--border2)'};
      border-radius:var(--radius-sm);padding:7px 4px;
      font-family:var(--font-body);font-size:12px;cursor:pointer;
      transition:all .12s;`;
    btn.addEventListener('mouseenter', () => { if (!active) btn.style.borderColor = 'var(--accent)'; });
    btn.addEventListener('mouseleave', () => { if (!active) btn.style.borderColor = 'var(--border2)'; });
    btn.addEventListener('click', () => {
      state.currentYear = y;
      renderCalendar();
      overlay.remove();
    });
    grid.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.style.cssText = `
    margin-top:12px;background:none;border:1px solid var(--border2);
    color:var(--text-sec);padding:8px 16px;border-radius:var(--radius-sm);
    font-family:var(--font-body);font-size:13px;cursor:pointer;width:100%;`;
  cancelBtn.addEventListener('click', () => overlay.remove());

  box.appendChild(grid);
  box.appendChild(cancelBtn);
  overlay.appendChild(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  setTimeout(() => {
    const active = grid.querySelector(`button[style*="var(--accent)"]`);
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, 30);
}

function renderCalendar() {
  document.getElementById('cal-month-title').textContent = MONTHS[state.currentMonth];
  document.getElementById('cal-year-title').textContent = `Año ${state.currentYear}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const matchesThisMonth = state.matches.filter(m => m.month === state.currentMonth && m.year === state.currentYear);

  for (let week = 0; week < 4; week++) {
    const weekLabel = document.createElement('div');
    weekLabel.className = 'cal-week-label';
    weekLabel.textContent = WEEKS[week];
    grid.appendChild(weekLabel);

    for (let dow = 0; dow < 7; dow++) {
      const day = week * 7 + dow + 1;
      const cell = document.createElement('div');
      cell.className = 'cal-cell';

      const numDiv = document.createElement('div');
      numDiv.className = 'cal-cell-num';
      numDiv.textContent = day;
      cell.appendChild(numDiv);

      const dayMatches = matchesThisMonth.filter(m => m.day === day);
      if (dayMatches.length > 0) {
        cell.classList.add('has-match');

        dayMatches.forEach(m => {
          const rc = getResultClass(m);
          const block = document.createElement('div');
          block.className = 'cal-match-block';

          // Row 1: dot + winner name(s)
          const dotRow = document.createElement('div');
          dotRow.className = 'cal-dot-row';
          const dot = document.createElement('span');
          dot.className = 'cal-dot ' + rc;
          dotRow.appendChild(dot);
          if (m.winners?.length) {
            const wLabel = document.createElement('span');
            wLabel.className = 'cal-winner-label';
            wLabel.textContent = m.winners.join(' & ');
            dotRow.appendChild(wLabel);
          }
          block.appendChild(dotRow);

          // Row 2+: match details
          if (isPromo(m)) {
            const l = document.createElement('div');
            l.className = 'cal-preview-type';
            l.textContent = 'PROMO';
            block.appendChild(l);
          } else {
            if (m.vs?.length) {
              const l = document.createElement('div');
              l.className = 'cal-preview-vs';
              l.textContent = 'vs ' + m.vs.join(' & ');
              block.appendChild(l);
            }
            if (m.type?.length) {
              const l = document.createElement('div');
              l.className = 'cal-preview-type';
              l.textContent = m.type.join(', ');
              block.appendChild(l);
            }
            const brandArr = Array.isArray(m.brand) ? m.brand : (m.brand ? [m.brand] : []);
            if (brandArr.length > 0) {
              const l = document.createElement('div');
              l.className = 'cal-preview-brand';
              l.textContent = brandArr.join(' / ');
              block.appendChild(l);
            }
          }
          cell.appendChild(block);
        });
      }

      cell.addEventListener('click', () => openDayModal(day, state.currentMonth, state.currentYear));
      grid.appendChild(cell);
    }
  }
}

function getResultClass(match) {
  if (isPromo(match)) return 'promo';
  const myName = 'Mi Superstar';
  const winners = match.winners || [];
  if (winners.length === 0) return 'draw';
  if (winners.some(w => w.toLowerCase().includes('mi superstar') || w === myName)) return 'win';
  // Check if user won: if winners list is not empty and doesn't include any rival
  const rivals = match.vs || [];
  const userWon = winners.length > 0 && !winners.some(w => rivals.includes(w));
  if (userWon) return 'win';
  return 'loss';
}

function isPromo(match) {
  return match.type && match.type.includes('Promo');
}

// ---- Day Modal ----
function openDayModal(day, month, year) {
  const dayMatches = state.matches.filter(m => m.day === day && m.month === month && m.year === year);
  state.pendingDay = { day, month, year };

  if (dayMatches.length > 0) {
    showDayDetailModal(dayMatches, day, month, year);
  } else {
    openMatchForm(null, day, month, year);
  }
}

function showDayDetailModal(matches, day, month, year) {
  const overlay = document.getElementById('day-detail-overlay');
  document.getElementById('day-detail-title').textContent = formatDateLabel(year, month, day);
  const body = document.getElementById('day-detail-body');
  body.innerHTML = '';

  matches.forEach(m => {
    const div = document.createElement('div');
    div.className = 'mini-match';
    const rc = getResultClass(m);
    div.innerHTML = `
      <div class="mini-match-info">
        <div class="mini-match-title">${isPromo(m) ? 'PROMO' : (m.vs?.join(' vs ') || 'Sin rival')}</div>
        <div class="mini-match-sub">${m.type?.join(', ') || ''} ${(Array.isArray(m.brand) ? m.brand : (m.brand ? [m.brand] : [])).length > 0 ? '· ' + (Array.isArray(m.brand) ? m.brand : [m.brand]).join(' / ') : ''}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="match-result-badge ${rc}">${rc === 'win' ? 'Vic' : rc === 'loss' ? 'Der' : rc === 'promo' ? 'Promo' : 'Emp'}</span>
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

// ---- Match Form Modal ----
function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('btn-save').addEventListener('click', handleSave);
  document.getElementById('f-rating').addEventListener('input', e => {
    document.getElementById('star-display').textContent = '★ ' + (e.target.value / 2).toFixed(1);
  });
}

function openMatchForm(matchId, day, month, year) {
  state.editingMatchId = matchId;
  const match = matchId ? state.matches.find(m => m.id === matchId) : null;

  if (match) {
    day = match.day; month = match.month; year = match.year;
  }

  document.getElementById('modal-title').textContent = match ? 'Editar lucha' : 'Agregar lucha';
  document.getElementById('modal-date-label').textContent = formatDateLabel(year, month, day);

  // Single-value custom selects (support inline add)
  initMultiSelect('ss-brand',   state.catalogs.brands,      Array.isArray(match?.brand)         ? match.brand         : (match?.brand         ? [match.brand]         : []), 'brands');
  initMultiSelect('ss-division', state.catalogs.titles,      Array.isArray(match?.division)      ? match.division      : (match?.division      ? [match.division]      : []), 'titles');
  initMultiSelect('ss-rivalry-action', state.catalogs.rivalactions, Array.isArray(match?.rivalryAction) ? match.rivalryAction : (match?.rivalryAction ? [match.rivalryAction] : []), 'rivalactions');

  // Multi-selects
  initMultiSelect('ms-type',    state.catalogs.types,     match?.type    || [], 'types');
  initMultiSelect('ms-vs',      state.catalogs.wrestlers, match?.vs      || [], 'wrestlers');
  initMultiSelect('ms-partners', state.catalogs.wrestlers, match?.partners || [], 'wrestlers');
  initMultiSelect('ms-titles',  state.catalogs.titles,    match?.titles  || [], 'titles');
  // Ganadores & Rivalidad leen del catálogo de luchadores
  initMultiSelect('ms-winners', state.catalogs.wrestlers, match?.winners || [], 'wrestlers');
  initMultiSelect('ss-rivalry', state.catalogs.wrestlers, Array.isArray(match?.rivalry) ? match.rivalry : (match?.rivalry ? [match.rivalry] : []), 'wrestlers');

  // Rating
  const ratingVal = match ? Math.round(match.rating * 2) : 0;
  document.getElementById('f-rating').value = ratingVal;
  document.getElementById('star-display').textContent = '★ ' + (ratingVal / 2).toFixed(1);

  // Comment
  document.getElementById('f-comment').value = match?.comment || '';

  // Day matches summary (existing matches on this day)
  const dayMatches = state.matches.filter(m => m.day === day && m.month === month && m.year === year && m.id !== matchId);
  const daySection = document.getElementById('day-matches-section');
  if (dayMatches.length > 0) {
    daySection.classList.remove('hidden');
    const list = document.getElementById('day-matches-list');
    list.innerHTML = '';
    dayMatches.forEach(m => {
      const div = document.createElement('div');
      div.className = 'mini-match';
      div.innerHTML = `<div class="mini-match-info">
        <div class="mini-match-title">${m.vs?.join(' vs ') || 'Sin rival'}</div>
        <div class="mini-match-sub">${m.type?.join(', ') || ''}</div>
      </div>`;
      list.appendChild(div);
    });
  } else {
    daySection.classList.add('hidden');
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editingMatchId = null;
}

async function handleSave() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
  const { day, month, year } = state.pendingDay || (() => {
    if (state.editingMatchId) {
      const m = state.matches.find(x => x.id === state.editingMatchId);
      return { day: m.day, month: m.month, year: m.year };
    }
    return { day: 1, month: state.currentMonth, year: state.currentYear };
  })();

  const types    = getMultiSelected('ms-type');
  const vs       = getMultiSelected('ms-vs');
  const partners = getMultiSelected('ms-partners');
  const titles   = getMultiSelected('ms-titles');
  const winners  = getMultiSelected('ms-winners');
  const rivalry  = getMultiSelected('ss-rivalry');

  const data = {
    day, month, year,
    sortKey: makeSortKey(year, month, day),
    type: types,
    vs,
    partners,
    titles,
    winners,
    rivalry,
    brand:        getMultiSelected('ss-brand'),
    division:     getMultiSelected('ss-division'),
    rivalryAction: getMultiSelected('ss-rivalry-action'),
    rating: parseFloat(document.getElementById('f-rating').value) / 2,
    comment: document.getElementById('f-comment').value.trim(),
    num: 0
  };

  await saveMatch(data);
  closeModal();
  document.getElementById('day-detail-overlay').classList.add('hidden');
  renderCalendar();
  renderHistory();
  renderStats();
  renderCatalogs();
  updateSidebarMeta();
  } catch(err) {
    console.error('Save error:', err);
    alert('Error al guardar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar lucha';
  }
}

// ---- Edit / Delete ----
function editMatch(id) {
  document.getElementById('day-detail-overlay').classList.add('hidden');
  openMatchForm(id, null, null, null);
}

function confirmDelete(id) {
  state.pendingDeleteId = id;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

function setupConfirmModal() {
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

// ---- Multi-select component ----
function initMultiSelect(containerId, options, selected, catalogKey) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  let selectedItems = [...selected];
  // options reference is kept live so catalog updates are reflected
  let liveOptions = options;

  function addItem(val) {
    val = val.trim();
    if (!val || selectedItems.includes(val)) return;
    selectedItems.push(val);
    // Auto-add to the source catalog if not already there
    if (!liveOptions.includes(val)) {
      liveOptions.push(val);
      if (catalogKey) saveCatalog(catalogKey); // async fire-and-forget
    }
    render();
  }

  function render() {
    wrap.innerHTML = '';
    selectedItems.forEach(item => {
      const tag = document.createElement('span');
      tag.className = 'ms-tag';
      // Escape for inline handler
      const safe = item.replace(/\\/g,'\\\\').replace(/'/g,"\'");
      tag.innerHTML = `${item} <button onclick="removeTag(this,'${containerId}','${safe}')">×</button>`;
      wrap.appendChild(tag);
    });

    const inputWrap = document.createElement('div');
    inputWrap.className = 'ms-input-wrap';
    const input = document.createElement('input');
    input.className = 'ms-input';
    input.placeholder = selectedItems.length === 0 ? 'Seleccionar o escribir…' : '';
    const dropdown = document.createElement('div');
    dropdown.className = 'ms-dropdown';

    function showDropdown(filter) {
      filter = filter || '';
      dropdown.innerHTML = '';
      // Sort options A-Z, filter out already selected
      const sorted = [...liveOptions]
        .sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'}))
        .filter(o => !selectedItems.includes(o) && o.toLowerCase().includes(filter.toLowerCase()));

      sorted.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'ms-option';
        div.textContent = opt;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          addItem(opt);
        });
        dropdown.appendChild(div);
      });

      // "Agregar: X" option when typed text is not in list
      const trimmed = filter.trim();
      if (trimmed && !liveOptions.some(o => o.toLowerCase() === trimmed.toLowerCase())) {
        const addDiv = document.createElement('div');
        addDiv.className = 'ms-option ms-option-add';
        addDiv.textContent = '+ Agregar: ' + trimmed;
        addDiv.addEventListener('mousedown', e => {
          e.preventDefault();
          addItem(trimmed);
          input.value = '';
        });
        dropdown.appendChild(addDiv);
      }

      dropdown.classList.toggle('open', dropdown.childElementCount > 0);
    }

    input.addEventListener('input',  e => showDropdown(e.target.value));
    input.addEventListener('focus',  () => showDropdown(input.value));
    input.addEventListener('blur',   () => setTimeout(() => dropdown.classList.remove('open'), 160));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (val) { addItem(val); input.value = ''; dropdown.classList.remove('open'); }
      }
    });

    inputWrap.appendChild(input);
    inputWrap.appendChild(dropdown);
    wrap.appendChild(inputWrap);
    wrap._selected = selectedItems;
  }

  wrap._getSelected = () => selectedItems;
  render();
}

window.removeTag = function(btn, containerId, item) {
  const wrap = document.getElementById(containerId);
  const idx = wrap._getSelected ? wrap._getSelected().indexOf(item) : -1;
  if (idx >= 0) wrap._getSelected().splice(idx, 1);
  const inputWrap = wrap.querySelector('.ms-input-wrap');
  const sibling = btn.closest('.ms-tag');
  if (sibling) sibling.remove();
};

function getMultiSelected(containerId) {
  const wrap = document.getElementById(containerId);
  return wrap._getSelected ? [...wrap._getSelected()] : [];
}

// ---- Selects ----
// Single-value custom select with inline-add
function initSingleSelect(containerId, options, catalogKey, selectedValue) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = '';

  let current = selectedValue || '';
  let liveOptions = options; // stays in sync with catalog array

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ss-btn';
  btn.textContent = current || '— ninguna —';
  if (!current) btn.classList.add('placeholder');

  const dropdown = document.createElement('div');
  dropdown.className = 'ss-dropdown';

  function buildDropdown(rawFilter) {
    const filter = (rawFilter || '').toLowerCase(); // for matching only
    const display = (rawFilter || '').trim();       // original case for display/save
    dropdown.innerHTML = '';

    // None option
    const none = document.createElement('div');
    none.className = 'ms-option' + (!current ? ' ms-option-selected' : '');
    none.textContent = '— ninguna —';
    none.addEventListener('mousedown', e => {
      e.preventDefault();
      current = '';
      btn.textContent = '— ninguna —';
      btn.classList.add('placeholder');
      dropdown.classList.remove('open');
    });
    dropdown.appendChild(none);

    // Sorted filtered options
    [...liveOptions]
      .sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'}))
      .filter(o => o.toLowerCase().includes(filter))
      .forEach(opt => {
        const d = document.createElement('div');
        d.className = 'ms-option' + (opt === current ? ' ms-option-selected' : '');
        d.textContent = opt;
        d.addEventListener('mousedown', e => {
          e.preventDefault();
          current = opt;
          btn.textContent = opt;
          btn.classList.remove('placeholder');
          dropdown.classList.remove('open');
        });
        dropdown.appendChild(d);
      });

    // "Agregar: X" if typed text not in list
    if (display && !liveOptions.some(o => o.toLowerCase() === display.toLowerCase())) {
      const add = document.createElement('div');
      add.className = 'ms-option ms-option-add';
      add.textContent = '+ Agregar: ' + display;
      add.addEventListener('mousedown', async e => {
        e.preventDefault();
        if (!liveOptions.includes(display)) {
          liveOptions.push(display);
          if (catalogKey) await saveCatalog(catalogKey);
          renderCatalogs();
        }
        current = display;
        btn.textContent = display;
        btn.classList.remove('placeholder');
        dropdown.classList.remove('open');
        searchInput.value = '';
      });
      dropdown.appendChild(add);
    }
    dropdown.classList.toggle('open', dropdown.childElementCount > 0);
  }

  // Search input inside dropdown
  const searchWrap = document.createElement('div');
  searchWrap.className = 'ss-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'ss-search';
  searchInput.placeholder = 'Buscar o escribir…';
  searchInput.addEventListener('input', e => buildDropdown(e.target.value));
  searchWrap.appendChild(searchInput);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.ss-dropdown.open,.ms-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) {
      buildDropdown('');
      dropdown.classList.add('open');
      setTimeout(() => searchInput.focus(), 30);
    }
  });

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) dropdown.classList.remove('open');
  }, { capture: true });

  wrap._getValue = () => current;
  wrap.appendChild(btn);
  dropdown.insertBefore(searchWrap, dropdown.firstChild);
  wrap.appendChild(dropdown);
}

function getSingleSelectValue(containerId) {
  const wrap = document.getElementById(containerId);
  return wrap?._getValue ? wrap._getValue() : '';
}

// ---- History ----
function renderHistory() {
  const list = document.getElementById('history-list');
  const brandFilter = document.getElementById('filter-brand').value;
  const typeFilter = document.getElementById('filter-type').value;
  const resultFilter = document.getElementById('filter-result').value;

  // Populate filters
  const brands = ['', ...new Set(state.matches.flatMap(m => Array.isArray(m.brand) ? m.brand : (m.brand ? [m.brand] : [])).filter(Boolean))];
  const curBrand = document.getElementById('filter-brand').value;
  document.getElementById('filter-brand').innerHTML = brands.map(b => `<option value="${b}" ${b === curBrand ? 'selected':''}>` + (b || 'Todas las marcas') + '</option>').join('');

  const types = ['', ...state.catalogs.types];
  const curType = document.getElementById('filter-type').value;
  document.getElementById('filter-type').innerHTML = types.map(t => `<option value="${t}" ${t === curType ? 'selected':''}>` + (t || 'Todos los tipos') + '</option>').join('');

  const realMatches = state.matches.filter(m => !isPromo(m));
  let filtered = [...state.matches].reverse();

  if (brandFilter) filtered = filtered.filter(m => (Array.isArray(m.brand) ? m.brand : [m.brand]).includes(brandFilter));
  if (typeFilter) filtered = filtered.filter(m => m.type?.includes(typeFilter));
  if (resultFilter) filtered = filtered.filter(m => getResultClass(m) === resultFilter);

  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No hay luchas registradas aún.<br>Haz clic en un día del calendario para agregar la primera.</p></div>';
    return;
  }

  filtered.forEach(m => {
    const rc = getResultClass(m);
    const card = document.createElement('div');
    card.className = `match-card ${rc}`;

    const stars = m.rating > 0 ? '★ ' + m.rating.toFixed(1) : '';
    const titleStr = isPromo(m) ? 'PROMO' : (m.vs?.length > 0 ? 'vs ' + m.vs.join(' & ') : 'Sin rival');
    const labelMap = { win: 'Victoria', loss: 'Derrota', draw: 'Empate', promo: 'Promo' };

    card.innerHTML = `
      <div class="match-num">#${String(m.num || 0).padStart(3,'0')}</div>
      <div class="match-info">
        <div class="match-title">${titleStr}</div>
        <div class="match-meta">
          ${m.type?.map(t => `<span class="match-tag">${t}</span>`).join('') || ''}
          ${m.brand ? `<span class="match-tag">${m.brand}</span>` : ''}
          ${m.titles?.length > 0 ? `<span class="match-tag" style="color:var(--accent);">🏆 ${m.titles.join(', ')}</span>` : ''}
          ${m.partners?.length > 0 ? `<span class="match-tag" style="color:var(--text-sec);">🤝 ${m.partners.join(' & ')}</span>` : ''}
          ${m.rivalry?.length > 0 ? `<span class="match-tag" style="color:var(--promo);">Rivalidad: ${(Array.isArray(m.rivalry) ? m.rivalry : [m.rivalry]).join(' & ')}</span>` : ''}
        </div>
        ${m.comment ? `<div class="match-comment">${m.comment}</div>` : ''}
      </div>
      <div class="match-right">
        <span class="match-result-badge ${rc}">${labelMap[rc]}</span>
        ${stars ? `<span class="match-stars">${stars}</span>` : ''}
        <span class="match-date-label">${formatDateLabel(m.year, m.month, m.day)}</span>
        <div class="match-actions">
          <button class="btn-icon" onclick="editMatch('${m.id}')">Editar</button>
          <button class="btn-icon del" onclick="confirmDelete('${m.id}')">Eliminar</button>
        </div>
      </div>`;
    list.appendChild(card);
  });

  // Re-attach filter listeners
  ['filter-brand','filter-type','filter-result'].forEach(id => {
    document.getElementById(id).onchange = renderHistory;
  });
}

// ---- Stats ----
function renderStats() {
  const realMatches = state.matches.filter(m => !isPromo(m));
  const total = realMatches.length;
  const wins = realMatches.filter(m => getResultClass(m) === 'win').length;
  const losses = realMatches.filter(m => getResultClass(m) === 'loss').length;
  const draws = realMatches.filter(m => getResultClass(m) === 'draw').length;
  const rated = realMatches.filter(m => m.rating > 0);
  const avgRating = rated.length > 0 ? (rated.reduce((s,m) => s + m.rating, 0) / rated.length).toFixed(2) : '—';
  const winPct = total > 0 ? Math.round(wins / total * 100) : 0;

  document.getElementById('stat-general').innerHTML = `
    <div class="stat-card-item"><div class="sc-label">Luchas</div><div class="sc-val">${total}</div></div>
    <div class="stat-card-item"><div class="sc-label">Victorias</div><div class="sc-val win">${wins}</div></div>
    <div class="stat-card-item"><div class="sc-label">% Victoria</div><div class="sc-val gold">${winPct}%</div></div>
    <div class="stat-card-item"><div class="sc-label">Rating prom.</div><div class="sc-val gold">${avgRating === '—' ? '—' : '★ ' + avgRating}</div></div>
    <div class="stat-card-item"><div class="sc-label">Derrotas</div><div class="sc-val loss">${losses}</div></div>
    <div class="stat-card-item"><div class="sc-label">Empates</div><div class="sc-val">${draws}</div></div>`;

  // By type
  const typeEl = document.getElementById('stat-by-type');
  typeEl.innerHTML = '';
  const byType = {};
  realMatches.forEach(m => {
    (m.type || []).forEach(t => {
      if (!byType[t]) byType[t] = { total: 0, wins: 0 };
      byType[t].total++;
      if (getResultClass(m) === 'win') byType[t].wins++;
    });
  });
  Object.entries(byType).sort((a,b) => b[1].total - a[1].total).forEach(([type, data]) => {
    const pct = Math.round(data.wins / data.total * 100);
    typeEl.innerHTML += `<div class="bar-item">
      <div class="bar-header"><span class="bar-label">${type} (${data.total})</span><span class="bar-pct">${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill win" style="width:${pct}%"></div></div>
    </div>`;
  });
  if (typeEl.innerHTML === '') typeEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin datos aún</p>';

  // By brand
  const brandEl = document.getElementById('stat-by-brand');
  brandEl.innerHTML = '';
  const byBrand = {};
  state.matches.forEach(m => {
    (Array.isArray(m.brand) ? m.brand : (m.brand ? [m.brand] : [])).forEach(b => {
      byBrand[b] = (byBrand[b] || 0) + 1;
    });
  });
  const totalAll = state.matches.length;
  Object.entries(byBrand).sort((a,b) => b[1] - a[1]).forEach(([brand, count]) => {
    const pct = Math.round(count / totalAll * 100);
    brandEl.innerHTML += `<div class="bar-item">
      <div class="bar-header"><span class="bar-label">${brand}</span><span class="bar-pct">${count} luchas</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  });
  if (brandEl.innerHTML === '') brandEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin datos aún</p>';

  // Rivalries
  const rivEl = document.getElementById('stat-rivalries');
  rivEl.innerHTML = '';
  const rivals = {};
  realMatches.forEach(m => {
    const rivalList = Array.isArray(m.rivalry) ? m.rivalry : (m.rivalry ? [m.rivalry] : []);
    rivalList.forEach(rival => {
      if (!rival) return;
      if (!rivals[rival]) rivals[rival] = { total: 0, wins: 0, losses: 0, draws: 0 };
      rivals[rival].total++;
      const rc = getResultClass(m);
      if (rc === 'win') rivals[rival].wins++;
      else if (rc === 'loss') rivals[rival].losses++;
      else rivals[rival].draws++;
    });
  });
  Object.entries(rivals).sort((a,b) => b[1].total - a[1].total).forEach(([rival, data]) => {
    rivEl.innerHTML += `<div class="rivalry-item">
      <span class="rivalry-name">${rival}</span>
      <span class="rivalry-record" style="color:var(--win)">${data.wins}V</span>
      <span class="rivalry-record" style="margin:0 4px;color:var(--text-ter)">·</span>
      <span class="rivalry-record" style="color:var(--loss)">${data.losses}D</span>
      <span class="rivalry-record" style="margin:0 4px;color:var(--text-ter)">·</span>
      <span class="rivalry-record" style="color:var(--draw)">${data.draws}E</span>
    </div>`;
  });
  if (rivEl.innerHTML === '') rivEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin rivalidades aún</p>';

  // Losses by rival (from vs field)
  const lossByRivalEl = document.getElementById('stat-losses-by-rival');
  if (lossByRivalEl) {
    lossByRivalEl.innerHTML = '';
    const lossByRival = {};
    realMatches.forEach(m => {
      if (getResultClass(m) !== 'loss') return;
      (m.vs || []).forEach(rival => {
        if (!rival) return;
        lossByRival[rival] = (lossByRival[rival] || 0) + 1;
      });
    });
    const sorted = Object.entries(lossByRival).sort((a,b) => b[1] - a[1]);
    if (sorted.length === 0) {
      lossByRivalEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin derrotas registradas aún</p>';
    } else {
      const max = sorted[0][1];
      sorted.forEach(([rival, count]) => {
        const pct = Math.round(count / max * 100);
        lossByRivalEl.innerHTML += `<div class="bar-item">
          <div class="bar-header">
            <span class="bar-label">${rival}</span>
            <span class="bar-pct" style="color:var(--loss)">${count} derrota${count > 1 ? 's' : ''}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:var(--loss);"></div>
          </div>
        </div>`;
      });
    }
  }

  // Titles (days)
  const titlesEl = document.getElementById('stat-titles');
  titlesEl.innerHTML = '';
  const titleDays = calcTitleDays();
  Object.entries(titleDays).forEach(([title, days]) => {
    titlesEl.innerHTML += `<div class="title-item">
      <span class="title-name">${title}</span>
      <span class="title-days">${days} días</span>
    </div>`;
  });
  if (titlesEl.innerHTML === '') titlesEl.innerHTML = '<p style="color:var(--text-ter);font-size:13px;">Sin títulos aún</p>';
}

function calcTitleDays() {
  const sorted = [...state.matches].sort((a,b) => (a.sortKey||'').localeCompare(b.sortKey||''));
  const titleActive = {};
  const titleTotal = {};

  sorted.forEach((m, idx) => {
    const heldNow = m.titles || [];
    const dayNum = (m.year - 1) * 12 * 28 + m.month * 28 + m.day;

    // Check which titles were held before this match
    Object.keys(titleActive).forEach(title => {
      if (!heldNow.includes(title)) {
        // Lost title
        const prevDay = titleActive[title];
        titleTotal[title] = (titleTotal[title] || 0) + (dayNum - prevDay);
        delete titleActive[title];
      }
    });

    // New titles
    heldNow.forEach(title => {
      if (!titleActive[title]) {
        titleActive[title] = dayNum;
      }
    });
  });

  // Still active titles
  const today = (state.currentYear - 1) * 12 * 28 + state.currentMonth * 28 + 28;
  Object.keys(titleActive).forEach(title => {
    titleTotal[title] = (titleTotal[title] || 0) + (today - titleActive[title]);
  });

  return titleTotal;
}

// ---- Catalogs ----
function renderCatalogs() {
  const cats = [
    { id: 'cat-wrestlers',    key: 'wrestlers'    },
    { id: 'cat-types',        key: 'types'        },
    { id: 'cat-brands',       key: 'brands'       },
    { id: 'cat-titles',       key: 'titles'       },
    { id: 'cat-rivalactions', key: 'rivalactions' }
  ];
  cats.forEach(({ id, key }) => {
    const card = document.getElementById(id);
    if (!card) return;
    const listEl = card.querySelector('.cat-list');
    listEl.innerHTML = '';
    [...state.catalogs[key]]
      .sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'}))
      .forEach((item) => {
        const realIdx = state.catalogs[key].indexOf(item);
        const div = document.createElement('div');
        div.className = 'cat-item';
        div.innerHTML = `<span>${item}</span><button onclick="removeCatalogItem('${key}', ${realIdx})">×</button>`;
        listEl.appendChild(div);
      });
  });
}

function setupCatalogEditors() {
  const cats = [
    { id: 'cat-wrestlers',    key: 'wrestlers'    },
    { id: 'cat-types',        key: 'types'        },
    { id: 'cat-brands',       key: 'brands'       },
    { id: 'cat-titles',       key: 'titles'       },
    { id: 'cat-rivalactions', key: 'rivalactions' }
  ];
  cats.forEach(({ id, key }) => {
    const card = document.getElementById(id);
    if (!card) return;
    const input = card.querySelector('input');
    const btn = card.querySelector('.cat-add button');
    const add = async () => {
      const val = input.value.trim();
      if (!val || state.catalogs[key].includes(val)) return;
      state.catalogs[key].push(val);
      await saveCatalog(key);
      input.value = '';
      renderCatalogs();
    };
    btn.addEventListener('click', add);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  });
}

window.removeCatalogItem = async function(key, idx) {
  state.catalogs[key].splice(idx, 1);
  await saveCatalog(key);
  renderCatalogs();
};

// ---- Sidebar meta ----
function updateSidebarMeta() {
  const real = state.matches.filter(m => !isPromo(m));
  const wins = real.filter(m => getResultClass(m) === 'win').length;
  const losses = real.filter(m => getResultClass(m) === 'loss').length;
  const rated = real.filter(m => m.rating > 0);
  const avg = rated.length > 0 ? (rated.reduce((s,m) => s+m.rating, 0) / rated.length).toFixed(1) : '—';
  document.getElementById('meta-total').textContent = real.length;
  document.getElementById('meta-wins').textContent = wins;
  document.getElementById('meta-losses').textContent = losses;
  document.getElementById('meta-rating').textContent = avg === '—' ? '—' : '★' + avg;
}

// ---- Start ----

// ---- Image Upload (Cloudinary) ----
async function uploadToCloudinary(file) {
  const cloud  = window.CLOUDINARY_CLOUD_NAME;
  const preset = window.CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || cloud === 'TU_CLOUD_NAME') throw new Error('Cloudinary no configurado en firebase-config.js');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', preset);
  fd.append('folder', 'wwe-superstar');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Error subiendo imagen a Cloudinary');
  const data = await res.json();
  return data.secure_url;
}

// ---- Export Calendar as Image (Native Canvas — no external libs) ----
function setupExport() {
  const btn = document.getElementById('btn-export');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Generando…';
    setTimeout(() => {
      try { drawExportCanvas(); }
      catch(e) { console.error('Export error:', e); alert('Error al generar imagen: ' + e.message); }
      finally { btn.disabled = false; btn.querySelector('span').textContent = 'Exportar imagen'; }
    }, 50);
  });
}

function drawExportCanvas() {
  const isLight = true; // always light mode
  const C = {
    bg:      '#f5f4f0', bg2: '#ffffff', bg3: '#eeede9',
    border:  'rgba(0,0,0,0.15)',
    text:    '#1a1a1e', textSec: '#5a5865', textTer: '#9a98a4',
    accent:  '#b8941a', win: '#2d7a4f', loss: '#c03030', draw: '#b06010', promo: '#5548c8',
  };

  const SCALE = 2, W = 900, PAD = 24;
  const WEEK_W = 58, CELL_W = Math.floor((W - PAD*2 - WEEK_W) / 7);
  const CELL_H = 76, HEADER_ROW = 34;
  const STAT_H = 108;
  const CAL_H  = HEADER_ROW + 4 * CELL_H;
  const LEG_H  = 34;
  const H = PAD + STAT_H + 16 + CAL_H + LEG_H + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  // Helper: rounded rect
  function rr(x,y,w,h,r,fill,stroke) {
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,r);
    if (fill)  { ctx.fillStyle=fill;   ctx.fill();   }
    if (stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke(); }
  }

  // Helper: text
  function txt(s,x,y,opts={}) {
    ctx.font=`${opts.w||'normal'} ${opts.sz||13}px "${opts.f||'Barlow'}",sans-serif`;
    ctx.fillStyle=opts.c||C.text; ctx.textAlign=opts.a||'left';
    ctx.textBaseline=opts.b||'alphabetic'; ctx.fillText(String(s),x,y);
  }

  // ── Stats panel ──
  const month  = document.getElementById('cal-month-title').textContent;
  const year   = document.getElementById('cal-year-title').textContent;
  const total  = document.getElementById('meta-total').textContent;
  const wins   = document.getElementById('meta-wins').textContent;
  const losses = document.getElementById('meta-losses').textContent;
  const rating = document.getElementById('meta-rating').textContent;

  txt('WWE 2K25 · SUPERSTAR MODE', PAD, PAD+14, {sz:11,w:'600',f:'Barlow Condensed',c:C.accent});
  txt(month.toUpperCase(), PAD, PAD+54, {sz:42,w:'800',f:'Barlow Condensed'});
  txt(year, PAD, PAD+72, {sz:13,c:C.textTer});

  const sW=100, sH=46, sG=8;
  const sX = W - PAD - sW*2 - sG, sY = PAD;
  [['LUCHAS',total,C.text],['VICTORIAS',wins,C.win],['DERROTAS',losses,C.loss],['RATING',rating,C.accent]]
    .forEach(([label,val,col],i) => {
      const x = sX + (i%2)*(sW+sG), y = sY + Math.floor(i/2)*(sH+sG);
      rr(x,y,sW,sH,6,C.bg2,C.border);
      txt(label, x+9, y+14, {sz:9,w:'600',f:'Barlow Condensed',c:C.textTer});
      txt(val,   x+9, y+38, {sz:22,w:'800',f:'Barlow Condensed',c:col});
    });

  // ── Calendar ──
  const cX=PAD, cY=PAD+STAT_H+16, cW=W-PAD*2;
  rr(cX, cY, cW, CAL_H, 8, C.bg2, C.border);

  // Day header row
  ctx.fillStyle=C.bg3; ctx.fillRect(cX,cY,cW,HEADER_ROW);
  ctx.strokeStyle=C.border; ctx.lineWidth=1;
  ctx.strokeRect(cX+0.5,cY+0.5,cW-1,HEADER_ROW-1);

  // Week-label corner
  ctx.fillStyle=C.bg3; ctx.fillRect(cX,cY,WEEK_W,HEADER_ROW);
  ctx.beginPath(); ctx.moveTo(cX+WEEK_W+0.5,cY); ctx.lineTo(cX+WEEK_W+0.5,cY+HEADER_ROW); ctx.stroke();

  ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach((d,i) => {
    const x = cX+WEEK_W+i*CELL_W;
    if (i>0){ ctx.beginPath(); ctx.moveTo(x+0.5,cY); ctx.lineTo(x+0.5,cY+HEADER_ROW); ctx.stroke(); }
    txt(d, x+CELL_W/2, cY+HEADER_ROW/2+5, {sz:10,w:'600',f:'Barlow Condensed',c:C.textTer,a:'center'});
  });

  // Bottom of header
  ctx.beginPath(); ctx.moveTo(cX,cY+HEADER_ROW+0.5); ctx.lineTo(cX+cW,cY+HEADER_ROW+0.5); ctx.stroke();

  const monthMatches = state.matches.filter(m => m.month===state.currentMonth && m.year===state.currentYear);
  const WEEKS_LABELS = ['Semana 1','Semana 2','Semana 3','Semana 4'];

  for (let week=0; week<4; week++) {
    const rY = cY + HEADER_ROW + week*CELL_H;
    // Week label
    ctx.fillStyle=C.bg3; ctx.fillRect(cX,rY,WEEK_W,CELL_H);
    ctx.save(); ctx.translate(cX+WEEK_W/2, rY+CELL_H/2); ctx.rotate(-Math.PI/2);
    txt(WEEKS_LABELS[week], 0, 0, {sz:8,w:'600',f:'Barlow Condensed',c:C.textTer,a:'center',b:'middle'});
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(cX+WEEK_W+0.5,rY); ctx.lineTo(cX+WEEK_W+0.5,rY+CELL_H); ctx.stroke();
    if (week<3){ ctx.beginPath(); ctx.moveTo(cX,rY+CELL_H+0.5); ctx.lineTo(cX+cW,rY+CELL_H+0.5); ctx.stroke(); }

    for (let dow=0; dow<7; dow++) {
      const day = week*7+dow+1;
      const cx  = cX+WEEK_W+dow*CELL_W;
      if (dow>0){ ctx.beginPath(); ctx.moveTo(cx+0.5,rY); ctx.lineTo(cx+0.5,rY+CELL_H); ctx.stroke(); }
      const dm = monthMatches.filter(m=>m.day===day);
      txt(String(day), cx+7, rY+18, {sz:14,w:'700',f:'Barlow Condensed',c:dm.length>0?C.text:C.textTer});
      dm.forEach((m,di) => {
        const rc = getResultClass(m);
        const col = {win:C.win,loss:C.loss,draw:C.draw,promo:C.promo}[rc]||C.textSec;
        ctx.beginPath(); ctx.arc(cx+8+di*11, rY+32, 4, 0, Math.PI*2); ctx.fillStyle=col; ctx.fill();
      });
      // Multi-line preview per match in cell
      let lineY = rY + 46;
      const maxLineY = rY + CELL_H - 3;
      dm.forEach(m => {
        if (lineY > maxLineY) return;
        function clipText(s, maxW) {
          let t = s;
          ctx.font = `400 8px "Barlow",sans-serif`;
          while (ctx.measureText(t).width > maxW && t.length > 2) t = t.slice(0,-1);
          return t.length < s.length ? t + '…' : t;
        }
        if (isPromo(m)) {
          ctx.font = `600 8px "Barlow Condensed",sans-serif`;
          ctx.fillStyle = C.promo; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
          ctx.fillText('PROMO', cx+7, lineY); lineY += 10;
        } else {
          if (m.vs?.length && lineY <= maxLineY) {
            ctx.font = `600 8px "Barlow",sans-serif`;
            ctx.fillStyle = C.text; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
            ctx.fillText(clipText('vs '+m.vs.join(' & '), CELL_W-10), cx+7, lineY);
            lineY += 10;
          }
          if (m.type?.length && lineY <= maxLineY) {
            ctx.font = `400 7.5px "Barlow",sans-serif`;
            ctx.fillStyle = C.textSec;
            ctx.fillText(clipText(m.type.join(', '), CELL_W-10), cx+7, lineY);
            lineY += 9;
          }
          if (m.brand && lineY <= maxLineY) {
            ctx.font = `400 7.5px "Barlow",sans-serif`;
            ctx.fillStyle = C.textTer;
            ctx.fillText(clipText(m.brand, CELL_W-10), cx+7, lineY);
            lineY += 9;
          }
        }
        lineY += 3; // gap between matches on same day
      });
    }
  }

  // ── Legend ──
  const lY = cY+CAL_H+10;
  [['Victoria',C.win],['Derrota',C.loss],['Empate',C.draw],['Promo',C.promo]].forEach(([label,col],i) => {
    const lX = PAD+i*90;
    ctx.beginPath(); ctx.arc(lX+5,lY+7,4,0,Math.PI*2); ctx.fillStyle=col; ctx.fill();
    txt(label, lX+14, lY+11, {sz:12,c:C.textSec});
  });

  // ── Download ──
  const link = document.createElement('a');
  const safe = month.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'-');
  link.download = `wwe-${safe}-${year.replace(/\s+/g,'-').toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}


// ---- Start ----
init();
