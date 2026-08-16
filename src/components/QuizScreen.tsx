/**
 * Trivia Hip Hop — pantalla de juego: pregunta + opciones + timer + APRENDIZAJE
 *
 * Motor Final (§22, §30-31): después de responder se muestra el panel de
 * aprendizaje — respuesta correcta, explicación, contexto (periodo/lugar),
 * fuente y conocimientos relacionados. La trivia enseña, no solo puntúa:
 * Pregunta → Respuesta → Explicación → Conocimiento → Relación.
 *
 * Estética v2: opciones píldora, feedback "pegatina" (cápsula con sombra),
 * timer con glow y panel de aprendizaje glass.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pregunta, QuizConfig, RespuestaResult } from '../game/types'
import { TIEMPO_POR_PREGUNTA, evaluarRespuesta, EJES, OPERACIONES, DIFICULTADES, PREGUNTAS } from '../game/quiz'
import { AREAS } from './HomeScreen'
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

/** Mapa entrada_id → término (para chips de conocimientos relacionados) */
const titulosPorEntrada = new Map<string, string>()
for (const p of PREGUNTAS) {
  if (!titulosPorEntrada.has(p.entrada_id)) titulosPorEntrada.set(p.entrada_id, p.termino)
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
  const [verPista, setVerPista] = useState(false)

  const terminadoRef = useRef(false)
  const pausadoRef = useRef(pausado)
  pausadoRef.current = pausado

  const pregunta = preguntas[indice]
  const total = preguntas.length
  const areaNombre = config.modo === 'area' && config.area ? AREAS[config.area]?.nombre ?? config.area : 'Mixto'
  const areaEmoji = config.modo === 'area' && config.area ? AREAS[config.area]?.emoji ?? '📚' : '🎲'

  const respondida = elegido !== null

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
    },
    [elegido, pregunta, racha, resultados, tiempoRestante, audio],
  )

  // ─── Avanzar (desde el panel de aprendizaje) ───
  const siguiente = useCallback(() => {
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
      setVerPista(false)
    }
  }, [indice, total, resultados, onTerminar])

  const opciones = useMemo(() => {
    const o = pregunta?.opciones ?? []
    return o.map((texto, i) => ({ texto, i }))
  }, [pregunta])

  // Conocimientos relacionados (para el panel de aprendizaje)
  const relacionados = useMemo(() => {
    if (!pregunta) return []
    return (pregunta.relacionados ?? [])
      .slice(0, 4)
      .map((id) => titulosPorEntrada.get(id))
      .filter((t): t is string => !!t)
  }, [pregunta])

  if (!pregunta) return null

  const responderOpt = (i: number) => responder(i)
  const letras = ['A', 'B', 'C', 'D']
  const ejeMeta = EJES[pregunta.eje]
  const opMeta = OPERACIONES[pregunta.operacion]
  const difMeta = DIFICULTADES[pregunta.dificultad]
  const acertada = respondida && elegido === pregunta.indice_correcta
  const bajaTiempo = tiempoRestante <= 5 && !respondida

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3.5 px-4 py-4 safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onAbandonar}
          className="inline-flex h-8 items-center rounded-full border border-stone-700/70 bg-stone-800/80 px-3.5 text-xs font-bold text-stone-300 transition-all hover:border-red-500/50 hover:text-white active:scale-95"
        >
          ✕ Salir
        </button>
        <div className="inline-flex h-8 max-w-[45%] items-center gap-1.5 rounded-full border border-stone-700/60 bg-stone-900/80 px-3 text-xs font-semibold text-stone-200">
          <span className="text-sm leading-none">{areaEmoji}</span>
          <span className="truncate leading-none">{areaNombre}</span>
        </div>
        <div className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 text-xs font-black leading-none text-stone-950 shadow-[0_0_16px_rgba(249,115,22,0.35)]">
          {score.toLocaleString('es-CL')} pts
        </div>
      </div>

      {/* Progreso de ronda */}
      <div>
        <div className="mb-1 flex justify-between text-[11px] font-semibold text-stone-500">
          <span>
            Pregunta <span className="text-orange-400">{indice + 1}</span> de {total}
          </span>
          <span className={racha >= 3 ? 'text-orange-400' : ''}>Racha: {racha} 🔥</span>
        </div>
        <BarraProgreso valor={indice + (respondida ? 1 : 0)} total={total} />
      </div>

      {/* Tarjeta de pregunta */}
      <div key={indice} className="card-enter glass-deep rounded-3xl p-5">
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-orange-300">{difMeta.emoji} {difMeta.nombre}</span>
          <span className="rounded-full bg-stone-800/90 px-2.5 py-0.5 text-stone-400">{ejeMeta.emoji} {ejeMeta.nombre}</span>
          <span className="rounded-full bg-stone-800/90 px-2.5 py-0.5 text-stone-400">{opMeta.emoji} {opMeta.nombre}</span>
        </div>
        <h2 className="text-lg font-bold leading-snug text-white sm:text-xl">{pregunta.pregunta}</h2>

        {/* Pista contextual (bajo demanda — área · subcategoría, nunca revela la respuesta) */}
        {pregunta.pista && (
          <div className="mt-3 border-t border-stone-800/70 pt-2">
            <button
              onClick={() => setVerPista((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-400 transition-colors hover:text-orange-300"
            >
              <span className={`inline-block transition-transform duration-200 ${verPista ? 'rotate-90' : ''}`}>▸</span>
              💡 Pista
            </button>
            {verPista && (
              <p className="card-enter mt-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-xs font-semibold leading-relaxed text-orange-200/90">
                {pregunta.pista}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Timer */}
      {!respondida && (
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800/80">
            <div
              key={`t${indice}`}
              className={`ticker h-full rounded-full ${
                bajaTiempo
                  ? 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_14px_rgba(239,68,68,0.6)]'
                  : 'bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 shadow-[0_0_14px_rgba(249,115,22,0.45)]'
              }`}
              style={{ animationDuration: `${TIEMPO_POR_PREGUNTA}s`, animationPlayState: pausado ? 'paused' : 'running' }}
            />
          </div>
          <span
            className={`inline-flex h-6 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums transition-colors ${
              bajaTiempo ? 'animate-pulse bg-red-500/20 text-red-400' : 'bg-stone-800/80 text-stone-300'
            }`}
          >
            {tiempoRestante}s
          </span>
        </div>
      )}

      {/* Opciones (píldoras) */}
      <div className={`stagger-in flex flex-col gap-2.5 ${respondida ? 'pointer-events-none opacity-95' : ''}`}>
        {opciones.map(({ texto, i }) => {
          let estilo = 'border border-stone-800 bg-stone-900/90 text-stone-200 hover:border-orange-500/60 hover:bg-stone-800'
          let chip = 'bg-stone-800 text-stone-400'
          if (respondida) {
            if (i === pregunta.indice_correcta) {
              estilo =
                'bg-gradient-to-r from-emerald-500 to-emerald-400 text-emerald-950 shadow-[0_2px_0_rgba(0,0,0,0.35),0_10px_24px_rgba(16,185,129,0.35)]'
              chip = 'bg-emerald-950/20 text-emerald-950'
            } else if (i === elegido) {
              estilo =
                'animate-shake bg-gradient-to-r from-red-500 to-red-400 text-red-50 shadow-[0_2px_0_rgba(0,0,0,0.35),0_10px_24px_rgba(239,68,68,0.35)]'
              chip = 'bg-red-950/20 text-red-50'
            } else {
              estilo = 'border border-stone-800 bg-stone-900/40 text-stone-600'
              chip = 'bg-stone-800/60 text-stone-600'
            }
          }
          return (
            <button
              key={i}
              onClick={() => responderOpt(i)}
              disabled={respondida || pausado}
              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm font-semibold transition-all duration-150 active:scale-[0.99] disabled:cursor-default sm:text-base ${estilo}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                  respondida && i === pregunta.indice_correcta ? 'bg-emerald-950/25' : elegido === i ? 'bg-red-950/25' : chip
                }`}
              >
                {respondida && i === pregunta.indice_correcta ? '✓' : elegido === i ? '✗' : letras[i]}
              </span>
              <span className="leading-snug">{texto}</span>
            </button>
          )
        })}
      </div>

      {/* Feedback de puntos */}
      <div className="flex h-6 items-center justify-center">
        {respondida && (
          <span className={`animate-pop text-sm font-black ${acertada ? 'text-emerald-400' : 'text-red-400'}`}>
            {acertada ? `+${puntosGanados} pts` : finTiempo ? 'Tiempo agotado' : 'Sin puntos'}
          </span>
        )}
      </div>

      {/* ─── Panel de aprendizaje (Motor Final §22) ─── */}
      {respondida && (
        <div
          className={`card-enter rounded-3xl border-2 p-4 pb-5 ${
            acertada ? 'border-emerald-500/45 bg-emerald-950/25' : 'border-red-500/45 bg-red-950/25'
          }`}
        >
          <p className={`text-sm font-black ${acertada ? 'text-emerald-400' : 'text-red-400'}`}>
            {acertada ? '✅ ¡Correcto!' : finTiempo ? '⏰ Tiempo agotado' : '❌ Incorrecto'}
          </p>
          <p className="mt-1 text-sm font-bold text-white">
            {pregunta.termino}
            {!acertada && <span className="text-stone-400"> — la respuesta correcta era {letras[pregunta.indice_correcta]}</span>}
          </p>

          {(pregunta.explicacion || pregunta.respuesta) && (
            <p className="mt-2 text-sm leading-relaxed text-stone-300">
              {pregunta.explicacion || pregunta.respuesta}
            </p>
          )}

          {/* Contexto histórico/geográfico */}
          {(pregunta.periodo || pregunta.lugar) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {pregunta.periodo && (
                <span className="rounded-full bg-stone-800/90 px-2 py-0.5 text-stone-400">📅 {pregunta.periodo}</span>
              )}
              {pregunta.lugar && (
                <span className="rounded-full bg-stone-800/90 px-2 py-0.5 text-stone-400">📍 {pregunta.lugar}</span>
              )}
              {pregunta.subcategoria && pregunta.subcategoria.length > 0 && (
                <span className="rounded-full bg-stone-800/90 px-2 py-0.5 text-stone-400">
                  🗂️ {Array.isArray(pregunta.subcategoria) ? pregunta.subcategoria.join(', ') : pregunta.subcategoria}
                </span>
              )}
            </div>
          )}

          {/* Conocimientos relacionados (puerta de entrada a la Enciclopedia) */}
          {relacionados.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">También puedes aprender sobre</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {relacionados.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fuente (trazabilidad §12) */}
          {pregunta.source && (
            <p className="mt-2 border-t border-stone-800 pt-2 text-[10px] italic leading-snug text-stone-500">
              Fuente: {pregunta.source}
            </p>
          )}

          <button
            onClick={siguiente}
            className="btn-shine mt-3 w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 py-3.5 text-sm font-black text-stone-950 shadow-[0_4px_0_#9a3412,0_10px_26px_rgba(249,115,22,0.35)] transition-all hover:brightness-110 active:translate-y-0.5"
          >
            {indice + 1 >= total ? '🏁 VER RESULTADOS' : 'SIGUIENTE →'}
          </button>
        </div>
      )}

      {/* Overlay de pausa (el lobby pausa la sesión) */}
      {pausado && !respondida && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="animate-pop flex items-center gap-3 rounded-full border border-orange-500/40 bg-stone-900/95 px-6 py-3 shadow-glow-strong">
            <span className="text-xl">⏸</span>
            <span className="text-sm font-black tracking-widest text-white">PAUSADO</span>
          </div>
        </div>
      )}
    </div>
  )
}
