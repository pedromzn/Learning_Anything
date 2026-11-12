/**
 * The `chart` scene: thin axes and the curve of f(x) drawn from left to right (strokeDashoffset over a path of
 * normalized length). The function comes from the model and is interpreted by `compileFunction` — the contract's
 * closed interpreter, never eval.
 *
 * Points are sampled in 400 steps. Where the function blows up (tan, 1/x) the path is cut into pieces, otherwise the
 * stroke would cross the whole chart joining both sides of the asymptote.
 */

import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { compileFunction } from '../../../shared/video.ts'
import type { Scene } from '../../../shared/video.ts'
import { entranceStyle, input, INITIAL_DELAY } from '../animation'
import { AREA_UTIL, COLOR, FONT, MIN_TEXT } from '../theme'
import { Board } from './Board'

type Data = Extract<Scene, { type: 'chart' }>

const STEPS = 400
const WIDTH = AREA_UTIL.width
// inner SVG margins so the axis numbers are not cut off
const BORDER = { left: 110, right: 40, top: 30, base: 70 }

/** `1.5`, `-2`, `0.25`: no trailing zeros, with a decimal comma as in Portuguese. */
function formatNumber(v: number): string {
  const rounded = Math.round(v * 100) / 100
  return String(rounded).replace('.', ',')
}

export function ChartScene({ scene, duration }: { scene: Data; duration: number }) {
  const frame = useCurrentFrame()
  const func = compileFunction(scene.func)
  const hasTitle = Boolean(scene.title)
  const titleHeight = hasTitle ? 130 : 0
  const labelHeight = scene.label ? 80 : 0
  const height = AREA_UTIL.height - titleHeight - labelHeight

  const samples: Array<{ x: number; y: number }> = []
  if (func) {
    for (let i = 0; i <= STEPS; i++) {
      const x = scene.xMin + ((scene.xMax - scene.xMin) * i) / STEPS
      samples.push({ x, y: func(x) })
    }
  }
  const valid = samples.filter((p) => Number.isFinite(p.y)).map((p) => p.y)
  let yMin = valid.length ? Math.min(...valid) : -1
  let yMax = valid.length ? Math.max(...valid) : 1
  // a very steep function (tan, 1/x) ruins the scale: limit the y axis to a multiple of the data's central range
  if (valid.length > 10) {
    const sorted = [...valid].sort((a, b) => a - b)
    const low = sorted[Math.floor(sorted.length * 0.03)]
    const high = sorted[Math.floor(sorted.length * 0.97)]
    const range = Math.max(high - low, 1e-6)
    yMin = Math.max(yMin, low - range * 0.5)
    yMax = Math.min(yMax, high + range * 0.5)
  }
  if (yMax - yMin < 1e-9) {
    yMin -= 1
    yMax += 1
  }
  const paddingY = (yMax - yMin) * 0.08
  yMin -= paddingY
  yMax += paddingY

  const innerWidth = WIDTH - BORDER.left - BORDER.right
  const plotHeight = height - BORDER.top - BORDER.base
  const toX = (x: number) => BORDER.left + ((x - scene.xMin) / (scene.xMax - scene.xMin)) * innerWidth
  const toY = (y: number) => BORDER.top + (1 - (y - yMin) / (yMax - yMin)) * plotHeight

  // the path: an "M" each time the function stops being continuous
  let filePath = ''
  let previous: { x: number; y: number } | null = null
  const yStep = (yMax - yMin) * 0.6
  for (const p of samples) {
    const inner = Number.isFinite(p.y) && p.y >= yMin - yStep && p.y <= yMax + yStep
    if (!inner) {
      previous = null
      continue
    }
    const jump = previous !== null && Math.abs(p.y - previous.y) > (yMax - yMin) * 0.8
    filePath += `${previous === null || jump ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)} `
    previous = p
  }

  // the axis crosses the origin when it is in range; otherwise it sticks to the edge
  const yAxisX = scene.xMin <= 0 && scene.xMax >= 0 ? toX(0) : toX(scene.xMin)
  const xAxisY = yMin <= 0 && yMax >= 0 ? toY(0) : toY(yMin)

  const xTicks = Array.from({ length: 5 }, (_, i) => scene.xMin + ((scene.xMax - scene.xMin) * i) / 4)
  const yTicks = [yMin + paddingY, yMax - paddingY]
  const yAxisOnEdge = yAxisX <= toX(scene.xMin) + 1

  const strokeStart = INITIAL_DELAY + 20
  const strokeEnd = Math.max(strokeStart + 30, Math.round(duration * 0.75))
  const progress = interpolate(frame, [strokeStart, strokeEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  })
  const axesIn = input(frame, 8, 20)

  return (
    <Board duration={duration}>
      {hasTitle ? (
        <div
          style={{
            ...entranceStyle(input(frame, 4, 22)),
            fontFamily: FONT.title,
            fontWeight: 600,
            fontSize: 76,
            lineHeight: 1.1,
            letterSpacing: '-0.015em',
            height: titleHeight,
          }}
        >
          {scene.title}
        </div>
      ) : null}
      <svg width={WIDTH} height={height} style={{ overflow: 'visible' }}>
        <g opacity={axesIn.opacity}>
          <line
            x1={BORDER.left}
            x2={WIDTH - BORDER.right}
            y1={xAxisY}
            y2={xAxisY}
            stroke={COLOR.secondary}
            strokeWidth={2}
          />
          <line
            x1={yAxisX}
            x2={yAxisX}
            y1={BORDER.top}
            y2={height - BORDER.base}
            stroke={COLOR.secondary}
            strokeWidth={2}
          />
          {xTicks.map((v, i) => (
            <g key={`x${i}`}>
              <line x1={toX(v)} x2={toX(v)} y1={xAxisY - 8} y2={xAxisY + 8} stroke={COLOR.secondary} strokeWidth={2} />
              <text
                x={toX(v)}
                y={height - BORDER.base + 54}
                textAnchor="middle"
                fontFamily={FONT.code}
                fontSize={MIN_TEXT}
                fill={COLOR.secondary}
              >
                {formatNumber(v)}
              </text>
            </g>
          ))}
          {/* the y axis zero is left out: it would land on the origin, which the x axis already marks */}
          {yTicks
            .filter((v) => Math.abs(v) > 1e-9)
            .map((v, i) => (
              <g key={`y${i}`}>
                <line
                  x1={yAxisX - 8}
                  x2={yAxisX + 8}
                  y1={toY(v)}
                  y2={toY(v)}
                  stroke={COLOR.secondary}
                  strokeWidth={2}
                />
                <text
                  x={yAxisOnEdge ? yAxisX - 20 : yAxisX - 20}
                  y={toY(v) + 12}
                  textAnchor="end"
                  fontFamily={FONT.code}
                  fontSize={MIN_TEXT}
                  fill={COLOR.secondary}
                >
                  {formatNumber(v)}
                </text>
              </g>
            ))}
        </g>
        <path
          d={filePath}
          fill="none"
          stroke={COLOR.accent}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - progress}
        />
      </svg>
      {scene.label ? (
        <div
          style={{
            ...entranceStyle(input(frame, strokeEnd - 10, 22)),
            height: labelHeight,
            textAlign: 'center',
            fontFamily: FONT.code,
            fontSize: 44,
            paddingTop: 16,
          }}
        >
          {scene.label}
        </div>
      ) : null}
    </Board>
  )
}
