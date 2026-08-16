/**
 * Trivia Hip Hop — progreso local (fallback standalone / caché)
 *
 * El lobby es la fuente de verdad cuando hay sesión (SDK), pero el juego
 * también funciona standalone (trivia.juegahiphop.cl directo, PWA) y debe
 * persistir localmente + mergear con el remoto al reconectar.
 *
 * Motor Final: además del progreso clásico, registra el rendimiento por
 * eje / operación / dificultad (adaptación §21) y la memoria de
 * conocimientos vistos (repetición inteligente §23-24).
 */

import type { RespuestaResult, TriviaState, TriviaStats } from './types'

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
    rendimientoEjes: {},
    rendimientoOperaciones: {},
    rendimientoDificultades: {},
    conocimientosVistos: {},
    ultimasPreguntas: [],
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

/** Merge de dos registros de rendimiento (semántica de unión) */
function mergeRendimiento(a: Record<string, { ok: number; total: number }> | undefined, b: Record<string, { ok: number; total: number }> | undefined) {
  const out: Record<string, { ok: number; total: number }> = {}
  for (const [k, v] of Object.entries(a ?? {})) out[k] = { ...v }
  for (const [k, v] of Object.entries(b ?? {})) {
    const prev = out[k]
    out[k] = prev ? { ok: prev.ok + v.ok, total: prev.total + v.total } : { ...v }
  }
  return out
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
    rendimientoEjes: mergeRendimiento(local.rendimientoEjes, remoto.rendimientoEjes),
    rendimientoOperaciones: mergeRendimiento(local.rendimientoOperaciones, remoto.rendimientoOperaciones),
    rendimientoDificultades: mergeRendimiento(local.rendimientoDificultades, remoto.rendimientoDificultades),
    conocimientosVistos: mergeVistos(local.conocimientosVistos, remoto.conocimientosVistos),
    ultimasPreguntas: union(local.ultimasPreguntas, remoto.ultimasPreguntas).slice(-40),
  }
}

function mergeVistos(
  a: Record<string, { visto: number; fallado: number }> | undefined,
  b: Record<string, { visto: number; fallado: number }> | undefined,
) {
  const out: Record<string, { visto: number; fallado: number }> = {}
  for (const [k, v] of Object.entries(a ?? {})) out[k] = { ...v }
  for (const [k, v] of Object.entries(b ?? {})) {
    const prev = out[k]
    out[k] = prev ? { visto: prev.visto + v.visto, fallado: prev.fallado + v.fallado } : { ...v }
  }
  return out
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

function registrar(
  reg: Record<string, { ok: number; total: number }>,
  clave: string,
  correcta: boolean,
): Record<string, { ok: number; total: number }> {
  const prev = reg[clave] ?? { ok: 0, total: 0 }
  return {
    ...reg,
    [clave]: { ok: prev.ok + (correcta ? 1 : 0), total: prev.total + 1 },
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
    resultados: RespuestaResult[]
  },
): TriviaState {
  let nuevo: TriviaState = {
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

  // ─── Motor Final: rendimiento por dimensión + memoria de conocimientos ───
  for (const r of ronda.resultados) {
    nuevo.rendimientoEjes = registrar(nuevo.rendimientoEjes, r.eje, r.correcta)
    nuevo.rendimientoOperaciones = registrar(nuevo.rendimientoOperaciones, r.operacion, r.correcta)
    nuevo.rendimientoDificultades = registrar(nuevo.rendimientoDificultades, String(r.dificultad), r.correcta)

    const prev = estado.conocimientosVistos[r.entradaId]
    nuevo.conocimientosVistos = {
      ...nuevo.conocimientosVistos,
      [r.entradaId]: {
        visto: (prev?.visto ?? 0) + 1,
        fallado: (prev?.fallado ?? 0) + (r.correcta ? 0 : 1),
      },
    }
  }

  // Anti-memorización: recordar las últimas formulaciones vistas (40 máx.)
  const ids = ronda.resultados.map((r) => r.id)
  nuevo.ultimasPreguntas = [...nuevo.ultimasPreguntas, ...ids].slice(-40)

  return nuevo
}
