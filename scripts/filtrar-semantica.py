# -*- coding: utf-8 -*-
"""Filtro semántico del dataset de la Trivia — FASE 1 del Motor de Trivia v2.

Elimina las preguntas ABSURDAS que el generador por plantilla produjo al
ignorar el tipo semántico de la entrada (ver PLAN-MOTOR-TRIVIA-V2.md §3.1):

  R1. "¿Dónde…?" con verbo de origen (surgió/apareció/nació/se fundó…) sobre
      técnica / instrumento / obra (canción, álbum, mixtape, película,
      documental) / equipo → un proceso no "surge" en un lugar.
  R2. "¿Dónde…?"/"¿Cuándo…?" con verbo de origen sobre concepto abstracto
      puro (flow, groove, respeto, foundation…) sin lugar real → absurdo.
  R3. "¿Dónde…?"/"¿Cuándo…?" sobre movimiento de ÉPOCA ("…en los años 2010")
      → circular (la época ES la respuesta).
  R4. "¿Cuándo…?" con verbo de origen sobre técnica/instrumento/obra sin
      lugar real → el "cuándo" es débil (no hay fecha canónica).
  R5. "¿Qué es X?" genérica sin contexto → fuera si existe versión con
      contexto para la misma entrada ("¿Qué es el juez en el breaking?").

El "¿Dónde?" POSICIONAL ("¿Dónde se toca el hi-hat en el patrón?") NO usa
verbo de origen → se conserva SIEMPRE (regla del verbo).

Casos límite (concepto abstracto CON lugar real, p.ej. hook/bassline) NO se
tocan por defecto: se listan como DUDOSOS. Freddy aprobó eliminar los 4 de
hook/bassline (2026-08-16) → ver DUDOSAS_APROBADAS.

Criterio validado en dry-run (ago-2026): 1275 → 148 eliminadas (144 reglas +
4 dudosas aprobadas) → 1127 quedan. Corrección posterior (mismo día): la
lista ABSTRACTOS usaba términos acentuados en vez de los ids reales de la
enciclopedia → +28 absurdas eliminadas (total 176).

Uso:
  python scripts/filtrar-semantica.py            # dry-run: reporte, no escribe
  python scripts/filtrar-semantica.py --apply    # backup + aplicar al dataset
  python scripts/filtrar-semantica.py --check    # exit 1 si hay clases prohibidas

Con --apply: respaldo automático en scripts/backups/ antes de escribir.
Idempotente: una 2ª corrida con --apply encuentra 0 eliminables.
"""
import argparse
import collections
import json
import os
import random
import re
import shutil
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, 'src', 'data', 'preguntas.json')
ENCICLOPEDIA = r'E:\dev\JuegaHipHop\Enciclopedia HH\dist\enciclopedia.json'
BACKUP_DIR = os.path.join(RAIZ, 'scripts', 'backups')
LOTES_DIR = os.path.join(RAIZ, 'lotes')

# ─── criterio semántico (matriz W × tipo, §3.1) ──────────────────────────
VERBO_ORIGEN = re.compile(
    r'surgi|apareci|naci|se fund|se origin|empez|comenz', re.IGNORECASE)
ES_EPOCA = re.compile(
    r'años\s+(19|20)\d\d|década|años 2000|años 2010', re.IGNORECASE)

# tipos de entrada que NO "surgen en un lugar" (procesos/obras/equipo)
PROCESOS = {
    'técnica', 'instrumento', 'canción', 'álbum', 'mixtape', 'película',
    'documental', 'equipo',
}

# ids de la enciclopedia = concepto abstracto puro (valores, habilidades,
# elementos intangibles) — el dónde/cuándo de origen no aplica.
# ⚠️ Son los IDs (slugs) reales de la enciclopedia, NO los términos
# acentuados ('metrica', no 'métrica'; 'expression', no 'expresión').
ABSTRACTOS = {
    'bassline', 'beat', 'beef', 'character', 'community', 'creativity',
    'crowdpleaser', 'cultura-de-barrio', 'expression', 'flow', 'foundation',
    'groove', 'having-fun', 'hook', 'identity', 'knowledge',
    'knowledge-of-self', 'love', 'metrica', 'musicality', 'originality',
    'peace', 'realness', 'resistance', 'respect', 'rhythm', 'self-expression',
    'stagepresence', 'street', 'street-culture', 'style', 'tradicion', 'unity',
}


def lugar_real(lugar):
    """¿El campo lugar apunta a una geografía real (no 'Mundial'/global)?"""
    if not lugar:
        return False
    ll = str(lugar).lower()
    return not ('mundial' in ll or 'todo el mundo' in ll
                or 'escena internacional' in ll)


# Casos límite (concepto abstracto CON lugar real) aprobados por Freddy
# para ELIMINAR (2026-08-16): hook/bassline + street/realness no "surgen"
# en un lugar/época.
DUDOSAS_APROBADAS = {'p00813', 'p00968', 'p01137', 'p01270',
                     'p01036', 'p01325', 'p01330'}


def es_generica_sin_contexto(pregunta):
    """'¿Qué es el juez?' (sin contexto) vs '¿Qué es el juez en el breaking?'."""
    return bool(re.match(
        r'^¿Qué es (el|la|los|las) [a-záéíóúñ]+[?]?$', pregunta.lower()))


def clasificar(q, e):
    """Devuelve ('quedar'|'eliminar'|'dudosa', razon|None)."""
    tipo = e.get('tipo', '?') if e else '?'
    w = q.get('tipo', '')
    es_abs = bool(e) and e.get('id') in ABSTRACTOS
    origen = bool(VERBO_ORIGEN.search(q.get('pregunta', '')))
    termino = q.get('termino') or ''
    lugar = e.get('lugar') if e else None

    if w == 'donde' and origen:
        if tipo in PROCESOS:
            return 'eliminar', f'«{q.get("termino")}» es {tipo}: no "surge" en un lugar'
        if es_abs and not lugar_real(lugar):
            return 'eliminar', f'«{q.get("termino")}» es concepto abstracto: no "surge" en un lugar'
        if tipo == 'movimiento' and ES_EPOCA.search(termino):
            return 'eliminar', f'«{q.get("termino")}» es movimiento de época: dónde es circular'
        if es_abs and lugar_real(lugar):
            if q.get('id') in DUDOSAS_APROBADAS:
                return 'eliminar', f'«{q.get("termino")}»: dudosa aprobada para eliminar por Freddy (hook/bassline)'
            return 'dudosa', f'concepto abstracto CON lugar real (revisar a mano)'
    elif w == 'cuando' and origen:
        if es_abs and not lugar_real(lugar):
            return 'eliminar', f'«{q.get("termino")}» es concepto abstracto: no "surge" en una época'
        if tipo == 'movimiento' and ES_EPOCA.search(termino):
            return 'eliminar', f'«{q.get("termino")}» es movimiento de época: cuándo es circular'
        if tipo in PROCESOS and not lugar_real(lugar):
            return 'eliminar', f'«{q.get("termino")}» es {tipo}: el "cuándo" es débil'
        if es_abs and lugar_real(lugar):
            if q.get('id') in DUDOSAS_APROBADAS:
                return 'eliminar', f'«{q.get("termino")}»: dudosa aprobada para eliminar por Freddy (hook/bassline)'
            return 'dudosa', f'concepto abstracto CON lugar real (revisar a mano)'
    return 'quedar', None


def aplicar_filtro(preguntas, por_id):
    """Aplica las reglas R1-R4 (W×tipo) y devuelve (eliminadas, dudosas, quedan)."""
    eliminadas, dudosas, quedan = [], [], []
    for q in preguntas:
        accion, razon = clasificar(q, por_id.get(q.get('entrada_id'), {}))
        if accion == 'eliminar':
            eliminadas.append((q['id'], razon, q['pregunta'], q['respuesta'][:60]))
        elif accion == 'dudosa':
            dudosas.append((q['id'], razon, q['pregunta'], q['respuesta'][:60]))
        else:
            quedan.append(q)
    return eliminadas, dudosas, quedan


def dedup_genericas(quedan):
    """R5: '¿Qué es X?' genérica → fuera si existe versión con contexto."""
    def gen(q):
        return q['tipo'] == 'que' and es_generica_sin_contexto(q['pregunta'])

    ctx = {}
    for q in quedan:
        if q['tipo'] == 'que' and not gen(q):
            ctx.setdefault(q['entrada_id'], q)
    dup = [q for q in quedan if gen(q)
           and q['entrada_id'] in ctx and ctx[q['entrada_id']]['id'] != q['id']]
    quedan = [q for q in quedan if q not in dup]
    return dup, quedan


def reporte_md(eliminadas, dudosas, quedan, por_id, dry):
    """Reporte legible para Freddy: eliminadas (por qué) + muestra de 50."""
    random.seed(20260816)
    por_area = collections.defaultdict(list)
    for q in quedan:
        por_area[q.get('area', '?')].append(q)
    muestra = []
    for area in sorted(por_area):
        por_area[area].sort(key=lambda q: q['id'])
        k = max(1, round(50 * len(por_area[area]) / max(len(quedan), 1)))
        muestra += por_area[area][:k]
    if len(muestra) > 50:
        random.shuffle(muestra)
        muestra = muestra[:50]
    muestra.sort(key=lambda q: q['id'])

    L = []
    L.append('# Filtro semántico del dataset — reporte')
    L.append('')
    L.append(f'- Fecha: {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    L.append(f'- Modo: {"DRY-RUN (nada aplicado)" if dry else "APLICADO"}')
    L.append(f'- Total dataset: {len(eliminadas) + len(dudosas) + len(quedan)}'
             f' → ELIMINADAS {len(eliminadas)} · DUDOSAS {len(dudosas)}'
             f' · QUEDAN {len(quedan)}')
    L.append('')
    L.append('## ✗ Eliminadas (no tienen pies ni cabeza)')
    L.append('')
    for qid, razon, preg, resp in sorted(eliminadas, key=lambda x: x[0]):
        L.append(f'- `{qid}` **{preg}** → {resp}')
        L.append(f'  - _{razon}_')
    L.append('')
    L.append('## ⚠️ Dudosas (casos límite — decisión de Freddy)')
    L.append('')
    for qid, razon, preg, resp in sorted(dudosas, key=lambda x: x[0]):
        L.append(f'- `{qid}` **{preg}** → {resp}')
        L.append(f'  - _{razon}_')
    L.append('')
    L.append('## ✓ Muestra de 50 que se quedan (con sentido)')
    L.append('')
    for q in muestra:
        L.append(f'- `{q["id"]}` [{q.get("area")}] **{q["pregunta"]}**')
    L.append('')
    return '\n'.join(L), muestra


preguntas_entrada_id = {}  # se llena en main() para el reporte de dudosas


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--apply', action='store_true',
                    help='aplicar el filtro (backup + escribir dataset)')
    ap.add_argument('--check', action='store_true',
                    help='modo verificación: exit 1 si hay clases prohibidas')
    args = ap.parse_args()

    with open(DATA, encoding='utf-8') as f:
        data = json.load(f)
    preguntas = data['preguntas']
    global preguntas_entrada_id
    preguntas_entrada_id = {q['id']: q['entrada_id'] for q in preguntas}

    try:
        with open(ENCICLOPEDIA, encoding='utf-8') as f:
            enc = json.load(f)
        entries = enc if isinstance(enc, list) else enc.get('entries', [])
        por_id = {e['id']: e for e in entries}
    except FileNotFoundError:
        print(f'⚠️  No se encontró la enciclopedia en {ENCICLOPEDIA}'
              ' — los tipos se tratan como desconocidos')
        por_id = {}

    eliminadas, dudosas, quedan = aplicar_filtro(preguntas, por_id)
    # las dudosas NO aprobadas se CONSERVAN en el dataset (solo se listan)
    dudosa_ids = {d[0] for d in dudosas}
    quedan = quedan + [q for q in preguntas if q['id'] in dudosa_ids]
    dup_gen, quedan = dedup_genericas(quedan)
    eliminadas += [(
        q['id'],
        f'«{q.get("termino")}»: "¿Qué es X?" genérica sin contexto'
        f' (existe versión contextual en la misma entrada)',
        q['pregunta'], q['respuesta'][:60]) for q in dup_gen]

    print(f'TOTAL {len(preguntas)} → ELIMINADAS {len(eliminadas)}'
          f' · DUDOSAS {len(dudosas)} · QUEDAN {len(quedan)}')

    if args.check:
        print('CHECK:', 'FALLÓ' if eliminadas else 'OK — 0 clases prohibidas')
        return 1 if eliminadas else 0

    os.makedirs(LOTES_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    md, muestra = reporte_md(eliminadas, dudosas, quedan, por_id, not args.apply)
    reporte_path = os.path.join(LOTES_DIR, f'filtro-semantica-{ts}.md')
    with open(reporte_path, 'w', encoding='utf-8') as f:
        f.write(md)
    print(f'Reporte: {reporte_path}')

    if args.apply:
        backup = os.path.join(BACKUP_DIR, f'preguntas-{ts}.json')
        shutil.copy2(DATA, backup)
        data['preguntas'] = quedan
        data['meta'] = {
            'total': len(quedan),
            'version': '4.2.1',
            'fuente': 'enciclopedia',
            'qa': f'2026-08-16 filtro semantico motor v2 ({len(eliminadas)} eliminadas)',
        }
        with open(DATA, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(f'Aplicado: {len(quedan)} preguntas escritas en {DATA}')
        print(f'Backup: {backup}')
    else:
        print('DRY-RUN: nada se escribió. Usa --apply para aplicar.')

    # resumen rápido a consola
    print(f'\nELIMINADAS por regla:')
    reglas = collections.Counter(r.split(':')[0] for _, r, _, _ in eliminadas)
    for k, v in reglas.most_common():
        print(f'  {k}: {v}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
