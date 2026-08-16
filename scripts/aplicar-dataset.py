# -*- coding: utf-8 -*-
"""aplicar-dataset.py — aplica las decisiones del panel al dataset completo.

Lee lotes/revision-dataset.json (decisiones por id de pregunta del dataset):
  - estado == 'rechazada'    → retira la pregunta del pool (backup previo)
  - estado == 'aprobada' y editada → corrige in situ (pregunta/opciones/
    correcta/explicación) y realinea 'respuesta' con la nueva correcta
  - aprobada sin edición     → nada (ya está)

Uso:
  python scripts/aplicar-dataset.py          # aplica y reporta
  python scripts/aplicar-dataset.py --check  # solo reporta qué haría

El match es por id directo de pregunta del dataset (pXXXXX). Backup
automático en scripts/backups/ y bump de versión solo si hubo cambios.
"""
import json
import os
import re
import shutil
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, 'src', 'data', 'preguntas-nuevas.json')  # pool de calidad v2 (legacy congelado)
REVISION = os.path.join(RAIZ, 'lotes', 'revision-dataset.json')
BACKUP_DIR = os.path.join(RAIZ, 'scripts', 'backups')


def norm(s):
    return re.sub(r'\s+', ' ', str(s)).strip().lower()


def main():
    solo_check = '--check' in sys.argv
    if not os.path.exists(REVISION):
        print('⚠️  no hay revisión del dataset (lotes/revision-dataset.json)')
        return 0
    rev = json.load(open(REVISION, encoding='utf-8'))
    data = json.load(open(DATA, encoding='utf-8'))
    pool = data['preguntas']
    por_id = {q['id']: q for q in pool}

    retirar, corregir, sin_match = [], [], []
    for r in rev.get('preguntas', []):
        q = por_id.get(r.get('id'))
        if not q:
            sin_match.append((r.get('id'), r.get('estado')))
            continue
        if r.get('estado') == 'rechazada':
            retirar.append(q)
        elif r.get('estado') == 'aprobada' and r.get('editada'):
            cambios = 0
            if r.get('pregunta') and norm(r['pregunta']) != norm(q['pregunta']):
                q['pregunta'] = r['pregunta']; cambios += 1
            if r.get('opciones') and norm(r['opciones']) != norm(q['opciones']):
                q['opciones'] = list(r['opciones']); cambios += 1
            if r.get('indice_correcta') is not None and r['indice_correcta'] != q['indice_correcta']:
                q['indice_correcta'] = r['indice_correcta']; cambios += 1
            if r.get('explicacion') and norm(r['explicacion']) != norm(q['explicacion']):
                q['explicacion'] = r['explicacion']; cambios += 1
            if cambios:
                q['respuesta'] = q['opciones'][q['indice_correcta']]
                corregir.append((q, cambios))

    print(f'📝 revisión dataset: {len(rev.get("preguntas", []))} filas · '
          f'retirar {len(retirar)} · corregir {len(corregir)}')
    for q in retirar:
        print(f'   RETIRAR {q["id"]} [{q.get("area")}]: {q["pregunta"][:60]}')
    for q, c in corregir:
        print(f'   CORREGIR {q["id"]} ({c} campos): {q["pregunta"][:60]}')
    for qid, est in sin_match:
        print(f'   ⚠️  no está en el pool: {qid} ({est})')

    if solo_check or not (retirar or corregir):
        return 0

    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = os.path.join(BACKUP_DIR, f'preguntas-{ts}.json')
    shutil.copy2(DATA, backup)
    ids_retirar = {q['id'] for q in retirar}
    data['preguntas'] = [q for q in pool if q['id'] not in ids_retirar]
    ver = [int(x) for x in str(data['meta'].get('version', '4.0.0')).split('.')]
    ver[2] += 1
    data['meta'] = {
        'total': len(data['preguntas']),
        'version': '.'.join(map(str, ver)),
        'fuente': 'enciclopedia',
        'qa': f'{datetime.now():%Y-%m-%d} panel dataset aplicado '
              f'(retiradas {len(retirar)} + corregidas {len(corregir)})',
    }
    json.dump(data, open(DATA, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(f'✅ aplicado → {DATA} (backup: {backup}) · total {len(data["preguntas"])} · v{data["meta"]["version"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
