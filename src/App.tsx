/**
 * Trivia Hip Hop — App principal + integración SDK del lobby
 *
 * Reglas del protocolo (v2):
 * - UN solo game_completed por partida (el lobby ignora los demás)
 * - score = puntos de ESA partida (nunca acumulados)
 * - completed SIEMPRE explícito
 * - save_progress con progress: { current, total, label } = áreas dominadas
 * - resetProgress({ confirm: true }) + bandera anti-revive
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createLobbyClient } from './lib/sdk/lobby-client'
import type { SessionContextPayload } from './lib/sdk/types'
import { SplashScreen } from './components/SplashScreen'
import { HomeScreen } from './components/HomeScreen'
import { QuizScreen } from './components/QuizScreen'
import { ResultsScreen } from './components/ResultsScreen'
import { useAudio } from './hooks/useAudio'
import type { LogroDef } from './game/achievements'
import { evaluarLogros } from './game/achievements'
import {
  aplicarRonda,
  cargarLocal,
  estadoInicial,
  guardarLocal,
  mergeEstados,
} from './game/progress'
import { seleccionarPreguntas, analizarDebilidades } from './game/quiz'
import type { Dificultad, Pregunta, QuizConfig, RespuestaResult, Screen, TriviaState } from './game/types'

const GAME_ID = 'trivia'
const LOBBY_ORIGIN = 'https://juegahiphop.cl'
const RESET_PENDING_KEY = 'trivia_reset_pending'

/** Nombres de dificultad para el SDK del lobby (metadata) */
const DIFICULTAD_SDK: Record<Dificultad, string> = {
  1: 'facil',
  2: 'medio',
  3: 'dificil',
  4: 'experto',
}

interface RondaResultado {
  config: QuizConfig
  resultados: RespuestaResult[]
  score: number
  aciertos: number
  total: number
  dominada: boolean
  esNuevoRecord: boolean
}

export default function App() {
  const audio = useAudio()

  // ─── Estado de UI ───
  const [screen, setScreen] = useState<Screen>('splash')
  const [splashLabel, setSplashLabel] = useState('Cargando preguntas…')
  const [config, setConfig] = useState<QuizConfig | null>(null)
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [ronda, setRonda] = useState<RondaResultado | null>(null)
  const [pausado, setPausado] = useState(false)
  const [nuevosLogros, setNuevosLogros] = useState<LogroDef[]>([])

  // ─── Estado de juego ───
  const [estado, setEstado] = useState<TriviaState>(estadoInicial)
  const [esInvitado, setEsInvitado] = useState(true)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [resetPendiente, setResetPendiente] = useState(false)

  const lobbyRef = useRef<ReturnType<typeof createLobbyClient> | null>(null)
  const estadoRef = useRef<TriviaState>(estadoInicial())
  estadoRef.current = estado

  const partidaTerminadaRef = useRef(false)
  const startRef = useRef(0)
  const logrosNotificadosRef = useRef<Set<string>>(new Set())

  // ═══════════════════════════════════════════════════════
  //  Progreso: cargar / guardar / reset
  //  (declarados antes del useEffect de montaje — lo usa)
  // ═══════════════════════════════════════════════════════

  const syncAlLobby = useCallback(async (est: TriviaState) => {
    const lobby = lobbyRef.current
    if (!lobby) return
    try {
      await lobby.saveProgress({
        gameState: est as unknown as Record<string, unknown>,
        score: Math.max(...Object.values(est.mejoresPuntajes), est.mejorMixto, 0),
        progress: {
          current: est.areasCompletadas.length,
          total: 12,
          label: 'Áreas',
        },
      })
    } catch {
      /* invitado o lobby caído — no crítico */
    }
  }, [])

  const cargarProgresoRemoto = useCallback(async (ctx: SessionContextPayload) => {
    const lobby = lobbyRef.current
    if (!lobby || ctx.isGuest) {
      // Invitado: solo local
      const local = cargarLocal()
      setEstado(local)
      return
    }
    try {
      const data = await lobby.loadProgress()
      const local = cargarLocal()
      const remoto = (data.gameState as TriviaState | null) ?? null

      // Bandera anti-revive: si hay un reset pendiente, el local post-reset manda
      if (localStorage.getItem(RESET_PENDING_KEY) === '1') {
        setEstado(local)
        void syncAlLobby(local)
        localStorage.removeItem(RESET_PENDING_KEY)
        return
      }

      const merge = mergeEstados(local, remoto)
      setEstado(merge)
      logrosNotificadosRef.current = new Set(merge.desbloqueados)
      guardarLocal(merge)
    } catch {
      // Lobby no respondió — seguimos con local
      const local = cargarLocal()
      setEstado(local)
    }
  }, [syncAlLobby])

  const guardarProgreso = useCallback(async () => {
    guardarLocal(estadoRef.current)
    await syncAlLobby(estadoRef.current)
  }, [syncAlLobby])

  const handleReset = useCallback(async () => {
    setResetPendiente(true)
    const limpio = estadoInicial()
    setEstado(limpio)
    estadoRef.current = limpio
    guardarLocal(limpio)
    localStorage.setItem(RESET_PENDING_KEY, '1')
    logrosNotificadosRef.current = new Set()

    const lobby = lobbyRef.current
    if (lobby) {
      try {
        await lobby.resetProgress({ confirm: true })
      } catch {
        /* invitado: el lobby responde error, el reset local ya corrió */
      }
    }
    setResetPendiente(false)
  }, [])

  // ═══════════════════════════════════════════════════════
  //  SDK: ciclo de vida
  // ═══════════════════════════════════════════════════════

  useEffect(() => {
    // Cargar progreso local inmediato (standalone también juega)
    const local = cargarLocal()
    setEstado(local)
    logrosNotificadosRef.current = new Set(local.desbloqueados)

    const lobby = createLobbyClient({
      lobbyOrigin: LOBBY_ORIGIN,
      gameId: GAME_ID,
      capabilities: ['save_progress', 'achievements'],
    })
    lobbyRef.current = lobby

    lobby.onSessionContext((ctx) => {
      setEsInvitado(ctx.isGuest)
      setDisplayName(ctx.displayName ?? null)
      void cargarProgresoRemoto(ctx)
    })

    lobby.onPause(() => {
      setPausado(true)
    })
    lobby.onResume(() => {
      setPausado(false)
    })
    lobby.onEndSession(() => {
      // El lobby cierra la sesión — guardar lo que haya y limpiar
      void guardarProgreso()
      lobby.destroy()
      lobbyRef.current = null
    })

    // ¡Listos! (después de montar — los assets son estáticos)
    setSplashLabel('Conectando con el lobby…')
    lobby.sendReady({ version: '1.0.0' })

    // Splash mínimo (asegura que el handshake llegó antes de la home)
    const t = window.setTimeout(() => setScreen('home'), 900)
    return () => {
      window.clearTimeout(t)
      lobby.destroy()
      lobbyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ═══════════════════════════════════════════════════════
  //  Partida
  // ═══════════════════════════════════════════════════════

  const empezarPartida = useCallback(
    (modo: 'area' | 'mixto', area: string | null, dificultad: Dificultad) => {
      const cfg: QuizConfig = { modo, area: area ?? undefined, dificultad }
      const preg = seleccionarPreguntas(cfg, estadoRef.current)
      if (preg.length === 0) return

      setConfig(cfg)
      setPreguntas(preg)
      setRonda(null)
      setNuevosLogros([])
      setPausado(false)
      partidaTerminadaRef.current = false
      startRef.current = Date.now()
      setScreen('quiz')

      // Notificar inicio de partida al lobby (telemetría)
      lobbyRef.current?.sendGameStarted({
        levelId: modo === 'area' ? (area ?? undefined) : 'mixto',
        difficulty: DIFICULTAD_SDK[dificultad],
      })
    },
    [],
  )

  const terminarPartida = useCallback(
    (resultados: RespuestaResult[], score: number, aciertos: number) => {
      if (partidaTerminadaRef.current || !config) return
      partidaTerminadaRef.current = true

      const total = resultados.length
      const timeSpent = Math.round((Date.now() - startRef.current) / 1000)
      const dominada = config.modo === 'area' && aciertos / total >= 0.6

      // Récord personal (con el estado ANTES de aplicar la ronda)
      const prev = estadoRef.current
      const esNuevoRecord =
        config.modo === 'area' && config.area
          ? score > (prev.mejoresPuntajes[config.area] ?? 0)
          : score > prev.mejorMixto

      // 1. Actualizar estado persistido (cálculo puro con detalle por pregunta)
      const nuevo = aplicarRonda(prev, {
        modo: config.modo,
        area: config.area,
        aciertos,
        total,
        score,
        resultados,
      })
      const ultimoAcierto = [...resultados].reverse().find((r) => r.correcta)
      const tUltimo = ultimoAcierto?.tiempoSegundos ?? 0

      // 2. Logros nuevos
      const nuevos = evaluarLogros({
        totalCorrectas: nuevo.totalCorrectas,
        totalPartidas: nuevo.totalPartidas,
        rachaMaxima: nuevo.rachaMaxima,
        areasCompletadas: nuevo.areasCompletadas,
        desbloqueados: nuevo.desbloqueados,
        aciertosRonda: aciertos,
        tiempoUltimoAcierto: tUltimo,
      })
      if (nuevos.length > 0) {
        nuevo.desbloqueados = [...new Set([...nuevo.desbloqueados, ...nuevos.map((l) => l.id)])]
        setNuevosLogros(nuevos)

        // Notificar logros al lobby (uno por uno, saltando ya notificados)
        const lobby = lobbyRef.current
        const yaNotificados = logrosNotificadosRef.current
        for (const l of nuevos) {
          if (yaNotificados.has(l.id)) continue
          // Fire-and-forget: si el lobby no responde (standalone/timeout), no romper la partida
          lobby?.unlockAchievement({ achievementId: l.id, metadata: { score } })?.catch(() => {})
          yaNotificados.add(l.id)
        }
      }

      // 3. game_completed — UNO por partida
      lobbyRef.current?.sendGameCompleted({
        score,
        itemId: config.modo === 'area' ? (config.area ?? 'mixto') : 'mixto',
        difficulty: DIFICULTAD_SDK[config.dificultad],
        timeSpent,
        completed: true,
        metadata: {
          aciertos,
          total,
          rachaMaxima: nuevo.rachaMaxima,
        },
      })

      // 4. Persistir (local + lobby)
      setEstado(nuevo)
      estadoRef.current = nuevo
      guardarLocal(nuevo)
      void syncAlLobby(nuevo)

      // 4b. Ad interstitial al terminar la ronda (placement: game_results).
      // Fire-and-forget: si el lobby no tiene campaña o no responde,
      // resuelve de inmediato y la pantalla de resultados sigue normal.
      lobbyRef.current
        ?.requestCampaign({ placement: 'game_results', rewardIds: [] })
        .catch(() => {})

      // 5. Pantalla de resultados
      setRonda({ config, resultados, score, aciertos, total, dominada, esNuevoRecord })
      setScreen('results')
    },
    [config, syncAlLobby],
  )

  const abandonarPartida = useCallback(() => {
    if (!partidaTerminadaRef.current) {
      // Abandono → game_completed con completed: false (el lobby cierra la sesión)
      lobbyRef.current?.sendGameCompleted({
        score: 0,
        itemId: config?.modo === 'area' ? (config.area ?? 'mixto') : 'mixto',
        difficulty: config ? DIFICULTAD_SDK[config.dificultad] : 'facil',
        timeSpent: Math.round((Date.now() - startRef.current) / 1000),
        completed: false,
      })
      partidaTerminadaRef.current = true
    }
    setScreen('home')
  }, [config])

  const salir = useCallback(() => {
    lobbyRef.current?.sendExitGame({ reason: 'user_quit', saveBeforeExit: true })
  }, [])

  const revancha = useCallback(() => {
    if (!config) return
    empezarPartida(config.modo, config.area ?? null, config.dificultad)
  }, [config, empezarPartida])

  // ═══════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════

  if (screen === 'splash') return <SplashScreen label={splashLabel} />

  // Transición suave entre pantallas (key + screen-enter)
  return (
    <div key={screen} className="screen-enter h-full">
      {screen === 'quiz' && config ? (
        <QuizScreen
          config={config}
          preguntas={preguntas}
          onTerminar={terminarPartida}
          onAbandonar={abandonarPartida}
          audio={{
            playCorrect: audio.playCorrect,
            playWrong: audio.playWrong,
            playTick: audio.playTick,
            playLose: audio.playLose,
          }}
          pausado={pausado}
        />
      ) : screen === 'results' && ronda ? (
        <ResultsScreen
          score={ronda.score}
          aciertos={ronda.aciertos}
          total={ronda.total}
          resultados={ronda.resultados}
          area={ronda.config.area ?? null}
          modo={ronda.config.modo}
          nuevosLogros={nuevosLogros}
          dominada={ronda.dominada}
          esNuevoRecord={ronda.esNuevoRecord}
          displayName={displayName}
          debilidades={analizarDebilidades(estado, 3)}
          onRevancha={revancha}
          onHome={() => setScreen('home')}
          onSalir={salir}
        />
      ) : (
        <HomeScreen
          estado={estado}
          esInvitado={esInvitado}
          displayName={displayName}
          onJugar={empezarPartida}
          onReset={handleReset}
          onSalir={salir}
          resetPendiente={resetPendiente}
        />
      )}
    </div>
  )
}
