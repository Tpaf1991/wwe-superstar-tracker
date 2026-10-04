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
    divisions: ['WWE Championship','Universal Championship','Intercontinental','United States','Tag Team','Women\'s','Women\'s Tag Team'],
    winners: [],
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
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; if (state.currentYear < 1) state.currentYear = 1; }
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    renderCalendar();
  });
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
        const dotsDiv = document.createElement('div');
        dotsDiv.className = 'cal-dots';
        dayMatches.forEach(m => {
          const dot = document.createElement('div');
          dot.className = 'cal-dot ' + getResultClass(m);
          dotsDiv.appendChild(dot);
        });
        cell.appendChild(dotsDiv);

        // Preview lines for each match
        dayMatches.forEach(m => {
          const lines = [];
          if (isPromo(m)) {
            lines.push('PROMO');
          } else {
            if (m.vs?.length)   lines.push('vs ' + m.vs.join(' & '));
            if (m.type?.length) lines.push(m.type.join(', '));
            if (m.brand)        lines.push(m.brand);
          }
          if (lines.length > 0) {
            const preview = document.createElement('div');
            preview.className = 'cal-match-preview';
            preview.textContent = lines.join(' · ');
            cell.appendChild(preview);
          }
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
        <div class="mini-match-sub">${m.type?.join(', ') || ''} ${m.brand ? '· ' + m.brand : ''}</div>
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

  // Populate selects
  populateSelect('f-brand', state.catalogs.brands, match?.brand);
  populateSelect('f-division', ['', ...state.catalogs.divisions], match?.division);
  populateSelect('f-rivalry', ['', ...state.catalogs.wrestlers], match?.rivalry);
  populateSelect('f-rivalry-action', ['', ...state.catalogs.rivalactions], match?.rivalryAction);

  // Multi-selects
  initMultiSelect('ms-type', state.catalogs.types, match?.type || []);
  initMultiSelect('ms-vs', state.catalogs.wrestlers, match?.vs || []);
  initMultiSelect('ms-titles', state.catalogs.titles, match?.titles || []);
  initMultiSelect('ms-winners', state.catalogs.winners.length > 0 ? state.catalogs.winners : state.catalogs.wrestlers, match?.winners || []);

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

  const types = getMultiSelected('ms-type');
  const vs = getMultiSelected('ms-vs');
  const titles = getMultiSelected('ms-titles');
  const winners = getMultiSelected('ms-winners');

  // Auto-add winners to winners catalog
  winners.forEach(w => {
    if (!state.catalogs.winners.includes(w)) {
      state.catalogs.winners.push(w);
    }
  });
  await saveCatalog('winners');

  const data = {
    day, month, year,
    sortKey: makeSortKey(year, month, day),
    type: types,
    vs,
    titles,
    winners,
    brand: document.getElementById('f-brand').value,
    division: document.getElementById('f-division').value,
    rivalry: document.getElementById('f-rivalry').value,
    rivalryAction: document.getElementById('f-rivalry-action').value,
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
function initMultiSelect(containerId, options, selected) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  let selectedItems = [...selected];
  // options reference is kept live so catalog updates are reflected
  let liveOptions = options;

  function addItem(val) {
    val = val.trim();
    if (!val || selectedItems.includes(val)) return;
    selectedItems.push(val);
    // Auto-add to the source array if not already there (inline add)
    if (!liveOptions.includes(val)) liveOptions.push(val);
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
function populateSelect(id, options, selected) {
  const sel = document.getElementById(id);
  sel.innerHTML = '';
  const hasEmpty = options[0] === '';
  (hasEmpty ? options : ['', ...options]).forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt || '— ninguna —';
    if (opt === selected) o.selected = true;
    sel.appendChild(o);
  });
}

// ---- History ----
function renderHistory() {
  const list = document.getElementById('history-list');
  const brandFilter = document.getElementById('filter-brand').value;
  const typeFilter = document.getElementById('filter-type').value;
  const resultFilter = document.getElementById('filter-result').value;

  // Populate filters
  const brands = ['', ...new Set(state.matches.map(m => m.brand).filter(Boolean))];
  const curBrand = document.getElementById('filter-brand').value;
  document.getElementById('filter-brand').innerHTML = brands.map(b => `<option value="${b}" ${b === curBrand ? 'selected':''}>` + (b || 'Todas las marcas') + '</option>').join('');

  const types = ['', ...state.catalogs.types];
  const curType = document.getElementById('filter-type').value;
  document.getElementById('filter-type').innerHTML = types.map(t => `<option value="${t}" ${t === curType ? 'selected':''}>` + (t || 'Todos los tipos') + '</option>').join('');

  const realMatches = state.matches.filter(m => !isPromo(m));
  let filtered = [...state.matches].reverse();

  if (brandFilter) filtered = filtered.filter(m => m.brand === brandFilter);
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
          ${m.rivalry ? `<span class="match-tag" style="color:var(--promo);">Rivalidad: ${m.rivalry}</span>` : ''}
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
    if (m.brand) {
      byBrand[m.brand] = (byBrand[m.brand] || 0) + 1;
    }
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
    if (m.rivalry) {
      if (!rivals[m.rivalry]) rivals[m.rivalry] = { total: 0, wins: 0, losses: 0, draws: 0 };
      rivals[m.rivalry].total++;
      const rc = getResultClass(m);
      if (rc === 'win') rivals[m.rivalry].wins++;
      else if (rc === 'loss') rivals[m.rivalry].losses++;
      else rivals[m.rivalry].draws++;
    }
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
    { id: 'cat-wrestlers', key: 'wrestlers' },
    { id: 'cat-types', key: 'types' },
    { id: 'cat-brands', key: 'brands' },
    { id: 'cat-titles', key: 'titles' },
    { id: 'cat-divisions', key: 'divisions' },
    { id: 'cat-winners', key: 'winners' },
    { id: 'cat-rivalactions', key: 'rivalactions' }
  ];
  cats.forEach(({ id, key }) => {
    const card = document.getElementById(id);
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
    { id: 'cat-wrestlers', key: 'wrestlers' },
    { id: 'cat-types', key: 'types' },
    { id: 'cat-brands', key: 'brands' },
    { id: 'cat-titles', key: 'titles' },
    { id: 'cat-divisions', key: 'divisions' },
    { id: 'cat-winners', key: 'winners' },
    { id: 'cat-rivalactions', key: 'rivalactions' }
  ];
  cats.forEach(({ id, key }) => {
    const card = document.getElementById(id);
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
      // Show preview lines for each match in the cell
      let lineY = rY + 47;
      const maxLineY = rY + CELL_H - 4;
      ctx.font = `400 8.5px "Barlow",sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      dm.forEach(m => {
        if (lineY > maxLineY) return;
        const parts = [];
        if (isPromo(m)) {
          parts.push('PROMO');
        } else {
          if (m.vs?.length)   parts.push('vs ' + m.vs.join(' & '));
          if (m.type?.length) parts.push(m.type.join(', '));
          if (m.brand)        parts.push(m.brand);
        }
        let line = parts.join(' · ');
        while (ctx.measureText(line).width > CELL_W - 10 && line.length > 3) line = line.slice(0,-1);
        if (line.length < parts.join(' · ').length) line += '…';
        ctx.fillStyle = C.textSec;
        ctx.fillText(line, cx+7, lineY);
        lineY += 12;
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
