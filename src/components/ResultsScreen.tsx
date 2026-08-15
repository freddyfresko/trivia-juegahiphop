/**
 * Trivia Hip Hop — pantalla de resultados
 */

import { useMemo } from 'react'
import type { RespuestaResult } from '../game/types'
import { PREGUNTAS_POR_RONDA } from '../game/quiz'
import type { LogroDef } from '../game/achievements'
import { AREAS } from './HomeScreen'
import { Boton, Card, Titulo } from './ui'

interface Props {
  score: number
  aciertos: number
  total: number
  resultados: RespuestaResult[]
  area: string | null
  modo: 'area' | 'mixto'
  nuevosLogros: LogroDef[]
  dominada: boolean
  esNuevoRecord: boolean
  displayName: string | null
  onRevancha: () => void
  onHome: () => void
  onSalir: () => void
}

export function ResultsScreen({
  score,
  aciertos,
  total,
  resultados,
  area,
  modo,
  nuevosLogros,
  dominada,
  esNuevoRecord,
  displayName,
  onRevancha,
  onHome,
  onSalir,
}: Props) {
  const precision = total > 0 ? aciertos / total : 0
  const titulo = useMemo(() => {
    if (precision >= 0.9) return { emoji: '🏆', texto: '¡LEYENDA!' }
    if (precision >= 0.7) return { emoji: '🔥', texto: '¡IMPRESIONANTE!' }
    if (precision >= 0.5) return { emoji: '👏', texto: '¡Buen trabajo!' }
    if (precision >= 0.3) return { emoji: '💪', texto: 'A seguir practicando' }
    return { emoji: '📚', texto: 'Vuelve a la Enciclopedia' }
  }, [precision])

  const areaNombre = area ? AREAS[area]?.nombre ?? area : null

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 py-6 safe-area-top safe-area-bottom">
      <div className="text-center">
        <div className="animate-pop text-6xl">{titulo.emoji}</div>
        <Titulo className="mt-1 text-4xl">{titulo.texto}</Titulo>
        {displayName && <p className="mt-1 text-sm text-stone-400">¡Eso fue para ti, {displayName}!</p>}
      </div>

      {/* Score */}
      <Card className="text-center">
        <p className="text-overline">PUNTAJE FINAL</p>
        <p className="text-display text-5xl text-orange-400">{score.toLocaleString('es-CL')}</p>
        {esNuevoRecord && (
          <p className="animate-pop mt-1 text-xs font-bold text-amber-400">🏅 ¡Nuevo récord personal!</p>
        )}
      </Card>

      {/* Stats de la ronda */}
      <Card>
        <div className="grid grid-cols-4 gap-2 text-center">
          <MiniStat label="Correctas" valor={`${aciertos}/${total}`} />
          <MiniStat label="Precisión" valor={`${Math.round(precision * 100)}%`} />
          <MiniStat label="Racha máx" valor={resultados.reduce((m, r) => Math.max(m, r.racha), 0)} />
          <MiniStat label="Mejor acierto" valor={resultados.reduce((m, r) => Math.max(m, r.puntos), 0)} />
        </div>
      </Card>

      {/* Dominio de área */}
      {modo === 'area' && areaNombre && (
        <Card className={`border-l-4 ${dominada ? 'border-l-emerald-500' : 'border-l-stone-700'}`}>
          <p className="text-sm font-bold text-white">
            {dominada ? '✅' : '🔄'} Área: {areaNombre}
          </p>
          <p className="text-xs text-stone-400">
            {dominada
              ? `¡Dominada! Con ${aciertos}/${total} superas el 60%.`
              : `Necesitas ${Math.ceil(PREGUNTAS_POR_RONDA * 0.6)} de ${PREGUNTAS_POR_RONDA} para dominarla (llevas ${aciertos}).`}
          </p>
        </Card>
      )}

      {/* Logros nuevos */}
      {nuevosLogros.length > 0 && (
        <div className="card-enter">
          <p className="text-overline mb-2">🎉 LOGROS DESBLOQUEADOS</p>
          <div className="stagger-in flex flex-col gap-2">
            {nuevosLogros.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                <span className="text-2xl">{l.icono}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{l.nombre}</p>
                  <p className="truncate text-xs text-stone-400">{l.descripcion}</p>
                </div>
                <span className="shrink-0 text-xs font-bold text-amber-400">+{l.xp} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Boton onClick={onRevancha} className="w-full py-4 text-lg">
          🔄 REVANCHA
        </Boton>
        <div className="grid grid-cols-2 gap-2">
          <Boton variant="secundario" onClick={onHome}>
            🏠 Inicio
          </Boton>
          <Boton variant="fantasma" onClick={onSalir}>
            ← Lobby
          </Boton>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div>
      <div className="text-lg font-extrabold text-white">{valor}</div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
    </div>
  )
}
