/**
 * Trivia Hip Hop — pantalla de resultados (trofeo + confetti + score gradiente)
 */

import { useMemo } from 'react'
import type { RespuestaResult } from '../game/types'
import { PREGUNTAS_POR_RONDA } from '../game/quiz'
import type { Debilidad } from '../game/quiz'
import type { LogroDef } from '../game/achievements'
import { AREAS } from './HomeScreen'
import { Boton, Card, Confetti, Titulo } from './ui'

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
  /** Foco de práctica (Motor Final §21): dimensiones a reforzar */
  debilidades: Debilidad[]
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
  debilidades,
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
  const festejo = precision >= 0.7

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 py-6 safe-area-top safe-area-bottom">
      {festejo && <Confetti />}

      {/* Encabezado */}
      <div className="card-enter text-center">
        <div className="relative mx-auto w-fit">
          {festejo && (
            <span className="animate-ping-ring absolute inset-0 rounded-full border-2 border-orange-500/60" />
          )}
          <div className="animate-pulse-glow relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-orange-500/40 bg-gradient-to-b from-stone-800 to-stone-900 text-4xl">
            {titulo.emoji}
          </div>
        </div>
        <Titulo className="mt-2 text-hero text-4xl">{titulo.texto}</Titulo>
        {displayName && <p className="mt-1 text-sm text-stone-400">¡Eso fue para ti, {displayName}!</p>}
      </div>

      {/* Score */}
      <Card className="card-enter text-center">
        <p className="text-overline">PUNTAJE FINAL</p>
        <p className="text-display text-6xl leading-tight text-gradient drop-shadow-[0_0_24px_rgba(249,115,22,0.35)]">
          {score.toLocaleString('es-CL')}
        </p>
        {esNuevoRecord && (
          <p className="animate-pop mt-1 inline-block rounded-full bg-gradient-to-r from-amber-500/25 to-orange-500/25 px-3 py-1 text-xs font-black text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.25)]">
            🏅 ¡Nuevo récord personal!
          </p>
        )}
      </Card>

      {/* Stats de la ronda */}
      <Card className="card-enter">
        <div className="grid grid-cols-4 gap-2 text-center">
          <MiniStat label="Correctas" valor={`${aciertos}/${total}`} />
          <MiniStat label="Precisión" valor={`${Math.round(precision * 100)}%`} />
          <MiniStat label="Racha máx" valor={resultados.reduce((m, r) => Math.max(m, r.racha), 0)} />
          <MiniStat label="Mejor acierto" valor={resultados.reduce((m, r) => Math.max(m, r.puntos), 0)} />
        </div>
      </Card>

      {/* Dominio de área */}
      {modo === 'area' && areaNombre && (
        <Card className={`card-enter border-l-4 ${dominada ? 'border-l-emerald-500' : 'border-l-stone-700'}`}>
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

      {/* Foco de práctica (Motor Final §21) */}
      {debilidades.length > 0 && (
        <Card className="card-enter border-l-4 border-l-orange-500">
          <p className="text-overline mb-2">🎯 TU FOCO DE PRÁCTICA</p>
          <div className="flex flex-wrap gap-2">
            {debilidades.map((d) => (
              <span
                key={`${d.tipo}-${d.clave}`}
                className="rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-300"
              >
                {d.emoji} {d.nombre} · {Math.round(d.pct * 100)}%
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-stone-500">
            El motor priorizará estos ejes y operaciones en tus próximas rondas para que mejores donde más lo necesitas.
          </p>
        </Card>
      )}

      {/* Logros nuevos */}
      {nuevosLogros.length > 0 && (
        <div className="card-enter">
          <p className="text-overline mb-2">🎉 LOGROS DESBLOQUEADOS</p>
          <div className="stagger-in flex flex-col gap-2">
            {nuevosLogros.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-orange-500/10 p-3 shadow-[0_0_20px_rgba(251,191,36,0.08)]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-2xl">
                  {l.icono}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{l.nombre}</p>
                  <p className="truncate text-xs text-stone-400">{l.descripcion}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-black text-amber-300">
                  +{l.xp} XP
                </span>
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
      <div className="text-lg font-extrabold text-white sm:text-xl">{valor}</div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
    </div>
  )
}
