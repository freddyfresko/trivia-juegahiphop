/**
 * Trivia Hip Hop — progreso local (fallback standalone / caché)
 *
 * El lobby es la fuente de verdad cuando hay sesión (SDK), pero el juego
 * también funciona standalone (sopa.juegahiphop.cl directo, PWA) y debe
 * persistir localmente + mergear con el remoto al reconectar.
 */

import type { TriviaState, TriviaStats } from './types'

const STORAGE_KEY = 'trivia_progress_v1'

export function estadoInicial(): TriviaState {
  return {
    areasCompletadas: [],
    mejoresPuntajes: {},
    mejorMixto: 0,
    totalPartidas: 0,
    totalCorrectas: 0,
    totalRespondidas: 0,
    rachaMaxima: 0,
    desbloqueados: [],
    partidasPorArea: {},
  }
}

export function cargarLocal(): TriviaState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return estadoInicial()
    const parsed = JSON.parse(raw) as Partial<TriviaState>
    return { ...estadoInicial(), ...parsed }
  } catch {
    return estadoInicial()
  }
}

export function guardarLocal(estado: TriviaState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado))
  } catch {
    /* storage lleno o bloqueado — no crítico */
  }
}

export function limpiarLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

/**
 * Merge local ↔ remoto (semántica de unión, gana el que tenga más progreso).
 * Se usa al recibir el progreso del lobby después de haber jugado offline.
 */
export function mergeEstados(local: TriviaState, remoto: TriviaState | null): TriviaState {
  if (!remoto) return local
  return {
    areasCompletadas: union(local.areasCompletadas, remoto.areasCompletadas),
    mejoresPuntajes: { ...remoto.mejoresPuntajes, ...local.mejoresPuntajes },
    mejorMixto: Math.max(local.mejorMixto, remoto.mejorMixto),
    totalPartidas: Math.max(local.totalPartidas, remoto.totalPartidas),
    totalCorrectas: Math.max(local.totalCorrectas, remoto.totalCorrectas),
    totalRespondidas: Math.max(local.totalRespondidas, remoto.totalRespondidas),
    rachaMaxima: Math.max(local.rachaMaxima, remoto.rachaMaxima),
    desbloqueados: union(local.desbloqueados, remoto.desbloqueados),
    partidasPorArea: { ...remoto.partidasPorArea, ...local.partidasPorArea },
  }
}

function union<T>(a: T[], b: T[]): T[] {
  return [...new Set([...a, ...b])]
}

export function calcularStats(estado: TriviaState): TriviaStats {
  return {
    partidas: estado.totalPartidas,
    correctas: estado.totalCorrectas,
    respondidas: estado.totalRespondidas,
    precision: estado.totalRespondidas > 0 ? estado.totalCorrectas / estado.totalRespondidas : 0,
    rachaMaxima: estado.rachaMaxima,
    areasDominadas: estado.areasCompletadas.length,
  }
}

/** Aplica el resultado de una ronda completa al estado persistido */
export function aplicarRonda(
  estado: TriviaState,
  ronda: {
    modo: 'area' | 'mixto'
    area?: string
    aciertos: number
    total: number
    score: number
  },
): TriviaState {
  const nuevo: TriviaState = {
    ...estado,
    totalPartidas: estado.totalPartidas + 1,
    totalCorrectas: estado.totalCorrectas + ronda.aciertos,
    totalRespondidas: estado.totalRespondidas + ronda.total,
  }

  if (ronda.modo === 'area' && ronda.area) {
    nuevo.partidasPorArea = {
      ...estado.partidasPorArea,
      [ronda.area]: (estado.partidasPorArea[ronda.area] ?? 0) + 1,
    }
    nuevo.mejoresPuntajes = {
      ...estado.mejoresPuntajes,
      [ronda.area]: Math.max(estado.mejoresPuntajes[ronda.area] ?? 0, ronda.score),
    }
    // Dominar el área: ≥60% de acierto en la ronda
    if (ronda.aciertos / ronda.total >= 0.6 && !nuevo.areasCompletadas.includes(ronda.area)) {
      nuevo.areasCompletadas = [...nuevo.areasCompletadas, ronda.area].sort()
    }
  } else {
    nuevo.mejorMixto = Math.max(estado.mejorMixto, ronda.score)
  }

  return nuevo
}
