/**
 * Trivia Hip Hop — motor de selección y puntaje (Motor Final)
 *
 * Selección adaptativa (spec §21): el rendimiento del jugador por eje,
 * operación y dificultad modula qué preguntas salen — si dominas DJ pero
 * fallas cronología, el motor prioriza «cuando/donde» y operaciones débiles
 * sin subir la dificultad de todo.
 *
 * Repetición inteligente (§23-24): el conocimiento (entrada_id) puede
 * reaparecer, pero nunca con la misma formulación seguida — las variantes
 * del mismo conocimiento puntúan distinto y las preguntas recientes quedan
 * penalizadas (anti-memorización).
 */

import preguntasData from '../data/preguntas.json'
import type { Dificultad, Eje, Operacion, Pregunta, QuizConfig, Rendimiento, RespuestaResult, TriviaState } from './types'

/** Dataset v4 del Motor Final (tipado explícito — el JSON deriva string/number) */
export const PREGUNTAS: Pregunta[] = preguntasData.preguntas as Pregunta[]
export const TOTAL_PREGUNTAS = PREGUNTAS.length

export const PREGUNTAS_POR_RONDA = 10
export const TIEMPO_POR_PREGUNTA = 20 // segundos
export const UMBRAL_AREA = 0.6 // 60% de acierto para dominar un área

/** Bonus de puntos por dificultad (más difícil = más valor) */
const MULT_DIFICULTAD: Record<Dificultad, number> = { 1: 1, 2: 1.25, 3: 1.5, 4: 1.75 }

/** Metadata de ejes para UI */
export const EJES: Record<Eje, { nombre: string; emoji: string }> = {
  que: { nombre: 'Qué', emoji: '❓' },
  quien: { nombre: 'Quién', emoji: '🕵️' },
  cuando: { nombre: 'Cuándo', emoji: '📅' },
  donde: { nombre: 'Dónde', emoji: '📍' },
  como: { nombre: 'Cómo', emoji: '⚙️' },
  por_que: { nombre: 'Por qué', emoji: '🧠' },
  para_que: { nombre: 'Para qué', emoji: '🎯' },
}

/** Metadata de operaciones cognitivas para UI */
export const OPERACIONES: Record<Operacion, { nombre: string; emoji: string }> = {
  reconocer: { nombre: 'Reconocer', emoji: '👀' },
  recordar: { nombre: 'Recordar', emoji: '🧠' },
  comprender: { nombre: 'Comprender', emoji: '💡' },
  relacionar: { nombre: 'Relacionar', emoji: '🔗' },
  comparar: { nombre: 'Comparar', emoji: '⚖️' },
  ordenar: { nombre: 'Ordenar', emoji: '🔢' },
  aplicar: { nombre: 'Aplicar', emoji: '🛠️' },
  analizar: { nombre: 'Analizar', emoji: '🔬' },
  inferir: { nombre: 'Inferir', emoji: '🔎' },
  evaluar: { nombre: 'Evaluar', emoji: '🏁' },
}

/** Metadata de dificultades para UI */
export const DIFICULTADES: Record<Dificultad, { nombre: string; emoji: string; desc: string }> = {
  1: { nombre: 'Fácil', emoji: '🌱', desc: 'Reconocer y recordar lo esencial' },
  2: { nombre: 'Medio', emoji: '🔥', desc: 'Recordar, comprender y relacionar' },
  3: { nombre: 'Difícil', emoji: '💎', desc: 'Comprender, relacionar y analizar' },
  4: { nombre: 'Experto', emoji: '🧠', desc: 'Analizar, inferir y evaluar' },
}

export const NIVELES_DIFICULTAD: Dificultad[] = [1, 2, 3, 4]

/** Puntos base por acierto + bonus de tiempo + bonus de dificultad */
export function puntosPorAcierto(rachaPrevia: number, segundosRestantes: number, dificultad: Dificultad = 1): number {
  let puntos = Math.round((100 + Math.round(segundosRestantes * 5)) * MULT_DIFICULTAD[dificultad])
  if (rachaPrevia >= 2) puntos += 25 // racha de 3+
  if (rachaPrevia >= 5) puntos += 50 // racha de 6+
  return puntos
}

/**
 * Peso adaptativo de una dimensión de rendimiento:
 * sin datos → neutro; débil (<50%) → priorizar; fuerte (>90%) → espaciar.
 */
function pesoRendimiento(r: Rendimiento | undefined, pesoDebil: number): number {
  if (!r || r.total < 3) return 0.3
  const pct = r.ok / r.total
  if (pct < 0.5) return pesoDebil
  if (pct < 0.7) return 0.4
  if (pct > 0.9) return -0.7
  return 0
}

/** Score adaptativo de una pregunta para el pool de la ronda */
function scorePregunta(p: Pregunta, estado: TriviaState): number {
  let s = 0
  // Adaptación: operaciones débiles primero, ejes débiles después
  s += pesoRendimiento(estado.rendimientoOperaciones[p.operacion], 1.6)
  s += pesoRendimiento(estado.rendimientoEjes[p.eje], 1.1) * 0.7
  s += pesoRendimiento(estado.rendimientoDificultades[p.dificultad], 1.0) * 0.4

  // Repetición inteligente: conocimiento ya visto → espaciar; fallado → reforzar
  const visto = estado.conocimientosVistos[p.entrada_id]
  if (visto) {
    if (visto.fallado > 0 && visto.visto <= 2) s += 0.9 // reaparece con otra formulación
    else s -= 0.9
  }

  // Anti-memorización: la MISMA formulación reciente no se repite
  if (estado.ultimasPreguntas.includes(p.id)) s -= 2.5

  // Ruido para variedad
  s += Math.random() * 0.5
  return s
}

/**
 * Selecciona N preguntas para una ronda (Motor Final).
 * - Filtra por dificultad y área.
 * - Nunca repite el mismo conocimiento (entrada_id) dentro de la ronda.
 * - Prioriza operaciones/ejes débiles y espacia conocimientos ya dominados.
 */
export function seleccionarPreguntas(cfg: QuizConfig, estado: TriviaState, cantidad: number = PREGUNTAS_POR_RONDA): Pregunta[] {
  let pool = PREGUNTAS.filter((p) => p.dificultad === cfg.dificultad)

  if (cfg.modo === 'area' && cfg.area) {
    pool = pool.filter((p) => p.area === cfg.area)
  }

  // Score adaptativo
  const conScore = pool.map((p) => ({ p, s: scorePregunta(p, estado) }))
  conScore.sort((a, b) => b.s - a.s)

  // Greedy: sin repetir conocimiento en la ronda
  const elegidas: Pregunta[] = []
  const usadas = new Set<string>()
  for (const { p } of conScore) {
    if (elegidas.length >= cantidad) break
    if (usadas.has(p.entrada_id)) continue
    usadas.add(p.entrada_id)
    elegidas.push(p)
  }

  // Fallback: si el pool filtrado no alcanza, completar sin repetir conocimiento
  if (elegidas.length < cantidad) {
    for (const p of pool) {
      if (elegidas.length >= cantidad) break
      if (usadas.has(p.entrada_id)) continue
      usadas.add(p.entrada_id)
      elegidas.push(p)
    }
  }

  // Barajar el orden de presentación (Fisher-Yates)
  const arr = [...elegidas]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** ¿Hay suficientes preguntas de la dificultad pedida en el área? */
export function contarDisponibles(cfg: QuizConfig): number {
  let pool = PREGUNTAS.filter((p) => p.dificultad === cfg.dificultad)
  if (cfg.modo === 'area' && cfg.area) pool = pool.filter((p) => p.area === cfg.area)
  return pool.length
}

/** Construye el resultado de responder una pregunta */
export function evaluarRespuesta(
  pregunta: Pregunta,
  indiceElegido: number,
  rachaPrevia: number,
  segundosRestantes: number,
): RespuestaResult {
  const correcta = indiceElegido === pregunta.indice_correcta
  const racha = correcta ? rachaPrevia + 1 : 0
  return {
    id: pregunta.id,
    correcta,
    puntos: correcta ? puntosPorAcierto(rachaPrevia, segundosRestantes, pregunta.dificultad) : 0,
    racha,
    indiceElegido,
    indiceCorrecta: pregunta.indice_correcta,
    tiempoSegundos: TIEMPO_POR_PREGUNTA - segundosRestantes,
    entradaId: pregunta.entrada_id,
    eje: pregunta.eje,
    operacion: pregunta.operacion,
    dificultad: pregunta.dificultad,
  }
}

export interface Debilidad {
  tipo: 'eje' | 'operacion'
  clave: string
  nombre: string
  emoji: string
  pct: number
  total: number
}

/**
 * Debilidades detectadas para la UI (Home/Results): ejes y operaciones con
 * peor precisión (mínimo 3 respuestas). Es la base del «foco de práctica».
 */
export function analizarDebilidades(estado: TriviaState, limite = 2): Debilidad[] {
  const items: Debilidad[] = []
  for (const [clave, r] of Object.entries(estado.rendimientoEjes)) {
    if (r.total < 3) continue
    items.push({ tipo: 'eje', clave, nombre: EJES[clave as Eje]?.nombre ?? clave, emoji: EJES[clave as Eje]?.emoji ?? '❓', pct: r.ok / r.total, total: r.total })
  }
  for (const [clave, r] of Object.entries(estado.rendimientoOperaciones)) {
    if (r.total < 3) continue
    items.push({ tipo: 'operacion', clave, nombre: OPERACIONES[clave as Operacion]?.nombre ?? clave, emoji: OPERACIONES[clave as Operacion]?.emoji ?? '🧠', pct: r.ok / r.total, total: r.total })
  }
  return items.sort((a, b) => a.pct - b.pct).slice(0, limite)
}

/** ¿El jugador ya domina este conocimiento? (visto ≥2 veces con ≥80% global) */
export function conocimientoDominado(estado: TriviaState, entradaId: string): boolean {
  const v = estado.conocimientosVistos[entradaId]
  return !!v && v.visto >= 2 && v.fallado === 0
}
