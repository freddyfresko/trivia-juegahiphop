/**
 * Trivia Hip Hop — pantalla de carga inicial
 */

export function SplashScreen({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="flex h-24 w-24 animate-pop items-center justify-center rounded-3xl border-2 border-orange-500/60 bg-stone-900 shadow-[0_0_40px_rgba(249,115,22,0.25)]">
        <span className="text-5xl">🎤</span>
      </div>
      <h1 className="text-display text-5xl text-white">TRIVIA HIP HOP</h1>
      <p className="text-center text-sm text-stone-400">
        Preguntas de la Enciclopedia Hip Hop
      </p>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-stone-800">
        <div className="shimmer h-full w-full" />
      </div>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}
