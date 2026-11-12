/**
 * The board's sober motion: a fade with a slight rise, and the clock that spreads a scene's elements
 * along the narration. Everything is a function of the current frame (no state), which is what Remotion requires.
 */

import { Easing, interpolate } from 'remotion'
import { FPS } from './theme'

export interface Entrance {
  opacity: number
  /** vertical offset in px; starts positive (below) and reaches zero */
  rise: number
}

/** Fade + 24 px rise, easing out, starting at `start` (in frames). */
export function input(frame: number, start: number, duration = 18): Entrance {
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })
  return { opacity: progress, rise: (1 - progress) * 24 }
}

/** The CSS style for an entrance. */
export function entranceStyle(e: Entrance) {
  return { opacity: e.opacity, transform: `translateY(${e.rise}px)` }
}

/** The first element only enters after half a second: the student sees a clean board before the speech asks for attention. */
export const INITIAL_DELAY = Math.round(FPS * 0.5)

/**
 * The frame where element `index` of `total` enters, spread from the start to ~70% of the scene: the rest of the scene
 * is for the student to look at the full content while the voice finishes.
 */
export function elementStart(index: number, total: number, sceneDuration: number, delay = INITIAL_DELAY): number {
  if (total <= 1) return delay
  const span = Math.max(sceneDuration * 0.7 - delay, total * 6)
  return Math.round(delay + (span / total) * index)
}
