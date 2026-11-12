/**
 * The `bullets` scene: the title at the top and the bullets entering one at a time, at the pace of the speech.
 */

import { useCurrentFrame } from 'remotion'
import type { Scene } from '../../../shared/video.ts'
import { entranceStyle, input, elementStart } from '../animation'
import { COLOR, FONT } from '../theme'
import { Board } from './Board'

type Data = Extract<Scene, { type: 'bullets' }>

export function BulletsScene({ scene, duration }: { scene: Data; duration: number }) {
  const frame = useCurrentFrame()
  const total = scene.bullets.length + 1
  const titleIn = input(frame, elementStart(0, total, duration), 22)
  const size = scene.bullets.some((t) => t.length > 90) ? 46 : 56

  return (
    <Board duration={duration}>
      <div
        style={{
          ...entranceStyle(titleIn),
          fontFamily: FONT.title,
          fontWeight: 600,
          fontSize: scene.title.length > 60 ? 60 : 72,
          lineHeight: 1.08,
          letterSpacing: '-0.015em',
          marginBottom: 56,
        }}
      >
        {scene.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        {scene.bullets.map((bullet, i) => {
          const e = input(frame, elementStart(i + 1, total, duration), 22)
          return (
            <div
              key={i}
              style={{
                ...entranceStyle(e),
                display: 'flex',
                alignItems: 'baseline',
                gap: 32,
                fontSize: size,
                lineHeight: 1.25,
              }}
            >
              <span
                style={{
                  flex: 'none',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `3px solid ${COLOR.accent}`,
                  transform: 'translateY(-6px)',
                }}
              />
              <span>{bullet}</span>
            </div>
          )
        })}
      </div>
    </Board>
  )
}
