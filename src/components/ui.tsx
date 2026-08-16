/**
 * Trivia Hip Hop — componentes UI base (estética stone + orange, superficies glass)
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Boton({
  children,
  variant = 'primario',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primario' | 'secundario' | 'fantasma' | 'peligro'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-extrabold transition-all duration-150 active:translate-y-0.5 disabled:opacity-45 disabled:cursor-not-allowed select-none px-6 py-3 text-sm sm:text-base'
  const variants = {
    primario:
      'btn-shine bg-gradient-to-r from-orange-500 to-amber-500 text-stone-950 shadow-[0_4px_0_#9a3412,0_10px_26px_rgba(249,115,22,0.35)] hover:brightness-110 hover:shadow-[0_4px_0_#c2410c,0_14px_34px_rgba(249,115,22,0.5)]',
    secundario:
      'bg-stone-800/90 text-stone-100 border border-stone-700 shadow-[0_4px_0_#1c1917] hover:bg-stone-700/90',
    fantasma: 'bg-transparent text-stone-300 hover:text-white hover:bg-stone-800/60',
    peligro:
      'btn-shine bg-gradient-to-r from-red-600 to-red-500 text-white shadow-[0_4px_0_#7f1d1d] hover:brightness-110',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const clickable = onClick ? 'cursor-pointer hover:border-orange-500/40 hover:-translate-y-0.5 transition-all' : ''
  return (
    <div onClick={onClick} className={`glass rounded-2xl p-4 ${clickable} ${className}`}>
      {children}
    </div>
  )
}

/** Card con borde-izquierda naranja (patrón de Freddy) */
export function CardAccent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-2xl border-l-4 border-l-orange-500 p-4 ${className}`}>{children}</div>
  )
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-stone-700/70 bg-stone-800/80 px-3 py-1 text-xs font-semibold text-stone-300 ${className}`}
    >
      {children}
    </span>
  )
}

export function BarraProgreso({ valor, total, className = '' }: { valor: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-stone-800/80 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 shadow-[0_0_12px_rgba(249,115,22,0.45)] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Titulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`text-display text-4xl tracking-wide text-white sm:text-5xl ${className}`}>{children}</h1>
}

/**
 * Chip cápsula seleccionable — highlight "pegatina" (puntas redondeadas,
 * sombra pegatina). NUNCA cuadro/borde al seleccionar.
 */
export function Chip({
  activo,
  children,
  onClick,
  className = '',
}: {
  activo?: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-all duration-150 select-none active:scale-[0.97] ${
        activo
          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-stone-950 shadow-sticker'
          : 'border border-stone-800 bg-stone-900/90 text-stone-300 hover:border-stone-600 hover:bg-stone-800'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Vinilo animado (disco hip hop) con emoji central */
export function Vinilo({ emoji = '🎤', size = 96, spinning = true }: { emoji?: string; size?: number; spinning?: boolean }) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
    >
      <div
        className={`vinilo h-full w-full ${spinning ? 'animate-spin-slow' : ''}`}
        style={{ animationDuration: `${Math.max(4, size / 10)}s` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 shadow-glow-orange"
          style={{ width: size * 0.42, height: size * 0.42, fontSize: size * 0.2 }}
        >
          {emoji}
        </div>
      </div>
    </div>
  )
}

/** Barras de ecualizador animadas (hero) */
export function Equalizer({ barras = 5, className = '' }: { barras?: number; className?: string }) {
  return (
    <div className={`flex h-5 items-end justify-center gap-[3px] ${className}`}>
      {Array.from({ length: barras }).map((_, i) => (
        <span
          key={i}
          className="eq-bar w-[4px] bg-gradient-to-t from-orange-600 to-amber-400"
          style={{ height: `${55 + ((i * 17) % 45)}%`, animationDelay: `${i * 0.13}s` }}
        />
      ))}
    </div>
  )
}

const CONFETTI_COLORS = ['#f97316', '#fbbf24', '#fb923c', '#fdba74', '#fcd34d', '#ea580c']

/** Lluvia de confeti (resultados destacados) */
export function Confetti({ piezas = 26 }: { piezas?: number }) {
  return (
    <>
      {Array.from({ length: piezas }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDuration: `${2.4 + (i % 5) * 0.6}s`,
            animationDelay: `${(i % 7) * 0.18}s`,
            transform: `rotate(${(i * 47) % 360}deg)`,
          }}
        />
      ))}
    </>
  )
}
