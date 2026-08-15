/**
 * Trivia Hip Hop — pantalla de inicio: elegir modo, área y dificultad
 */

import { useMemo, useState } from 'react'
import areasData from '../data/areas.json'
import type { Nivel, TriviaState } from '../game/types'
import { contarDisponibles, PREGUNTAS_POR_RONDA } from '../game/quiz'
import { calcularStats } from '../game/progress'
import { BarraProgreso, Boton, Card, Titulo } from './ui'

export const AREAS = areasData as Record<string, { nombre: string; emoji: string }>

export const NIVELES: { id: Nivel; nombre: string; emoji: string; desc: string }[] = [
  { id: 'basico', nombre: 'Básico', emoji: '🌱', desc: 'Lo esencial de la cultura' },
  { id: 'intermedio', nombre: 'Intermedio', emoji: '🔥', desc: 'Para los que ya conocen' },
  { id: 'avanzado', nombre: 'Avanzado', emoji: '💎', desc: 'Solo para expertos' },
]

interface Props {
  estado: TriviaState
  esInvitado: boolean
  displayName: string | null
  onJugar: (modo: 'area' | 'mixto', area: string | null, nivel: Nivel) => void
  onReset: () => void
  onSalir: () => void
  resetPendiente: boolean
}

export function HomeScreen({ estado, esInvitado, displayName, onJugar, onReset, onSalir, resetPendiente }: Props) {
  const [modo, setModo] = useState<'area' | 'mixto'>('area')
  const [area, setArea] = useState<string>('01-nacimiento')
  const [nivel, setNivel] = useState<Nivel>('basico')
  const [confirmReset, setConfirmReset] = useState(false)

  const stats = useMemo(() => calcularStats(estado), [estado])

  const disponibles = useMemo(() => {
    if (modo === 'mixto') {
      return contarDisponibles({ modo: 'mixto', nivel })
    }
    return contarDisponibles({ modo: 'area', area, nivel })
  }, [modo, area, nivel])

  const areasDominadas = new Set(estado.areasCompletadas)

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 py-6 safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Titulo className="text-3xl sm:text-4xl">TRIVIA HIP HOP</Titulo>
        <button
          onClick={onSalir}
          className="rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-stone-300 hover:bg-stone-700"
        >
          ← Salir
        </button>
      </div>

      {displayName && (
        <p className="text-sm text-stone-400">
          <span className="font-bold text-orange-400">{displayName}</span>
          {esInvitado ? ' · jugando como invitado' : ''}
        </p>
      )}

      {/* Stats */}
      <Card className="stagger-in">
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

      {/* Modo */}
      <div className="grid grid-cols-2 gap-3">
        <ModoCard
          activo={modo === 'area'}
          emoji="🗺️"
          titulo="Por Área"
          desc="Elige un tema de la enciclopedia"
          onClick={() => setModo('area')}
        />
        <ModoCard
          activo={modo === 'mixto'}
          emoji="🎲"
          titulo="Mixto"
          desc="Preguntas de todo el Hip Hop"
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
                <button
                  key={id}
                  onClick={() => setArea(id)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                    area === id
                      ? 'border-orange-500 bg-orange-500/15 text-white shadow-[0_0_16px_rgba(249,115,22,0.15)]'
                      : 'border-stone-800 bg-stone-900 text-stone-300 hover:border-stone-600'
                  }`}
                >
                  <span className="mr-1.5">{a.emoji}</span>
                  {a.nombre}
                  {dominada && <span className="ml-1 text-xs text-emerald-400" title="Área dominada">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Dificultad */}
      <div>
        <p className="text-overline mb-2">DIFICULTAD</p>
        <div className="grid grid-cols-3 gap-2">
          {NIVELES.map((n) => (
            <button
              key={n.id}
              onClick={() => setNivel(n.id)}
              className={`rounded-xl border px-3 py-2.5 text-center transition-all ${
                nivel === n.id
                  ? 'border-orange-500 bg-orange-500/15 text-white'
                  : 'border-stone-800 bg-stone-900 text-stone-400 hover:border-stone-600'
              }`}
            >
              <div className="text-lg">{n.emoji}</div>
              <div className="text-sm font-bold">{n.nombre}</div>
              <div className="text-[10px] text-stone-500">{n.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Jugar */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Boton
          onClick={() => onJugar(modo, modo === 'area' ? area : null, nivel)}
          className="w-full py-4 text-lg"
          disabled={disponibles < PREGUNTAS_POR_RONDA}
        >
          🎮 JUGAR {PREGUNTAS_POR_RONDA} PREGUNTAS
        </Boton>
        {disponibles < PREGUNTAS_POR_RONDA && (
          <p className="text-center text-xs text-stone-500">
            Solo hay {disponibles} preguntas de {nivel} en esta selección — elige otra dificultad o modo mixto.
          </p>
        )}

        {/* Reset */}
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-center text-xs text-stone-600 hover:text-red-400"
          >
            🗑️ Reiniciar progreso
          </button>
        ) : (
          <div className="card-enter flex flex-col items-center gap-2 rounded-xl border border-red-900/60 bg-red-950/30 p-3">
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
      <div className="text-xl font-extrabold text-white">{valor}</div>
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
      className={`rounded-2xl border p-4 text-left transition-all ${
        activo
          ? 'border-orange-500 bg-orange-500/15 shadow-[0_0_20px_rgba(249,115,22,0.12)]'
          : 'border-stone-800 bg-stone-900 hover:border-stone-600'
      }`}
    >
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 font-bold text-white">{titulo}</div>
      <div className="text-xs text-stone-400">{desc}</div>
    </button>
  )
}
