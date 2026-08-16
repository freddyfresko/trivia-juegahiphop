# -*- coding: utf-8 -*-
"""Arreglo de redacción del dataset de la Trivia — QA 2026-08-16.

Corrige los bugs de fábrica del generador (ver `generar_trivia.py` de la
Enciclopedia HH): texto truncado a mitad de frase con '…', paréntesis
abiertos sin cerrar, espacios antes de puntuación (restos de markdown),
respuestas '¿Dónde…?' rotas por el corte ciego de 32 chars, explicaciones
cortadas a 340 chars y opciones kilométricas (hasta 700 chars).

Estrategia: reconstruir desde la fuente canónica (dist/enciclopedia.json de
la Enciclopedia HH) por entrada_id / matching de prefijo, limpiar markdown,
recortar opciones a <=200 chars en límite de oración, y reescrituras
editoriales puntuales (10 redundantes + 3 delatadoras + 1 larga).

Uso:  python scripts/arreglar-dataset.py
Respaldo automático en scripts/backups/. Idempotente.
"""
import json
import os
import re
import shutil
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, 'src', 'data', 'preguntas.json')
ENCICLOPEDIA = r'E:\dev\JuegaHipHop\Enciclopedia HH\dist\enciclopedia.json'
BACKUP_DIR = os.path.join(RAIZ, 'scripts', 'backups')

MAX_OPCION = 200  # recorte de opciones en límite de oración


# ─── utilidades de texto ────────────────────────────────────────────────
def limpiar(t):
    """Espacios, markdown sobrante, espacios antes de puntuación."""
    if not t:
        return ''
    t = str(t)
    t = re.sub(r'\s*\(ver[^)]*\)', '', t)          # "(ver `a`, `b`)" leftovers
    t = re.sub(r'[*`_]', '', t)                    # cursivas/negritas markdown
    t = re.sub(r' ([,.!?;:])', r'\1', t)           # "flow ," → "flow,"
    t = re.sub(r'\s{2,}', ' ', t)
    t = t.replace('..', '.').replace(' .', '.')
    return t.strip(' ')


def norm(t):
    """Normalización para matching: minúsculas, sin puntuación ni acentos."""
    t = limpiar(t or '').lower()
    t = re.sub(r'[^a-z0-9 ]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def cortar_oracion(texto, max_len=MAX_OPCION):
    """Corta en un límite natural (oración > coma/dos puntos) cerca de max_len.

    Usa ventana extendida (max_len+80): si la primera oración termina poco
    después de max_len, se deja COMPLETA (nunca se parte a la mitad).
    Nunca corta dentro de paréntesis; '…' solo como último recurso.
    """
    texto = limpiar(texto)
    if len(texto) <= max_len:
        return texto
    ventana = texto[: max_len + 80]

    def cortar_en(pos):
        t = ventana[:pos].strip()
        # no dejar paréntesis abierto: retroceder hasta antes del último '(' abierto
        while t.count('(') > t.count(')'):
            idx = t.rfind('(')
            if idx < 0:
                break
            t = t[:idx].rstrip(' ,;:')
        return t

    # 1. límites de oración (punto tras minúscula/dígito — no 'EE. UU.'),
    #    incluyendo el punto FINAL del texto (fix QA 2026-08-16)
    ms = list(re.finditer(r'(?<=[a-záéíóúñ0-9»”])[.!?](?:[\s»”]?\s+(?=[A-ZÁÉÍÓÚÑ¿¡«“(])|$)', ventana))
    for m in ms:
        if m.start() >= 120:
            r = cortar_en(m.start() + 1)
            if r:
                return r
    # 2. primer límite de oración más temprano (≥40)
    for m in ms:
        if m.start() >= 40:
            r = cortar_en(m.start() + 1)
            if r:
                return r
    # 3. primera coma/punto y coma/dos puntos (≥40)
    mc = list(re.finditer(r'[,;:]\s+', ventana))
    for m in mc:
        if m.start() >= 40:
            r = cortar_en(m.start())
            if r:
                return r
    # 4. último recurso: ventana estricta + '…'
    trozo = texto[:max_len]
    if ' ' in trozo:
        trozo = trozo.rsplit(' ', 1)[0]
    trozo = trozo.rstrip('.,;:')
    return trozo + '…'


def lugar_respuesta(lugar):
    """Lugar → respuesta 'En …' (versión arreglada: sin corte ciego de 32).

    - "(origen); mundial", "(origen)", "; mundial" → se quitan
    - paréntesis → coma (los detalles se integran como segmento)
    - listas de ciudades → primeros 2 segmentos
    - lugares 'Mundial …' sin geografía → 'En todo el mundo'
    """
    l = limpiar(str(lugar))
    if not l:
        return None
    l = re.sub(r'\([^)]*origen[^)]*\)', '', l, flags=re.IGNORECASE)
    l = re.sub(r';.*$', '', l)
    l = re.sub(r'\(', ', ', l).replace(')', '')
    l = re.sub(r'\s+en origen\b', '', l, flags=re.IGNORECASE)
    l = re.sub(r'\s+orígenes? del sonido\b', '', l, flags=re.IGNORECASE)
    seg = re.split(r',\s*', l)
    if len(seg) > 2:
        l = ', '.join(seg[:2])
    l = limpiar(l).strip('()')
    if not l:
        return None
    if re.match(r'^mundial\b', l, re.IGNORECASE):
        return 'En todo el mundo'
    if l.lower().startswith('en '):
        return l
    return f'En {l}'


def lugar_completo(lugar):
    """Lugar completo (sin recorte de segmentos) para distractores 'donde'."""
    l = limpiar(str(lugar))
    if not l:
        return None
    l = re.sub(r'\([^)]*origen[^)]*\)', '', l, flags=re.IGNORECASE)
    l = re.sub(r';.*$', '', l)
    l = re.sub(r'\(', ', ', l).replace(')', '')
    l = re.sub(r'\s+en origen\b', '', l, flags=re.IGNORECASE)
    l = re.sub(r'\s+orígenes? del sonido\b', '', l, flags=re.IGNORECASE)
    l = limpiar(l).strip('()')
    if not l:
        return None
    if re.match(r'^mundial\b', l, re.IGNORECASE):
        return 'En todo el mundo'
    if l.lower().startswith('en '):
        return l
    return f'En {l}'


def recortar_sujeto(texto, termino):
    """'El Click es un sonido…' → 'es un sonido…' (el término ya está en la pregunta)."""
    t = re.escape(limpiar(termino))
    pat = re.compile(rf'^(?:el|la|los|las)\s+{t}\s+(es|son|fue|fueron|era|eran|es\s+un|es\s+una)\s+', re.IGNORECASE)
    m = pat.match(texto)
    if m:
        resto = texto[m.end():]
        if len(resto) >= 12:
            return texto[: m.start()] + resto  # sin el sujeto, conserva la cópula
    return texto


# ─── carga ──────────────────────────────────────────────────────────────
with open(DATA, encoding='utf-8') as f:
    data = json.load(f)
preguntas = data['preguntas']

with open(ENCICLOPEDIA, encoding='utf-8') as f:
    enc = json.load(f)
entries = enc if isinstance(enc, list) else enc.get('entradas', enc.get('entries', []))
por_id = {e['id']: e for e in entries}

print(f"preguntas: {len(preguntas)} · entradas enciclopedia: {len(entries)}")

# ─── pools de reconstrucción ────────────────────────────────────────────
pool_desc = []   # (texto, entrada_id, campo)
pool_lugar = []  # (lugar_crudo, entrada_id) — sin recorte, para matchear opciones rotas
for e in entries:
    for campo in ('descripcion', 'importancia', 'dato_clave'):
        t = limpiar(e.get(campo, ''))
        if len(t) >= 24:
            pool_desc.append((t, e['id'], campo))
    for pm in (e.get('preguntas') or []):
        if isinstance(pm, dict) and pm.get('respuesta'):
            t = limpiar(pm['respuesta'])
            if len(t) >= 24:
                pool_desc.append((t, e['id'], 'manual'))
    lc = limpiar(e.get('lugar', ''))
    if len(lc) >= 8:
        pool_lugar.append((lc, e['id']))
print(f"pool descripciones: {len(pool_desc)} · pool lugares crudos: {len(pool_lugar)}")


def buscar_pool(texto_visible, pool):
    """Busca en el pool el texto completo cuyo inicio coincide con el visible."""
    pref = norm(texto_visible)
    if len(pref) < 20:
        return None
    cands = [t for t, *_ in pool if norm(t).startswith(pref)]
    if not cands:
        cands = [t for t, *_ in pool if pref in norm(t) and norm(t).find(pref) <= 40]
    if not cands:
        return None
    cands.sort(key=len)
    return cands[0]


def buscar_pool_lugar(texto_visible):
    """Opción 'donde' rota → lugar crudo que la contenga → lugar completo."""
    pref = norm(texto_visible)
    if pref.startswith('en '):
        pref = pref[3:]
    if len(pref) < 20:
        return None
    mejores = []
    for lc, eid in pool_lugar:
        n = norm(lc)
        idx = n.find(pref)
        if idx >= 0 and idx <= 60:
            mejores.append((idx, len(n), lc))
    if not mejores:
        return None
    mejores.sort(key=lambda x: (x[0], x[1]))
    return lugar_completo(mejores[0][2])


def esta_roto(t):
    return '…' in t or t.count('(') > t.count(')')


# ═══════════════════════════════════════════════════════════════════════
# PASO 1 — explicaciones desde la enciclopedia (importancia → desc → dato)
# ═══════════════════════════════════════════════════════════════════════
sin_entrada = 0
exp_reconstruidas = 0
exp_por_prefijo = 0
exp_dejadas = 0
for q in preguntas:
    e = por_id.get(q['entrada_id'])
    nueva = None
    if e:
        for campo in ('importancia', 'descripcion', 'dato_clave'):
            t = limpiar(e.get(campo, ''))
            if len(t) >= 24:
                nueva = t
                break
        if nueva:
            exp_reconstruidas += 1
    else:
        sin_entrada += 1
        # intento por prefijo contra el pool
        cand = buscar_pool(q['explicacion'].rstrip('…'), pool_desc)
        if cand:
            nueva = cand
            exp_por_prefijo += 1
        else:
            exp_dejadas += 1
            continue
    q['explicacion'] = nueva

print(f"PASO 1 — explicaciones: reconstruidas por entrada {exp_reconstruidas} · por prefijo {exp_por_prefijo} · sin entrada {sin_entrada} · dejadas {exp_dejadas}")

# ═══════════════════════════════════════════════════════════════════════
# PASO 2 — respuestas '¿Dónde…?' rotas → reconstruir desde el campo `lugar`
# ═══════════════════════════════════════════════════════════════════════
donde_arregladas = 0
for q in preguntas:
    if q['tipo'] != 'donde':
        continue
    if esta_roto(q['respuesta']) or q['respuesta'].startswith('En Mundial'):
        nuevo = lugar_respuesta(q.get('lugar', ''))
        if nuevo:
            q['respuesta'] = nuevo
            q['opciones'][q['indice_correcta']] = nuevo
            donde_arregladas += 1
print(f"PASO 2 — respuestas 'donde' rotas o 'En Mundial' reconstruidas: {donde_arregladas}")

# ═══════════════════════════════════════════════════════════════════════
# PASO 3 — opciones rotas → reconstruir desde pools
# ═══════════════════════════════════════════════════════════════════════
opc_rotas = 0
opc_reconstruidas = 0
opc_sin_fuente = []
origenes = {}  # (qid, i) → texto visible original (para re-buscar en dedup)
for q in preguntas:
    for i, o in enumerate(q['opciones']):
        if not esta_roto(o) and o != 'En Mundial':
            continue
        opc_rotas += 1
        visible = o.rstrip('…').strip()  # norm() ignora paréntesis: no recortar aquí
        origenes[(q['id'], i)] = visible
        # 'En Mundial' suelto (lugar seg[:2] viejo sin '…') → 'En todo el mundo'
        if visible == 'En Mundial':
            nuevo = 'En todo el mundo'
        else:
            # probar lugar primero, luego descripción (las opciones 'En…' pueden ser ambas)
            nuevo = buscar_pool_lugar(visible)
            if not nuevo:
                nuevo = buscar_pool(visible, pool_desc)
        if not nuevo:
            opc_sin_fuente.append((q['id'], i, o[:60]))
            continue
        # si la opción es la correcta, alinear con la respuesta
        if i == q['indice_correcta']:
            q['respuesta'] = nuevo
        q['opciones'][i] = nuevo
        opc_reconstruidas += 1
print(f"PASO 3 — opciones rotas: {opc_rotas} → reconstruidas {opc_reconstruidas} · sin fuente {len(opc_sin_fuente)}")


def lugar_alternativo(excl):
    """Primer lugar del pool cuyo resultado no esté en excl (dedup de distractores)."""
    for lc, eid in pool_lugar:
        r = lugar_completo(lc)
        if r and norm(r) not in excl:
            return r
    return None


# PASO 3b — dedup: reconstruir opciones repetidas con otro candidato del pool
# Regla: NUNCA se reemplaza la opción correcta — solo los distractores duplicados.
dedup = 0
for q in preguntas:
    opc_norm = [norm(o) for o in q['opciones']]
    grupos = {}
    for i, n in enumerate(opc_norm):
        if opc_norm.count(n) > 1:
            grupos.setdefault(n, []).append(i)
    for n, idxs in grupos.items():
        if q['indice_correcta'] in idxs:
            idxs = [i for i in idxs if i != q['indice_correcta']]
        else:
            idxs = idxs[1:]
        for i in idxs:
            o = q['opciones'][i]
            vis = origenes.get((q['id'], i), o)
            excl = set(opc_norm)
            excl.discard(n)
            nuevo = None
            if vis == 'En Mundial' or (vis.startswith('En ') and len(vis) <= 40):
                nuevo = lugar_alternativo(excl)
            else:
                cands = [t for t, *_ in pool_desc if norm(t).startswith(norm(vis))]
                if not cands:
                    cands = [t for t, *_ in pool_desc if norm(vis) in norm(t) and norm(t).find(norm(vis)) <= 40]
                for t in cands:
                    if norm(t) not in excl:
                        nuevo = t
                        break
            if nuevo and norm(nuevo) not in excl and norm(nuevo) != n:
                q['opciones'][i] = nuevo
                dedup += 1
print(f"PASO 3b — opciones duplicadas reemplazadas: {dedup}")

# ═══════════════════════════════════════════════════════════════════════
# PASO 4 — recorte de sujeto en opciones reconstruidas (¿Qué es X? → no repetir X)
# ═══════════════════════════════════════════════════════════════════════
sujetos_recortados = 0
for q in preguntas:
    termino = limpiar(q.get('termino', ''))
    if not termino or len(termino) < 3:
        continue
    if not re.match(r'^¿qué\s', q['pregunta'], re.IGNORECASE):
        continue
    for i, o in enumerate(q['opciones']):
        nuevo = recortar_sujeto(o, termino)
        if nuevo != o:
            if i == q['indice_correcta']:
                q['respuesta'] = nuevo
            q['opciones'][i] = nuevo
            sujetos_recortados += 1
print(f"PASO 4 — sujetos recortados (no delatar el término): {sujetos_recortados}")

# ═══════════════════════════════════════════════════════════════════════
# PASO 5 — limpieza global de TODOS los textos
# ═══════════════════════════════════════════════════════════════════════
for q in preguntas:
    q['pregunta'] = limpiar(q['pregunta'])
    q['respuesta'] = limpiar(q['respuesta'])
    q['explicacion'] = limpiar(q['explicacion'])
    q['opciones'] = [limpiar(o) for o in q['opciones']]
    if q.get('pista'):
        q['pista'] = limpiar(q['pista'])

# ═══════════════════════════════════════════════════════════════════════
# PASO 6 — recorte de opciones + respuestas a MAX_OPCION en límite de oración
# ═══════════════════════════════════════════════════════════════════════
recortadas = 0
for q in preguntas:
    for i, o in enumerate(q['opciones']):
        nuevo = cortar_oracion(o)
        if nuevo != o:
            if i == q['indice_correcta']:
                q['respuesta'] = nuevo
            q['opciones'][i] = nuevo
            recortadas += 1
print(f"PASO 6 — opciones recortadas a {MAX_OPCION} chars: {recortadas}")

# ═══════════════════════════════════════════════════════════════════════
# PASO 7 — reescrituras editoriales (redundantes + delatadoras + largas)
# ═══════════════════════════════════════════════════════════════════════
REWRITES_PREGUNTA = {
    # redundantes: el prefijo repite el término de la pregunta
    'p00465': '¿Qué fue la explosión del hip hop chileno en los 2010?',
    'p00302': '¿Qué es el mouth drum?',
    'p00492': '¿Qué fue la batalla del Lincoln Center?',
    'p00303': '¿Qué sonidos componen la batería bucal?',
    'p00322': '¿Qué es un drum break?',
    'p00323': '¿Qué diferencia hay entre break, breakbeat y drum break?',
    'p00464': '¿Qué fue el rap conciente chileno de los 2000?',
    'p00170': '¿Qué es el estilo de Brooklyn?',
    'p00169': '¿Qué es el estilo del Bronx?',
    'p00292': '¿Qué es un loop en beatbox?',
    # larga: repite la fecha y el lugar en el prefijo
    'p00003': '¿Qué fiesta se celebró el 11 de agosto de 1973 en el Bronx?',
}

# delatadoras: la respuesta empieza repitiendo el término de la pregunta
REWRITES_RESPUESTA = {
    'p00784': (r'^La batalla del Lincoln Center fue un ', 'Un '),
    'p00771': (r'^la red de ', 'La red de '),  # el recorte de sujeto dejó artículo en minúscula
    'p00763': (r'^El Hip Hop de Medio Oriente reúne las escenas de rap en árabe, persa, turco y hebreo ',
               'Un conjunto de escenas de rap en árabe, persa, turco y hebreo '),
}

for qid, nueva in REWRITES_PREGUNTA.items():
    q = next((q for q in preguntas if q['id'] == qid), None)
    if q:
        q['pregunta'] = nueva

for qid, (pat, repl) in REWRITES_RESPUESTA.items():
    q = next((q for q in preguntas if q['id'] == qid), None)
    if q:
        nueva_resp = re.sub(pat, repl, q['respuesta'])
        q['respuesta'] = nueva_resp
        q['opciones'][q['indice_correcta']] = nueva_resp

# Capitalizar artículos iniciales en minúscula (restos del recorte de sujeto)
cap_articulos = 0
for q in preguntas:
    if re.match(r'^(la|el|los|las)\s+', q['respuesta']):
        nueva = q['respuesta'][0].upper() + q['respuesta'][1:]
        if nueva != q['respuesta']:
            q['respuesta'] = nueva
            q['opciones'][q['indice_correcta']] = nueva
            cap_articulos += 1
print(f"PASO 7 — respuestas con artículo capitalizado: {cap_articulos}")

# ─── PASO 7b — dedup FINAL post-recorte (el recorte a 200 puede re-crear duplicados) ───
# Regla: NUNCA se reemplaza la opción correcta — solo los distractores duplicados.
dedup_final = 0
for q in preguntas:
    opc_norm = [norm(o) for o in q['opciones']]
    grupos = {}
    for i, n in enumerate(opc_norm):
        if opc_norm.count(n) > 1:
            grupos.setdefault(n, []).append(i)
    for n, idxs in grupos.items():
        if q['indice_correcta'] in idxs:
            idxs = [i for i in idxs if i != q['indice_correcta']]
        else:
            idxs = idxs[1:]
        for i in idxs:
            o = q['opciones'][i]
            vis = origenes.get((q['id'], i), o)
            excl = set(opc_norm)
            excl.discard(n)  # se busca un texto distinto de todos los usados
            nuevo = None
            if vis == 'En Mundial' or (vis.startswith('En ') and len(vis) <= 40):
                nuevo = lugar_alternativo(excl)
            else:
                cands = [t for t, *_ in pool_desc
                         if norm(t).startswith(norm(vis)) or (norm(vis) in norm(t) and norm(t).find(norm(vis)) <= 40)]
                for t in cands:
                    rt = cortar_oracion(t) if len(t) > MAX_OPCION else t
                    if norm(rt) not in excl:
                        nuevo = t
                        break
            if not nuevo:
                part = (o.split()[0] if o.split() else '').lower()
                for t, *_ in pool_desc:
                    if len(t) >= 40 and (t.split()[0] if t.split() else '').lower() == part and norm(t) not in excl:
                        nuevo = t
                        break
            if nuevo:
                nf = cortar_oracion(nuevo) if len(nuevo) > MAX_OPCION else nuevo
                if norm(nf) not in excl and norm(nf) != n:
                    q['opciones'][i] = nf
                    dedup_final += 1
print(f"PASO 7b — dedup final post-recorte: {dedup_final}")

# ═══════════════════════════════════════════════════════════════════════
# PASO 8 — meta + validación final
# ═══════════════════════════════════════════════════════════════════════
data['meta'] = {**data.get('meta', {}), 'total': len(preguntas),
                'version': '4.0.1', 'qa': '2026-08-16 arreglo redaccion'}

problemas = []
if len({q['id'] for q in preguntas}) != len(preguntas):
    problemas.append('IDs duplicados')
for q in preguntas:
    if not (0 <= q['indice_correcta'] < len(q['opciones'])):
        problemas.append(f"{q['id']}: índice fuera de rango")
        continue
    if limpiar(q['opciones'][q['indice_correcta']]) != limpiar(q['respuesta']):
        problemas.append(f"{q['id']}: opción correcta ≠ respuesta")
    for campo, t in (('pregunta', q['pregunta']), ('respuesta', q['respuesta']),
                     ('explicacion', q['explicacion'])):
        if esta_roto(t):
            problemas.append(f"{q['id']} [{campo}]: texto roto '…'")
        if t.count('(') != t.count(')'):
            problemas.append(f"{q['id']} [{campo}]: paréntesis desbalanceado")
    if re.search(r' ([,.])', q['pregunta'] + q['respuesta'] + q['explicacion'] + ' '.join(q['opciones'])):
        problemas.append(f"{q['id']}: espacio antes de puntuación")
    for o in q['opciones']:
        if esta_roto(o):
            problemas.append(f"{q['id']}: opción rota")
            break
    if not q['pregunta'].endswith('?'):
        problemas.append(f"{q['id']}: pregunta sin '?'")

print(f"\nValidación: {len(problemas)} problemas")
for p in problemas[:30]:
    print('  ⚠', p)

# ─── reporte de no-resueltos ───
print(f"\nOpciones rotas sin fuente ({len(opc_sin_fuente)}):")
for qid, i, o in opc_sin_fuente:
    print(f"  {qid}[{i}]: {o}")

# ═══════════════════════════════════════════════════════════════════════
# PASO 9 — backup + escribir
# ═══════════════════════════════════════════════════════════════════════
os.makedirs(BACKUP_DIR, exist_ok=True)
stamp = datetime.now().strftime('%Y-%m-%d')
backup = os.path.join(BACKUP_DIR, f'preguntas-{stamp}-pre-arreglo.json')
shutil.copy2(DATA, backup)
with open(DATA, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(f"\n✔ Dataset escrito: {DATA}")
print(f"✔ Backup: {backup}")
