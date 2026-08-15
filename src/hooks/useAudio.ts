/**
 * Trivia Hip Hop — efectos de sonido con WebAudio (sin dependencias)
 */

import { useCallback, useRef } from 'react'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, c.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(c.currentTime + start)
  osc.stop(c.currentTime + start + dur + 0.02)
}

export function useAudio() {
  const enabledRef = useRef(true)

  const setEnabled = useCallback((v: boolean) => {
    enabledRef.current = v
  }, [])

  const playCorrect = useCallback(() => {
    if (!enabledRef.current) return
    tone(660, 0, 0.12, 'sine', 0.14)
    tone(880, 0.09, 0.16, 'sine', 0.14)
  }, [])

  const playWrong = useCallback(() => {
    if (!enabledRef.current) return
    tone(220, 0, 0.18, 'triangle', 0.14)
    tone(174, 0.12, 0.24, 'triangle', 0.12)
  }, [])

  const playClick = useCallback(() => {
    if (!enabledRef.current) return
    tone(440, 0, 0.06, 'square', 0.05)
  }, [])

  const playWin = useCallback(() => {
    if (!enabledRef.current) return
    tone(523, 0, 0.12, 'sine', 0.14)
    tone(659, 0.1, 0.12, 'sine', 0.14)
    tone(784, 0.2, 0.12, 'sine', 0.14)
    tone(1047, 0.3, 0.28, 'sine', 0.16)
  }, [])

  const playLose = useCallback(() => {
    if (!enabledRef.current) return
    tone(392, 0, 0.16, 'triangle', 0.12)
    tone(330, 0.14, 0.16, 'triangle', 0.12)
    tone(262, 0.28, 0.3, 'triangle', 0.12)
  }, [])

  const playTick = useCallback(() => {
    if (!enabledRef.current) return
    tone(1200, 0, 0.04, 'square', 0.03)
  }, [])

  return { playCorrect, playWrong, playClick, playWin, playLose, playTick, setEnabled }
}
