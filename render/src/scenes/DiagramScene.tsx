/**
 * The `diagram` scene: boxes with a light border and arrows, in a simple automatic layout. Layers come from the links
 * (depth of the longest path from the boxes with no incoming link) and run left to right; if there are too many layers
 * for the width, the row wraps into "snake" rows (the arrow keeps going down, without crossing).
 * No layout library: the graph has at most 8 nodes and 10 links.
 */

import { useCurrentFrame } from 'remotion'
import type { Scene } from '../../../shared/video.ts'
import { entranceStyle, input, elementStart } from '../animation'
import { AREA_UTIL, COLOR, FONT, MIN_TEXT } from '../theme'
import { Board } from './Board'

type Data = Extract<Scene, { type: 'diagram' }>

interface Rectangle {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

const BOX_WIDTH = 340
const BOX_HEIGHT = 120
/* a gap wide enough for the arrow label ("h → 0") to fit above it without touching the boxes */
const HORIZONTAL_GAP = 170
const VERTICAL_GAP = 56
const LAYERS_PER_ROW = 4

/** Each node's layer: the longest path to it. The iteration limit protects against cycles (A→B→A). */
function computeLayers(nodes: Data['nodes'], links: Data['links']): Map<string, number> {
  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (let lap = 0; lap < nodes.length; lap++) {
    let changed = false
    for (const l of links) {
      const from = layer.get(l.from)
      const to = layer.get(l.to)
      if (from === undefined || to === undefined) continue
      if (to < from + 1 && from + 1 < nodes.length) {
        layer.set(l.to, from + 1)
        changed = true
      }
    }
    if (!changed) break
  }
  return layer
}

/** Compacts empty layers and returns each one's nodes, in the order they appear in the script. */
function groupByLayer(nodes: Data['nodes'], layer: Map<string, number>): Data['nodes'][] {
  const used = [...new Set(nodes.map((n) => layer.get(n.id) ?? 0))].sort((a, b) => a - b)
  return used.map((c) => nodes.filter((n) => (layer.get(n.id) ?? 0) === c))
}

function place(layers: Data['nodes'][]): { rectangles: Rectangle[]; width: number; height: number } {
  const columns = Math.min(layers.length, LAYERS_PER_ROW)
  const layerRows = Math.ceil(layers.length / columns)
  const totalWidth = columns * BOX_WIDTH + (columns - 1) * HORIZONTAL_GAP

  // each row of layers is as tall as its fullest layer
  const rowHeights: number[] = []
  for (let r = 0; r < layerRows; r++) {
    const inRow = layers.slice(r * columns, (r + 1) * columns)
    const fullest = Math.max(...inRow.map((c) => c.length))
    rowHeights.push(fullest * BOX_HEIGHT + (fullest - 1) * VERTICAL_GAP)
  }
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0) + (layerRows - 1) * VERTICAL_GAP * 1.6

  const rectangles: Rectangle[] = []
  let rowTop = 0
  for (let r = 0; r < layerRows; r++) {
    layers.slice(r * columns, (r + 1) * columns).forEach((nodes, k) => {
      // odd rows run right to left
      const column = r % 2 === 0 ? k : columns - 1 - k
      const layerHeight = nodes.length * BOX_HEIGHT + (nodes.length - 1) * VERTICAL_GAP
      const beginning = rowTop + (rowHeights[r] - layerHeight) / 2
      nodes.forEach((node, j) => {
        rectangles.push({
          id: node.id,
          label: node.label,
          x: column * (BOX_WIDTH + HORIZONTAL_GAP),
          y: beginning + j * (BOX_HEIGHT + VERTICAL_GAP),
          width: BOX_WIDTH,
          height: BOX_HEIGHT,
        })
      })
    })
    rowTop += rowHeights[r] + VERTICAL_GAP * 1.6
  }
  return { rectangles, width: totalWidth, height: totalHeight }
}

/** The point where the center→center line leaves the rectangle's edge: the arrow starts and ends at the edge, not mid-box. */
function pointOnBorder(r: Rectangle, targetX: number, targetY: number, slack: number) {
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const dx = targetX - cx
  const dy = targetY - cy
  const scale = Math.min(
    dx === 0 ? Infinity : (r.width / 2 + slack) / Math.abs(dx),
    dy === 0 ? Infinity : (r.height / 2 + slack) / Math.abs(dy),
  )
  return { x: cx + dx * scale, y: cy + dy * scale }
}

type Event = { type: 'node'; id: string } | { type: 'link'; index: number }

/** The entrance order: each node, and right after it the arrows whose ends are already on the board. */
function sortEvents(layers: Data['nodes'][], links: Data['links']): Event[] {
  const events: Event[] = []
  const presentNodes = new Set<string>()
  const alreadyShown = new Set<number>()
  for (const node of layers.flat()) {
    events.push({ type: 'node', id: node.id })
    presentNodes.add(node.id)
    links.forEach((l, index) => {
      if (!alreadyShown.has(index) && presentNodes.has(l.from) && presentNodes.has(l.to)) {
        alreadyShown.add(index)
        events.push({ type: 'link', index })
      }
    })
  }
  return events
}

export function DiagramScene({ scene, duration }: { scene: Data; duration: number }) {
  const frame = useCurrentFrame()
  const layers = groupByLayer(scene.nodes, computeLayers(scene.nodes, scene.links))
  const { rectangles, width, height } = place(layers)
  const byId = new Map(rectangles.map((r) => [r.id, r]))
  const events = sortEvents(layers, scene.links)

  const hasTitle = Boolean(scene.title)
  const totalEvents = events.length + (hasTitle ? 1 : 0)
  const offset = hasTitle ? 1 : 0
  const eventStart = (position: number) => elementStart(position + offset, totalEvents, duration)

  const nodeStart = new Map<string, number>()
  const linkStart = new Map<number, number>()
  events.forEach((ev, position) => {
    if (ev.type === 'node') nodeStart.set(ev.id, eventStart(position))
    else linkStart.set(ev.index, eventStart(position))
  })

  // the "active" (green) arrow is the last one to have started; earlier ones stay in the secondary color
  let activeLink = -1
  let latestStart = -1
  linkStart.forEach((start, index) => {
    if (start <= frame && start > latestStart) {
      latestStart = start
      activeLink = index
    }
  })

  // the diagram is centered in the area left below the title; if it does not fit, it shrinks uniformly
  const titleHeight = hasTitle ? 150 : 0
  const scale = Math.min(1, AREA_UTIL.width / width, (AREA_UTIL.height - titleHeight) / height)

  return (
    <Board duration={duration}>
      {hasTitle ? (
        <div
          style={{
            ...entranceStyle(input(frame, elementStart(0, totalEvents, duration), 22)),
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', flex: 'none', width: width, height: height, transform: `scale(${scale})` }}>
          <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            <defs>
              <marker
                id="ponta-neutra"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={COLOR.faint} />
              </marker>
              <marker
                id="tip-accent"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={COLOR.accent} />
              </marker>
            </defs>
            {scene.links.map((l, index) => {
              const from = byId.get(l.from)
              const to = byId.get(l.to)
              if (!from || !to) return null
              const start = linkStart.get(index) ?? 0
              const e = input(frame, start, 20)
              const isActive = index === activeLink
              const origin = pointOnBorder(from, to.x + to.width / 2, to.y + to.height / 2, 6)
              const destination = pointOnBorder(to, from.x + from.width / 2, from.y + from.height / 2, 8)
              const color = isActive ? COLOR.accent : COLOR.faint
              const midX = (origin.x + destination.x) / 2
              const midY = (origin.y + destination.y) / 2
              return (
                <g key={index} opacity={e.opacity}>
                  <line
                    x1={origin.x}
                    y1={origin.y}
                    x2={destination.x}
                    y2={destination.y}
                    stroke={color}
                    strokeWidth={isActive ? 4 : 3}
                    markerEnd={isActive ? 'url(#tip-accent)' : 'url(#ponta-neutra)'}
                  />
                  {l.label ? (
                    <text
                      x={midX}
                      y={midY - 22}
                      textAnchor="middle"
                      fontFamily={FONT.text}
                      fontSize={MIN_TEXT}
                      fill={COLOR.secondary}
                      stroke={COLOR.background}
                      strokeWidth={10}
                      paintOrder="stroke"
                    >
                      {l.label}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>
          {rectangles.map((r) => {
            const e = input(frame, nodeStart.get(r.id) ?? 0, 22)
            return (
              <div
                key={r.id}
                style={{
                  ...entranceStyle(e),
                  position: 'absolute',
                  left: r.x,
                  top: r.y,
                  width: r.width,
                  height: r.height,
                  boxSizing: 'border-box',
                  border: `3px solid ${COLOR.text}`,
                  borderRadius: 18,
                  padding: '0 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: r.label.length > 24 ? MIN_TEXT + 2 : 42,
                  lineHeight: 1.15,
                  background: COLOR.card,
                }}
              >
                {r.label}
              </div>
            )
          })}
        </div>
      </div>
    </Board>
  )
}
