/**
 * Ana on screen: a calm voice indicator. A soft disc in the theme's colors, with rings that breathe with the volume —
 * the student's while she listens (accent green), her own while she speaks (terracotta); while thinking, a thin arc
 * turns around it. Colors come from the theme variables, so it fits paper by day and the lamp at night. Drawn on a
 * canvas every frame; with "reduce motion" on, it stays almost still.
 */

import { useEffect, useRef, type MutableRefObject } from 'react'

export type OrbState = 'idleTimer' | 'listening' | 'thinking' | 'speaking'

/** Which theme variable colors each state. */
const VARIABLE: Record<OrbState, string> = {
  idleTimer: '--ink-faint',
  listening: '--accent',
  thinking: '--accent-ink',
  speaking: '--info',
}

/** `#rrggbb` (as the theme writes its colors) → [r, g, b]. */
function rgbOf(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [120, 120, 120]
}

function themeColor(state: OrbState): [number, number, number] {
  return rgbOf(getComputedStyle(document.documentElement).getPropertyValue(VARIABLE[state]))
}

export function Orb({ state, level, size = 260 }: { state: OrbState; level: MutableRefObject<number>; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const currentState = useRef(state)
  currentState.current = state

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = size * dpr
    c.height = size * dpr
    ctx.scale(dpr, dpr)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let color: number[] = themeColor(currentState.current)
    let smooth = 0
    let frame = 0

    const draw = (t: number) => {
      const target = themeColor(currentState.current)
      color = color.map((v, i) => v + (target[i]! - v) * 0.08)
      smooth += (level.current - smooth) * 0.25
      const [r, g, b] = color.map(Math.round)
      const rgba = (a: number) => `rgba(${r},${g},${b},${a})`
      const time = reducedMotion ? 0 : t / 1000
      const center = size / 2
      const base = size * 0.22
      const breath = reducedMotion ? 0 : Math.sin(time * 1.6) * 0.025
      const radius = base * (1 + smooth * 0.3 + breath)
      ctx.clearRect(0, 0, size, size)

      // the rings: soft circles that open with the volume
      for (let i = 3; i >= 1; i--) {
        ctx.fillStyle = rgba(0.07 + smooth * 0.05)
        ctx.beginPath()
        ctx.arc(center, center, radius * (1 + i * 0.28 + smooth * 0.25 * i), 0, Math.PI * 2)
        ctx.fill()
      }

      // the disc
      ctx.fillStyle = rgba(0.92)
      ctx.beginPath()
      ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.fill()

      // thinking: a thin arc turning around
      if (currentState.current === 'thinking') {
        ctx.strokeStyle = rgba(0.8)
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        const start = time * 3
        ctx.beginPath()
        ctx.arc(center, center, radius * 1.7, start, start + Math.PI * 0.6)
        ctx.stroke()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [level, size])

  return <canvas ref={canvas} style={{ width: size, height: size }} aria-hidden className="max-w-full" />
}
