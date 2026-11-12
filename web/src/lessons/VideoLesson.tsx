/**
 * The video lesson: the player with the embedded questions and, when no video has been rendered, the script slides.
 *
 * The player pauses at the questions and does not let you skip them: when it reaches the time of a question not yet
 * answered correctly, the video stops and the question opens on top. Right answer, it goes on. Wrong answer, the
 * feedback shows and you can rewatch the segment (it goes back to `backToMs`). The answer key only arrives after the
 * answer.
 *
 * hls.js runs without a worker (`enableWorker: false`); Safari uses native HLS.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Hls from 'hls.js'
import katex from 'katex'
import { ArrowCounterClockwise, CaretLeft, CaretRight, Pause, SpeakerSlash } from '@phosphor-icons/react'
import type { StudentScene, VideoContent } from '@shared/api'
import type { StudentItem, AttemptResult } from '@shared/course'
import { compileFunction } from '@shared/video'
import { Item, type ItemActions } from './Item'
import { Button, Command, Panel, Badge, join } from '@/components/ui'
import { useT } from '@/i18n'
import { LANGUAGE_DATA, type Language } from '@shared/languages'

type VideoPause = NonNullable<VideoContent['video']>['pauses'][number]

interface Props {
  content: VideoContent
  courseId: string
  actionsFor: (itemId: string) => ItemActions
  onAnswer: (itemId: string, r: AttemptResult) => void
  /** the course language: the narration and the subtitles are in it */
  language: Language
}

export function VideoLesson({ content, courseId, actionsFor, onAnswer, language }: Props) {
  if (content.video) {
    return (
      <Player
        video={content.video}
        scenes={content.script.scenes}
        actionsFor={actionsFor}
        onAnswer={onAnswer}
        language={language}
      />
    )
  }
  return <Slides courseId={courseId} scenes={content.script.scenes} actionsFor={actionsFor} onAnswer={onAnswer} />
}

// ── the player ───────────────────────────────────────────────────────────────

function Player({
  video,
  scenes,
  actionsFor,
  onAnswer,
  language,
}: {
  video: NonNullable<VideoContent['video']>
  scenes: StudentScene[]
  actionsFor: Props['actionsFor']
  onAnswer: Props['onAnswer']
  language: Language
}) {
  const element = useRef<HTMLVideoElement>(null)
  const t = useT()
  const base = video.base.endsWith('/') ? video.base : `${video.base}/`
  const [correctlyAnswered, setCorrectIds] = useState<Set<string>>(new Set())
  const [currentPause, setCurrentPause] = useState<VideoPause | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [last, setLast] = useState<AttemptResult | null>(null)
  const pendingItems = useMemo(
    () => video.pauses.filter((p) => !correctlyAnswered.has(p.itemId)),
    [video.pauses, correctlyAnswered],
  )
  const items = useMemo(() => {
    const map = new Map<string, StudentItem>()
    for (const c of scenes) if (c.type === 'question') map.set(c.item.id, c.item)
    return map
  }, [scenes])

  useEffect(() => {
    const v = element.current
    if (!v) return
    const source = `${base}index.m3u8`
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = source
      return
    }
    if (!Hls.isSupported()) return
    const hls = new Hls({ enableWorker: false })
    hls.loadSource(source)
    hls.attachMedia(v)
    return () => hls.destroy()
  }, [base])

  /* the question lock: reaching a pending pause stops the video; trying to skip past it goes back */
  useEffect(() => {
    const v = element.current
    if (!v) return
    function check() {
      if (!v) return
      const nowMs = v.currentTime * 1000
      const next = pendingItems.find((p) => nowMs >= p.atMs - 80)
      if (next) {
        v.pause()
        if (nowMs > next.atMs + 250) v.currentTime = next.atMs / 1000
        setCurrentPause((current) => (current?.itemId === next.itemId ? current : next))
      }
    }
    v.addEventListener('timeupdate', check)
    v.addEventListener('seeked', check)
    return () => {
      v.removeEventListener('timeupdate', check)
      v.removeEventListener('seeked', check)
    }
  }, [pendingItems])

  function onFinish(itemId: string) {
    return (r: AttemptResult) => {
      onAnswer(itemId, r)
      setLast(r)
      if (r.correct) setCorrectIds((current) => new Set(current).add(itemId))
    }
  }

  function resume() {
    setCurrentPause(null)
    setLast(null)
    void element.current?.play()
  }

  function rewindToSegment() {
    if (!currentPause || !element.current) return
    element.current.currentTime = currentPause.backToMs / 1000
    setCurrentPause(null)
    setLast(null)
    setAttempt((t) => t + 1)
    void element.current.play()
  }

  const item = currentPause ? items.get(currentPause.itemId) : undefined

  return (
    <div className="flex flex-col gap-4">
      {video.simulatedVoice ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-soft">
          <Badge>
            <SpeakerSlash size={14} aria-hidden />
            {t.video.noNarration}
          </Badge>
          <span>
            {t.video.noNarrationNote1} <code className="font-mono text-ink">npm run voice:install</code>{' '}
            {t.video.noNarrationNote2} <code className="font-mono text-ink">--forcar</code>.
          </span>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-panel border border-line bg-black">
        <video
          ref={element}
          className="aspect-video w-full"
          controls
          playsInline
          preload="metadata"
          poster={`${base}poster.jpg`}
        >
          <track
            kind="captions"
            src={`${base}subtitles.vtt`}
            srcLang={LANGUAGE_DATA[language].bcp47}
            label={LANGUAGE_DATA[language].name}
            default
          />
        </video>

        {currentPause && item ? (
          <div
            className="animate-appear border-t border-line bg-page/92 p-3 backdrop-blur-md sm:absolute sm:inset-0 sm:z-10 sm:overflow-y-auto sm:border-0 sm:bg-page/80 sm:p-6"
            aria-live="polite"
          >
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              <p className="inline-flex items-center gap-2 text-[14px] font-medium text-info">
                <Pause size={16} weight="fill" aria-hidden />
                {t.video.pause}
              </p>
              <Item
                key={`${item.id}-${attempt}`}
                item={item}
                actions={actionsFor(item.id)}
                onFinish={onFinish(item.id)}
              />
              {last ? (
                <div className="flex flex-wrap gap-3">
                  {last.correct ? (
                    <Button onClick={resume}>{t.video.resumeVideo}</Button>
                  ) : (
                    <>
                      <Button onClick={rewindToSegment} icon={<ArrowCounterClockwise size={16} />}>
                        {t.video.rewatchSegment}
                      </Button>
                      <Button variant="ghost" onClick={resume}>
                        {t.video.continueAnyway}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {video.pauses.length ? (
        <p className="text-[13px] text-ink-faint">{t.video.pauses(video.pauses.length, correctlyAnswered.size)}</p>
      ) : null}
    </div>
  )
}

// ── the slides ───────────────────────────────────────────────────────────────

function Slides({
  courseId,
  scenes,
  actionsFor,
  onAnswer,
}: {
  courseId: string
  scenes: StudentScene[]
  actionsFor: Props['actionsFor']
  onAnswer: Props['onAnswer']
}) {
  const [index, setIndex] = useState(0)
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set())
  const t = useT()
  const scene = scenes[index]
  const blocked = scene.type === 'question' && !answeredIds.has(scene.item.id)

  function record(itemId: string) {
    return (r: AttemptResult) => {
      onAnswer(itemId, r)
      setAnsweredIds((current) => new Set(current).add(itemId))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] text-ink-soft">{t.video.notGenerated}</p>
        <Command text={`npm run course:video -- ${courseId}`} className="sm:max-w-md" />
      </Panel>

      <div
        key={index}
        className="card flex min-h-[260px] animate-appear flex-col justify-center overflow-hidden rounded-panel p-6 sm:aspect-video sm:p-12"
      >
        {scene.type === 'question' ? (
          <p className="font-display text-[clamp(1.25rem,3vw,1.75rem)] text-ink">{t.video.pause}</p>
        ) : (
          <SceneFrame scene={scene} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="subtle"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          icon={<CaretLeft size={16} />}
        >
          {t.video.previous}
        </Button>
        <span className="font-mono text-[13px] text-ink-faint">{t.video.scene(index + 1, scenes.length)}</span>
        <Button disabled={index === scenes.length - 1 || blocked} onClick={() => setIndex(index + 1)}>
          {t.video.next}
          <CaretRight size={16} aria-hidden />
        </Button>
      </div>

      {scene.type === 'question' ? (
        <Item
          key={scene.item.id}
          item={scene.item}
          actions={actionsFor(scene.item.id)}
          onFinish={record(scene.item.id)}
        />
      ) : (
        <p className="max-w-[70ch] text-[16px] leading-[1.75] text-ink-soft">{scene.narration}</p>
      )}
    </div>
  )
}

function Title({ children }: { children: ReactNode }) {
  return <p className="font-display text-[clamp(1.25rem,3vw,1.75rem)] leading-tight text-ink">{children}</p>
}

function SceneFrame({ scene }: { scene: Exclude<StudentScene, { type: 'question' }> }) {
  const t = useT()
  if (scene.type === 'title') {
    return (
      <div>
        <p className="font-display text-[clamp(1.6rem,4.5vw,3rem)] leading-tight accent-text">{scene.title}</p>
        {scene.subtitle ? <p className="mt-3 text-[clamp(1rem,2vw,1.25rem)] text-ink-soft">{scene.subtitle}</p> : null}
      </div>
    )
  }
  if (scene.type === 'bullets') {
    return (
      <div>
        <Title>{scene.title}</Title>
        <ul className="mt-5 flex flex-col gap-3">
          {scene.bullets.map((t) => (
            <li key={t} className="flex gap-3 text-[clamp(1rem,2vw,1.25rem)] text-ink">
              <span className="mt-[0.6em] size-2 shrink-0 rounded-full bg-info" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (scene.type === 'equation') {
    return (
      <div className="flex flex-col items-center gap-4 text-ink">
        {scene.lines.map((line) => (
          <div
            key={line}
            className="max-w-full overflow-x-auto text-[clamp(1.1rem,3vw,1.7rem)]"
            /* KaTeX builds the HTML from the LaTeX with `trust: false`: no \href and no HTML coming from the script */
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(line, { throwOnError: false, trust: false, displayMode: true }),
            }}
          />
        ))}
        {scene.captions ? <p className="text-[15px] text-ink-soft">{scene.captions}</p> : null}
      </div>
    )
  }
  if (scene.type === 'code') {
    return (
      <pre className="overflow-auto rounded-tile border border-line bg-card p-4 font-mono text-[14px] leading-relaxed text-ink">
        {scene.code.split('\n').map((l, i) => (
          <div key={i} className={join('px-2', scene.highlights.includes(i + 1) && 'rounded bg-info/14')}>
            <span className="mr-4 inline-block w-6 text-right text-ink-faint">{i + 1}</span>
            {l || ' '}
          </div>
        ))}
      </pre>
    )
  }
  if (scene.type === 'diagram') {
    const label = new Map(scene.nodes.map((n) => [n.id, n.label]))
    return (
      <div>
        {scene.title ? <Title>{scene.title}</Title> : null}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {scene.nodes.map((n, i) => (
            <span key={n.id} className="inline-flex items-center gap-2">
              <span className="rounded-tile border border-accent-ink/50 bg-accent/12 px-4 py-2 text-[16px] text-ink">
                {n.label}
              </span>
              {i < scene.nodes.length - 1 ? <CaretRight size={16} className="text-info" aria-hidden /> : null}
            </span>
          ))}
        </div>
        {scene.links.length ? (
          <ul className="mt-5 flex flex-col gap-1 text-[14px] text-ink-soft">
            {scene.links.map((l, i) => (
              <li key={i}>
                {t.video.leadsTo(label.get(l.from) ?? l.from, label.get(l.to) ?? l.to)}
                {l.label ? `, ${l.label}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }
  return <Chart func={scene.func} xMin={scene.xMin} xMax={scene.xMax} title={scene.title} label={scene.label} />
}

/** The slide graph: the curve goes through the closed interpreter (`compileFunction`), never through eval. */
function Chart({
  func,
  xMin,
  xMax,
  title,
  label,
}: {
  func: string
  xMin: number
  xMax: number
  title: string
  label: string
}) {
  const t = useT()
  const f = compileFunction(func)
  if (!f) return <p className="text-ink-soft">{t.video.chartUnavailable}</p>
  const points = Array.from({ length: 81 }, (_, i) => {
    const x = xMin + ((xMax - xMin) * i) / 80
    return { x, y: f(x) }
  }).filter((p) => Number.isFinite(p.y))
  if (!points.length) return <p className="text-ink-soft">{t.video.chartUnavailable}</p>
  const ys = points.map((p) => p.y)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const px = (x: number) => 40 + ((x - xMin) / (xMax - xMin)) * 520
  const py = (y: number) => 260 - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * 220
  const yZero = py(Math.max(yMin, Math.min(0, yMax)))
  const xZero = px(Math.max(xMin, Math.min(0, xMax)))
  const filePath = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ')
  return (
    <div>
      {title ? <Title>{title}</Title> : null}
      <svg
        viewBox="0 0 600 290"
        className="mt-2 w-full max-w-[640px]"
        role="img"
        aria-label={label || t.video.chartOf(func)}
      >
        <line x1="30" y1={yZero} x2="580" y2={yZero} stroke="var(--ink-faint)" strokeWidth="1.5" />
        <line x1={xZero} y1="20" x2={xZero} y2="280" stroke="var(--ink-faint)" strokeWidth="1.5" />
        <path d={filePath} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <p className="mt-1 text-[15px] text-ink-soft">{label}</p> : null}
    </div>
  )
}
