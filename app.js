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
  await loadCatalogs();
  await loadMatches();
  renderCalendar();
  renderHistory();
  renderStats();
  renderCatalogs();
  updateSidebarMeta();
  setupNavigation();
  setupCalendarNav();
  setupModal();
  setupDayDetailModal();
  setupCatalogEditors();
  setupConfirmModal();
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
  if (!snap.empty) {
    snap.docs.forEach(d => {
      if (state.catalogs[d.id] !== undefined) {
        state.catalogs[d.id] = d.data().items || state.catalogs[d.id];
      }
    });
  }
}

async function saveCatalog(key) {
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

  function render() {
    wrap.innerHTML = '';
    selectedItems.forEach(item => {
      const tag = document.createElement('span');
      tag.className = 'ms-tag';
      tag.innerHTML = `${item} <button onclick="removeTag(this, '${containerId}', '${item}')">×</button>`;
      wrap.appendChild(tag);
    });

    const inputWrap = document.createElement('div');
    inputWrap.className = 'ms-input-wrap';
    const input = document.createElement('input');
    input.className = 'ms-input';
    input.placeholder = selectedItems.length === 0 ? 'Seleccionar…' : '';
    const dropdown = document.createElement('div');
    dropdown.className = 'ms-dropdown';

    function showDropdown(filter = '') {
      dropdown.innerHTML = '';
      const filtered = options.filter(o => o.toLowerCase().includes(filter.toLowerCase()) && !selectedItems.includes(o));
      filtered.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'ms-option';
        div.textContent = opt;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          selectedItems.push(opt);
          render();
        });
        dropdown.appendChild(div);
      });
      dropdown.classList.toggle('open', filtered.length > 0);
    }

    input.addEventListener('input', e => showDropdown(e.target.value));
    input.addEventListener('focus', () => showDropdown(input.value));
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('open'), 150));

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
    state.catalogs[key].forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'cat-item';
      div.innerHTML = `<span>${item}</span><button onclick="removeCatalogItem('${key}', ${idx})">×</button>`;
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
init();
