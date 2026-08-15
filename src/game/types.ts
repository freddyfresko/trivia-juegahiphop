/**
 * Trivia Hip Hop — tipos del dominio
 */

import type preguntasJson from '../data/preguntas.json'

export type Pregunta = (typeof preguntasJson)['preguntas'][number]

export type Nivel = 'basico' | 'intermedio' | 'avanzado'

export type Modo = 'area' | 'mixto'

export interface QuizConfig {
  modo: Modo
  /** Id del área cuando modo === 'area' */
  area?: string
  nivel: Nivel
}

export interface PreguntaSeleccionada {
  pregunta: Pregunta
  /** Posición barajada en la que se muestra */
  orden: number
}

/** Resultado de una respuesta del jugador */
export interface RespuestaResult {
  correcta: boolean
  puntos: number
  racha: number
  indiceElegido: number
  indiceCorrecta: number
  tiempoSegundos: number
}

/** Estado persistido del jugador (se guarda vía SDK en game_state) */
export interface TriviaState {
  /** Áreas dominadas (ronda de área con ≥60% acierto) */
  areasCompletadas: string[]
  /** Mejor puntaje por área (id de área → score) */
  mejoresPuntajes: Record<string, number>
  /** Mejor puntaje en modo mixto */
  mejorMixto: number
  totalPartidas: number
  totalCorrectas: number
  totalRespondidas: number
  rachaMaxima: number
  /** Achievement ids desbloqueados (para no re-notificar) */
  desbloqueados: string[]
  /** Partidas completadas por área (para barra fina) */
  partidasPorArea: Record<string, number>
}

export interface TriviaStats {
  partidas: number
  correctas: number
  respondidas: number
  precision: number
  rachaMaxima: number
  areasDominadas: number
}

export type Screen = 'splash' | 'home' | 'quiz' | 'results'
