/**
 * Trivia Hip Hop — pantalla de carga inicial (vinilo + glow)
 */

import { Equalizer, Vinilo } from './ui'

export function SplashScreen({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="animate-float">
        <Vinilo emoji="🎤" size={110} />
      </div>
      <div className="text-center">
        <h1 className="text-hero text-display text-5xl sm:text-6xl">TRIVIA HIP HOP</h1>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
          Enciclopedia Hip Hop · Quiz
        </p>
      </div>
      <Equalizer barras={7} />
      <div className="h-1.5 w-52 overflow-hidden rounded-full bg-stone-800/80 shadow-inner">
        <div className="shimmer h-full w-full" />
      </div>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}
