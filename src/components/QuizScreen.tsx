/**
 * Trivia Hip Hop — pantalla de juego: pregunta + opciones + timer
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pregunta, QuizConfig } from '../game/types'
import { TIEMPO_POR_PREGUNTA, evaluarRespuesta } from '../game/quiz'
import { AREAS } from './HomeScreen'
import type { RespuestaResult } from '../game/types'
import { BarraProgreso } from './ui'

interface Props {
  config: QuizConfig
  preguntas: Pregunta[]
  onTerminar: (resultados: RespuestaResult[], scoreTotal: number, aciertos: number) => void
  onAbandonar: () => void
  audio: {
    playCorrect: () => void
    playWrong: () => void
    playTick: () => void
    playLose: () => void
  }
  pausado: boolean
}

export function QuizScreen({ config, preguntas, onTerminar, onAbandonar, audio, pausado }: Props) {
  const [indice, setIndice] = useState(0)
  const [resultados, setResultados] = useState<RespuestaResult[]>([])
  const [score, setScore] = useState(0)
  const [racha, setRacha] = useState(0)
  const [elegido, setElegido] = useState<number | null>(null)
  const [tiempoRestante, setTiempoRestante] = useState(TIEMPO_POR_PREGUNTA)
  const [finTiempo, setFinTiempo] = useState(false)
  const [puntosGanados, setPuntosGanados] = useState<number | null>(null)

  const terminadoRef = useRef(false)
  const pausadoRef = useRef(pausado)
  pausadoRef.current = pausado

  const pregunta = preguntas[indice]
  const total = preguntas.length
  const areaNombre = config.modo === 'area' && config.area ? AREAS[config.area]?.nombre ?? config.area : 'Mixto'
  const areaEmoji = config.modo === 'area' && config.area ? AREAS[config.area]?.emoji ?? '📚' : '🎲'

  // ─── Timer (por pregunta) ───
  useEffect(() => {
    if (elegido !== null || finTiempo) return
    const interval = setInterval(() => {
      if (pausadoRef.current) return
      setTiempoRestante((t) => {
        if (t <= 1) {
          clearInterval(interval)
          // Tiempo agotado → se cuenta como incorrecta
          setFinTiempo(true)
          setElegido(-1) // -1 = no respondió
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [indice, elegido, finTiempo])

  // Tick sonoro en los últimos 5 segundos
  useEffect(() => {
    if (tiempoRestante <= 5 && tiempoRestante > 0 && elegido === null && !finTiempo) {
      audio.playTick()
    }
  }, [tiempoRestante, elegido, finTiempo, audio])

  // ─── Responder ───
  const responder = useCallback(
    (i: number) => {
      if (elegido !== null) return
      setElegido(i)
      const res = evaluarRespuesta(pregunta, i, racha, tiempoRestante)
      const nuevosResultados = [...resultados, res]
      setResultados(nuevosResultados)
      setScore((s) => s + res.puntos)
      if (res.correcta) {
        setRacha(res.racha)
        setPuntosGanados(res.puntos)
        audio.playCorrect()
      } else {
        setRacha(0)
        setPuntosGanados(0)
        audio.playWrong()
      }

      // Avanzar tras un delay breve (feedback visual)
      window.setTimeout(() => {
        if (indice + 1 >= total) {
          if (!terminadoRef.current) {
            terminadoRef.current = true
            onTerminar(nuevosResultados, nuevosResultados.reduce((s, r) => s + r.puntos, 0), nuevosResultados.filter((r) => r.correcta).length)
          }
        } else {
          setIndice((i) => i + 1)
          setElegido(null)
          setFinTiempo(false)
          setTiempoRestante(TIEMPO_POR_PREGUNTA)
          setPuntosGanados(null)
        }
      }, 1200)
    },
    [elegido, pregunta, racha, resultados, tiempoRestante, indice, total, onTerminar, audio],
  )

  // ─── Efecto de tiempo agotado (auto-avanzar) ───
  useEffect(() => {
    if (elegido === -1) {
      window.setTimeout(() => {
        if (indice + 1 >= total) {
          if (!terminadoRef.current) {
            terminadoRef.current = true
            onTerminar(resultados, resultados.reduce((s, r) => s + r.puntos, 0), resultados.filter((r) => r.correcta).length)
          }
        } else {
          setIndice((i) => i + 1)
          setElegido(null)
          setFinTiempo(false)
          setTiempoRestante(TIEMPO_POR_PREGUNTA)
          setPuntosGanados(null)
        }
      }, 1000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido])

  const opciones = useMemo(() => {
    const o = pregunta?.opciones ?? []
    return o.map((texto, i) => ({ texto, i }))
  }, [pregunta])

  if (!pregunta) return null

  const responderOpt = (i: number) => responder(i)
  const letras = ['A', 'B', 'C', 'D']

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 px-4 py-5 safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onAbandonar} className="rounded-xl bg-stone-800 px-3 py-1.5 text-xs font-bold text-stone-300 hover:bg-stone-700">
          ✕ Salir
        </button>
        <div className="flex items-center gap-2 text-xs font-semibold text-stone-300">
          <span className="text-base">{areaEmoji}</span>
          {areaNombre}
        </div>
        <div className="rounded-xl bg-stone-800 px-3 py-1.5 text-xs font-bold text-orange-400">
          {score.toLocaleString('es-CL')} pts
        </div>
      </div>

      {/* Progreso de ronda */}
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-stone-500">
          <span>Pregunta {indice + 1} de {total}</span>
          <span>Racha: {racha} 🔥</span>
        </div>
        <BarraProgreso valor={indice + (elegido !== null ? 1 : 0)} total={total} />
      </div>

      {/* Tarjeta de pregunta */}
      <div key={indice} className="card-enter rounded-2xl border border-stone-800 bg-stone-900/90 p-5">
        <p className="text-overline mb-2">{config.nivel}</p>
        <h2 className="text-lg font-bold leading-snug text-white sm:text-xl">{pregunta.pregunta}</h2>
      </div>

      {/* Timer */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-800">
        <div
          key={`t${indice}`}
          className={`ticker h-full rounded-full ${tiempoRestante <= 5 ? 'bg-red-500' : 'bg-orange-500'}`}
          style={{ animationDuration: `${TIEMPO_POR_PREGUNTA}s`, animationPlayState: pausado || elegido !== null ? 'paused' : 'running' }}
        />
      </div>
      <p className="-mt-2 text-center text-[11px] font-semibold text-stone-500">
        {elegido === null ? `${tiempoRestante}s` : '…'}
      </p>

      {/* Opciones */}
      <div className="stagger-in flex flex-col gap-2.5">
        {opciones.map(({ texto, i }) => {
          let estilo = 'border-stone-800 bg-stone-900 text-stone-200 hover:border-orange-500/60 hover:bg-stone-800'
          if (elegido !== null) {
            if (i === pregunta.indice_correcta) {
              estilo = 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
            } else if (i === elegido) {
              estilo = 'border-red-500 bg-red-500/15 text-red-300 animate-shake'
            } else {
              estilo = 'border-stone-800 bg-stone-900/50 text-stone-600'
            }
          }
          return (
            <button
              key={i}
              onClick={() => responderOpt(i)}
              disabled={elegido !== null || pausado}
              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm font-semibold transition-all active:scale-[0.99] disabled:cursor-default sm:text-base ${estilo}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  elegido !== null && i === pregunta.indice_correcta
                    ? 'bg-emerald-500 text-emerald-950'
                    : elegido === i
                      ? 'bg-red-500 text-red-950'
                      : 'bg-stone-800 text-stone-400'
                }`}
              >
                {elegido !== null && i === pregunta.indice_correcta ? '✓' : elegido === i ? '✗' : letras[i]}
              </span>
              <span>{texto}</span>
            </button>
          )
        })}
      </div>

      {/* Feedback de puntos */}
      <div className="h-8 text-center">
        {puntosGanados !== null && (
          <span className={`animate-pop inline-block text-sm font-black ${puntosGanados > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {puntosGanados > 0 ? `+${puntosGanados} pts` : 'Sin puntos'}
          </span>
        )}
      </div>
    </div>
  )
}
