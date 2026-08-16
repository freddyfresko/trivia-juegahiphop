/* app.js — panel de revisión de lotes de la Trivia (Motor v2, Fase 5).
   Ver + corregir las preguntas que genera el redactor: aprobar/rechazar,
   editar pregunta/opciones/correcta/explicación, autosave vía API local.
   Fuente de verdad del estado: state.revision[idx] (sincronizada con las
   tarjetas al editar; el POST persiste el array completo). */
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
  lotes: [], lote: null, n: null, items: [], filtro: 'todas',
  revision: {}, // idx → {idx, entrada_id, estado, editada, pregunta, opciones, indice_correcta, explicacion, nota}
  dirty: false,
};

// ─── API ──────────────────────────────────────────────────────────────────
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.json();
}

// revisión mutable por índice (crea la fila si no existe)
function rev(idx) {
  if (!state.revision[idx]) {
    const p = state.items.find(x => x.idx === idx);
    state.revision[idx] = {
      idx, entrada_id: p?.entrada_id || '', estado: null, editada: false,
      pregunta: null, opciones: null, indice_correcta: null, explicacion: null, nota: '',
    };
  }
  return state.revision[idx];
}

// textos efectivos de una pregunta (revisión si editó, si no el original)
function textos(p) {
  const r = state.revision[p.idx];
  return {
    pregunta: r?.pregunta ?? p.pregunta,
    opciones: r?.opciones ?? [...p.opciones],
    indice_correcta: r?.indice_correcta ?? p.indice_correcta,
    explicacion: r?.explicacion ?? p.explicacion,
  };
}

// ─── carga inicial ────────────────────────────────────────────────────────
async function init() {
  try {
    const data = await api('/api/lotes');
    state.lotes = data.lotes;
    $('#stat-preguntas').textContent = data.dataset.total;
    $('#stat-enc').textContent = data.enciclopedia;
    $('#stat-version').textContent = data.dataset.version;
    renderLotes();
    // lote activo: primero con pendientes en su revisión > revisión a medias
    // > último no integrado > último
    const activo = state.lotes.find(l => l.pendientes > 0)
      || state.lotes.find(l => l.estado === 'revision')
      || state.lotes.find(l => l.estado !== 'integrado')
      || state.lotes[state.lotes.length - 1];
    if (activo) cargarLote(activo.n);
  } catch (e) { console.error(e); }
}

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

// ─── carga de lote ────────────────────────────────────────────────────────
async function cargarLote(n) {
  state.n = n;
  state.revision = {};
  state.dirty = false;
  renderLotes();
  const data = await api('/api/lote/' + n);
  state.lote = data.lote;
  state.items = data.preguntas;
  state.actualizado = data.revision?.actualizado ?? null;
  for (const r of (data.revision?.preguntas || [])) state.revision[r.idx] = r;
  $('#lote-head').hidden = false;
  $('#filtros').hidden = false;
  $('#integracion').hidden = false;
  $('#lote-titulo').textContent = `Lote ${String(n).padStart(3, '0')} — ${data.lote.area || 'mixta'}`;
  $('#lote-meta').textContent = `generado ${data.lote.generado} · ${state.items.length} preguntas`;
  $('#cmd-integrar').textContent = `python scripts/integrar-lote.py ${n}`;
  render();
}

// ─── render ───────────────────────────────────────────────────────────────
function render() {
  const grid = $('#cards');
  grid.innerHTML = '';
  for (const p of state.items) if (filtrar(p)) grid.appendChild(renderCard(p));
  renderProgreso();
}

function filtrar(p) {
  const est = state.revision[p.idx]?.estado || null;
  const errs = [...(p.errores_js || []), ...(p.validacion || [])];
  switch (state.filtro) {
    case 'pendientes': return est === null;
    case 'aprobadas': return est === 'aprobada';
    case 'rechazadas': return est === 'rechazada';
    case 'errores': return errs.length > 0;
    default: return true;
  }
}

function renderProgreso() {
  let ap = 0, re = 0, ed = 0;
  for (const p of state.items) {
    const r = state.revision[p.idx];
    if (r?.estado === 'aprobada') ap++;
    if (r?.estado === 'rechazada') re++;
    if (r?.editada) ed++;
  }
  const tot = state.items.length;
  $('#prog-fill').style.width = (tot ? (ap / tot) * 100 : 0) + '%';
  $('#prog-nums').textContent = `${ap}✓ aprobadas · ${re}✗ rechazadas · ${ed}✎ editadas · ${tot - ap - re} pendientes`;
}

function renderCard(p) {
  const cur = textos(p);
  const r0 = state.revision[p.idx];
  const chipEst = r0?.estado || (r0?.editada ? 'editada' : null);
  const card = el('article', 'card ' + (chipEst || 'pendiente'));

  // head
  const head = el('div', 'card-head');
  head.appendChild(el('span', 'card-num', `${String(p.idx + 1).padStart(2, '0')} · ${p.entrada_id}`));
  const badges = el('div', 'badges');
  badges.appendChild(el('span', 'badge tipo', p.termino));
  badges.appendChild(el('span', 'badge', p.tipo));
  badges.appendChild(el('span', 'badge', `área ${p.area || '?'}`));
  badges.appendChild(el('span', 'badge', `d${p.dificultad ?? 2}`));
  if (p.juez) badges.appendChild(el('span', 'badge juez', `juez ${p.juez.global ?? '?'}/5`));
  if (p.semantica?.accion === 'eliminar') badges.appendChild(el('span', 'badge sem-eliminar', `matriz ✗: ${p.semantica.razon || ''}`));
  if (p.semantica?.accion === 'dudosa') badges.appendChild(el('span', 'badge sem-dudosa', `dudosa: ${p.semantica.razon || ''}`));
  if ((p.validacion || []).length) badges.appendChild(el('span', 'badge err', `⚠ ${p.validacion.length} reglas`));
  head.appendChild(badges);
  const chip = el('span', 'estado-chip ' + (chipEst || 'pendiente'), chipTexto(chipEst));
  head.appendChild(chip);
  card.appendChild(head);

  // campos
  const body = el('div');
  body.appendChild(campoPregunta(p, card));
  for (let i = 0; i < 4; i++) body.appendChild(campoOpcion(p, i, card));
  body.appendChild(campoExplicacion(p, card));

  // errores en vivo
  const errsBox = el('div', 'errs');
  card._errsBox = errsBox;
  body.appendChild(errsBox);
  actualizarErrores(p, card);

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
  notaIn.value = state.revision[p.idx]?.nota || '';
  notaIn.oninput = () => { rev(p.idx).nota = notaIn.value; scheduleSave(); };
  nota.appendChild(notaIn);
  foot.appendChild(nota);

  const acc = el('div', 'acciones');
  const bNull = el('button', 'mini null', '—');
  bNull.title = 'volver a pendiente';
  bNull.onclick = () => {
    rev(p.idx).estado = null;
    const est = rev(p.idx).editada ? 'editada' : null;
    card.className = 'card pendiente';
    chip.textContent = chipTexto(est);
    chip.className = 'estado-chip ' + (est || 'pendiente');
    scheduleSave();
  };
  const bOk = el('button', 'mini ok', '✓ aprobar');
  bOk.onclick = () => { rev(p.idx).estado = 'aprobada'; card.className = 'card aprobada'; chip.textContent = '✓ aprobada'; chip.className = 'estado-chip aprobada'; scheduleSave(); };
  const bBad = el('button', 'mini bad', '✗ rechazar');
  bBad.onclick = () => { rev(p.idx).estado = 'rechazada'; card.className = 'card rechazada'; chip.textContent = '✗ rechazada'; chip.className = 'estado-chip rechazada'; scheduleSave(); };
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

function campoPregunta(p, card) {
  const c = el('div', 'campo');
  c.appendChild(el('label', null, 'pregunta'));
  const ta = document.createElement('textarea');
  ta.className = 'pregunta';
  ta.rows = 2;
  ta.value = textos(p).pregunta;
  ta.oninput = () => { rev(p.idx).pregunta = ta.value; rev(p.idx).editada = true; actualizarErrores(p, card); scheduleSave(); };
  c.appendChild(ta);
  return c;
}

function campoOpcion(p, i, card) {
  const c = el('div', 'opcion' + (i === textos(p).indice_correcta ? ' correcta' : ''));
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'opc-' + p.idx;
  radio.checked = i === textos(p).indice_correcta;
  radio.title = 'marcar como correcta';
  radio.onchange = () => {
    rev(p.idx).indice_correcta = i;
    rev(p.idx).editada = true;
    card.querySelectorAll('.opcion').forEach((o, j) => o.classList.toggle('correcta', j === i));
    scheduleSave();
  };
  c.appendChild(radio);
  c.appendChild(el('span', 'letra', 'ABCD'[i]));
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.value = textos(p).opciones[i];
  ta.oninput = () => {
    const opcs = [...textos(p).opciones];
    opcs[i] = ta.value;
    rev(p.idx).opciones = opcs;
    rev(p.idx).editada = true;
    actualizarErrores(p, card);
    scheduleSave();
  };
  c.appendChild(ta);
  return c;
}

function campoExplicacion(p, card) {
  const c = el('div', 'campo explicacion');
  c.appendChild(el('label', null, 'explicación (enseña)'));
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.value = textos(p).explicacion;
  ta.oninput = () => { rev(p.idx).explicacion = ta.value; rev(p.idx).editada = true; actualizarErrores(p, card); scheduleSave(); };
  c.appendChild(ta);
  return c;
}

function actualizarErrores(p, card) {
  const errs = validarReglas(textos(p), { termino: p.termino, base: p.fuente_enc?.base });
  const todos = [...new Set([...errs, ...(p.validacion || [])])];
  card._errsBox.innerHTML = '';
  for (const e of todos) card._errsBox.appendChild(el('span', 'err-tag', e));
}

// ─── autosave ─────────────────────────────────────────────────────────────
let saveTimer = null;
function scheduleSave() {
  state.dirty = true;
  setSave('guardando…', '');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(guardar, 800);
}

function setSave(txt, cls) {
  const s = $('#save-state');
  s.textContent = txt;
  s.className = 'save-state' + (cls ? ' ' + cls : '');
}

async function guardar() {
  if (!state.dirty || !state.n) return;
  // serializa TODAS las filas del lote (las nunca tocadas quedan con estado null y textos originales)
  const filas = state.items.map(p => {
    const r = state.revision[p.idx] || {};
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
      body: JSON.stringify({ base_actualizado: state.actualizado ?? null, preguntas: filas }),
    });
    state.actualizado = res.actualizado;
    state.dirty = false;
    setSave('✓ guardado ' + new Date(res.actualizado).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 'ok');
    renderProgreso();
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('cambió en otro lado')) {
      setSave('⚠ el lote cambió en otro lado — recargando…', 'err');
      setTimeout(() => cargarLote(state.n), 1200);
    } else {
      setSave('✗ error al guardar', 'err');
    }
    console.error(e);
  }
}

// ─── acciones globales ────────────────────────────────────────────────────
$('#btn-reset').onclick = async () => {
  if (!state.n || !confirm('¿Borrar la revisión guardada del lote y volver todo a pendiente?')) return;
  await api('/api/lote/' + state.n + '/reset', { method: 'POST' });
  state.revision = {};
  render();
  setSave('', '');
};

$('#btn-integrar').onclick = () => {
  const cmd = $('#cmd-integrar').textContent;
  navigator.clipboard?.writeText(cmd);
  $('#btn-integrar').textContent = '✓ copiado';
  setTimeout(() => { $('#btn-integrar').textContent = '▶ integrar'; }, 1200);
  document.querySelector('.integracion').scrollIntoView({ behavior: 'smooth' });
};

document.querySelectorAll('.filtro').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.filtro').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.filtro = b.dataset.f;
    render();
  };
});

init();
