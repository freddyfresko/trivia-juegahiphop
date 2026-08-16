/* app.js — panel de revisión de la Trivia (Motor v2, Fase 5).
   Vista DATASET: todas las preguntas vivas, filtros por área/estado/búsqueda/
   largos dispares, edición directa y botón "aplicar al dataset".
   Vista LOTES: preguntas nuevas del redactor (flujo de integración).
   El estado de revisión del dataset se acumula entre páginas (state.d.rev)
   y se persiste en lotes/revision-dataset.json con autosave. */
'use strict';
import { validar as validarReglas } from './validador.js';

const $ = sel => document.querySelector(sel);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

const state = {
  vista: 'dataset',
  // dataset
  d: { total: 0, totalF: 0, page: 1, pageSize: 50, areas: [], items: [], rev: {}, actualizado: null, dirty: false },
  // lotes
  lotes: [], n: null, items: [], revL: {}, actualizadoL: null, dirtyL: false, filtroL: 'todas',
};

// ─── API ──────────────────────────────────────────────────────────────────
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.json();
}

function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

// ─── filas de revisión ────────────────────────────────────────────────────
function revD(id) {
  if (!state.d.rev[id]) {
    const p = state.d.items.find(x => x.id === id);
    state.d.rev[id] = { id, estado: null, editada: false, pregunta: null, opciones: null, indice_correcta: null, explicacion: null, nota: '' };
  }
  return state.d.rev[id];
}
function revL(idx) {
  if (!state.revL[idx]) {
    const p = state.items.find(x => x.idx === idx);
    state.revL[idx] = { idx, entrada_id: p?.entrada_id || '', estado: null, editada: false, pregunta: null, opciones: null, indice_correcta: null, explicacion: null, nota: '' };
  }
  return state.revL[idx];
}
function textos(p, rev) {
  const r = rev(p);
  return {
    pregunta: r?.pregunta ?? p.pregunta,
    opciones: r?.opciones ?? [...(p.opciones || [])],
    indice_correcta: r?.indice_correcta ?? p.indice_correcta,
    explicacion: r?.explicacion ?? p.explicacion,
  };
}

// ─── INIT ─────────────────────────────────────────────────────────────────
async function init() {
  try {
    const data = await api('/api/lotes');
    state.lotes = data.lotes;
    $('#stat-preguntas').textContent = data.dataset.total;
    $('#stat-enc').textContent = data.enciclopedia;
    $('#stat-version').textContent = data.dataset.version;
    $('#tab-lotes-n').textContent = state.lotes.length;
    renderLotes();
    cargarDataset();
  } catch (e) { console.error(e); }
}

// ══════════════════════════ VISTA DATASET ══════════════════════════

function filtrosDS() {
  return {
    area: $('#f-area').value,
    estado: $('#f-estado').value,
    q: $('#f-q').value.trim(),
    sospechosas: $('#f-sospechosas').value,
  };
}

async function cargarDataset() {
  const f = filtrosDS();
  const qs = new URLSearchParams({ area: f.area, estado: f.estado, q: f.q, sospechosas: f.sospechosas, page: state.d.page, ps: state.d.pageSize });
  const data = await api('/api/dataset?' + qs);
  state.d.total = data.total;
  state.d.totalF = data.total_filtrado;
  state.d.items = data.preguntas;
  state.d.actualizado = data.revision?.actualizado ?? null;
  if (data.revision) for (const r of data.revision.preguntas) state.d.rev[r.id] = r;
  // poblar select de áreas (una vez)
  const sel = $('#f-area');
  if (sel.options.length <= 1) {
    for (const a of data.areas) {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      sel.appendChild(o);
    }
  }
  $('#tab-dataset-n').textContent = data.total;
  renderDataset();
}

function renderDataset() {
  const grid = $('#cards-ds');
  grid.innerHTML = '';
  for (const p of state.d.items) grid.appendChild(renderCard(p, ctxD));
  // progreso
  let ap = 0, re = 0, ed = 0;
  for (const r of Object.values(state.d.rev)) {
    if (r.estado === 'aprobada') ap++;
    if (r.estado === 'rechazada') re++;
    if (r.editada) ed++;
  }
  $('#prog-ds').textContent = `Revisadas: ${ap}✓ aprobadas · ${re}✗ rechazadas · ${ed}✎ editadas · ${Object.keys(state.d.rev).length} decididas de ${state.d.total}`;
  // paginación
  const pag = $('#paginacion');
  pag.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(state.d.totalF / state.d.pageSize));
  const bPrev = el('button', 'btn ghost', '‹');
  bPrev.disabled = state.d.page <= 1;
  bPrev.onclick = () => { state.d.page--; cargarDataset(); };
  const bNext = el('button', 'btn ghost', '›');
  bNext.disabled = state.d.page >= totalPages;
  bNext.onclick = () => { state.d.page++; cargarDataset(); };
  const info = el('span', null, `página ${state.d.page} de ${totalPages} · ${state.d.totalF} resultados (${state.d.total} total)`);
  pag.append(bPrev, info, bNext);
}

// ctx para las tarjetas del dataset
const ctxD = {
  getRev: p => revD(p.id),
  textos: p => textos(p, revD),
  chip: p => { const r = revD(p.id); return r?.estado || (r?.editada ? 'editada' : null); },
  save: scheduleSaveD,
};

// ─── autosave dataset ─────────────────────────────────────────────────────
let saveTimerD = null;
function scheduleSaveD() {
  state.d.dirty = true;
  setSaveD('guardando…', '');
  clearTimeout(saveTimerD);
  saveTimerD = setTimeout(guardarDataset, 800);
}
function setSaveD(txt, cls) {
  const s = $('#save-ds');
  s.textContent = txt;
  s.className = 'save-state' + (cls ? ' ' + cls : '');
}
async function guardarDataset() {
  if (!state.d.dirty) return;
  // serializa TODAS las filas decididas (acumuladas entre páginas)
  const filas = Object.values(state.d.rev).map(r => ({
    id: r.id, estado: r.estado ?? null, editada: r.editada ?? false,
    pregunta: r.pregunta ?? null, opciones: r.opciones ?? null,
    indice_correcta: r.indice_correcta ?? null, explicacion: r.explicacion ?? null, nota: r.nota ?? '',
  }));
  try {
    const res = await api('/api/dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_actualizado: state.d.actualizado ?? null, preguntas: filas }),
    });
    state.d.actualizado = res.actualizado;
    state.d.dirty = false;
    setSaveD('✓ guardado ' + new Date(res.actualizado).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 'ok');
    renderDataset();
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('cambió en otro lado')) {
      setSaveD('⚠ la revisión cambió en otro lado — recargando…', 'err');
      setTimeout(() => { state.d.page = 1; cargarDataset(); }, 1200);
    } else { setSaveD('✗ error al guardar', 'err'); }
    console.error(e);
  }
}

// ─── acciones dataset ─────────────────────────────────────────────────────
function bindDatasetActions() {
  $('#f-area').onchange = () => { state.d.page = 1; cargarDataset(); };
  $('#f-estado').onchange = () => { state.d.page = 1; cargarDataset(); };
  $('#f-sospechosas').onchange = () => { state.d.page = 1; cargarDataset(); };
  let qTimer = null;
  $('#f-q').oninput = () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.d.page = 1; cargarDataset(); }, 500);
  };
  $('#btn-reset-ds').onclick = async () => {
    if (!confirm('¿Borrar TODAS las decisiones de revisión del dataset?')) return;
    await api('/api/dataset/reset', { method: 'POST' });
    state.d.rev = {};
    state.d.actualizado = null;
    cargarDataset();
    setSaveD('', '');
  };
  $('#btn-aplicar-ds').onclick = async () => {
    const decididas = Object.values(state.d.rev).filter(r => r.estado || r.editada).length;
    if (!decididas) { alert('No hay decisiones que aplicar.'); return; }
    if (!confirm(`¿Aplicar al dataset? Se retiran las rechazadas y se corrigen ${Object.values(state.d.rev).filter(r => r.editada && r.estado !== 'rechazada').length} editadas. Backup automático.`)) return;
    const btn = $('#btn-aplicar-ds');
    btn.textContent = 'aplicando…';
    btn.disabled = true;
    try {
      const res = await api('/api/dataset/aplicar', { method: 'POST' });
      const pre = $('#reporte-ds-pre');
      pre.textContent = res.reporte || '(sin salida)';
      $('#reporte-ds').hidden = false;
      // recargar todo (el dataset cambió y la revisión se limpió)
      state.d.rev = {}; state.d.actualizado = null;
      const meta = await api('/api/lotes');
      state.lotes = meta.lotes;
      $('#stat-preguntas').textContent = meta.dataset.total;
      $('#stat-version').textContent = meta.dataset.version;
      renderLotes();
      state.d.page = 1;
      await cargarDataset();
    } catch (e) { alert('Error al aplicar: ' + e.message); }
    btn.textContent = '▶ aplicar al dataset';
    btn.disabled = false;
  };
}

// ══════════════════════════ VISTA LOTES ══════════════════════════

function renderLotes() {
  const c = $('#lotes-chips');
  c.innerHTML = '';
  for (const l of state.lotes) {
    const b = el('button', 'chip' + (l.n === state.n ? ' active' : '') + (l.estado === 'integrado' ? ' done' : ''));
    b.appendChild(el('span', 'dot ' + l.estado));
    b.append(`Lote ${String(l.n).padStart(3, '0')} `);
    b.appendChild(el('small', null, `· ${l.total} preg`));
    if (l.aprobadas) { const x = el('small', null, `· ${l.aprobadas}✓`); x.style.color = 'var(--ok)'; b.appendChild(x); }
    if (l.rechazadas) { const x = el('small', null, ` ${l.rechazadas}✗`); x.style.color = 'var(--bad)'; b.appendChild(x); }
    b.title = `Área: ${l.area}\nGenerado: ${l.generado}\nEstado: ${l.estado}`;
    b.onclick = () => { if (l.n !== state.n) cargarLote(l.n); };
    c.appendChild(b);
  }
}

async function cargarLote(n) {
  state.n = n;
  state.revL = {};
  state.dirtyL = false;
  renderLotes();
  const data = await api('/api/lote/' + n);
  state.items = data.preguntas;
  state.actualizadoL = data.revision?.actualizado ?? null;
  for (const r of (data.revision?.preguntas || [])) state.revL[r.idx] = r;
  $('#lote-head').hidden = false;
  $('#filtros').hidden = false;
  $('#integracion').hidden = false;
  $('#lote-titulo').textContent = `Lote ${String(n).padStart(3, '0')} — ${data.lote.area || 'mixta'}`;
  $('#lote-meta').textContent = `generado ${data.lote.generado} · ${state.items.length} preguntas`;
  $('#cmd-integrar').textContent = `python scripts/integrar-lote.py ${n}`;
  renderLotesVista();
}

function renderLotesVista() {
  const grid = $('#cards');
  grid.innerHTML = '';
  for (const p of state.items) if (filtrarL(p)) grid.appendChild(renderCard(p, ctxL));
  let ap = 0, re = 0, ed = 0;
  for (const p of state.items) {
    const r = state.revL[p.idx];
    if (r?.estado === 'aprobada') ap++;
    if (r?.estado === 'rechazada') re++;
    if (r?.editada) ed++;
  }
  const tot = state.items.length;
  $('#prog-fill').style.width = (tot ? (ap / tot) * 100 : 0) + '%';
  $('#prog-nums').textContent = `${ap}✓ aprobadas · ${re}✗ rechazadas · ${ed}✎ editadas · ${tot - ap - re} pendientes`;
}

function filtrarL(p) {
  const est = state.revL[p.idx]?.estado || null;
  const errs = [...(p.errores_js || []), ...(p.validacion || [])];
  switch (state.filtroL) {
    case 'pendientes': return est === null;
    case 'aprobadas': return est === 'aprobada';
    case 'rechazadas': return est === 'rechazada';
    case 'errores': return errs.length > 0;
    default: return true;
  }
}

const ctxL = {
  getRev: p => revL(p.idx),
  textos: p => textos(p, revL),
  chip: p => { const r = revL(p.idx); return r?.estado || (r?.editada ? 'editada' : null); },
  save: scheduleSaveL,
};

let saveTimerL = null;
function scheduleSaveL() {
  state.dirtyL = true;
  setSaveL('guardando…', '');
  clearTimeout(saveTimerL);
  saveTimerL = setTimeout(guardarLote, 800);
}
function setSaveL(txt, cls) {
  const s = $('#save-state');
  s.textContent = txt;
  s.className = 'save-state' + (cls ? ' ' + cls : '');
}
async function guardarLote() {
  if (!state.dirtyL || !state.n) return;
  const filas = state.items.map(p => {
    const r = state.revL[p.idx] || {};
    return {
      idx: p.idx, entrada_id: p.entrada_id, estado: r.estado ?? null,
      editada: r.editada ?? false, pregunta: r.pregunta ?? null,
      opciones: r.opciones ?? null, indice_correcta: r.indice_correcta ?? null,
      explicacion: r.explicacion ?? null, nota: r.nota ?? '',
    };
  });
  try {
    const res = await api('/api/lote/' + state.n, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_actualizado: state.actualizadoL ?? null, preguntas: filas }),
    });
    state.actualizadoL = res.actualizado;
    state.dirtyL = false;
    setSaveL('✓ guardado ' + new Date(res.actualizado).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 'ok');
    renderLotesVista();
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('cambió en otro lado')) {
      setSaveL('⚠ el lote cambió en otro lado — recargando…', 'err');
      setTimeout(() => cargarLote(state.n), 1200);
    } else { setSaveL('✗ error al guardar', 'err'); }
    console.error(e);
  }
}

function bindLotesActions() {
  $('#btn-reset').onclick = async () => {
    if (!state.n || !confirm('¿Borrar la revisión guardada del lote y volver todo a pendiente?')) return;
    await api('/api/lote/' + state.n + '/reset', { method: 'POST' });
    state.revL = {};
    renderLotesVista();
    setSaveL('', '');
  };
  $('#btn-integrar').onclick = () => {
    const cmd = $('#cmd-integrar').textContent;
    navigator.clipboard?.writeText(cmd);
    $('#btn-integrar').textContent = '✓ copiado';
    setTimeout(() => { $('#btn-integrar').textContent = '▶ integrar'; }, 1200);
    document.querySelector('.integracion').scrollIntoView({ behavior: 'smooth' });
  };
  document.querySelectorAll('#filtros .filtro').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#filtros .filtro').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.filtroL = b.dataset.f;
      renderLotesVista();
    };
  });
}

// ══════════════════════════ TARJETA (compartida) ══════════════════════════

function renderCard(p, ctx) {
  const chipEst = ctx.chip(p);
  const card = el('article', 'card ' + (chipEst || 'pendiente'));

  const head = el('div', 'card-head');
  const num = state.vista === 'dataset' ? p.id : String(p.idx + 1).padStart(2, '0');
  head.appendChild(el('span', 'card-num', num + (state.vista === 'dataset' ? ' · ' + (p.entrada_id || '') : ' · ' + p.entrada_id)));
  const badges = el('div', 'badges');
  badges.appendChild(el('span', 'badge tipo', p.termino || '?'));
  badges.appendChild(el('span', 'badge', p.tipo));
  badges.appendChild(el('span', 'badge', `área ${p.area || '?'}`));
  if (p.dificultad !== undefined) badges.appendChild(el('span', 'badge', `d${p.dificultad}`));
  if (p.juez) badges.appendChild(el('span', 'badge juez', `juez ${p.juez.global ?? '?'}/5`));
  if (p.senales_plantilla?.length) badges.appendChild(el('span', 'badge plantilla', `⚠ plantilla: ${p.senales_plantilla.join(', ')}`));
  if (p.semantica?.accion === 'eliminar') badges.appendChild(el('span', 'badge sem-eliminar', `matriz ✗: ${p.semantica.razon || ''}`));
  if (p.semantica?.accion === 'dudosa') badges.appendChild(el('span', 'badge sem-dudosa', `dudosa: ${p.semantica.razon || ''}`));
  if ((p.validacion || []).length) badges.appendChild(el('span', 'badge err', `⚠ ${p.validacion.length} reglas`));
  head.appendChild(badges);
  const chip = el('span', 'estado-chip ' + (chipEst || 'pendiente'), chipTexto(chipEst));
  head.appendChild(chip);
  card.appendChild(head);

  const body = el('div');
  body.appendChild(campoPregunta(p, ctx, card));
  for (let i = 0; i < 4; i++) body.appendChild(campoOpcion(p, i, ctx, card));
  body.appendChild(campoExplicacion(p, ctx, card));

  const errsBox = el('div', 'errs');
  card._errsBox = errsBox;
  body.appendChild(errsBox);
  actualizarErrores(p, ctx, card);

  // fuente
  const det = el('details', 'fuente');
  det.appendChild(el('summary', null, '📖 fuente (enciclopedia)'));
  const db = el('div', 'fuente-body');
  if (p.fuente_enc?.base) {
    const b = el('p', 'base', p.fuente_enc.base.slice(0, 300) + (p.fuente_enc.base.length > 300 ? '…' : ''));
    db.appendChild(b);
  }
  const ul = el('ul');
  for (const f of (p.fuente || [])) ul.appendChild(el('li', null, f));
  db.appendChild(ul);
  det.appendChild(db);
  body.appendChild(det);
  card.appendChild(body);

  // foot
  const foot = el('div', 'card-foot');
  const nota = el('div', 'nota');
  const notaIn = document.createElement('input');
  notaIn.placeholder = 'nota (para el redactor, ej. «muy fácil»)';
  notaIn.value = ctx.getRev(p).nota || '';
  notaIn.oninput = () => { ctx.getRev(p).nota = notaIn.value; ctx.save(); };
  nota.appendChild(notaIn);
  foot.appendChild(nota);

  const acc = el('div', 'acciones');
  const bNull = el('button', 'mini null', '—');
  bNull.title = 'volver a pendiente';
  bNull.onclick = () => {
    ctx.getRev(p).estado = null;
    const est = ctx.chip(p);
    card.className = 'card pendiente';
    chip.textContent = chipTexto(est);
    chip.className = 'estado-chip ' + (est || 'pendiente');
    ctx.save();
  };
  const bOk = el('button', 'mini ok', '✓ aprobar');
  bOk.onclick = () => {
    ctx.getRev(p).estado = 'aprobada';
    card.className = 'card aprobada';
    chip.textContent = '✓ aprobada';
    chip.className = 'estado-chip aprobada';
    ctx.save();
  };
  const bBad = el('button', 'mini bad', '✗ rechazar');
  bBad.onclick = () => {
    ctx.getRev(p).estado = 'rechazada';
    card.className = 'card rechazada';
    chip.textContent = '✗ rechazada';
    chip.className = 'estado-chip rechazada';
    ctx.save();
  };
  acc.append(bNull, bOk, bBad);
  foot.appendChild(acc);
  card.appendChild(foot);
  return card;
}

function chipTexto(est) {
  return est === 'aprobada' ? '✓ aprobada'
    : est === 'rechazada' ? '✗ rechazada'
    : est === 'editada' ? '✎ editada'
    : 'pendiente';
}

function campoPregunta(p, ctx, card) {
  const c = el('div', 'campo');
  c.appendChild(el('label', null, 'pregunta'));
  const ta = document.createElement('textarea');
  ta.className = 'pregunta';
  ta.rows = 2;
  ta.value = ctx.textos(p).pregunta;
  ta.oninput = () => {
    const r = ctx.getRev(p);
    r.pregunta = ta.value; r.editada = true;
    actualizarErrores(p, ctx, card);
    ctx.save();
  };
  c.appendChild(ta);
  return c;
}

function campoOpcion(p, i, ctx, card) {
  const c = el('div', 'opcion' + (i === ctx.textos(p).indice_correcta ? ' correcta' : ''));
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'opc-' + (state.vista === 'dataset' ? p.id : p.idx);
  radio.checked = i === ctx.textos(p).indice_correcta;
  radio.title = 'marcar como correcta';
  radio.onchange = () => {
    const r = ctx.getRev(p);
    r.indice_correcta = i; r.editada = true;
    card.querySelectorAll('.opcion').forEach((o, j) => o.classList.toggle('correcta', j === i));
    ctx.save();
  };
  c.appendChild(radio);
  c.appendChild(el('span', 'letra', 'ABCD'[i]));
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.value = ctx.textos(p).opciones[i];
  ta.oninput = () => {
    const r = ctx.getRev(p);
    const opcs = [...ctx.textos(p).opciones];
    opcs[i] = ta.value;
    r.opciones = opcs; r.editada = true;
    actualizarErrores(p, ctx, card);
    ctx.save();
  };
  c.appendChild(ta);
  return c;
}

function campoExplicacion(p, ctx, card) {
  const c = el('div', 'campo explicacion');
  c.appendChild(el('label', null, 'explicación (enseña)'));
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.value = ctx.textos(p).explicacion;
  ta.oninput = () => {
    const r = ctx.getRev(p);
    r.explicacion = ta.value; r.editada = true;
    actualizarErrores(p, ctx, card);
    ctx.save();
  };
  c.appendChild(ta);
  return c;
}

function actualizarErrores(p, ctx, card) {
  const errs = validarReglas(ctx.textos(p), { termino: p.termino, base: p.fuente_enc?.base });
  const todos = [...new Set([...errs, ...(p.validacion || [])])];
  card._errsBox.innerHTML = '';
  for (const e of todos) card._errsBox.appendChild(el('span', 'err-tag', e));
}

// ══════════════════════════ TABS ══════════════════════════
function bindTabs() {
  $('#tab-dataset').onclick = () => { setVista('dataset'); };
  $('#tab-lotes').onclick = () => { setVista('lotes'); };
}
function setVista(v) {
  state.vista = v;
  $('#tab-dataset').classList.toggle('active', v === 'dataset');
  $('#tab-lotes').classList.toggle('active', v === 'lotes');
  $('#vista-dataset').hidden = v !== 'dataset';
  $('#vista-lotes').hidden = v !== 'lotes';
  if (v === 'dataset') {
    state.d.page = 1;
    cargarDataset();
  } else if (state.n === null && state.lotes.length) {
    const activo = state.lotes.find(l => l.pendientes > 0)
      || state.lotes.find(l => l.estado === 'revision')
      || state.lotes.find(l => l.estado !== 'integrado')
      || state.lotes[state.lotes.length - 1];
    cargarLote(activo.n);
  }
}

bindTabs();
bindDatasetActions();
bindLotesActions();
init();
