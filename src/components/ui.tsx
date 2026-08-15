/**
 * Trivia Hip Hop — componentes UI base (estética stone + orange del lobby)
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
    'inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-all duration-150 active:translate-y-0.5 disabled:opacity-45 disabled:cursor-not-allowed select-none px-5 py-3 text-sm sm:text-base'
  const variants = {
    primario:
      'bg-orange-500 text-stone-950 shadow-[0_4px_0_#9a3412] hover:bg-orange-400 hover:shadow-[0_4px_0_#c2410c]',
    secundario:
      'bg-stone-800 text-stone-100 border border-stone-700 shadow-[0_4px_0_#1c1917] hover:bg-stone-700',
    fantasma: 'bg-transparent text-stone-300 hover:text-white hover:bg-stone-800/60',
    peligro:
      'bg-red-600/90 text-white shadow-[0_4px_0_#7f1d1d] hover:bg-red-500',
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
  const clickable = onClick ? 'cursor-pointer hover:border-orange-500/40 hover:bg-stone-800/60 transition-colors' : ''
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-stone-800 bg-stone-900/80 p-4 ${clickable} ${className}`}
    >
      {children}
    </div>
  )
}

/** Card con borde-izquierda naranja (patrón de Freddy) */
export function CardAccent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border-l-4 border-orange-500 bg-stone-900/80 border border-l-orange-500 border-stone-800 p-4 ${className}`}>
      {children}
    </div>
  )
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-stone-800 px-3 py-1 text-xs font-semibold text-stone-300 ${className}`}>
      {children}
    </span>
  )
}

export function BarraProgreso({ valor, total, className = '' }: { valor: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-stone-800 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Titulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`font-display text-4xl sm:text-5xl tracking-wide text-white ${className}`}>{children}</h1>
  )
}
