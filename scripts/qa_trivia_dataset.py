#!/usr/bin/env python3
"""QA de redacción del dataset de la Trivia JuegaHipHop (preguntas.json).

Uso:
    python scripts/qa_trivia_dataset.py [ruta a preguntas.json]
    (default: E:\\dev\\JuegaHipHop\\Trivia\\src\\data\\preguntas.json)

Detecta los problemas de la auditoría ago-2026:
  1. Truncamientos "…" en respuesta / opciones / explicación
  2. Duplicados (pregunta, id, opciones entre sí)
  3. indice_correcta fuera de rango o desalineado con la respuesta
  4. Campos vacíos
  5. Espacio antes de coma/punto ("flow ," / "headspin ." — artefactos markdown)
  6. Prefijos "Término: ¿…?" redundantes (el prefijo repite el tema de la pregunta)
  7. Opciones kilométricas (>300c) en preguntas "qué"
  8. Respuesta que delata (contenida en la pregunta)
  9. Explicaciones truncadas a mitad de frase (sin punto final)
 10. Distribución por área / nivel
"""
import collections
import json
import re
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else r"E:\dev\JuegaHipHop\Trivia\src\data\preguntas.json"

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

preguntas = data["preguntas"] if isinstance(data, dict) else data
print(f"TOTAL: {len(preguntas)}", end="")
if isinstance(data, dict) and "meta" in data:
    print(f" | meta.total: {data['meta'].get('total')}  ← ¡desfase si no coincide!", end="")
print()


def norm(s):
    return re.sub(r"\s+", " ", s).strip().lower()


def trunc(s):
    return "…" in s or "..." in s


# 1. Truncamientos
resp_trunc = [q for q in preguntas if trunc(q["respuesta"])]
opc_trunc = [q for q in preguntas if any(trunc(o) for o in q["opciones"])]
exp_trunc = [q for q in preguntas if q["explicacion"].rstrip().endswith("…")]
exp_sin_punto = [q for q in preguntas if not re.search(r"[.!?…]\s*$", q["explicacion"].rstrip())]
print(f"[1] TRUNCADOS '…': respuesta={len(resp_trunc)} | opciones (preguntas)={len(opc_trunc)} "
      f"| explicación termina '…'={len(exp_trunc)} | explicación sin punto final={len(exp_sin_punto)}")

# 2. Duplicados
vistos = collections.defaultdict(list)
for q in preguntas:
    vistos[norm(q["pregunta"])].append(q["id"])
dups = {k: v for k, v in vistos.items() if len(v) > 1}
dup_ids = [i for i, c in collections.Counter(q["id"] for q in preguntas).items() if c > 1]
print(f"[2] DUPLICADOS: pregunta={len(dups)} | id={len(dup_ids)}")

# 3. Alineación indice_correcta
bad = [q["id"] for q in preguntas if not (0 <= q["indice_correcta"] < len(q["opciones"]))]
mis = [q["id"] for q in preguntas
       if 0 <= q["indice_correcta"] < len(q["opciones"])
       and norm(q["opciones"][q["indice_correcta"]]) != norm(q["respuesta"])]
print(f"[3] indice_correcta: fuera de rango={len(bad)} | desalineado={len(mis)}")

# 4. Vacíos
vacio = sum(1 for q in preguntas
            if not q["pregunta"].strip() or not q["respuesta"].strip()
            or any(not o.strip() for o in q["opciones"]))
print(f"[4] campos vacíos: {vacio}")

# 5. Espacio antes de coma/punto (artefactos markdown)
esp = re.compile(r"[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9] [.,]")
textos = set()
for q in preguntas:
    for t in [q["explicacion"]] + q["opciones"] + [q["respuesta"]]:
        if esp.search(t):
            textos.add(t)
print(f"[5] textos con 'palabra ,'/'palabra .': {len(textos)}")

# 6. Prefijos redundantes "Término: ¿…?"
pat = re.compile(r"^([^:¿?]{2,40}):\s*(¿.*)$")


def sig(s):
    return {w for w in re.sub(r"[^a-z0-9áéíóúñü ]", " ", s.lower()).split() if len(w) > 3}


red = []
for q in preguntas:
    m = pat.match(q["pregunta"])
    if not m:
        continue
    sp, sc = sig(m.group(1)), sig(m.group(2))
    ov = sp & sc
    if len(ov) >= 2 and len(ov) / max(len(sp), 1) >= 0.5:
        red.append(q["id"])
print(f"[6] prefijos 'Término: ¿…?' redundantes: {len(red)}")

# 7. Opciones kilométricas en preguntas "qué"
que = [q for q in preguntas if q["tipo"] == "que"]
largas = sum(1 for q in que if max(len(o) for o in q["opciones"]) > 300)
print(f"[7] preguntas 'qué' con opción >300c: {largas}")

# 8. Respuesta delata
delata = [q["id"] for q in preguntas
          if len(norm(q["respuesta"])) >= 8 and norm(q["respuesta"])[:25] in norm(q["pregunta"])]
print(f"[8] respuesta contenida en la pregunta (delata): {len(delata)}")

# 9. Distribución
areas = collections.Counter(q["area"] for q in preguntas)
niv = collections.Counter(q["nivel"] for q in preguntas)
print(f"[9] áreas={dict(sorted(areas.items()))} | nivel={dict(niv)}")
