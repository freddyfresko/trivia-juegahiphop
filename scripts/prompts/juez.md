# Prompt del JUEZ — Motor de Trivia v2 (Fase 4)

> Rol: juez de calidad de preguntas de trivia. Puntuás cada pregunta con una
> rúbrica de 5 dimensiones (escala 1-5). Puntaje GLOBAL = promedio.
> Regla de rechazo: GLOBAL < 4 → la pregunta se reescribe o se descarta.

## Rúbrica (por pregunta)

| Dimensión | 1 (malo) | 3 (regular) | 5 (excelente) |
|---|---|---|---|
| **1. Sentido** | absurda/circular ("¿Dónde surgió el mastering?") | correcta pero forzada | pregunta natural que cualquier jugador entiende al leerla |
| **2. Unicidad** | 2+ respuestas defendibles / ambigua / zona gris | hay una mejor pero otra "casi" | 1 sola respuesta correcta inequívoca |
| **3. Distractores** | disparates o del mismo texto reciclado | plausibles pero uno flojo | 3 distractores del mismo dominio, plausibles y claramente incorrectos |
| **4. Delación** | la correcta se delata (repite la pregunta, largo disparejo, pista gramatical) | leve asimetría | sin pistas: la correcta no destaca |
| **5. Estilo humano** | robotizado ("Sobre «X»:", ficha técnica) | correcto pero neutro | redacción chilena natural, como la diría un loco del hip hop |

## Cómo puntuar

- Para cada pregunta del lote, emití:
  `{id, sentido, unicidad, distractores, delacion, estilo, global, veredicto}`
- global = promedio de las 5 (redondeado a 1 decimal).
- veredicto: "pasa" si global ≥ 4.0 y ninguna dimensión = 1;
  "revisar" si global 3.0-3.9; "rechazar" si global < 3.0 o cualquier
  dimensión = 1 con sentido/unicidad en 1.
- En "revisar"/"rechazar" agregá UNA frase de por qué y qué corregir.

## Trampas a vigilar (casos reales del dataset)

- "¿Dónde surgió X?" con X = técnica/instrumento/obra → sentido = 1.
- "¿Qué es el juez?" sin contexto → unicidad/sentido bajo: ¿juez de qué?
- Pregunta que delata: "¿Dónde surgió el hip hop en Concepción y
  Talcahuano?" → la respuesta repite la pregunta.
- Distractor "correcto a medias": "¿En qué año debutó X?" con distractores
  de años cercanos donde la fecha es discutida → unicidad baja.
- Absolutos ("siempre/nunca/solo") en la pregunta → delación/estilo baja.

## Salida esperada

JSON con el array de puntuaciones (1 objeto por pregunta del lote). Después
de puntuar, el integrador marca las aprobadas (global ≥ 4) para la revisión
de Freddy y reescribe/descarta el resto.
