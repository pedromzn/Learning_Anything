/**
 * The `code` scene: the code block in Geist Mono with line numbers, on a sunken paper panel with a light syntax
 * palette; the `highlights` lines get a translucent green band one after another, following the speech. The previous band fades, so the student remembers where the
 * explanation has been.
 */

import { interpolate, useCurrentFrame } from 'remotion'
import type { Scene } from '../../../shared/video.ts'
import { entranceStyle, input } from '../animation'
import { AREA_UTIL, COLOR, FONT, MIN_TEXT, SYNTAX } from '../theme'
import { Board } from './Board'

type Data = Extract<Scene, { type: 'code' }>

/** Line comment, to paint it in the comment color (the rest goes through `colorize`). */
function splitComment(line: string, lang: Data['lang']): { code: string; comment: string } {
  const marker = lang === 'python' ? '#' : lang === 'pseudocode' ? '//' : '//'
  const position = line.indexOf(marker)
  if (position < 0) return { code: line, comment: '' }
  return { code: line.slice(0, position), comment: line.slice(position) }
}

const KEYWORDS = new Set(
  (
    'def return if elif else for while in not and or is import from as class lambda None True False pass break ' +
    'continue with try except finally raise yield function const let var new this typeof instanceof null undefined ' +
    'true false async await export default switch case do of print int double float char void long short bool ' +
    'unsigned struct auto include'
  ).split(' '),
)

/** A light, honest syntax palette: keywords, strings and numbers; everything else stays in ink. */
function colorize(code: string, lang: Data['lang']): { text: string; color?: string }[] {
  const tokens: { text: string; color?: string }[] = []
  const pattern =
    /("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)|\b(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\b|([A-Za-z_]\w*)/g
  let last = 0
  for (const m of code.matchAll(pattern)) {
    const index = m.index ?? 0
    if (index > last) tokens.push({ text: code.slice(last, index) })
    if (m[1]) tokens.push({ text: m[1], color: SYNTAX.string })
    else if (m[2]) tokens.push({ text: m[2], color: SYNTAX.number })
    else if (lang !== 'pseudocode' && KEYWORDS.has(m[3])) tokens.push({ text: m[3], color: SYNTAX.keyword })
    else tokens.push({ text: m[0] })
    last = index + m[0].length
  }
  if (last < code.length) tokens.push({ text: code.slice(last) })
  return tokens
}

/** The largest font size that fits: limited by height (lines) and width (longest column), never below 34 px. */
function codeSize(lines: string[]): number {
  const byHeight = Math.floor((AREA_UTIL.height - 80) / (lines.length * 1.55))
  const longest = Math.max(...lines.map((l) => l.length), 1)
  const byWidth = Math.floor((AREA_UTIL.width - 200) / (longest * 0.62))
  return Math.max(MIN_TEXT, Math.min(48, byHeight, byWidth))
}

export function CodeScene({ scene, duration }: { scene: Data; duration: number }) {
  const frame = useCurrentFrame()
  const lines = scene.code.replace(/\t/g, '    ').split('\n')
  const size = codeSize(lines)
  const lineHeight = size * 1.55

  const blockIn = input(frame, 15, 24)
  // highlights start after the block settles and end with room to spare before the scene ends
  const highlightsStart = 60
  const step =
    scene.highlights.length > 0 ? Math.max(24, (duration * 0.85 - highlightsStart) / scene.highlights.length) : 0
  const activeIndex = scene.highlights.length
    ? Math.min(scene.highlights.length - 1, Math.floor((frame - highlightsStart) / step))
    : -1

  return (
    <Board duration={duration}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            ...entranceStyle(blockIn),
            position: 'relative',
            width: '100%',
            padding: '40px 0',
            border: `2px solid ${COLOR.line}`,
            borderRadius: 20,
            background: COLOR.sunken,
            color: COLOR.text,
            fontFamily: FONT.code,
            fontSize: size,
          }}
        >
          {scene.highlights.map((lineNumber, k) => {
            const start = highlightsStart + k * step
            const fadeIn = interpolate(frame, [start, start + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
            const active = k === activeIndex
            return (
              <div
                key={k}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 40 + (lineNumber - 1) * lineHeight,
                  height: lineHeight,
                  background: 'rgb(46 94 78 / 0.12)',
                  borderLeft: `6px solid ${COLOR.accent}`,
                  opacity: fadeIn * (active ? 1 : 0.4),
                }}
              />
            )
          })}
          {lines.map((line, i) => {
            const { code, comment } = splitComment(line, scene.lang)
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  display: 'flex',
                  height: lineHeight,
                  lineHeight: `${lineHeight}px`,
                  whiteSpace: 'pre',
                }}
              >
                <span
                  style={{
                    flex: 'none',
                    width: 110,
                    paddingRight: 32,
                    textAlign: 'right',
                    color: COLOR.faint,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ paddingLeft: 24 }}>
                  {colorize(code, scene.lang).map((t, j) => (
                    <span key={j} style={t.color ? { color: t.color } : undefined}>
                      {t.text}
                    </span>
                  ))}
                  <span style={{ color: SYNTAX.comment, fontStyle: 'italic' }}>{comment}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Board>
  )
}
