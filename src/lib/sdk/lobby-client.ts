/**
 * @juegahiphop/sdk — LobbyClient
 *
 * Cliente que se usa DENTRO del juego (ejecutándose en un iframe)
 * para comunicarse con el Lobby que lo contiene.
 *
 * El lobby es el CEREBRO: maneja usuario, sesión, y persistencia.
 * Los juegos son stateless desde el punto de vista del backend.
 * Toda lectura/escritura va por postMessage al lobby.
 *
 * Uso:
 *   import { createLobbyClient } from '@juegahiphop/sdk'
 *
 *   const lobby = createLobbyClient({ lobbyOrigin: 'https://juegahiphop.cl' })
 *
 *   // Anunciar que el juego está listo
 *   lobby.sendReady({ version: '1.0.0' })
 *
 *   // Escuchar eventos del lobby
 *   lobby.onPause(() => { /* pausar juego *​/ })
 *   lobby.onSessionContext((ctx) => { /* recibir datos del usuario *​/ })
 *   lobby.onProgressData((data) => { /* cargar progreso guardado *​/ })
 *
 *   // Guardar/cargar progreso (vía el lobby)
 *   const result = await lobby.saveProgress({ gameState: { ... }, score: 100 })
 *   const data = await lobby.loadProgress()
 *
 *   // Registrar completion / logro
 *   lobby.sendGameCompleted({ score: 1000, itemId: 'nivel-3' })
 *   lobby.sendAchievementUnlocked({ achievementId: 'first_win' })
 *
 *   // Salir
 *   lobby.sendExitGame({ reason: 'user_quit' })
 */

import type { LobbyClientOptions } from './types'
import { listenMessages } from './messages'
import { MessageType } from './types'
import type {
  GameReadyPayload,
  GameStartedPayload,
  GameCompletedPayload,
  ScoreUpdatedPayload,
  ExitGamePayload,
  ErrorPayload,
  SaveProgressPayload,
  LoadProgressPayload,
  UnlockAchievementPayload,
  CampaignRequestPayload,
  ResetProgressPayload,
  ResetResultPayload,
  SessionContextPayload,
  ProgressDataPayload,
  SaveResultPayload,
  AchievementResultPayload,
  CampaignResponsePayload,
  EndSessionPayload,
  MessageCallback,
} from './types'
import { PROTOCOL_VERSION, createRequestId } from './types'

// ─── Tipos de promesas pendientes ───

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface LobbyClientInstance {
  // ═══ Ciclo de vida (fire-and-forget) ═══
  /** Anunciar que el juego terminó de cargar */
  sendReady: (payload: GameReadyPayload) => void
  /** Anunciar que empezó una partida */
  sendGameStarted: (payload?: GameStartedPayload) => void
  /** Anunciar que una partida terminó */
  sendGameCompleted: (payload: GameCompletedPayload) => void
  /** Actualizar puntaje en vivo */
  sendScoreUpdated: (payload: ScoreUpdatedPayload) => void
  /** Solicitar pantalla completa al lobby */
  requestFullscreen: () => void
  /** Solicitar volver al lobby */
  sendExitGame: (payload?: ExitGamePayload) => void
  /** Reportar un error */
  sendError: (payload: ErrorPayload) => void

  // ═══ Persistencia (request/response, devuelve promesa) ═══
  /** Guardar el estado del juego en el backend (vía lobby) */
  saveProgress: (payload: SaveProgressPayload) => Promise<SaveResultPayload>
  /** Cargar el estado guardado del juego (vía lobby) */
  loadProgress: (payload?: LoadProgressPayload) => Promise<ProgressDataPayload>
  /** Registrar un logro desbloqueado (vía lobby) */
  unlockAchievement: (payload: UnlockAchievementPayload) => Promise<AchievementResultPayload>
  /** Solicitar campaña recompensada (vía lobby) */
  requestCampaign: (payload: CampaignRequestPayload) => Promise<CampaignResponsePayload>
  /** RESETEAR el progreso del juego (vía lobby — borra todo en Supabase) */
  resetProgress: (payload?: ResetProgressPayload) => Promise<ResetResultPayload>

  // ═══ Listeners (eventos del lobby) ═══
  /** Escuchar contexto de sesión (perfil, userId, etc.) */
  onSessionContext: (cb: MessageCallback<SessionContextPayload>) => void
  /** Escuchar pausa del lobby */
  onPause: (cb: MessageCallback) => void
  /** Escuchar reanudación del lobby */
  onResume: (cb: MessageCallback) => void
  /** Escuchar cierre de sesión */
  onEndSession: (cb: MessageCallback<EndSessionPayload>) => void

  /** Destruir la instancia y limpiar listeners */
  destroy: () => void
}

const DEFAULT_TIMEOUT = 10000 // 10s para respuestas del lobby

export function createLobbyClient(options: LobbyClientOptions): LobbyClientInstance {
  const { lobbyOrigin, capabilities, gameId } = options

  let destroyed = false

  // El origen del lobby es el que nos contiene (window.parent)
  const parentWindow = window.parent !== window ? window.parent : null

  // Helper para enviar mensajes al lobby
  const send = (type: string, payload: unknown, requestId?: string) => {
    if (destroyed || !parentWindow) return
    parentWindow.postMessage(
      {
        type,
        payload,
        timestamp: Date.now(),
        protocolVersion: PROTOCOL_VERSION,
        source: 'game',
        ...(gameId ? { gameId } : {}),
        ...(requestId ? { requestId } : {}),
      },
      lobbyOrigin,
    )
  }

  // ─── Promesas pendientes (request/response) ───
  const pendingSaves = new Map<string, PendingRequest<SaveResultPayload>>()
  const pendingLoads = new Map<string, PendingRequest<ProgressDataPayload>>()
  const pendingAchievements = new Map<string, PendingRequest<AchievementResultPayload>>()
  const pendingCampaigns = new Map<string, PendingRequest<CampaignResponsePayload>>()
  const pendingResets = new Map<string, PendingRequest<ResetResultPayload>>()

  // ─── Callback arrays (eventos push) ───
  let pauseCb: MessageCallback[] = []
  let resumeCb: MessageCallback[] = []
  let sessionContextCb: MessageCallback<SessionContextPayload>[] = []
  let endSessionCb: MessageCallback<EndSessionPayload>[] = []

  // ─── Escuchar respuestas del lobby ───
  const responseListener = listenMessages((msg) => {
    if (msg.source !== 'lobby') return

    switch (msg.type) {
      case MessageType.SESSION_CONTEXT:
        sessionContextCb.forEach((cb) => cb(msg.payload as SessionContextPayload))
        break

      case MessageType.PAUSE:
        pauseCb.forEach((cb) => cb(msg.payload))
        break

      case MessageType.RESUME:
        resumeCb.forEach((cb) => cb(msg.payload))
        break

      case MessageType.END_SESSION:
        endSessionCb.forEach((cb) => cb(msg.payload as EndSessionPayload))
        break

      case MessageType.SAVE_RESULT: {
        const resp = msg.payload as SaveResultPayload
        const pending = pendingSaves.get(resp.requestId)
        if (pending) {
          clearTimeout(pending.timer)
          pendingSaves.delete(resp.requestId)
          pending.resolve(resp)
        }
        break
      }

      case MessageType.PROGRESS_DATA: {
        const resp = msg.payload as ProgressDataPayload
        const pending = pendingLoads.get(resp.requestId)
        if (pending) {
          clearTimeout(pending.timer)
          pendingLoads.delete(resp.requestId)
          pending.resolve(resp)
        }
        break
      }

      case MessageType.ACHIEVEMENT_RESULT: {
        const resp = msg.payload as AchievementResultPayload
        const pending = pendingAchievements.get(resp.requestId)
        if (pending) {
          clearTimeout(pending.timer)
          pendingAchievements.delete(resp.requestId)
          pending.resolve(resp)
        }
        break
      }

      case MessageType.CAMPAIGN_RESPONSE: {
        const resp = msg.payload as CampaignResponsePayload
        const pending = pendingCampaigns.get(resp.requestId)
        if (pending) {
          clearTimeout(pending.timer)
          pendingCampaigns.delete(resp.requestId)
          pending.resolve(resp)
        }
        break
      }

      case MessageType.RESET_RESULT: {
        const resp = msg.payload as ResetResultPayload
        const pending = pendingResets.get(resp.requestId)
        if (pending) {
          clearTimeout(pending.timer)
          pendingResets.delete(resp.requestId)
          pending.resolve(resp)
        }
        break
      }
    }
  }, [lobbyOrigin])

  // ─── Helper: crear promesa request/response con timeout ───
  const createPending = <T>(
    map: Map<string, PendingRequest<T>>,
    type: string,
    payload: unknown,
    timeoutMs = DEFAULT_TIMEOUT,
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      if (destroyed) {
        reject(new Error('Cliente destruido'))
        return
      }
      const requestId = createRequestId()
      const timer = setTimeout(() => {
        map.delete(requestId)
        reject(new Error(`Timeout: el lobby no respondió a ${type}`))
      }, timeoutMs)
      map.set(requestId, { resolve, reject, timer })
      send(type, payload, requestId)
    })
  }

  const instance: LobbyClientInstance = {
    // ═══ Ciclo de vida ═══
    sendReady: (payload: GameReadyPayload) => {
      if (destroyed) return
      send(MessageType.GAME_READY, {
        ...payload,
        protocolVersion: PROTOCOL_VERSION,
        capabilities,
      })
    },

    sendGameStarted: (payload?: GameStartedPayload) => {
      if (destroyed) return
      send(MessageType.GAME_STARTED, payload ?? {})
    },

    sendGameCompleted: (payload: GameCompletedPayload) => {
      if (destroyed) return
      send(MessageType.GAME_COMPLETED, payload)
    },

    sendScoreUpdated: (payload: ScoreUpdatedPayload) => {
      if (destroyed) return
      send(MessageType.SCORE_UPDATED, payload)
    },

    requestFullscreen: () => {
      if (destroyed) return
      send(MessageType.REQUEST_FULLSCREEN, undefined)
    },

    sendExitGame: (payload?: ExitGamePayload) => {
      if (destroyed) return
      send(MessageType.EXIT_GAME, payload ?? {})
    },

    sendError: (payload: ErrorPayload) => {
      if (destroyed) return
      send(MessageType.ERROR, payload)
    },

    // ═══ Persistencia (request/response) ═══
    saveProgress: (payload: SaveProgressPayload): Promise<SaveResultPayload> => {
      return createPending(pendingSaves, MessageType.SAVE_PROGRESS, payload)
    },

    loadProgress: (payload?: LoadProgressPayload): Promise<ProgressDataPayload> => {
      return createPending(pendingLoads, MessageType.LOAD_PROGRESS, payload ?? {})
    },

    unlockAchievement: (payload: UnlockAchievementPayload): Promise<AchievementResultPayload> => {
      return createPending(pendingAchievements, MessageType.UNLOCK_ACHIEVEMENT, payload)
    },

    requestCampaign: (payload: CampaignRequestPayload): Promise<CampaignResponsePayload> => {
      return createPending(pendingCampaigns, MessageType.CAMPAIGN_REQUEST, payload, 30000)
    },

    resetProgress: (payload?: ResetProgressPayload): Promise<ResetResultPayload> => {
      return createPending(pendingResets, MessageType.RESET_PROGRESS, payload ?? {})
    },

    // ═══ Listeners ═══
    onSessionContext: (cb: MessageCallback<SessionContextPayload>) => { sessionContextCb.push(cb) },
    onPause: (cb: MessageCallback) => { pauseCb.push(cb) },
    onResume: (cb: MessageCallback) => { resumeCb.push(cb) },
    onEndSession: (cb: MessageCallback<EndSessionPayload>) => { endSessionCb.push(cb) },

    // ═══ Cleanup ═══
    destroy: () => {
      destroyed = true
      responseListener.unsubscribe()
      // Cancelar todas las promesas pendientes
      for (const [, pending] of pendingSaves) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Cliente destruido'))
      }
      pendingSaves.clear()
      for (const [, pending] of pendingLoads) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Cliente destruido'))
      }
      pendingLoads.clear()
      for (const [, pending] of pendingAchievements) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Cliente destruido'))
      }
      pendingAchievements.clear()
      for (const [, pending] of pendingCampaigns) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Cliente destruido'))
      }
      pendingCampaigns.clear()
      for (const [, pending] of pendingResets) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Cliente destruido'))
      }
      pendingResets.clear()
      pauseCb = []
      resumeCb = []
      sessionContextCb = []
      endSessionCb = []
    },
  }

  return instance
}
