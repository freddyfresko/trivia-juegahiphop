/* validador.js — espejo en JS de las reglas duras de generar-lote.py (Motor v2).
   Se usa en el panel de revisión (browser, <script type="module">) y en
   scripts/servir-revision.mjs (Node ESM). Módulo ESM puro.
   Categoría gramatical del primer token para paralelismo: numeral > artículo >
   nombre propio (antes que infinitivo: 'master' termina en -er) > infinitivo >
   preposición > otro. */
export const MAX_PREGUNTA = 140;
export const MAX_OPCION = 160;

const ABSOLUTOS = /\b(siempre|nunca|jamás|todas las anteriores|ninguna de las anteriores|todos los anteriores|ninguno de los anteriores)\b/i;

const NUMERALES = {
  uno: 1, dos: 1, tres: 1, cuatro: 1, cinco: 1, seis: 1, siete: 1, ocho: 1,
  nueve: 1, diez: 1, once: 1, doce: 1, veinte: 1, treinta: 1, cuarenta: 1,
  cincuenta: 1, sesenta: 1, setenta: 1, ochenta: 1, noventa: 1, cien: 1,
  ciento: 1, primera: 1, primero: 1, segunda: 1, segundo: 1, tercera: 1,
  tercero: 1
};
const ARTICULOS = { el: 1, la: 1, los: 1, las: 1, un: 1, una: 1, unos: 1, unas: 1 };
const PREPOSICIONES = { en: 1, por: 1, para: 1, con: 1, de: 1, desde: 1, hasta: 1, sin: 1, sobre: 1, entre: 1 };

export function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

export function primerToken(t) {
  const m = /^[a-záéíóúñü0-9]+/i.exec(String(t || '').trim());
  return m ? m[0].toLowerCase() : '';
}

export function categoriaToken(token, original) {
  if (/^\d+$/.test(token) || NUMERALES[token]) return 'numeral';
  if (ARTICULOS[token]) return 'articulo';
  if (original && /^[A-ZÁÉÍÓÚÑÜ]/.test(original.trim())) return 'nombre_propio';
  if (/^[a-záéíóúñü]+(ar|er|ir|arse|erse|irse)$/.test(token)) return 'infinitivo';
  if (PREPOSICIONES[token]) return 'preposicion';
  return 'otro';
}

/* Reglas duras → array de errores (vacío = pasa).
   item: {pregunta, opciones, indice_correcta, explicacion}
   entrada: {termino, base} — base = texto de la enciclopedia para grounding. */
export function validar(item, entrada) {
  const errs = [];
  const q = String(item.pregunta || '');
  const opc = item.opciones || [];
  const ic = item.indice_correcta;
  const expl = String(item.explicacion || '');
  const term = (entrada && entrada.termino) || '';
  const base = (entrada && entrada.base) || '';

  if (q.length < 20 || q.length > MAX_PREGUNTA) errs.push('pregunta ' + q.length + 'c (esperado 20-' + MAX_PREGUNTA + ')');
  if (q.charAt(0) !== '¿') errs.push('pregunta no empieza con ¿');
  if (q.charAt(q.length - 1) !== '?') errs.push('pregunta no termina con ?');
  if (ABSOLUTOS.test(q)) errs.push('absolutos en la pregunta (siempre/nunca/solo/todas)');
  const qSinTitulos = q.replace(/«[^»]*»/g, '');
  if (/\bno\b/i.test(qSinTitulos)) errs.push('negación "no" en la pregunta (stem negativo)');

  if (opc.length !== 4) {
    errs.push(opc.length + ' opciones (esperado 4)');
  } else {
    if (ic < 0 || ic > 3) errs.push('indice_correcta ' + ic + ' fuera de rango');
    const largos = opc.map(o => String(o || '').length);
    if (largos.some(l => l < 20 || l > MAX_OPCION))
      errs.push('largos ' + largos.join('/') + ' fuera de 20-' + MAX_OPCION);
    const cats = {};
    opc.forEach(o => { cats[categoriaToken(primerToken(o), String(o))] = 1; });
    const claves = Object.keys(cats);
    if (claves.length !== 1) errs.push('opciones no paralelas (categorías ' + claves.join(', ') + ')');
    const normSet = {};
    opc.forEach(o => { normSet[norm(o)] = 1; });
    if (Object.keys(normSet).length !== 4) errs.push('opciones duplicadas');
    if (ABSOLUTOS.test(opc.join(' '))) errs.push('absolutos en opciones');
    if (ic >= 0 && ic <= 3) {
      const correcta = String(opc[ic] || '');
      if (term && term.length >= 4 &&
          norm(q).slice(0, 80).indexOf(term.toLowerCase()) === -1 &&
          norm(correcta).slice(0, 60).indexOf(term.toLowerCase()) !== -1)
        errs.push('la correcta repite el término de la pregunta (delata)');
      if (base) {
        const sig = norm(correcta).replace(/[^a-záéíóúñü ]/g, ' ').split(/\s+/)
          .filter(w => w.length > 4);
        const uniq = {};
        let hits = 0;
        sig.forEach(w => { if (!uniq[w]) { uniq[w] = 1; if (base.indexOf(w) !== -1) hits++; } });
        if (sig.length && hits === 0) errs.push('grounding: la correcta no comparte palabras con la entrada');
      }
    }
  }

  if (expl.length < 40 || expl.length > 200) errs.push('explicación ' + expl.length + 'c (esperado 40-200)');
  else if (!/[.!?]\s*$/.test(expl)) errs.push('explicación no termina en punto');

  return errs;
}
