# -*- coding: utf-8 -*-
"""clasificar-revision.py — valida la matriz W×tipo para el panel de revisión.

Lee JSON por stdin: {preguntas: [{idx, pregunta, entrada_id, termino}],
entradas: {id: {tipo, lugar, termino}}} y devuelve por cada pregunta:
{idx: {w, accion: 'quedar'|'eliminar'|'dudosa', razon}}.

Reusa clasificar() de filtrar-semantica.py y w_de de generar-lote.py:
el panel NO duplica la matriz; este helper es la fuente de verdad.

Uso (lo invoca scripts/servir-revision.mjs):
  python scripts/clasificar-revision.py < payload.json
"""
import importlib.util
import json
import os
import sys

SCRIPTS = os.path.dirname(os.path.abspath(__file__))


def _load(mod_name, fname):
    spec = importlib.util.spec_from_file_location(mod_name, os.path.join(SCRIPTS, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fs = _load('filtrar_semantica', 'filtrar-semantica.py')
gen = _load('generar_lote', 'generar-lote.py')


def main():
    payload = json.load(sys.stdin)
    preguntas = payload.get('preguntas', [])
    entradas = payload.get('entradas', {})
    out = {}
    for p in preguntas:
        e = entradas.get(p.get('entrada_id')) or {}
        w = gen.w_de(p.get('pregunta', ''))
        accion, razon = fs.clasificar(
            {'tipo': w, 'pregunta': p.get('pregunta', ''),
             'termino': p.get('termino') or e.get('termino', '')},
            e)
        out[p['idx']] = {'w': w, 'accion': accion, 'razon': razon}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
