/**
 * @juegahiphop/sdk — Helpers de mensajes postMessage
 *
 * Copia local sincronizada con packages/juegahiphop-sdk/
 * Mantener actualizado cuando se modifique el paquete.
 *
 * Funciones para crear, enviar, validar y recibir mensajes
 * del protocolo JuegaHipHop.
 */

import type {
  JuegaHipHopMessage,
  MessagePayloadMap,
  MessageType,
  GameEventHandlers,
  LobbyEventHandlers,
} from './types'
import { PROTOCOL_VERSION } from './types'

// ─── Crear mensaje ───

export function createMessage<T extends MessageType>(
  type: T,
  payload: MessagePayloadMap[T],
  source: 'lobby' | 'game',
  options?: {
    gameId?: string
    requestId?: string
  },
): JuegaHipHopMessage<MessagePayloadMap[T]> {
  return {
    type,
    payload,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    source,
    ...(options?.gameId ? { gameId: options.gameId } : {}),
    ...(options?.requestId ? { requestId: options.requestId } : {}),
  }
}

// ─── Validar mensaje ───

export function isValidMessage(data: unknown): data is JuegaHipHopMessage {
  if (!data || typeof data !== 'object') return false
  const msg = data as Record<string, unknown>
  return (
    typeof msg.type === 'string' &&
    msg.type.startsWith('jh:') &&
    typeof msg.timestamp === 'number' &&
    (msg.source === 'lobby' || msg.source === 'game')
  )
}

// ─── Enviar mensaje a un target específico ───

export function sendMessage<T extends MessageType>(
  target: Window | HTMLIFrameElement | null,
  type: T,
  payload: MessagePayloadMap[T],
  targetOrigin: string,
  source: 'lobby' | 'game',
  options?: {
    gameId?: string
    requestId?: string
  },
): void {
  if (!target) return

  const win = target instanceof HTMLIFrameElement ? target.contentWindow : target
  if (!win) return

  const message = createMessage(type, payload, source, options)
  win.postMessage(message, targetOrigin)
}

// ─── Escuchar mensajes (genérico) ───

export interface MessageListener {
  unsubscribe: () => void
}

export function listenMessages(
  handler: (message: JuegaHipHopMessage) => void,
  allowedOrigins?: string[],
): MessageListener {
  const onMessage = (event: MessageEvent) => {
    // Validar origen si hay lista blanca
    if (allowedOrigins && allowedOrigins.length > 0) {
      if (!allowedOrigins.includes(event.origin)) return
    }

    // Validar formato del mensaje
    if (!isValidMessage(event.data)) return

    handler(event.data as JuegaHipHopMessage)
  }

  window.addEventListener('message', onMessage)

  return {
    unsubscribe: () => window.removeEventListener('message', onMessage),
  }
}

// ─── Conectar callbacks del juego (iframe) ───

export function connectGameCallbacks(
  listener: MessageListener,
  handlers: GameEventHandlers,
  allowedOrigins?: string[],
): MessageListener {
  const { unsubscribe: unsubParent } = listenMessages((msg) => {
    switch (msg.type) {
      case 'jh:pause':
        handlers.onPause?.(msg.payload)
        break
      case 'jh:resume':
        handlers.onResume?.(msg.payload)
        break
      case 'jh:session_context':
        handlers.onSessionContext?.(msg.payload as never)
        break
      case 'jh:progress_data':
        handlers.onProgressData?.(msg.payload as never)
        break
      case 'jh:save_result':
        handlers.onSaveResult?.(msg.payload as never)
        break
      case 'jh:achievement_result':
        handlers.onAchievementResult?.(msg.payload as never)
        break
      case 'jh:campaign_response':
        handlers.onCampaignResponse?.(msg.payload as never)
        break
      case 'jh:end_session':
        handlers.onEndSession?.(msg.payload as never)
        break
      case 'jh:viewport_changed':
        handlers.onViewportChanged?.(msg.payload as never)
        break
    }
  }, allowedOrigins)

  return {
    unsubscribe: () => {
      unsubParent()
      listener.unsubscribe()
    },
  }
}

// ─── Conectar callbacks del lobby ───

export function connectLobbyCallbacks(
  handlers: LobbyEventHandlers,
  allowedOrigins?: string[],
): MessageListener {
  return listenMessages((msg) => {
    switch (msg.type) {
      case 'jh:game_ready':
        handlers.onGameReady?.(msg.payload as never)
        break
      case 'jh:game_started':
        handlers.onGameStarted?.(msg.payload as never)
        break
      case 'jh:game_completed':
        handlers.onGameCompleted?.(msg.payload as never)
        break
      case 'jh:score_updated':
        handlers.onScoreUpdated?.(msg.payload as never)
        break
      case 'jh:request_fullscreen':
        handlers.onRequestFullscreen?.(msg.payload)
        break
      case 'jh:exit_game':
        handlers.onExitGame?.(msg.payload as never)
        break
      case 'jh:error':
        handlers.onError?.(msg.payload as never)
        break
      case 'jh:save_progress':
        handlers.onSaveProgress?.(msg.payload as never)
        break
      case 'jh:load_progress':
        handlers.onLoadProgress?.(msg.payload as never)
        break
      case 'jh:unlock_achievement':
        handlers.onUnlockAchievement?.(msg.payload as never)
        break
      case 'jh:campaign_request':
        handlers.onCampaignRequest?.(msg.payload as never)
        break
    }
  }, allowedOrigins)
}
