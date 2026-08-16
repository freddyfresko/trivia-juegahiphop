# -*- coding: utf-8 -*-
"""aplicar-reescrituras.py — reemplaza preguntas originales por sus
reescrituras aprobadas del panel (lote de reescrituras tipo 004).

Lee lote-XXX.json + revision-XXX.json y, por pregunta del lote:
  - aprobada con 'id_original' → REEMPLAZA la pregunta del pool con ese id
    por la reescritura (aplicando correcciones del panel si editó) y
    realinea 'respuesta'. El id/metadata original se conserva.
  - aprobada SIN 'id_original' → inserta como pregunta NUEVA (id nuevo).
  - rechazada → la original SE QUEDA (la reescritura no convenció).
  - sin decidir → no toca nada (la original sigue viva).

Uso:
  python scripts/aplicar-reescrituras.py 4

Backup automático en scripts/backups/ + bump de versión si hubo cambios.
"""
import json
import os
import re
import shutil
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, 'src', 'data', 'preguntas.json')
LOTES_DIR = os.path.join(RAIZ, 'lotes')
BACKUP_DIR = os.path.join(RAIZ, 'scripts', 'backups')


def norm(s):
    return re.sub(r'\s+', ' ', str(s)).strip().lower()


def main():
    if len(sys.argv) < 2:
        print('uso: python scripts/aplicar-reescrituras.py <lote> [<lote> ...]')
        return 1
    lotes = [int(a) for a in sys.argv[1:] if a.isdigit()]
    data = json.load(open(DATA, encoding='utf-8'))
    pool = data['preguntas']
    por_id = {q['id']: q for q in pool}
    usado_ids = {int(re.sub(r'\D', '', q['id'])) for q in pool}
    siguiente = (max(usado_ids) + 1) if usado_ids else 1

    reemplazadas, insertadas, no_tocadas = [], [], []
    for n in lotes:
        lote_path = os.path.join(LOTES_DIR, f'lote-{n:03d}.json')
        rev_path = os.path.join(LOTES_DIR, f'revision-{n:03d}.json')
        if not (os.path.exists(lote_path) and os.path.exists(rev_path)):
            print(f'⚠️  lote {n}: falta lote/revision, salto')
            continue
        lote = json.load(open(lote_path, encoding='utf-8'))
        rev = json.load(open(rev_path, encoding='utf-8'))
        revs = {r['idx']: r for r in rev.get('preguntas', [])}
        created_at = datetime.now().astimezone().isoformat()

        for i, it in enumerate(lote['preguntas']):
            r = revs.get(i)
            estado = (r or {}).get('estado')
            if estado != 'aprobada':
                if estado == 'rechazada':
                    no_tocadas.append((n, it['entrada_id'], 'rechazada → se mantiene la original'))
                continue
            # textos finales: correcciones del panel si editó
            final = dict(it)
            if r:
                if r.get('pregunta'):
                    final['pregunta'] = r['pregunta']
                if r.get('opciones'):
                    final['opciones'] = list(r['opciones'])
                if r.get('indice_correcta') is not None:
                    final['indice_correcta'] = r['indice_correcta']
                if r.get('explicacion'):
                    final['explicacion'] = r['explicacion']

            ido = it.get('id_original')
            if ido and ido in por_id:
                q = por_id[ido]
                q['pregunta'] = final['pregunta']
                q['opciones'] = list(final['opciones'])
                q['indice_correcta'] = final['indice_correcta']
                q['explicacion'] = final['explicacion']
                q['respuesta'] = q['opciones'][q['indice_correcta']]
                q['dificultad'] = final.get('dificultad', q.get('dificultad', 2))
                reemplazadas.append((n, ido, q['pregunta'][:60]))
            else:
                nueva = {
                    'id': f'p{siguiente:05d}',
                    'tipo': final.get('tipo', 'que'),
                    'eje': final.get('tipo', 'que'),
                    'operacion': 'recordar',
                    'nivel': final.get('nivel', 'basico'),
                    'dificultad': final.get('dificultad', 2),
                    'pregunta': final['pregunta'],
                    'respuesta': final['opciones'][final['indice_correcta']],
                    'respuesta_corta': False,
                    'explicacion': final['explicacion'],
                    'opciones': list(final['opciones']),
                    'indice_correcta': final['indice_correcta'],
                    'entrada_id': final['entrada_id'],
                    'termino': final.get('termino', ''),
                    'area': final.get('area', ''),
                    'subcategoria': [],
                    'relacionados': [],
                    'source': final.get('fuente') or [],
                    'source_type': 'redactor-llm',
                    'periodo': '', 'lugar': '',
                    'created_at': created_at,
                }
                pool.append(nueva)
                por_id[nueva['id']] = nueva
                siguiente += 1
                insertadas.append((n, nueva['id'], nueva['pregunta'][:60]))

    if reemplazadas or insertadas:
        ts = datetime.now().strftime('%Y%m%d-%H%M%S')
        backup = os.path.join(BACKUP_DIR, f'preguntas-{ts}.json')
        shutil.copy2(DATA, backup)
        ver = [int(x) for x in str(data['meta'].get('version', '4.0.0')).split('.')]
        ver[2] += 1
        data['meta'] = {
            'total': len(pool),
            'version': '.'.join(map(str, ver)),
            'fuente': 'enciclopedia',
            'qa': f'{datetime.now():%Y-%m-%d} reescrituras aplicadas '
                  f'(reemplazadas {len(reemplazadas)} + insertadas {len(insertadas)})',
        }
        data['preguntas'] = pool
        json.dump(data, open(DATA, 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        print(f'✅ reemplazadas {len(reemplazadas)} · insertadas {len(insertadas)} → {DATA} (backup: {backup})')
    else:
        print('⚠️  nada que aplicar')

    for n, qid, txt in reemplazadas:
        print(f'   REEMPLAZADA lote {n} {qid}: {txt}…')
    for n, qid, txt in insertadas:
        print(f'   INSERTADA lote {n} {qid}: {txt}…')
    for n, eid, motivo in no_tocadas:
        print(f'   — {motivo}: {eid}')

    print(f'\nTotal dataset: {len(pool)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
