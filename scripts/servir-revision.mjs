// servir-revision.mjs — panel de revisión de lotes de la Trivia (Motor v2, Fase 5).
//
// Sirve revision/ (panel web) + API JSON local. Cero dependencias (Node ≥18).
//   GET  /api/lotes                    → resumen de lotes con estado
//   GET  /api/lote/:n                  → lote + revisión guardada + entradas + semántica
//   POST /api/lote/:n                  → guarda revision-XXX.json
//   POST /api/lote/:n/reset            → borra la revisión (vuelve a pendiente)
//
// Uso:  node scripts/servir-revision.mjs [--port 5187]
import { spawn } from 'child_process';
import { readFile, writeFile, stat, mkdir } from 'fs/promises';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Validador from '../revision/validador.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(__dirname);
const LOTES_DIR = path.join(RAIZ, 'lotes');
const REVISION_DIR = path.join(RAIZ, 'revision');
const ESTADO_FILE = path.join(LOTES_DIR, 'estado.json');
const ENCICLOPEDIA = 'E:/dev/JuegaHipHop/Enciclopedia HH/dist/enciclopedia.json';
const PYTHON = process.env.PYTHON || 'python';

const PORT = parseInt(process.argv[process.argv.indexOf('--port') + 1], 10) || 5187;

// ─── cache ────────────────────────────────────────────────────────────────
let _enc = null, _encMtime = 0, _estado = null;
const _semCache = new Map(); // lote → {mtime, payload}

async function leerJson(ruta, fallback) {
  try { return JSON.parse(await readFile(ruta, 'utf8')); }
  catch { return fallback; }
}

async function estado() {
  if (!_estado) _estado = await leerJson(ESTADO_FILE, { lotes: {} });
  return _estado;
}

async function guardarEstado() {
  await mkdir(LOTES_DIR, { recursive: true });
  await writeFile(ESTADO_FILE, JSON.stringify(_estado, null, 2), 'utf8');
}

async function enciclopedia() {
  try {
    const st = await stat(ENCICLOPEDIA);
    if (!_enc || st.mtimeMs !== _encMtime) {
      _enc = await leerJson(ENCICLOPEDIA, { entries: [] });
      _encMtime = st.mtimeMs;
    }
  } catch { _enc = { entries: [] }; }
  return _enc;
}

// mapa entradas {id → {termino, tipo, categoria, lugar, periodo, base, fuentes}}
async function entradas() {
  const enc = await enciclopedia();
  const porId = {};
  for (const e of enc.entries) {
    const manuales = (e.preguntas || []).map(m => m.respuesta || '').join(' ');
    porId[e.id] = {
      termino: e.termino || '', tipo: e.tipo || '?', categoria: e.categoria || '',
      lugar: e.lugar || '', periodo: e.periodo || '',
      base: [e.descripcion, e.dato_clave, e.importancia, manuales]
        .filter(Boolean).join(' ').toLowerCase(),
      fuentes: e.fuentes || [],
    };
  }
  return porId;
}

function listaLotes() {
  return readdirSync(LOTES_DIR)
    .filter(f => /^lote-\d{3}\.json$/.test(f))
    .map(f => ({ n: parseInt(f.slice(5, 8), 10), file: f }))
    .sort((a, b) => a.n - b.n);
}

// estado de un lote: integrado (estado.json) > revision (hay revision-XXX.json) > pendiente
function estadoLote(n, hayRevision) {
  const est = _estado && _estado.lotes;
  if (est && est[String(n).padStart(3, '0')] === 'integrado') return 'integrado';
  return hayRevision ? 'revision' : 'pendiente';
}

function revisionPath(n) {
  return path.join(LOTES_DIR, `revision-${String(n).padStart(3, '0')}.json`);
}

// semántica W×tipo vía clasificar-revision.py (fuente de verdad: filtrar-semantica.py)
function semanticaLote(n, lote) {
  const cached = _semCache.get(n);
  if (cached && Date.now() - cached.ts < 60_000) return Promise.resolve(cached.payload);
  const payload = {
    preguntas: lote.preguntas.map((p, idx) => ({
      idx, pregunta: p.pregunta, entrada_id: p.entrada_id, termino: p.termino,
    })),
  };
  return new Promise(resolve => {
    const proc = spawn(PYTHON, [path.join(__dirname, 'clasificar-revision.py')],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    proc.stdout.on('data', c => { stdout += c; });
    proc.on('error', () => { _semCache.set(n, { ts: Date.now(), payload: {} }); resolve({}); });
    proc.on('close', () => {
      let out = {};
      try { out = JSON.parse(stdout); } catch { out = {}; }
      _semCache.set(n, { ts: Date.now(), payload: out });
      resolve(out);
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function cuerpo(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 5e6) { reject(new Error('body muy grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('JSON inválido')); } });
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

async function estatico(res, ruta) {
  const abs = path.join(REVISION_DIR, ruta);
  try {
    const data = await readFile(abs);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'no existe' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    // estáticos
    if (p === '/' || p === '/index.html') return estatico(res, 'index.html');
    if (p === '/app.js' || p === '/style.css' || p === '/validador.js') return estatico(res, p.slice(1));

    // GET /api/lotes
    if (p === '/api/lotes' && req.method === 'GET') {
      await estado();
      const ent = await entradas();
      const dataset = await leerJson(path.join(RAIZ, 'src/data/preguntas.json'), { preguntas: [], meta: {} });
      const lotes = listaLotes().map(({ n }) => {
        const lote = JSON.parse(readFileSync(path.join(LOTES_DIR, `lote-${String(n).padStart(3, '0')}.json`), 'utf8'));
        const rev = existsSync(revisionPath(n)) ? JSON.parse(readFileSync(revisionPath(n), 'utf8')) : null;
        const porRev = {};
        if (rev) for (const r of rev.preguntas) porRev[r.idx] = r;
        let aprobadas = 0, rechazadas = 0, editadas = 0;
        lote.preguntas.forEach((_, idx) => {
          const r = porRev[idx];
          if (r && r.estado === 'aprobada') aprobadas++;
          if (r && r.estado === 'rechazada') rechazadas++;
          if (r && r.editada) editadas++;
        });
        return {
          n, area: lote.area, generado: lote.generado, total: lote.preguntas.length,
          con_errores: lote.preguntas.filter(q => (q.validacion || []).length).length,
          estado: estadoLote(n, !!rev), aprobadas, rechazadas, editadas,
          actualizado: rev ? rev.actualizado : null,
        };
      });
      return json(res, 200, {
        lotes, dataset: { total: dataset.preguntas.length, version: dataset.meta.version },
        enciclopedia: Object.keys(ent).length,
      });
    }

    // GET /api/lote/:n
    let m = p.match(/^\/api\/lote\/(\d+)$/);
    if (m && req.method === 'GET') {
      const n = parseInt(m[1], 10);
      const file = path.join(LOTES_DIR, `lote-${String(n).padStart(3, '0')}.json`);
      if (!existsSync(file)) return json(res, 404, { error: `no existe lote ${n}` });
      const lote = JSON.parse(readFileSync(file, 'utf8'));
      const rev = existsSync(revisionPath(n)) ? JSON.parse(readFileSync(revisionPath(n), 'utf8')) : null;
      const ent = await entradas();
      const sem = await semanticaLote(n, lote);
      const items = lote.preguntas.map((p, idx) => {
        const e = ent[p.entrada_id] || {};
        const errs = Validador.validar(p, e);
        return {
          idx, ...p,
          errores_js: errs,
          semantica: sem[idx] || { w: '?', accion: 'quedar' },
          fuente_enc: e,
        };
      });
      return json(res, 200, {
        lote: { n, area: lote.area, generado: lote.generado },
        revision: rev,
        preguntas: items,
      });
    }

    // POST /api/lote/:n  (guardar revisión)
    if (m && req.method === 'POST') {
      const n = parseInt(m[1], 10);
      const body = await cuerpo(req);
      if (!Array.isArray(body.preguntas)) return json(res, 400, { error: 'falta preguntas[]' });
      const rev = {
        lote: n,
        actualizado: new Date().toISOString(),
        preguntas: body.preguntas.map(r => ({
          idx: r.idx, entrada_id: r.entrada_id, estado: r.estado || null,
          editada: !!r.editada, pregunta: r.pregunta, opciones: r.opciones,
          indice_correcta: r.indice_correcta, explicacion: r.explicacion,
          nota: r.nota || '',
        })),
      };
      await writeFile(revisionPath(n), JSON.stringify(rev, null, 2), 'utf8');
      return json(res, 200, { ok: true, actualizado: rev.actualizado });
    }

    // POST /api/lote/:n/reset
    if ((m = p.match(/^\/api\/lote\/(\d+)\/reset$/)) && req.method === 'POST') {
      const n = parseInt(m[1], 10);
      try { unlinkSync(revisionPath(n)); } catch {}
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: 'ruta no existe' });
  } catch (err) {
    console.error('✗', err.message);
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🛠  Panel de revisión de la Trivia`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Lotes: ${LOTES_DIR}`);
});
