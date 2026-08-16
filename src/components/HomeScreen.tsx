/**
 * Trivia Hip Hop — pantalla de inicio: elegir modo, área y dificultad
 * (Motor Final: 4 niveles de dificultad + foco de práctica adaptativo)
 *
 * Estética v2: hero con vinilo, superficies glass y selecciones en
 * cápsula (highlight "pegatina" — nunca cuadros al seleccionar).
 */

import { useMemo, useState } from 'react'
import areasData from '../data/areas.json'
import type { Dificultad, TriviaState } from '../game/types'
import { contarDisponibles, PREGUNTAS_POR_RONDA, DIFICULTADES, NIVELES_DIFICULTAD, analizarDebilidades } from '../game/quiz'
import { calcularStats } from '../game/progress'
import { BarraProgreso, Boton, Card, Chip, Equalizer, Vinilo } from './ui'

export const AREAS = areasData as Record<string, { nombre: string; emoji: string }>

interface Props {
  estado: TriviaState
  esInvitado: boolean
  displayName: string | null
  onJugar: (modo: 'area' | 'mixto', area: string | null, dificultad: Dificultad) => void
  onReset: () => void
  onSalir: () => void
  resetPendiente: boolean
}

export function HomeScreen({ estado, esInvitado, displayName, onJugar, onReset, onSalir, resetPendiente }: Props) {
  const [modo, setModo] = useState<'area' | 'mixto'>('area')
  const [area, setArea] = useState<string>('01-nacimiento')
  const [dificultad, setDificultad] = useState<Dificultad>(1)
  const [confirmReset, setConfirmReset] = useState(false)

  const stats = useMemo(() => calcularStats(estado), [estado])
  const debilidades = useMemo(() => analizarDebilidades(estado, 2), [estado])

  const disponibles = useMemo(() => {
    if (modo === 'mixto') {
      return contarDisponibles({ modo: 'mixto', dificultad })
    }
    return contarDisponibles({ modo: 'area', area, dificultad })
  }, [modo, area, dificultad])

  const areasDominadas = new Set(estado.areasCompletadas)
  const difMeta = DIFICULTADES[dificultad]

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 py-5 safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Vinilo emoji="🎤" size={34} spinning />
          <span className="text-display text-lg tracking-wider text-white/90">TRIVIA</span>
        </div>
        <button
          onClick={onSalir}
          className="inline-flex h-8 items-center rounded-full border border-stone-700/70 bg-stone-800/80 px-4 text-xs font-bold text-stone-300 transition-all hover:border-orange-500/50 hover:text-white active:scale-95"
        >
          ← Salir
        </button>
      </div>

      {/* Hero */}
      <div className="card-enter flex flex-col items-center gap-1 pt-1 text-center">
        <h1 className="text-hero text-display text-[2.2rem] leading-none sm:text-6xl">TRIVIA HIP HOP</h1>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-stone-500">
          Enciclopedia Hip Hop · Quiz
        </p>
        <Equalizer barras={7} className="mt-1" />
        {displayName && (
          <p className="mt-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-300">
            🎤 {displayName}
            {esInvitado ? ' · invitado' : ''}
          </p>
        )}
      </div>

      {/* Stats */}
      <Card className="card-enter">
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Rondas" valor={stats.partidas} />
          <Stat label="Precisión" valor={`${Math.round(stats.precision * 100)}%`} />
          <Stat label="Mejor racha" valor={stats.rachaMaxima} />
          <Stat label="Áreas" valor={`${stats.areasDominadas}/12`} />
        </div>
        <div className="mt-3">
          <BarraProgreso valor={stats.areasDominadas} total={12} />
          <p className="mt-1 text-right text-[11px] text-stone-500">Progreso de áreas</p>
        </div>
      </Card>

      {/* Foco de práctica (adaptación §21) */}
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
            El motor prioriza tus puntos débiles en cada ronda para que mejores donde más lo necesitas.
          </p>
        </Card>
      )}

      {/* Modo */}
      <div className="stagger-in grid grid-cols-2 gap-3">
        <ModoCard
          activo={modo === 'area'}
          emoji="🗺️"
          titulo="Por Área"
          desc="Un tema de la enciclopedia"
          onClick={() => setModo('area')}
        />
        <ModoCard
          activo={modo === 'mixto'}
          emoji="🎲"
          titulo="Mixto"
          desc="Adaptado a tus debilidades"
          onClick={() => setModo('mixto')}
        />
      </div>

      {/* Áreas (solo modo área) */}
      {modo === 'area' && (
        <div className="card-enter">
          <p className="text-overline mb-2">ELIGE UN ÁREA</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(AREAS).map(([id, a]) => {
              const dominada = areasDominadas.has(id)
              return (
                <Chip key={id} activo={area === id} onClick={() => setArea(id)} className="text-center leading-tight">
                  <span className="mr-1">{a.emoji}</span>
                  {a.nombre}
                  {dominada && <span className="ml-1 text-xs text-emerald-400" title="Área dominada">✓</span>}
                </Chip>
              )
            })}
          </div>
        </div>
      )}

      {/* Dificultad (Motor Final: 4 niveles) */}
      <div>
        <p className="text-overline mb-2">DIFICULTAD</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {NIVELES_DIFICULTAD.map((d) => {
            const meta = DIFICULTADES[d]
            return (
              <Chip key={d} activo={dificultad === d} onClick={() => setDificultad(d)} className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-xl leading-none">{meta.emoji}</span>
                <span className="text-sm font-bold leading-tight">{meta.nombre}</span>
                <span className="flex gap-0.5" aria-hidden>
                  {NIVELES_DIFICULTAD.map((n) => (
                    <span
                      key={n}
                      className={`h-1.5 w-1.5 rounded-full ${
                        n <= d ? (dificultad === d ? 'bg-stone-900/70' : 'bg-orange-500') : 'bg-stone-700'
                      }`}
                    />
                  ))}
                </span>
              </Chip>
            )
          })}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-stone-500">{difMeta.desc}</p>
      </div>

      {/* Jugar */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Boton
          onClick={() => onJugar(modo, modo === 'area' ? area : null, dificultad)}
          className="w-full py-4 text-lg"
          disabled={disponibles < PREGUNTAS_POR_RONDA}
        >
          ▶ JUGAR {PREGUNTAS_POR_RONDA} PREGUNTAS
        </Boton>
        {disponibles < PREGUNTAS_POR_RONDA && (
          <p className="text-center text-xs text-stone-500">
            Solo hay {disponibles} preguntas de {difMeta.nombre.toLowerCase()} en esta selección — elige otra dificultad o modo mixto.
          </p>
        )}

        {/* Reset */}
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-center text-xs text-stone-600 transition-colors hover:text-red-400"
          >
            🗑️ Reiniciar progreso
          </button>
        ) : (
          <div className="card-enter flex flex-col items-center gap-2 rounded-2xl border border-red-900/60 bg-red-950/30 p-3">
            <p className="text-xs text-red-300">¿Seguro? Se borra TODO tu progreso y XP en este juego.</p>
            <div className="flex gap-2">
              <Boton variant="peligro" onClick={onReset} disabled={resetPendiente} className="px-4 py-2 text-xs">
                {resetPendiente ? 'Borrando…' : 'Sí, borrar todo'}
              </Boton>
              <Boton variant="secundario" onClick={() => setConfirmReset(false)} className="px-4 py-2 text-xs">
                Cancelar
              </Boton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div>
      <div className="text-xl font-extrabold text-white sm:text-2xl">{valor}</div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
    </div>
  )
}

function ModoCard({
  activo,
  emoji,
  titulo,
  desc,
  onClick,
}: {
  activo: boolean
  emoji: string
  titulo: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-[22px] px-3.5 py-3.5 text-left transition-all duration-200 active:scale-[0.98] ${
        activo
          ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-stone-950 shadow-sticker scale-[1.02]'
          : 'glass text-stone-300 hover:border-stone-600 hover:-translate-y-0.5'
      }`}
    >
      {activo && (
        <span className="absolute -top-2 right-3 rounded-full bg-stone-950/85 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-400 shadow">
          Activo
        </span>
      )}
      <div className={`text-2xl ${activo ? '' : 'grayscale-[35%]'}`}>{emoji}</div>
      <div className={`mt-1 text-sm font-bold ${activo ? 'text-stone-950' : 'text-stone-200'}`}>{titulo}</div>
      <div className={`text-[10px] leading-snug ${activo ? 'text-stone-900/80' : 'text-stone-500'}`}>{desc}</div>
    </button>
  )
}
