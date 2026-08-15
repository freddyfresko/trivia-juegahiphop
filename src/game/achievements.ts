/**
 * Trivia Hip Hop — catálogo de logros
 *
 * Los IDs se registran en Supabase (tabla achievements, game_id = 'trivia')
 * vía migración SQL — ver migración 00024 en el lobby.
 */

export interface LogroDef {
  id: string
  nombre: string
  descripcion: string
  icono: string
  rareza: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  xp: number
}

export const LOGROS: LogroDef[] = [
  { id: 'trivia_first_win', nombre: 'Primer Acierto', descripcion: 'Responde correctamente tu primera pregunta', icono: '🎯', rareza: 'common', xp: 25 },
  { id: 'trivia_round_5', nombre: 'En Racha', descripcion: 'Acierta 5 seguidas en una ronda', icono: '🔥', rareza: 'uncommon', xp: 50 },
  { id: 'trivia_round_10', nombre: 'Imparable', descripcion: 'Acierta las 10 preguntas de una ronda', icono: '⚡', rareza: 'epic', xp: 200 },
  { id: 'trivia_first_area', nombre: 'Primer Territorio', descripcion: 'Domina tu primer área (60%+ de acierto)', icono: '🗺️', rareza: 'uncommon', xp: 75 },
  { id: 'trivia_three_areas', nombre: 'Explorador', descripcion: 'Domina 3 áreas de la enciclopedia', icono: '🧭', rareza: 'rare', xp: 150 },
  { id: 'trivia_six_areas', nombre: 'Conocedor', descripcion: 'Domina 6 áreas de la enciclopedia', icono: '📚', rareza: 'epic', xp: 300 },
  { id: 'trivia_all_areas', nombre: 'Enciclopedista', descripcion: 'Domina las 12 áreas de la enciclopedia', icono: '🏛️', rareza: 'legendary', xp: 1000 },
  { id: 'trivia_games_5', nombre: 'Cinco Rondas', descripcion: 'Completa 5 partidas', icono: '🎮', rareza: 'uncommon', xp: 50 },
  { id: 'trivia_games_25', nombre: 'Vicio Saludable', descripcion: 'Completa 25 partidas', icono: '🎮', rareza: 'epic', xp: 200 },
  { id: 'trivia_correctas_50', nombre: 'Cincuenta Sabias', descripcion: 'Acumula 50 respuestas correctas', icono: '🧠', rareza: 'rare', xp: 150 },
  { id: 'trivia_correctas_200', nombre: 'Doscientas Sabias', descripcion: 'Acumula 200 respuestas correctas', icono: '🧠', rareza: 'epic', xp: 400 },
  { id: 'trivia_correctas_500', nombre: 'Biblioteca Viviente', descripcion: 'Acumula 500 respuestas correctas', icono: '📖', rareza: 'legendary', xp: 1000 },
  { id: 'trivia_chile_domado', nombre: 'Orgullo Nacional', descripcion: 'Domina el área de Hip Hop Chileno', icono: '🇨🇱', rareza: 'epic', xp: 250 },
  { id: 'trivia_speed_5', nombre: 'Rápido como el Flash', descripcion: 'Acierta en menos de 3 segundos', icono: '⚡', rareza: 'rare', xp: 100 },
]

export function logroPorId(id: string): LogroDef | undefined {
  return LOGROS.find((l) => l.id === id)
}

/** Evalúa qué logros se desbloquean con el estado actual (devuelve los NUEVOS) */
export function evaluarLogros(estado: {
  totalCorrectas: number
  totalPartidas: number
  rachaMaxima: number
  areasCompletadas: string[]
  desbloqueados: string[]
  aciertosRonda: number
  tiempoUltimoAcierto: number
}): LogroDef[] {
  const nuevos: LogroDef[] = []
  const ya = new Set(estado.desbloqueados)
  const candidatos: LogroDef[] = []

  if (estado.totalCorrectas >= 1) candidatos.push(logroPorId('trivia_first_win')!)
  if (estado.rachaMaxima >= 5) candidatos.push(logroPorId('trivia_round_5')!)
  if (estado.rachaMaxima >= 10) candidatos.push(logroPorId('trivia_round_10')!)
  if (estado.areasCompletadas.length >= 1) candidatos.push(logroPorId('trivia_first_area')!)
  if (estado.areasCompletadas.length >= 3) candidatos.push(logroPorId('trivia_three_areas')!)
  if (estado.areasCompletadas.length >= 6) candidatos.push(logroPorId('trivia_six_areas')!)
  if (estado.areasCompletadas.length >= 12) candidatos.push(logroPorId('trivia_all_areas')!)
  if (estado.totalPartidas >= 5) candidatos.push(logroPorId('trivia_games_5')!)
  if (estado.totalPartidas >= 25) candidatos.push(logroPorId('trivia_games_25')!)
  if (estado.totalCorrectas >= 50) candidatos.push(logroPorId('trivia_correctas_50')!)
  if (estado.totalCorrectas >= 200) candidatos.push(logroPorId('trivia_correctas_200')!)
  if (estado.totalCorrectas >= 500) candidatos.push(logroPorId('trivia_correctas_500')!)
  if (estado.areasCompletadas.includes('11-chile')) candidatos.push(logroPorId('trivia_chile_domado')!)
  if (estado.tiempoUltimoAcierto > 0 && estado.tiempoUltimoAcierto <= 3) candidatos.push(logroPorId('trivia_speed_5')!)

  for (const l of candidatos) {
    if (l && !ya.has(l.id)) nuevos.push(l)
  }
  return nuevos
}
