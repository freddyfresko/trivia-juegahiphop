# -*- coding: utf-8 -*-
"""aplicar-revision.py — aplica las decisiones del panel a preguntas YA integradas.

Para lotes NUEVOS la integración es integrar-lote.py (inserta con dedup).
Para lotes ya integrados (001-003), las decisiones del panel requieren aplicar
directo al dataset:
  - rechazada       → retirar la pregunta del pool (backup previo)
  - aprobada+editada → corregir en sitio (pregunta/opciones/correcta/explicación)
  - aprobada sin edición → nada (ya está en el pool)

Uso:
  python scripts/aplicar-revision.py 1 2 3        # aplica revisiones 001-003
  python scripts/aplicar-revision.py 3            # solo el 003

El match contra el pool es por entrada_id + pregunta original normalizada
(con fallback a la respuesta original normalizada). Backup automático en
scripts/backups/ y bump de versión solo si hubo cambios.
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
        print('uso: python scripts/aplicar-revision.py <lote> [<lote> ...]')
        return 1
    lotes = [int(a) for a in sys.argv[1:] if a.isdigit()]
    data = json.load(open(DATA, encoding='utf-8'))
    pool = data['preguntas']

    retiradas, corregidas, ya_no_estan = [], [], []
    for n in lotes:
        lote_path = os.path.join(LOTES_DIR, f'lote-{n:03d}.json')
        rev_path = os.path.join(LOTES_DIR, f'revision-{n:03d}.json')
        if not (os.path.exists(lote_path) and os.path.exists(rev_path)):
            print(f'⚠️  lote {n}: falta lote/revision, salto')
            continue
        lote = json.load(open(lote_path, encoding='utf-8'))
        rev = json.load(open(rev_path, encoding='utf-8'))
        orig = {i: p for i, p in enumerate(lote['preguntas'])}

        for r in rev['preguntas']:
            it = orig.get(r['idx'])
            if not it:
                continue
            # buscar la pregunta integrada: entrada_id + pregunta original (o respuesta)
            def encontrar():
                for q in pool:
                    if q.get('entrada_id') != it['entrada_id']:
                        continue
                    if norm(q['pregunta']) == norm(it['pregunta']):
                        return q
                    if norm(q['respuesta']) == norm(it['opciones'][it['indice_correcta']]):
                        return q
                return None

            if r.get('estado') == 'rechazada':
                q = encontrar()
                if q:
                    pool.remove(q)
                    retiradas.append((n, q['id'], q['pregunta'][:60]))
                else:
                    ya_no_estan.append((n, r['idx'], it['entrada_id']))
            elif r.get('estado') == 'aprobada' and r.get('editada'):
                q = encontrar()
                if q:
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
                        corregidas.append((n, q['id'], q['pregunta'][:60], cambios))
                else:
                    ya_no_estan.append((n, r['idx'], it['entrada_id']))

    if retiradas or corregidas:
        ts = datetime.now().strftime('%Y%m%d-%H%M%S')
        backup = os.path.join(BACKUP_DIR, f'preguntas-{ts}.json')
        shutil.copy2(DATA, backup)
        ver = [int(x) for x in str(data['meta'].get('version', '4.0.0')).split('.')]
        ver[2] += 1
        data['meta'] = {
            'total': len(pool),
            'version': '.'.join(map(str, ver)),
            'fuente': 'enciclopedia',
            'qa': f'{datetime.now():%Y-%m-%d} revisiones panel aplicadas '
                  f'(retiradas {len(retiradas)} + corregidas {len(corregidas)})',
        }
        data['preguntas'] = pool
        json.dump(data, open(DATA, 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        print(f'✅ retiradas {len(retiradas)} · corregidas {len(corregidas)} → {DATA} (backup: {backup})')
    else:
        print('⚠️  nada que aplicar')

    for n, qid, txt in retiradas:
        print(f'   RETIRADA lote {n} {qid}: {txt}…')
    for n, qid, txt, c in corregidas:
        print(f'   CORREGIDA lote {n} {qid} ({c} campos): {txt}…')
    for n, idx, eid in ya_no_estan:
        print(f'   ⚠️  no encontrada en el pool: lote {n} idx {idx} ({eid})')

    print(f'\nTotal dataset: {len(pool)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
