/**
 * The `title` scene: the large title on the left, the subtitle below, a thin green rule between them.
 */

import { useCurrentFrame } from 'remotion'
import type { Scene } from '../../../shared/video.ts'
import { entranceStyle, input, elementStart } from '../animation'
import { COLOR, FONT } from '../theme'
import { Board } from './Board'

type Data = Extract<Scene, { type: 'title' }>

export function TitleScene({ scene, duration }: { scene: Data; duration: number }) {
  const frame = useCurrentFrame()
  const total = scene.subtitle ? 3 : 1
  const titleIn = input(frame, elementStart(0, total, duration), 24)
  const lineIn = input(frame, elementStart(1, total, duration), 24)
  const subtitleIn = input(frame, elementStart(2, total, duration), 24)
  // a long title shrinks in steps: 120 characters at 128 px do not fit in three lines
  const size = scene.title.length > 70 ? 64 : scene.title.length > 40 ? 80 : 100

  return (
    <Board duration={duration}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 44 }}>
        <div
          style={{
            ...entranceStyle(titleIn),
            fontFamily: FONT.title,
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            maxWidth: 1500,
          }}
        >
          {scene.title}
        </div>
        {scene.subtitle ? (
          <>
            <div
              style={{
                ...entranceStyle(lineIn),
                width: 160,
                height: 2,
                background: COLOR.accent,
                opacity: lineIn.opacity,
              }}
            />
            <div
              style={{
                ...entranceStyle(subtitleIn),
                fontSize: 56,
                lineHeight: 1.25,
                color: COLOR.secondary,
                maxWidth: 1400,
              }}
            >
              {scene.subtitle}
            </div>
          </>
        ) : null}
      </div>
    </Board>
  )
}
