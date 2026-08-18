/**
 * Trivia Hip Hop — tipos del dominio (Motor Final)
 *
 * Modelo: cada pregunta = CONOCIMIENTO (entrada de la enciclopedia) + EJE (qué se
 * pregunta) + OPERACIÓN COGNITIVA (qué debe hacer mentalmente el jugador) +
 * DIFICULTAD multi-variable + trazabilidad (fuente, periodo, lugar).
 */

/** Ejes de pregunta (qué se pregunta) */
export type Eje = 'que' | 'quien' | 'cuando' | 'donde' | 'como' | 'por_que' | 'para_que'

/** Operaciones cognitivas (qué debe hacer mentalmente el jugador) */
export type Operacion =
  | 'reconocer'
  | 'recordar'
  | 'comprender'
  | 'relacionar'
  | 'comparar'
  | 'ordenar'
  | 'aplicar'
  | 'analizar'
  | 'inferir'
  | 'evaluar'

/** Dificultad multi-variable 1-4: 1 fácil · 2 medio · 3 difícil · 4 experto */
export type Dificultad = 1 | 2 | 3 | 4

/**
 * Pregunta del Motor Final (dataset v4): cada pregunta = CONOCIMIENTO
 * (entrada de la enciclopedia) + EJE + OPERACIÓN COGNITIVA + DIFICULTAD
 * multi-variable + trazabilidad (fuente, periodo, lugar).
 */
export interface Pregunta {
  id: string
  /** Eje (qué se pregunta) */
  tipo: Eje
  eje: Eje
  /** Operación cognitiva (qué debe hacer mentalmente el jugador) */
  operacion: Operacion
  /** Nivel de la entrada fuente (metadata: basico/intermedio/avanzado) */
  nivel: string
  /** Dificultad multi-variable 1-4 */
  dificultad: Dificultad
  pregunta: string
  /** Opción correcta (también usada como explicación en respuestas cortas) */
  respuesta: string
  /** Respuesta naturalmente corta (¿Cuándo?/¿Dónde?) */
  respuesta_corta?: boolean
  /** Contexto de aprendizaje post-respuesta (§22) */
  explicacion: string
  /** Pista contextual (área · subcategoría) — se muestra bajo demanda, nunca revela la respuesta */
  pista?: string
  opciones: string[]
  indice_correcta: number
  /** Conocimiento: entrada de la enciclopedia */
  entrada_id: string
  termino: string
  area: string
  subcategoria: string[] | string
  /** Conocimientos relacionados (ids de la enciclopedia, §14) */
  relacionados?: string[]
  /** Trazabilidad (§12) */
  source: string[] | string
  source_type: string
  periodo: string
  lugar: string
  created_at: string
}

export type Modo = 'area' | 'mixto'

export interface QuizConfig {
  modo: Modo
  /** Id del área cuando modo === 'area' */
  area?: string
  dificultad: Dificultad
}

export interface PreguntaSeleccionada {
  pregunta: Pregunta
  /** Posición barajada en la que se muestra */
  orden: number
}

/** Resultado de una respuesta del jugador (con metadata del Motor Final) */
export interface RespuestaResult {
  /** Id de la pregunta (para anti-memorización) */
  id: string
  correcta: boolean
  puntos: number
  racha: number
  indiceElegido: number
  indiceCorrecta: number
  tiempoSegundos: number
  /** Conocimiento (entrada de la enciclopedia) que evaluó esta pregunta */
  entradaId: string
  eje: Eje
  operacion: Operacion
  dificultad: Dificultad
}

/** Rendimiento acumulado de una dimensión (eje / operación / dificultad) */
export interface Rendimiento {
  ok: number
  total: number
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
  /** Adaptación (spec §21): precisión por eje, operación y dificultad */
  rendimientoEjes: Record<string, Rendimiento>
  rendimientoOperaciones: Record<string, Rendimiento>
  rendimientoDificultades: Record<string, Rendimiento>
  /** Repetición inteligente (spec §23-24): veces que se ha mostrado cada
   *  conocimiento (entrada_id) y cuántas veces se falló */
  conocimientosVistos: Record<string, { visto: number; fallado: number }>
  /** Anti-memorización: ids de preguntas vistas recientemente (para variar la formulación) */
  ultimasPreguntas: string[]
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
