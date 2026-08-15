/**
 * @juegahiphop/sdk — Tipos del protocolo de comunicación
 *
 * Copia local sincronizada con packages/juegahiphop-sdk/
 * Mantener actualizado cuando se modifique el paquete.
 *
 * Define el formato estándar de todos los mensajes intercambiados
 * entre el Lobby y los juegos mediante postMessage.
 *
 * Modelo: el Lobby es el CEREBRO — el único que toca Supabase.
 * Los juegos son stateless desde el punto de vista del backend.
 * Toda lectura/escritura de datos va por postMessage al lobby.
 *
 * Convención:
 * - Todos los tipos de mensaje usan prefijo "jh:" (JuegaHipHop)
 * - source identifica al emisor ('lobby' | 'game')
 * - timestamp en milisegundos (Date.now())
 * - requestId para operaciones que requieren respuesta (idempotencia)
 * - protocolVersion para compatibilidad entre versiones
 */

// ─── Versión del protocolo ───

export const PROTOCOL_VERSION = '2.0.0'

// ─── Formato base de cualquier mensaje ───

export interface JuegaHipHopMessage<T = unknown> {
  type: string
  payload?: T
  timestamp: number
  source: 'lobby' | 'game'
  gameId?: string
  /** ID único de solicitud para operaciones request/response */
  requestId?: string
  /** Versión del protocolo (para validación de compatibilidad) */
  protocolVersion?: string
}

// ─── Tipos de mensaje ───

export const MessageType = {
  // ═══ Game → Lobby: Ciclo de vida ═══
  /** El juego terminó de cargar y está listo */
  GAME_READY: 'jh:game_ready',
  /** El usuario empezó una partida */
  GAME_STARTED: 'jh:game_started',
  /** Una partida terminó (con resultado) */
  GAME_COMPLETED: 'jh:game_completed',
  /** Actualización de puntaje en vivo */
  SCORE_UPDATED: 'jh:score_updated',
  /** El juego solicita pantalla completa */
  REQUEST_FULLSCREEN: 'jh:request_fullscreen',
  /** El juego solicita volver al lobby */
  EXIT_GAME: 'jh:exit_game',
  /** Error desde el juego */
  ERROR: 'jh:error',

  // ═══ Game → Lobby: Persistencia (lobby = cerebro) ═══
  /** El juego solicita guardar su estado completo */
  SAVE_PROGRESS: 'jh:save_progress',
  /** El juego solicita cargar su estado guardado */
  LOAD_PROGRESS: 'jh:load_progress',
  /** El juego solicita registrar un logro desbloqueado */
  UNLOCK_ACHIEVEMENT: 'jh:unlock_achievement',
  /** El juego solicita visualizar una campaña recompensada */
  CAMPAIGN_REQUEST: 'jh:campaign_request',
  /** El juego solicita RESETEAR su progreso (empezar de 0) */
  RESET_PROGRESS: 'jh:reset_progress',

  // ═══ Lobby → Game: Respuestas a solicitudes ═══
  /** Respuesta a save_progress (éxito/error) */
  SAVE_RESULT: 'jh:save_result',
  /** Respuesta a load_progress (datos guardados) */
  PROGRESS_DATA: 'jh:progress_data',
  /** Respuesta a unlock_achievement (éxito/error) */
  ACHIEVEMENT_RESULT: 'jh:achievement_result',
  /** Respuesta a campaign_request */
  CAMPAIGN_RESPONSE: 'jh:campaign_response',
  /** Respuesta a reset_progress (éxito/error) */
  RESET_RESULT: 'jh:reset_result',

  // ═══ Lobby → Game: Contexto y control ═══
  /** Contexto de sesión: perfil, progreso, configuración */
  SESSION_CONTEXT: 'jh:session_context',
  /** Confirmación de guardado exitoso (legacy — usar SAVE_RESULT) */
  SAVE_CONFIRMED: 'jh:save_confirmed',
  /** Pausar el juego */
  PAUSE: 'jh:pause',
  /** Reanudar el juego */
  RESUME: 'jh:resume',
  /** El lobby cierra la sesión de juego */
  END_SESSION: 'jh:end_session',
  /** El lobby notifica el tamaño real del viewport del iframe (resize, fullscreen, orientación) */
  VIEWPORT_CHANGED: 'jh:viewport_changed',
} as const

export type MessageType = (typeof MessageType)[keyof typeof MessageType]

// ─── Payloads Game → Lobby ═══

/** El juego anuncia que está listo */
export interface GameReadyPayload {
  version: string
  protocolVersion?: string
  /** Capacidades declaradas por el juego (para validación lobby-side) */
  capabilities?: string[]
}

/** El juego notifica inicio de partida */
export interface GameStartedPayload {
  sessionId?: string
  /** Identificador del nivel / categoría / modo */
  levelId?: string
  /** Dificultad seleccionada */
  difficulty?: string
}

/** El juego notifica finalización de partida */
export interface GameCompletedPayload {
  score: number
  itemId?: string
  difficulty?: string
  /** Tiempo en segundos que duró la partida */
  timeSpent?: number
  /** Si la partida fue completada exitosamente */
  completed?: boolean
  metadata?: Record<string, unknown>
}

/** Actualización de puntaje en vivo */
export interface ScoreUpdatedPayload {
  score: number
  progress?: number
}

/** Solicitud para volver al lobby */
export interface ExitGamePayload {
  reason?: 'user_quit' | 'game_over' | 'completed' | 'error'
  /** Si debe guardar antes de salir */
  saveBeforeExit?: boolean
}

/** Error desde el juego */
export interface ErrorPayload {
  code: string
  message: string
  fatal: boolean
}

// ─── Persistencia: Game → Lobby ═══

/** El juego solicita guardar su estado completo */
export interface SaveProgressPayload {
  /** Estado completo del juego (opaco para el lobby — se guarda como JSONB) */
  gameState: Record<string, unknown>
  /** Puntaje a registrar como best_score */
  score?: number
  /** Metadatos adicionales (estadísticas, configuración, etc.) */
  metadata?: Record<string, unknown>
  /**
   * Progreso REAL del juego para mostrar en el lobby (cards, perfil):
   * ej: { current: 3, total: 9, label: 'Categorías' } o
   *     { current: 120, total: 930, label: 'Palabras' }.
   * Si viene, el lobby lo guarda en game_state.progress_* y las cards
   * muestran el avance real (no partidas jugadas).
   */
  progress?: {
    current: number
    total: number
    label: string
  }
}

/** El juego solicita cargar su estado guardado */
export interface LoadProgressPayload {
  /** Versión del esquema que el juego espera (para migración) */
  schemaVersion?: string
}

/** El juego solicita RESETEAR su progreso (empezar de 0) */
export interface ResetProgressPayload {
  /** Confirmación explícita — evita resets accidentales */
  confirm?: boolean
  /** Metadatos adicionales */
  metadata?: Record<string, unknown>
}

/** El juego solicita registrar un logro desbloqueado */
export interface UnlockAchievementPayload {
  achievementId: string
  /** Metadatos adicionales (puntaje, nivel, etc.) */
  metadata?: Record<string, unknown>
}

/** Solicitud de campaña recompensada */
export interface CampaignRequestPayload {
  /** Placement donde se solicita la campaña */
  placement: string
  /** IDs de recompensas solicitadas (el juego las conoce) */
  rewardIds: string[]
  /** Metadatos adicionales del juego */
  metadata?: Record<string, unknown>
}

// ─── Respuestas: Lobby → Game ═══

/** Respuesta del lobby a save_progress */
export interface SaveResultPayload {
  /** Mismo requestId de la solicitud */
  requestId: string
  /** true si el guardado fue exitoso */
  success: boolean
  /** Mensaje de error si success=false */
  error?: string
}

/** Respuesta del lobby a load_progress (datos guardados) */
export interface ProgressDataPayload {
  /** Mismo requestId de la solicitud */
  requestId: string
  /** true si la carga fue exitosa */
  success: boolean
  /** Datos del progreso guardado (null si no hay datos previos) */
  gameState: Record<string, unknown> | null
  /** Mejor puntaje guardado */
  bestScore?: number
  /** Versión del esquema guardado */
  schemaVersion?: string
  /** Mensaje de error si success=false */
  error?: string
}

/** Respuesta del lobby a unlock_achievement */
export interface AchievementResultPayload {
  /** Mismo requestId de la solicitud */
  requestId: string
  /** true si el logro fue registrado */
  success: boolean
  /** Si el logro ya estaba desbloqueado antes */
  alreadyUnlocked?: boolean
  /** XP otorgada al jugador */
  xpAwarded?: number
  /** Mensaje de error si success=false */
  error?: string
}

/** Respuesta del lobby a una solicitud de campaña */
export interface CampaignResponsePayload {
  /** Mismo requestId de la solicitud */
  requestId: string
  /** Estado de la respuesta */
  status: CampaignRewardStatus
  /** ID de la campaña mostrada (si aplica) */
  campaignId?: string
  /** IDs de recompensas concedidas */
  rewardedIds?: string[]
  /** Mensaje para el usuario */
  message?: string
}

export type CampaignRewardStatus =
  | 'approved'
  | 'rejected'
  | 'unavailable'
  | 'cancelled'
  | 'expired'
  | 'error'

/** Respuesta del lobby a reset_progress */
export interface ResetResultPayload {
  /** Mismo requestId de la solicitud */
  requestId: string
  /** true si el progreso fue borrado */
  success: boolean
  /** Mensaje de error si success=false */
  error?: string
}

// ─── Contexto: Lobby → Game ═══

/** Contexto de sesión enviado al juego después del handshake */
export interface SessionContextPayload {
  /** ID público del usuario (no el auth UUID completo) */
  userId: string
  /** Nombre visible del jugador */
  displayName?: string
  /** URL del avatar */
  avatarUrl?: string
  /** Nivel global del jugador */
  level?: number
  /** XP total del jugador */
  xp?: number
  /** Idioma preferido */
  locale?: string
  /** Indica si el usuario es invitado */
  isGuest: boolean
  /** Sesión activa del juego (UUID) */
  sessionId: string
  /** Capacidades disponibles (suscripción, etc.) */
  capabilities?: string[]
}

// ─── Control: Lobby → Game ═══

/** El lobby cierra la sesión */
export interface EndSessionPayload {
  reason?: 'navigate_away' | 'timeout' | 'error' | 'user_logout'
}

/** El lobby notifica el viewport real del iframe (px CSS del contenedor) */
export interface ViewportPayload {
  /** Ancho del iframe en px CSS */
  width: number
  /** Alto del iframe en px CSS */
  height: number
  /** Si el juego está en pantalla completa */
  isFullscreen: boolean
  /** Orientación actual del dispositivo */
  orientation: 'portrait' | 'landscape'
  /** Densidad de píxeles del dispositivo */
  devicePixelRatio: number
}

// ─── Mapa de tipo → payload ───

export interface MessagePayloadMap {
  [MessageType.GAME_READY]: GameReadyPayload
  [MessageType.GAME_STARTED]: GameStartedPayload
  [MessageType.GAME_COMPLETED]: GameCompletedPayload
  [MessageType.SCORE_UPDATED]: ScoreUpdatedPayload
  [MessageType.REQUEST_FULLSCREEN]: undefined
  [MessageType.EXIT_GAME]: ExitGamePayload
  [MessageType.ERROR]: ErrorPayload
  [MessageType.SAVE_PROGRESS]: SaveProgressPayload
  [MessageType.LOAD_PROGRESS]: LoadProgressPayload
  [MessageType.UNLOCK_ACHIEVEMENT]: UnlockAchievementPayload
  [MessageType.CAMPAIGN_REQUEST]: CampaignRequestPayload
  [MessageType.RESET_PROGRESS]: ResetProgressPayload
  [MessageType.SAVE_RESULT]: SaveResultPayload
  [MessageType.PROGRESS_DATA]: ProgressDataPayload
  [MessageType.ACHIEVEMENT_RESULT]: AchievementResultPayload
  [MessageType.CAMPAIGN_RESPONSE]: CampaignResponsePayload
  [MessageType.RESET_RESULT]: ResetResultPayload
  [MessageType.SESSION_CONTEXT]: SessionContextPayload
  [MessageType.SAVE_CONFIRMED]: undefined
  [MessageType.PAUSE]: undefined
  [MessageType.RESUME]: undefined
  [MessageType.END_SESSION]: EndSessionPayload
  [MessageType.VIEWPORT_CHANGED]: ViewportPayload
}

// ─── Callbacks para eventos ───

export type MessageCallback<T = unknown> = (payload: T) => void

/** Handlers que el juego (iframe) puede registrar (eventos del lobby) */
export interface GameEventHandlers {
  onPause?: MessageCallback
  onResume?: MessageCallback
  onSessionContext?: MessageCallback<SessionContextPayload>
  onProgressData?: MessageCallback<ProgressDataPayload>
  onSaveResult?: MessageCallback<SaveResultPayload>
  onAchievementResult?: MessageCallback<AchievementResultPayload>
  onCampaignResponse?: MessageCallback<CampaignResponsePayload>
  onEndSession?: MessageCallback<EndSessionPayload>
  onViewportChanged?: MessageCallback<ViewportPayload>
}

/** Handlers que el lobby puede registrar (eventos del juego) */
export interface LobbyEventHandlers {
  onGameReady?: MessageCallback<GameReadyPayload>
  onGameStarted?: MessageCallback<GameStartedPayload>
  onGameCompleted?: MessageCallback<GameCompletedPayload>
  onScoreUpdated?: MessageCallback<ScoreUpdatedPayload>
  onRequestFullscreen?: MessageCallback
  onExitGame?: MessageCallback<ExitGamePayload>
  onError?: MessageCallback<ErrorPayload>
  onSaveProgress?: MessageCallback<SaveProgressPayload>
  onLoadProgress?: MessageCallback<LoadProgressPayload>
  onUnlockAchievement?: MessageCallback<UnlockAchievementPayload>
  onCampaignRequest?: MessageCallback<CampaignRequestPayload>
}

// ─── Opciones de configuración ───

export interface LobbyClientOptions {
  /** Origen del lobby (para targetOrigin en postMessage) */
  lobbyOrigin: string
  /** Timeout en ms para game_ready (default: 15000) */
  readyTimeout?: number
  /** Capacidades del juego que se reportarán en game_ready */
  capabilities?: string[]
  /** ID del juego (slug) */
  gameId?: string
}

export interface GameClientOptions {
  /** Lista de orígenes permitidos para recibir mensajes */
  allowedOrigins: string[]
  /** Tiempo máximo de espera para game_ready en ms (default: 15000) */
  readyTimeout?: number
  /** ID del juego (slug) */
  gameId?: string
}

// ─── Versión del protocolo — funciones helpers ───

/** Verifica compatibilidad entre versiones del protocolo */
export function isProtocolCompatible(
  version: string | undefined,
  supportedVersion: string = PROTOCOL_VERSION,
): boolean {
  if (!version) return false
  const vParts = version.split('.').map(Number)
  const sParts = supportedVersion.split('.').map(Number)
  // Major version debe coincidir
  return vParts[0] === sParts[0]
}

/** Genera un requestId único */
export function createRequestId(): string {
  return `jh_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}
