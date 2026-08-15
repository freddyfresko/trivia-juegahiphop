/**
 * Trivia Hip Hop — lógica de selección de preguntas y puntaje
 */

import preguntasData from '../data/preguntas.json'
import type { Pregunta, QuizConfig, RespuestaResult } from './types'

export const PREGUNTAS: Pregunta[] = preguntasData.preguntas
export const TOTAL_PREGUNTAS = PREGUNTAS.length

export const PREGUNTAS_POR_RONDA = 10
export const TIEMPO_POR_PREGUNTA = 20 // segundos
export const UMBRAL_AREA = 0.6 // 60% de acierto para dominar un área

/** Puntos base por acierto + bonus de tiempo (20s → hasta +100) */
export function puntosPorAcierto(rachaPrevia: number, segundosRestantes: number): number {
  let puntos = 100 + Math.round(segundosRestantes * 5)
  if (rachaPrevia >= 2) puntos += 25 // racha de 3+
  if (rachaPrevia >= 5) puntos += 50 // racha de 6+
  return puntos
}

/** Selecciona N preguntas para una ronda (barajadas, sin repetir dentro de la ronda) */
export function seleccionarPreguntas(cfg: QuizConfig, cantidad: number = PREGUNTAS_POR_RONDA): Pregunta[] {
  let pool = PREGUNTAS

  if (cfg.modo === 'area' && cfg.area) {
    pool = pool.filter((p) => p.area === cfg.area)
  }

  pool = pool.filter((p) => p.nivel === cfg.nivel)

  // Barajar (Fisher-Yates con Math.random — no necesita seed estable)
  const arr = [...pool]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr.slice(0, cantidad)
}

/** ¿Hay suficientes preguntas del nivel pedido en el área? */
export function contarDisponibles(cfg: QuizConfig): number {
  let pool = PREGUNTAS
  if (cfg.modo === 'area' && cfg.area) pool = pool.filter((p) => p.area === cfg.area)
  pool = pool.filter((p) => p.nivel === cfg.nivel)
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
    correcta,
    puntos: correcta ? puntosPorAcierto(rachaPrevia, segundosRestantes) : 0,
    racha,
    indiceElegido,
    indiceCorrecta: pregunta.indice_correcta,
    tiempoSegundos: TIEMPO_POR_PREGUNTA - segundosRestantes,
  }
}
