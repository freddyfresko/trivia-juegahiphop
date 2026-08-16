# -*- coding: utf-8 -*-
"""integrar-lote.py — integra lotes aprobados al dataset de la Trivia (Fase 5).

Valida el lote aprobado (reglas duras + juez ≥4 + sin duplicados contra el
pool) y lo inserta a src/data/preguntas.json con metadata completa.

Uso:
  python scripts/integrar-lote.py <lote N> [--lote-json <path>]

Pasos:
  1. Lee lotes/lote-XXX.json (preguntas ya validadas + juez adjunto).
  2. Dedup normalizado contra el pool actual (pregunta normalizada y
     respuesta normalizada; las manuales de la enciclopedia ya están en el
     pool → se omiten y se reportan).
  3. Deriva metadata de la enciclopedia (tipo/eje = W de la pregunta,
     operacion por W, nivel, subcategoria, relacionados, source, periodo,
     lugar) y crea ids nuevos (siguiente pXXXXX libre).
  4. Backup + inserta + actualiza meta (version 4.2.0).
  5. Reporte: insertadas / omitidas (dup) / rechazadas.

Invariantes tras integrar (correr scripts/qa_trivia_dataset.py después):
  - 0 duplicados de pregunta · 0 ids repetidos · opción✓ == respuesta.
"""
import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, 'src', 'data', 'preguntas-nuevas.json')  # pool de calidad v2 (legacy congelado)
LOTES_DIR = os.path.join(RAIZ, 'lotes')
BACKUP_DIR = os.path.join(RAIZ, 'scripts', 'backups')
ENCICLOPEDIA = r'E:\dev\JuegaHipHop\Enciclopedia HH\dist\enciclopedia.json'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location(
    'generar_lote', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generar-lote.py'))
gen = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(gen)

FALLBACK_OPERACION = {
    'que': 'recordar', 'quien': 'recordar', 'cuando': 'recordar',
    'donde': 'recordar', 'por_que': 'comprender', 'para_que': 'comprender',
    'como': 'comprender',
}


def norm(s):
    return re.sub(r'\s+', ' ', str(s)).strip().lower()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('lote', type=int)
    ap.add_argument('--lote-json', help='ruta al JSON del lote (default lotes/lote-XXX.json)')
    args = ap.parse_args()

    lote_path = args.lote_json or os.path.join(LOTES_DIR, f'lote-{args.lote:03d}.json')
    with open(lote_path, encoding='utf-8') as f:
        lote = json.load(f)
    with open(ENCICLOPEDIA, encoding='utf-8') as f:
        enc = json.load(f)
    por_id = {e['id']: e for e in enc['entries']}
    with open(DATA, encoding='utf-8') as f:
        data = json.load(f)

    pool = data['preguntas']
    norm_pool = {norm(q['pregunta']) for q in pool}
    resp_pool = {norm(q['respuesta']) for q in pool}
    usado_ids = {int(re.sub(r'\D', '', q['id'])) for q in pool}
    siguiente = (max(usado_ids) + 1) if usado_ids else 1
    created_at = datetime.now(timezone.utc).isoformat()

    # revisión del panel (revision-XXX.json): corrige textos, salta
    # rechazadas, la aprobación humana manda sobre el juez.
    rev_path = os.path.join(os.path.dirname(lote_path),
                            os.path.basename(lote_path).replace('lote-', 'revision-'))
    revs = {}
    if os.path.exists(rev_path):
        rev_data = json.load(open(rev_path, encoding='utf-8'))
        for r in rev_data.get('preguntas', []):
            revs[r['idx']] = r
        print(f'📝 revisión encontrada: {sum(1 for r in revs.values() if r.get("estado"))} '
              f'decididas ({sum(1 for r in revs.values() if r.get("estado") == "aprobada")}✓ / '
              f'{sum(1 for r in revs.values() if r.get("estado") == "rechazada")}✗)')

    insertadas, omitidas, rechazadas = [], [], []
    for i, it in enumerate(lote['preguntas']):
        r = revs.get(i)
        # rechazada por Freddy
        if r and r.get('estado') == 'rechazada':
            nota = f" — {r.get('nota')}" if r.get('nota') else ''
            rechazadas.append((it['entrada_id'], 'rechazada por Freddy' + nota))
            continue
        # correcciones de Freddy (si editó en el panel)
        it = dict(it)
        if r:
            if r.get('pregunta'):
                it['pregunta'] = r['pregunta']
            if r.get('opciones'):
                it['opciones'] = list(r['opciones'])
            if r.get('indice_correcta') is not None:
                it['indice_correcta'] = r['indice_correcta']
            if r.get('explicacion'):
                it['explicacion'] = r['explicacion']
        # re-validar reglas duras con los textos FINALES (las correcciones
        # pueden romper paralelismo/longitudes → se rechazan con motivo)
        e0 = por_id.get(it['entrada_id'], {})
        errs_finales = gen.validar(it, e0)
        if errs_finales:
            rechazadas.append((it['entrada_id'], 'reglas tras revisión: ' + '; '.join(errs_finales[:2])))
            continue
        # rechazo: juez < 4, salvo aprobación humana explícita
        juez = it.get('juez') or {}
        humano = bool(r and r.get('estado') == 'aprobada')
        if not humano and juez.get('global', 5) < 4.0:
            rechazadas.append((it['entrada_id'], f"juez {juez.get('global')}/5"))
            continue
        # dedup normalizado (la manual de la enciclopedia ya vive en el pool)
        nq, nr = norm(it['pregunta']), norm(it['opciones'][it['indice_correcta']])
        if nq in norm_pool or nr in resp_pool:
            omitidas.append((it['entrada_id'], it['pregunta'][:60]))
            continue

        e = por_id.get(it['entrada_id'], {})
        w = gen.w_de(it['pregunta'])
        nueva = {
            'id': f'p{siguiente:05d}',
            'tipo': w,
            'eje': w,
            'operacion': FALLBACK_OPERACION.get(w, 'recordar'),
            'nivel': it.get('nivel') or e.get('nivel', 'basico'),
            'dificultad': it.get('dificultad', 2),
            'pregunta': it['pregunta'],
            'respuesta': it['opciones'][it['indice_correcta']],
            'respuesta_corta': False,
            'explicacion': it['explicacion'],
            'opciones': it['opciones'],
            'indice_correcta': it['indice_correcta'],
            'entrada_id': it['entrada_id'],
            'termino': it.get('termino') or e.get('termino', ''),
            'area': it.get('area') or e.get('categoria', ''),
            'subcategoria': it.get('subcategoria') or (e.get('subcategoria') or []),
            'relacionados': list(e.get('related_ids') or []),
            'source': it.get('fuente') or (e.get('fuentes') or []),
            'source_type': 'redactor-llm',
            'periodo': e.get('periodo') or '',
            'lugar': e.get('lugar') or '',
            'created_at': created_at,
        }
        insertadas.append(nueva)
        norm_pool.add(nq)
        resp_pool.add(nr)
        siguiente += 1

    # marcar el lote como integrado (aunque todo fuera rechazado: la
    # revisión quedó cerrada y el panel lo muestra gris)
    estado_path = os.path.join(LOTES_DIR, 'estado.json')
    estado = {'lotes': {}}
    if os.path.exists(estado_path):
        with open(estado_path, encoding='utf-8') as f:
            estado = json.load(f)
    estado['lotes'][f'{args.lote:03d}'] = 'integrado'
    with open(estado_path, 'w', encoding='utf-8') as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)

    if insertadas:
        ts = datetime.now().strftime('%Y%m%d-%H%M%S')
        backup = os.path.join(BACKUP_DIR, f'preguntas-{ts}.json')
        shutil.copy2(DATA, backup)
        data['preguntas'] = pool + insertadas
        ver = str(data['meta'].get('version', '4.0.0'))
        partes = [int(x) for x in ver.split('.')]
        while len(partes) < 3:
            partes.append(0)
        partes[2] += 1
        data['meta'] = {
            'total': len(data['preguntas']),
            'version': '.'.join(map(str, partes)),
            'fuente': 'enciclopedia',
            'qa': f"{datetime.now():%Y-%m-%d} lote {args.lote:03d} redactor-llm integrado (+{len(insertadas)})",
        }
        with open(DATA, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(f'✅ {len(insertadas)} insertadas → {DATA} (backup: {backup})')
    else:
        print('⚠️  nada que insertar')

    print(f'   omitidas (duplicadas en el pool): {len(omitidas)}')
    for eid, preg in omitidas[:10]:
        print(f'     · {eid}: {preg}…')
    print(f'   rechazadas: {len(rechazadas)}')
    for eid, r in rechazadas[:5]:
        print(f'     · {eid}: {r}')
    print(f'\nTotal dataset: {len(data["preguntas"])}')


if __name__ == '__main__':
    sys.exit(main())
