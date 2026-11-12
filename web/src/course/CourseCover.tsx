/**
 * A course's cover on the shelf: a muted book-cover color picked from the course id (always the same for the same
 * course), the first letter of the title in serif, and one tick per module that fills as the modules are finished.
 */

import { join } from '@/components/ui'

/** Muted cover colors that work on paper and under the lamp (hue, saturation, lightness in light/dark). */
const COVERS = [
  [152, 28],
  [24, 45],
  [210, 30],
  [340, 30],
  [42, 50],
  [265, 22],
  [190, 32],
  [8, 38],
] as const

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

export function CourseCover({
  id,
  title,
  modules,
  modulesDone,
  className,
}: {
  id: string
  title: string
  modules: number
  modulesDone: number
  className?: string
}) {
  const [hue, saturation] = COVERS[hash(id) % COVERS.length]!
  const letter = (title.trim()[0] ?? '?').toUpperCase()
  return (
    <div
      className={join('relative overflow-hidden rounded-tile', className)}
      style={{ background: `hsl(${hue} ${saturation}% 38%)` }}
      aria-hidden
    >
      {/* the spine */}
      <span className="absolute inset-y-0 left-0 w-3 bg-black/15" />
      <span className="absolute inset-y-0 left-3 w-px bg-white/15" />
      <span className="absolute top-3 right-4 font-display text-[64px] leading-none text-white/85 italic">
        {letter}
      </span>
      <span className="absolute right-4 bottom-3 left-7 flex gap-1">
        {Array.from({ length: Math.max(1, modules) }, (_, i) => (
          <span key={i} className={join('h-1 flex-1 rounded-pill', i < modulesDone ? 'bg-white' : 'bg-white/25')} />
        ))}
      </span>
    </div>
  )
}
