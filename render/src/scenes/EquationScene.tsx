/**
 * The `equation` scene: the LaTeX lines built up one at a time in KaTeX, large, in light color, and the caption.
 * KaTeX runs with `throwOnError: false`: broken LaTeX becomes KaTeX's own red text instead of bringing down the whole
 * video render.
 */

import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useCurrentFrame } from 'remotion'
import type { Scene } from '../../../shared/video.ts'
import { entranceStyle, input, elementStart } from '../animation'
import { COLOR } from '../theme'
import { Board } from './Board'

type Data = Extract<Scene, { type: 'equation' }>

function equationHtml(latex: string): string {
  return katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    strict: 'ignore',
    output: 'html',
    /* the LaTeX comes from the model: no \\href, \\url or \\includegraphics (the default is already false; made explicit) */
    trust: false,
  })
}

/** The formula size grows with the space: a few short lines get huge, many or long ones shrink. */
function formulaSize(lines: string[]): number {
  const longest = Math.max(...lines.map((l) => l.length))
  const byWidth = longest > 110 ? 44 : longest > 70 ? 56 : longest > 45 ? 72 : 96
  const byHeight = lines.length >= 4 ? 56 : lines.length === 3 ? 72 : 96
  return Math.min(byWidth, byHeight)
}

export function EquationScene({ scene, duration }: { scene: Data; duration: number }) {
  const frame = useCurrentFrame()
  const total = scene.lines.length + (scene.captions ? 1 : 0)
  const size = formulaSize(scene.lines)

  return (
    <Board duration={duration}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
          color: COLOR.text,
        }}
      >
        {scene.lines.map((line, i) => {
          const e = input(frame, elementStart(i, total, duration), 24)
          return (
            <div
              key={i}
              style={{ ...entranceStyle(e), fontSize: size, lineHeight: 1.3 }}
              dangerouslySetInnerHTML={{ __html: equationHtml(line) }}
            />
          )
        })}
        {scene.captions ? (
          <div
            style={{
              ...entranceStyle(input(frame, elementStart(total - 1, total, duration), 24)),
              textAlign: 'center',
              fontSize: 44,
              lineHeight: 1.3,
              color: COLOR.secondary,
              marginTop: 24,
            }}
          >
            {scene.captions}
          </div>
        ) : null}
      </div>
    </Board>
  )
}
