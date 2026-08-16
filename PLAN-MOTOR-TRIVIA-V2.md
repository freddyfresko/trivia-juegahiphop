# Motor de Trivia v2 — "El conocimiento se entiende o no se usa"

> **Para Hermes:** este plan es AUTO-CONTENIDO. Ejecútalo tarea por tarea en una sesión nueva leyendo este archivo. No improvises fuera de las fases; cuando una fase pida la aprobación de Freddy, PÁRATE y muéstrale resultados.

**Goal:** Reemplazar el motor de generación por plantilla (que produce preguntas absurdas tipo "¿Dónde apareció el mastering?") por un motor que entiende la semántica de cada término, redacta preguntas humanas (no robotizadas), valida en 3 capas (reglas → LLM-juez → Freddy) y selecciona preguntas con telemetría real.

**Architecture:** Enciclopedia HH (fuente, 333 entradas con `tipo`) → generación guiada por tipo semántico (agente LLM + plantillas validadas) → validación automática (reglas duras + LLM-as-judge) → curaduría humana (Freddy aprueba lotes) → dataset de la Trivia + telemetría de aciertos para ajustar dificultad y detectar preguntas malas.

**Tech Stack:** Python 3 (scripts en `E:\dev\JuegaHipHop\Enciclopedia HH\scripts\` y `E:\dev\JuegaHipHop\Trivia\scripts\`), JSON (dataset), agente Hermes con LLM para redacción/validación, sin nuevas dependencias de runtime.

---

## 1. Contexto: qué tenemos hoy (medido)

**Síntoma que reportó Freddy (ago-2026):** "NO SE PUEDE UTILIZAR EL CONOCIMIENTO DEL HIP HOP SIN ENTENDERLO". Ejemplos reales del dataset actual:

- `¿En qué lugar surgió el hip hop chileno en los años 2010?` → "En Chile" (movimiento de época: circular/absurda)
- `¿Qué es el juez?` → sin contexto (¿juez de qué? — juzgado de policía local)
- `¿Dónde apareció el mastering (Masterización)?` → "En todo el mundo" (un proceso no "aparece" en un lugar)

**Diagnóstico técnico (dry-run verificado):**
- El generador (`generar_trivia.py`) decide la W (qué/quien/dónde/cuándo…) por patrones de texto, IGNORANDO el campo `tipo` de la entrada (persona, técnica, concepto, movimiento, instrumento…).
- Cruces absurdos medidos en el dataset: `¿Dónde? × técnica` (51), `¿Dónde? × concepto abstracto` (69), `¿Cuándo? × técnica` (56), `¿Dónde/¿Cuándo? × movimiento de época` (~30), `¿Qué es X?` genérica sin contexto cuando existe versión con contexto.
- Filtro conservador probado en dry-run: **144 absurdas eliminadas de 1275 → quedan 1127** (reglas: verbo de origen "surgió/apareció/nació" + proceso → fuera; concepto abstracto puro → fuera; movimiento de época → fuera; "¿Qué es el juez?" genérica → fuera si existe "¿Qué es el juez en el breaking?").
- OJO: el `¿Dónde?` POSICIONAL es válido y NO se toca: "¿Dónde se toca el hi-hat en el patrón clásico?" (posición en el compás) — la regla debe mirar el VERBO, no solo la W.

**Ya resuelto (no repetir):** redacción/truncamientos/paréntesis del dataset (script `Trivia\scripts\arreglar-dataset.py`, dataset v4.0.1), 8 fixes de texto en `generar_trivia.py`. Lo que queda es el problema SEMÁNTICO: preguntas malas.

---

## 2. Investigación: cómo lo hacen los principales juegos de trivia

| Fuente | Cómo funciona | Lección para nosotros |
|---|---|---|
| **Kahoot!** | Preguntas ≤120 chars, respuestas ≤75 chars, 2-6 opciones, generación con IA + import de PDFs, banco comunitario moderado, feedback post-respuesta | **Límites de longitud estrictos** (nuestras opciones de 200-280 chars son kilométricas). Pregunta corta + opciones cortas |
| **HQ Trivia** | Equipo de escritores especializados + **fact-checkers verifican CADA pregunta** (~50 filtros internos). Los distractores son la parte más difícil: "indisputablemente incorrectos pero lo bastante ingeniosos para engañar". Reverse-engineering: escribir la respuesta primero. Evitan zonas grises ("no es incorrecto pero se debate"). 10s/pregunta | **Human-in-the-loop obligatorio**: nada entra sin revisión humana. Los distractores se diseñan, no se reciclan. Cero ambigüedad debatible |
| **Trivia Crack / QuizUp** | Contenido curado por categorías + UGC con moderación automática y revisión manual | Metadata por categoría/área para selección y dificultad |
| **Item writing académico (NBME/Pressbooks/Articulate)** | Stem = pensamiento completo y claro; 1 mejor respuesta; distractores plausibles pero incorrectos; opciones de longitud y gramática PARALELAS; sin pistas gramaticales (a/an, singular/plural); sin absolutos ("siempre/nunca"); sin "todas las anteriores"; un solo pensamiento por pregunta; **revisión por experto (SME)** | Checklist de calidad aplicable a CADA pregunta antes de publicar |
| **LLM AQG (generación automática de preguntas, literatura 2024-25)** | La generación con LLM escala, pero la EVALUACIÓN es el cuello de botella: sin validación produce basura. Patrón dominante: LLM genera candidatos → evaluación automática (reglas + LLM-as-judge) → **los distractores se proponen a escritores humanos** (nunca directo) | El agente redacta, los scripts validan, FREDDY aprueba. LLM-as-judge con rúbrica explícita para "¿tiene sentido?", "¿es ambigua?", "¿delata?" |

**Las 6 lecciones que definen el diseño:**
1. **El tipo de entrada manda** — cada tipo (persona, técnica, evento, obra, lugar…) tiene Ws válidas. Un proceso nunca "surge en un lugar".
2. **Human-in-the-loop** — HQ fact-checkea todo; la academia exige SME review. Freddy es el SME.
3. **Preguntas cortas, opciones cortas, paralelas** — longitud y gramática uniformes, sin pistas.
4. **Distractores diseñados, no reciclados** — plausibles pero claramente incorrectos, del mismo dominio.
5. **Validación en capas** — reglas duras → LLM-juez → humano. Ninguna capa sola basta.
6. **Telemetría de aciertos** — una pregunta que todo el mundo falla puede ser mala (ambigua), no difícil.

---

## 3. Diseño: Motor de Trivia v2

### 3.1 Matriz semántica W × tipo de entrada (el "entendimiento")

Cada entrada de la enciclopedia tiene `tipo`. El motor solo genera las W válidas para ese tipo:

| Tipo de entrada | Ws VÁLIDAS | Ws PROHIBIDAS (generan absurdos) |
|---|---|---|
| persona | quién, dónde (nació/se formó), cuándo (nació), qué (logros) | — |
| grupo / crew / organización / equipo | quién, dónde (se formó), cuándo (se fundó), qué | — |
| evento / acontecimiento / competencia | qué, cuándo (ocurrió), dónde (ocurrió), quién (ganó) | — |
| lugar | dónde (está), qué | — |
| movimiento (regional, con lugar real) | qué, cuándo (surgió), dónde (surgió) | — |
| movimiento de ÉPOCA ("…en los años 2010") | qué, por_qué, para_qué | dónde, cuándo (circular) |
| subgénero (escena con lugar) | qué, cuándo, dónde | — |
| técnica / proceso | qué, cómo, para_qué, por_qué | **dónde, cuándo** (un proceso no "surge en un lugar") |
| instrumento / equipo técnico | qué, cuándo (se creó/fabricó) | dónde (con verbo surgió), cuándo con verbo débil |
| concepto abstracto puro (flow, respeto, autoexpresión…) | qué, por_qué, para_qué | **dónde, cuándo** |
| concepto con lugar real (escena: "hip hop chileno") | qué, dónde, cuándo | — |
| canción / álbum / mixtape / película / documental | qué, quién (autor), cuándo (salió/estrenó) | dónde (con verbo surgió) |
| término genérico ("juez", "toy") | qué **CON contexto** ("¿Qué es el juez en el breaking?") | qué sin contexto ("¿Qué es el juez?") |

**Regla del verbo:** para `¿Dónde…?` y `¿Cuándo…?` solo verbos de origen geográfico-temporal (surgió/apareció/nació/se fundó) activan la prohibición. El `¿Dónde…?` posicional ("¿Dónde se toca el hi-hat?") SIEMPRE es válido.

### 3.2 Pipeline de generación (roles)

```
Enciclopedia HH (entrada + tipo + lugar + periodo)
        │
        ▼
[1] REDACTOR (agente Hermes / LLM con prompt de estilo)
        │  genera preguntas VÁLIDAS para el tipo, redactadas humanas
        │  (1 correcta + 3 distractores diseñados, ~40-90 chars)
        ▼
[2] VALIDADOR AUTOMÁTICO (scripts Python — reglas duras)
        │  estructura, longitud, paralelismo, ortografía, sin pistas,
        │  sin absolutos, W×tipo, respuesta respaldada por la fuente (grounding)
        ▼
[3] LLM-JUEZ (segunda pasada del LLM con rúbrica 1-5)
        │  ¿tiene sentido? ¿es ambigua? ¿los distractores son plausibles
        │  pero incorrectos? ¿la pregunta delata la respuesta?
        │  umbral: puntaje >= 4/5 o la pregunta se reescribe/descarta
        ▼
[4] CURADOR (Freddy — revisa LOTES, nunca pregunta por pregunta)
        │  aprueba / rechaza / corrige; el feedback alimenta el prompt del redactor
        ▼
[5] INTEGRADOR (script) → dataset + metadata (tema, dificultad, fuente)
```

### 3.3 Estándar de pregunta (checklist por pregunta — inspirado en HQ + academia)

- [ ] Stem: pensamiento completo, claro, UNA sola idea, sin "not"/negaciones
- [ ] Longitud: pregunta ≤ 140 chars · opciones 40-90 chars (ideal Kahoot: ≤120/75)
- [ ] 4 opciones, longitud y gramática PARALELAS (misma partícula inicial)
- [ ] 1 respuesta correcta inequívoca; 3 distractores plausibles pero claramente incorrectos, del mismo dominio
- [ ] Sin pistas: no repetir el término de la pregunta en la correcta, sin a/an, sin longitudes dispares
- [ ] Sin absolutos ("siempre", "nunca", "solo")
- [ ] Redacción humana chilena: nada de "Sobre «X»: ¿…?", nada de ficha técnica, nada de prefijo "Término:"
- [ ] Respuesta respaldada por la entrada (fuente citada en la pregunta del dataset)
- [ ] La explicación post-respuesta enseña (ya existe en la UI — se conserva)

### 3.4 Selección de juego y telemetría

- Pool por área (12 áreas) + dificultad derivada del tipo de operación cognitiva.
- **Telemetría nueva**: % de aciertos global por pregunta en el lobby (Supabase). Reglas:
  - aciertos < 20% → marcar "sospechosa" (posible ambigüedad/mala) → cuarentena para revisión
  - aciertos > 95% → candidata a dificultad mayor o reemplazo
- Selección adaptativa existente (debilidades) se conserva.

---

## 4. Plan de ejecución (tareas bite-sized)

> Orden estricto. Cada fase termina con verificación y (si aplica) aprobación de Freddy. Trabajar en `E:\dev\JuegaHipHop\Trivia` y `E:\dev\JuegaHipHop\Enciclopedia HH`.

### FASE 0 — Reconocimiento (30 min)
- [ ] 0.1 Leer `Enciclopedia HH\dist\enciclopedia.json` (333 entradas: campos `tipo`, `lugar`, `periodo`, `subcategoria`, `preguntas` manuales).
- [ ] 0.2 Leer `Trivia\src\data\preguntas.json` (1275 preguntas, meta 4.0.1) y `Trivia\scripts\arreglar-dataset.py` (no re-ejecutar a ciegas; es idempotente).
- [ ] 0.3 Verificar `python --version` (3.10+) en ambos repos.

### FASE 1 — Filtro semántico del dataset actual (2-3 h)
Objetivo: eliminar las absurdas YA EXISTENTES sin tocar las buenas.
- [ ] 1.1 Crear `Trivia\scripts\filtrar-semantica.py` con la matriz 3.1 + regla del verbo (el dry-run ya validó el criterio: 144 eliminadas / 1127 quedan).
- [ ] 1.2 Casos dudosos (hook/bassline: ~4) → lista para decisión manual de Freddy.
- [ ] 1.3 "¿Qué es X?" genérica sin contexto → eliminar si existe versión con contexto (dedup normalizado).
- [ ] 1.4 Backup + aplicar + validar invariantes (mismos checks del QA anterior) + `npm run lint` + `npm run build`.
- [ ] 1.5 **MOSTRAR A FREDDY**: lista de eliminadas (por qué) + muestra de 50 que quedan. Esperar OK.

### FASE 2 — Reglas duras en el generador (2-3 h)
- [ ] 2.1 En `Enciclopedia HH\scripts\generar_trivia.py`: implementar la matriz W×tipo (3.1) como `W_VALIDAS_POR_TIPO` + prohibición por verbo de origen. Las preguntas fuera de la matriz NO se generan.
- [ ] 2.2 Eliminar del pipeline los prefijos "Sobre «X»:" / "Término:" (el LLM redacta la pregunta completa, humana).
- [ ] 2.3 Corrida de prueba a archivo temporal (como en el QA anterior) + validación 12/12 → 0 absurdas de las clases prohibidas.
- [ ] 2.4 Commit en Enciclopedia HH (mensaje descriptivo).

### FASE 3 — Redactor LLM con estilo humano (3-4 h)
Objetivo: generar preguntas NUEVAS de calidad editorial (no plantilla).
- [ ] 3.1 Prompt de redacción (`Trivia\scripts\prompts\redactor.md`): entrada completa + tipo + Ws válidas + estándar 3.3 + ejemplos buenos/malos + estilo chileno humano. Instrucción explícita: prohibido el formato ficha.
- [ ] 3.2 Script `Trivia\scripts\generar-lote.py`: toma N entradas → invoca al LLM del agente (flujo: el AGENTE Hermes redacta el lote con este prompt; el script solo estructura/valida) → salida JSON por lote.
- [ ] 3.3 Lote piloto: 50 preguntas de 5 áreas distintas (10 c/u) + explicaciones.
- [ ] 3.4 Pasar el lote por las reglas duras (Fase 2) + LLM-juez (rúbrica 3.2).
- [ ] 3.5 **MOSTRAR A FREDDY las 50** (archivo `Trivia\.hermes\lotes\lote-001.md` legible, con área y fuente). Esperar feedback de estilo ANTES de escalar.

### FASE 4 — LLM-juez (1-2 h)
- [ ] 4.1 Rúbrica en `Trivia\scripts\prompts\juez.md`: dimensiones (sentido, ambigüedad, plausibilidad de distractores, delación, estilo humano) × escala 1-5 + regla de rechazo (<4).
- [ ] 4.2 Correr el juez sobre el lote piloto; comparar con el juicio de Freddy (Fase 3.5) → calibrar umbral.
- [ ] 4.3 El juez corre también sobre el dataset existente (muestra 200) para detectar otras malas que el filtro de Fase 1 no vio.

### FASE 5 — Curaduría + integración (2-3 h)
- [ ] 5.1 Formato de lote de revisión: markdown legible con ✓/✗ y campo de corrección; Freddy revisa 50 preguntas en ~10 min.
- [ ] 5.2 Script `Trivia\scripts\integrar-lote.py`: valida el lote aprobado (invariantes + dedup contra el pool) y lo inserta al dataset con `created_at`, fuente, dificultad.
- [ ] 5.3 Re-correr `arreglar-dataset.py` (idempotente) + validación final + lint + build.
- [ ] 5.4 Commit en Trivia.

### FASE 6 — Telemetría (2-3 h, requiere lobby)
- [ ] 6.1 En el lobby (Supabase): registrar `pregunta_id` + acierto/fallo por partida (el SDK ya manda telemetría; agregar ids de pregunta al metadata de game_completed).
- [ ] 6.2 Script `Trivia\scripts\analizar-telemetria.py`: % aciertos por pregunta → lista de sospechosas (<20%) y triviales (>95%).
- [ ] 6.3 Revisar sospechosas con LLM-juez + Freddy → corregir o retirar.

### FASE 7 — Cierre
- [ ] 7.1 QA final completo (invariantes + muestras + jugada en dev server `npm run dev`).
- [ ] 7.2 Commit + resumen de estado. **NO hacer push/deploy sin orden explícita de Freddy (App Hosting cobra).**

---

## 5. Archivos que cambiarán

| Archivo | Acción |
|---|---|
| `Enciclopedia HH\scripts\generar_trivia.py` | Modificar: matriz W×tipo, sin prefijos "Sobre/Término:" |
| `Trivia\scripts\filtrar-semantica.py` | Crear (Fase 1) |
| `Trivia\scripts\generar-lote.py` | Crear (Fase 3) |
| `Trivia\scripts\integrar-lote.py` | Crear (Fase 5) |
| `Trivia\scripts\analizar-telemetria.py` | Crear (Fase 6) |
| `Trivia\scripts\prompts\redactor.md`, `juez.md` | Crear (Fases 3-4) |
| `Trivia\src\data\preguntas.json` | Modificar (filtro + lotes aprobados) |
| Lobby (E:\dev\JuegaHipHop\lobby) | Modificar: telemetría por pregunta (Fase 6) |
| `Trivia\.hermes\lotes\lote-*.md` | Crear: lotes de revisión para Freddy |

## 6. Validación (cómo se sabe que funciona)

1. **Fase 1**: invariantes del QA anterior (0 "…", 0 paréntesis rotos, 0 duplicados, opción✓==respuesta, lint, build) + 0 preguntas de clases prohibidas (script de verificación).
2. **Fase 2**: corrida de prueba del generador → 0 absurdas de las clases prohibidas (mismo check 12/12).
3. **Fase 3-4**: las 50 del lote piloto pasan reglas + juez (>=4/5) y Freddy aprueba >= 80%.
4. **Fase 6**: telemetría funcionando; preguntas sospechosas detectadas y revisadas.
5. **Global**: Freddy juega 2 rondas completas y no encuentra ninguna pregunta "sin pies ni cabeza".

## 7. Riesgos y trade-offs

- **Pool más chico**: el filtro baja de 1275 → ~1127. Mitigación: el redactor LLM (Fase 3) genera nuevas preguntas buenas hasta superar el tamaño original.
- **Dependencia del LLM para redactar**: riesgo de alucinaciones → la respuesta DEBE estar respaldada por la entrada (grounding en la validación) y la fuente queda en el dataset.
- **Coste de tiempo de Freddy**: curaduría acotada a lotes de 50 (~10 min c/u); sin revisión pregunta por pregunta.
- **Cambio de estilo**: las 219 preguntas con prefijo "Término: ¿…?" existentes requieren reescritura (Fase 3 las reemplaza progresivamente; no bloquear el resto).
- **Telemetría requiere lobby**: si no se quiere tocar el lobby, la Fase 6 se pospone sin bloquear lo demás.

## 8. Preguntas abiertas para Freddy

1. ¿Generamos preguntas nuevas con el LLM del agente (gratis, flujo actual) o con API externa (DeepSeek/OpenAI con tu key)?
2. ¿El pool objetivo final: ~1500 preguntas buenas (más que hoy) o con 1127 filtradas alcanza?
3. ¿Aceptas reescribir/retirar las ~219 con prefijo "Término:" en lotes sucesivos?
4. ¿Habilitamos la telemetría por pregunta en el lobby (toca Supabase/lobby) o la dejamos para después?

---

## ESTADO DE EJECUCIÓN (2026-08-16) — resumen de cierre

**FASE 0 ✅ Reconocimiento** — 333 entradas, 1275 preg v4.0.1, Python 3.11.

**FASE 1 ✅ Filtro semántico** — `Trivia/scripts/filtrar-semantica.py` (dry-run/--apply/--check).
176 absurdas eliminadas en total: 144 reglas + 4 dudosas hook/bassline (aprobadas) + 28 por
fix de ABSTRACTOS (los ids reales de la enciclopedia son slugs sin tilde: 'metrica' ≠ 'métrica')
+ 3 dudosas street/realness (aprobadas). Dataset 4.1.0 → 4.2.1. El ¿dónde? posicional se conserva.

**FASE 2 ✅ Matriz W×tipo en el generador** — `Enciclopedia HH/scripts/generar_trivia.py`:
CUANDO_OK/DONDE_OK por tipo + regla del verbo (posicional y "se creó" siempre válidos) +
verbos honestos por tipo + aplicada también a manuales. Corrida de prueba: 918 preg,
calidad 10/10, 0 absurdas de clases prohibidas.

**FASE 3 ✅ Redactor LLM** — `Trivia/scripts/prompts/redactor.md` + `juez.md` +
`Trivia/scripts/generar-lote.py` (reglas duras: longitudes, paralelismo por categoría
gramatical, absolutos, delación, grounding con manuales, matriz W×tipo).
**3 lotes de 50 aprobados por Freddy e integrados** (001: mcing/djing/beatbox/beatmaking/chile;
002: nacimiento/writing/breaking/música/cultura; 003: mundo/entidades/restantes).

**FASE 4 ✅ LLM-juez** — rúbrica 5 dimensiones ×1-5, umbral ≥4. 150/150 pasan (globales 4.6-5.0).
Muestra 200 del dataset: detectó el bug de ABSTRACTOS + ~48 preguntas con largos dispares
(candidatas a reescritura en lotes futuros) + 5 chilenas que delatan la respuesta.

**FASE 5 ✅ Curaduría + integración** — `Trivia/scripts/integrar-lote.py`: dedup normalizado
contra el pool (manuales ya existentes se omiten), metadata completa, ids pXXXXX nuevos.
**Dataset final: 1235 preguntas** (139 del redactor-LLM, source_type 'redactor-llm'),
QA 10/10, 0 clases prohibidas, lint+build OK.

**FASE 6 ⏸️ Telemetría por pregunta (lobby/Supabase)** — PENDIENTE de decisión de Freddy.
Se pospone sin bloquear lo demás (plan §7).

**FASE 7 🔄 Cierre** — QA final: invariantes 10/10 ✓, dev server sirve dataset 4.4.0 ✓,
QA visual-jugado con subagente browser en curso (dev server en localhost:5179).

**Commits locales (sin push):** Trivia `e378f28` (filtro), `9bd85d3` (fix ABSTRACTOS),
`483137e` (redactor+validador), `d0d7a3d` (integrar-lote), `0cfd580` (lote 002), `82e3b02`
(fix realineación), `f707945` (lote 003) · Enciclopedia `96eb28c` (matriz), `0f8ed58` (fix ABSTRACTOS).

**Pendientes sugeridos:** reescritura de ~48 con largos dispares + 5 chilenas delatoras
(vía lotes redactor-LLM); decisión Fase 6; push/deploy SOLO con orden de Freddy.
