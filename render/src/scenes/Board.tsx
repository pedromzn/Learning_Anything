/**
 * The page: warm paper with a thin rule above the discreet mark, and the 120 px margin. Every scene is drawn inside
 * it. No stars, glows or gradients: paper, ink, thin lines. It also fades the content out, so the cut between scenes
 * is not abrupt.
 */

import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { HEIGHT, COLOR, FONT, WIDTH, MARGIN, BRAND_RESERVE, MIN_TEXT } from '../theme.ts'

const marker: CSSProperties = {
  position: 'absolute',
  right: MARGIN,
  bottom: 48,
  fontFamily: FONT.title,
  fontStyle: 'italic',
  fontSize: MIN_TEXT,
  letterSpacing: '0.01em',
  color: COLOR.faint,
}

/** the thin rule at the foot of the page, like the bottom line of a notebook sheet */
const rule: CSSProperties = {
  position: 'absolute',
  left: MARGIN,
  right: MARGIN,
  bottom: 48 + MIN_TEXT + 22,
  height: 1,
  background: COLOR.line,
}
interface Props {
  /** scene duration in frames, for the fade-out */
  duration: number
  children: ReactNode
}

export function Board({ duration, children }: Props) {
  const frame = useCurrentFrame()
  const output = interpolate(frame, [duration - 8, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.background, width: WIDTH, height: HEIGHT, color: COLOR.text }}>
      <div style={rule} />
      <AbsoluteFill
        style={{
          padding: `${MARGIN}px ${MARGIN}px ${MARGIN + BRAND_RESERVE}px`,
          opacity: output,
          fontFamily: FONT.text,
        }}
      >
        {children}
      </AbsoluteFill>
      <div style={marker}>learning anything</div>
    </AbsoluteFill>
  )
}
