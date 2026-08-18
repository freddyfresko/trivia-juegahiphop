# -*- coding: utf-8 -*-
"""generar-lote.py — estructura y valida lotes del REDACTOR (Motor v2, Fase 3).

Flujo (PLAN-MOTOR-TRIVIA-V2 §3.2): el AGENTE Hermes redacta las preguntas con
el prompt `scripts/prompts/redactor.md` y las deja en un JSON de redacción.
Este script SOLO estructura y valida con reglas duras:

  python scripts/generar-lote.py <lote N>           # valida redacción + emite lote
  python scripts/generar-lote.py <lote N> --juez <juez.json>   # adjunta puntajes del juez

Reglas duras por pregunta (estándar §3.3):
  - pregunta 20-140c, empieza ¿ y termina ?; sin negaciones ni absolutos
  - 4 opciones, 20-160c (ideal 40-90), MISMO primer token (paralelismo)
  - indice_correcta válido; sin duplicados entre opciones
  - sin "todas las anteriores" / "ninguna de las anteriores"
  - la correcta NO contiene el término de la pregunta (delación)
  - grounding (soft): la correcta comparte palabras clave con la entrada
  - explicación 40-200c, termina en punto
  - W×tipo: usa la matriz de filtrar-semantica.py (regla del verbo incluida)

Salidas en lotes/: lote-XXX.json (estructura final) + lote-XXX.md (revisión
de Freddy, legible). No toca el dataset (la integración es Fase 5).
"""
import argparse
import json
import os
import random
import re
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOTES_DIR = os.path.join(RAIZ, 'lotes')
REDACCION_DIR = os.path.join(LOTES_DIR, 'redaccion')
ENCICLOPEDIA = r'E:\dev\JuegaHipHop\Enciclopedia HH\dist\enciclopedia.json'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util as _ilu

_spec = _ilu.spec_from_file_location(
    'filtrar_semantica',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'filtrar-semantica.py'))
filtrar_semantica = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(filtrar_semantica)  # matriz W×tipo del Filtro

W_PATRONES = [
    ('que', r'^¿(?:qué|que)\s'), ('quien', r'^¿(?:quién|quien)\s'),
    ('por_que', r'^¿(?:por\s+qué)\s'), ('para_que', r'^¿para\s+qué\s'),
    ('como', r'^¿cómo\s'), ('cuando', r'^¿cuándo\s'), ('donde', r'^¿dónde\s'),
]


def w_de(pregunta):
    for w, pat in W_PATRONES:
        if re.match(pat, pregunta.strip(), re.IGNORECASE):
            return w
    return 'que'

MAX_PREGUNTA = 140
MAX_OPCION = 160
ABSOLUTOS = re.compile(r'\b(siempre|nunca|jamás|todas las anteriores|'
                       r'ninguna de las anteriores|todos los anteriores|'
                       r'ninguno de los anteriores)\b', re.IGNORECASE)


def norm(s):
    return re.sub(r'\s+', ' ', str(s)).strip().lower()


def barajar_correcta(opciones, ic, rng=None):
    """Devuelve (opciones_barajadas, nuevo_ic) con la correcta en posición
    aleatoria A/B/C/D. Los distractores conservan su orden relativo y la
    correcta nunca queda en la misma posición que tenía (anti-patrón)."""
    opc = list(opciones)
    correcta = opc[ic]
    distractores = [o for j, o in enumerate(opc) if j != ic]
    candidatas = [0, 1, 2, 3]
    candidatas.remove(ic)
    nueva_pos = (rng or random).choice(candidatas)
    nuevas = [None] * 4
    nuevas[nueva_pos] = correcta
    di = 0
    for j in range(4):
        if nuevas[j] is None:
            nuevas[j] = distractores[di]
            di += 1
    return nuevas, nueva_pos


def barajar_balanceado(opciones, ic, dist_pool, rng=None):
    """Igual que barajar_correcta pero elige la posición MENOS usada del
    pool (balance global ~25% por letra). Entre empates, aleatorio; nunca
    la posición original (anti-patrón)."""
    opc = list(opciones)
    correcta = opc[ic]
    distractores = [o for j, o in enumerate(opc) if j != ic]
    # ⚠️ NO excluir la posición original: si el redactor siempre pone ic=0
    # (A), vetar la posición 0 desbalancea el pool (A ≈ 12%). Todas las
    # posiciones compiten por ser la MENOS usada; el anti-patrón queda
    # garantizado por el balance global 25%.
    candidatas = list(range(4))
    rng = rng or random
    if dist_pool:
        menor = min(dist_pool.get(p, 0) for p in candidatas)
        candidatas = [p for p in candidatas if dist_pool.get(p, 0) == menor]
    nueva_pos = rng.choice(candidatas)
    nuevas = [None] * 4
    nuevas[nueva_pos] = correcta
    di = 0
    for j in range(4):
        if nuevas[j] is None:
            nuevas[j] = distractores[di]
            di += 1
    return nuevas, nueva_pos


def primer_token(t):
    m = re.match(r'^[a-záéíóúñü0-9]+', t.strip().lower())
    return m.group(0) if m else ''


NUMERALES = {'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
             'nueve', 'diez', 'once', 'doce', 'veinte', 'treinta', 'cuarenta',
             'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa', 'cien',
             'ciento', 'primera', 'primero', 'segunda', 'segundo', 'tercera',
             'tercero'}
# ojo: 'un/una/unos/unas' NO van en NUMERALES → son artículos como primer
# token de una opción ("Un álbum...", "Una sección...")
ARTICULOS = {'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'}


def categoria_token(token, original):
    """Categoría gramatical del primer token para validar paralelismo:
    opciones paralelas = misma categoría (numeral, artículo, infinitivo,
    nombre propio, preposición…). El token exacto puede variar ("8 compases"
    vs "16 compases", "Master of ceremonies" vs "Music creator")."""
    if token.isdigit() or token in NUMERALES:
        return 'numeral'
    if token in ARTICULOS:
        return 'articulo'
    if original and original[0].isupper():
        return 'nombre_propio'
    if re.match(r'^[a-záéíóúñü]+(ar|er|ir|arse|erse|irse)$', token):
        return 'infinitivo'
    if token in ('en', 'por', 'para', 'con', 'de', 'desde', 'hasta', 'sin', 'sobre', 'entre'):
        return 'preposicion'
    return 'otro'


def validar(p, e):
    """Reglas duras → lista de errores (vacía = pasa)."""
    errs = []
    q = p.get('pregunta', '')
    opc = p.get('opciones', [])
    ic = p.get('indice_correcta', -1)
    expl = p.get('explicacion', '')
    term = (e or {}).get('termino', '')

    if not (20 <= len(q) <= MAX_PREGUNTA):
        errs.append(f'pregunta {len(q)}c (esperado 20-{MAX_PREGUNTA})')
    if not q.startswith('¿'):
        errs.append('pregunta no empieza con ¿')
    if not q.endswith('?'):
        errs.append('pregunta no termina con ?')
    if ABSOLUTOS.search(q):
        errs.append('absolutos en la pregunta (siempre/nunca/solo/todas)')
    # negación "no": ignorar títulos entre «…» ("¿Qué hizo X con «No Love Deep Web»?")
    q_sin_titulos = re.sub(r'«[^»]*»', '', q)
    if re.search(r'\bno\b', q_sin_titulos.lower()):
        errs.append('negación "no" en la pregunta (stem negativo)')

    if len(opc) != 4:
        errs.append(f'{len(opc)} opciones (esperado 4)')
    else:
        if not (0 <= ic < 4):
            errs.append(f'indice_correcta {ic} fuera de rango')
        largos = [len(o) for o in opc]
        if any(l < 20 or l > MAX_OPCION for l in largos):
            errs.append(f'largos {largos} fuera de 20-{MAX_OPCION}')
        cats = {categoria_token(primer_token(o), o.strip()) for o in opc}
        if len(cats) != 1:
            errs.append(f'opciones no paralelas (categorías {cats})')
        if len(set(norm(o) for o in opc)) != 4:
            errs.append('opciones duplicadas')
        if ABSOLUTOS.search(' '.join(opc)):
            errs.append('absolutos en opciones')
        if 0 <= ic < 4:
            correcta = opc[ic]
            # delación: la correcta repite el término SOLO si la pregunta no lo
            # nombra (en preguntas comparativas "¿Qué diferencia a X de Y?" es
            # natural que la correcta mencione X — no hay delación)
            if (term and len(term) >= 4
                    and term.lower() not in norm(q)[:80]
                    and term.lower() in norm(correcta)[:60]):
                errs.append('la correcta repite el término de la pregunta (delata)')
            # grounding soft: palabras significativas de la correcta en la
            # entrada (descripcion/dato_clave/importancia + preguntas manuales)
            base = ' '.join([e.get('descripcion', ''), e.get('dato_clave', ''),
                             e.get('importancia', ''),
                             ' '.join(m['respuesta'] for m in (e.get('preguntas') or []))]).lower()
            if base:
                sig = [w for w in re.sub(r'[^a-záéíóúñü ]', ' ', norm(correcta)).split()
                       if len(w) > 4]
                hits = sum(1 for w in set(sig) if w in base)
                if sig and hits == 0:
                    errs.append('grounding: la correcta no comparte palabras con la entrada')

    if not (40 <= len(expl) <= 200):
        errs.append(f'explicación {len(expl)}c (esperado 40-200)')
    elif not re.search(r'[.!?]\s*$', expl.rstrip()):
        errs.append('explicación no termina en punto')

    # W×tipo: matriz del filtro (regla del verbo)
    p = dict(p)
    p['tipo'] = w_de(p['pregunta'])
    if filtrar_semantica.clasificar(p, e)[0] == 'eliminar':
        errs.append('viola la matriz W×tipo')
    return errs


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('lote', type=int, help='número de lote (1, 2, …)')
    ap.add_argument('--juez', help='JSON con puntajes del LLM-juez (opcional)')
    args = ap.parse_args()

    with open(ENCICLOPEDIA, encoding='utf-8') as f:
        enc = json.load(f)
    por_id = {e['id']: e for e in enc['entries']}

    src = os.path.join(REDACCION_DIR, f'redaccion-{args.lote:03d}.json')
    with open(src, encoding='utf-8') as f:
        red = json.load(f)

    items = red.get('preguntas', red) if isinstance(red, dict) else red
    area = red.get('area', '') if isinstance(red, dict) else ''
    errores_totales = 0
    salida = []
    for p in items:
        e = por_id.get(p.get('entrada_id'), {})
        errs = validar(p, e)
        item = {
            'entrada_id': p['entrada_id'],
            'id_original': p.get('id_original'),
            'termino': e.get('termino', ''),
            'tipo': e.get('tipo', '?'),
            'area': e.get('categoria', area),
            'nivel': e.get('nivel', 'basico'),
            'pregunta': p['pregunta'],
            'opciones': p['opciones'],
            'indice_correcta': p['indice_correcta'],
            'explicacion': p['explicacion'],
            'dificultad': p.get('dificultad', 2),
            'fuente': e.get('fuentes') or [e.get('id', '')],
            'validacion': errs,
        }
        if errs:
            errores_totales += 1
            print(f'✗ {p["entrada_id"]}: {len(errs)} errores → {errs[:3]}')
        salida.append(item)

    # adjuntar juez
    juez = {}
    if args.juez:
        with open(args.juez, encoding='utf-8') as f:
            juez = json.load(f)
        scores = juez.get('puntuaciones', juez) if isinstance(juez, dict) else juez
        for item in salida:
            sc = next((s for s in scores if s.get('id') == item['entrada_id']), None)
            if sc:
                item['juez'] = sc

    os.makedirs(LOTES_DIR, exist_ok=True)
    ts = datetime.now().strftime('%Y-%m-%d %H:%M')
    lote_json = os.path.join(LOTES_DIR, f'lote-{args.lote:03d}.json')
    lote_md = os.path.join(LOTES_DIR, f'lote-{args.lote:03d}.md')
    with open(lote_json, 'w', encoding='utf-8') as f:
        json.dump({'lote': args.lote, 'area': area, 'generado': ts,
                   'preguntas': salida}, f, ensure_ascii=False, indent=2)

    # MD legible para Freddy
    L = [f'# Lote {args.lote:03d} — preguntas para revisión',
         '', f'Generado: {ts} · Área: {area or "mixta"} · '
             f'{len(salida)} preguntas · errores reglas duras: {errores_totales}',
         '']
    letras = 'ABCD'
    for i, it in enumerate(salida, 1):
        L.append(f'## {i}. {it["pregunta"]}')
        L.append(f'`{it["entrada_id"]}` · {it["tipo"]} · área {it["area"]} · d{it["dificultad"]}')
        for j, o in enumerate(it['opciones']):
            marca = ' ✅' if j == it['indice_correcta'] else ''
            L.append(f'- {letras[j]}) {o}{marca}')
        L.append(f'  _Explicación: {it["explicacion"]}_')
        if it['validacion']:
            L.append(f'  ⚠️ reglas: {"; ".join(it["validacion"])}')
        if it.get('juez'):
            j = it['juez']
            L.append(f'  🧑⚖️ juez: {j.get("global", "?")}/5 · {j.get("veredicto", "")}'
                     + (f' — {j.get("nota", "")}' if j.get('nota') else ''))
        L.append('')
    with open(lote_md, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))

    print(f'\nLote {args.lote:03d}: {len(salida)} preguntas · '
          f'{errores_totales} con errores de reglas duras')
    print(f'  JSON: {lote_json}')
    print(f'  MD:   {lote_md}')
    return 1 if errores_totales else 0


if __name__ == '__main__':
    sys.exit(main())
