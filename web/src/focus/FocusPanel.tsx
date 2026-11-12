/**
 * The focus mode UI, mounted in the shell (it shows on every screen, the lesson included): the floating button, the
 * settings, calibration, the session widget, the nudge and the summary. The state comes from the engine (`./engine`).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ArrowFatLinesDown,
  Browser,
  Camera,
  CameraSlash,
  Coffee,
  DeviceMobile,
  DownloadSimple,
  Eye,
  Moon,
  Pause,
  PersonSimpleWalk,
  Play,
  ShieldCheck,
  SpeakerHigh,
  Stop,
  Timer,
  X,
} from '@phosphor-icons/react'
import {
  DURATIONS,
  LIMITS,
  PACES,
  SENSITIVITIES,
  DISTRACTION_TYPES,
  focusPercent,
  type ModelsState,
  type DistractionType,
} from '@shared/focus'
import { Button, join } from '@/components/ui'
import { api } from '@/lib/api'
import { useT } from '@/i18n'
import {
  openSettings,
  cancelSetup,
  dismissNudge,
  endSession,
  closeSettings,
  closeSummary,
  begin,
  changeConfig,
  pauseNow,
  unpause,
  testAlarm,
  useFocus,
  type Diagnostics,
} from './engine'

const DISTRACTION_ICON: Record<DistractionType, typeof Timer> = {
  phone: DeviceMobile,
  looking_down: ArrowFatLinesDown,
  left_tab: Browser,
  away: PersonSimpleWalk,
  eyes_closed: Moon,
  looking_away: Eye,
}

function timer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const second = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${second(m)}:${second(s)}` : `${second(m)}:${second(s)}`
}

const minutes = (seconds: number) => Math.round(seconds / 60)

/** The camera preview (mirrored, like a real mirror). */
function CameraPreview({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  if (!stream) return null
  return <video ref={ref} autoPlay muted playsInline className={join('-scale-x-100 object-cover', className)} />
}

function WindowFrame({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return
    const keyHandler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
  }, [onClose])
  const t = useT()
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-page/70 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card max-h-[calc(100dvh-1.5rem)] w-full max-w-lg animate-appear overflow-y-auto rounded-panel p-5 sm:p-7"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-[20px]">{title}</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-ink-faint hover:text-ink"
              aria-label={t.general.close}
            >
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={join(
        'rounded-tile border px-3 py-2 text-left text-sm transition-colors',
        active
          ? 'border-accent bg-accent/20 text-ink'
          : 'border-line text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function Toggle({
  enabled,
  onChange,
  children,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span className="text-sm text-ink-soft">{children}</span>
      <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={join(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-info',
          enabled ? 'bg-accent' : 'bg-tint',
        )}
      >
        <span
          className={join(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
            enabled ? 'left-5.5' : 'left-0.5',
          )}
        />
      </span>
    </label>
  )
}

// ── settings ─────────────────────────────────────────────────────────────────

function Settings() {
  const t = useT()
  const { config, error } = useFocus()
  const [models, setModels] = useState<ModelsState | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    api.get<ModelsState>('/api/focus/models').then(setModels, () => setModels(null))
  }, [])

  async function download() {
    setDownloading(true)
    setDownloadError(null)
    try {
      setModels(await api.post<ModelsState>('/api/focus/models'))
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
    }
  }

  const activePace = PACES.find((r) =>
    r.pause === 0 ? config.pauseMinutes === 0 : r.focus === config.focusMinutes && r.pause === config.pauseMinutes,
  )
  const missingModel = config.camera && models !== null && !models.installed

  return (
    <WindowFrame title={t.focus.title} onClose={closeSettings}>
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">{t.focus.howLong}</h3>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((m) => (
              <Choice key={m} active={config.totalMinutes === m} onClick={() => changeConfig({ totalMinutes: m })}>
                {m < 60 ? `${m} min` : `${m / 60}h${m % 60 ? ` ${m % 60}` : ''}`}
              </Choice>
            ))}
            <label className="flex items-center gap-2 rounded-tile border border-line px-3 py-1.5 text-sm text-ink-soft">
              <input
                type="number"
                min={5}
                max={480}
                value={config.totalMinutes}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value))
                  if (n >= 5 && n <= 480) changeConfig({ totalMinutes: n })
                }}
                className="w-14 bg-transparent text-ink outline-none"
                aria-label={t.focus.studyMinutes}
              />
              min
            </label>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">{t.focus.pace}</h3>
          <div className="grid grid-cols-3 gap-2">
            {PACES.map((r, i) => (
              <Choice
                key={r.label}
                active={activePace === r}
                onClick={() =>
                  changeConfig(r.pause === 0 ? { pauseMinutes: 0 } : { focusMinutes: r.focus, pauseMinutes: r.pause })
                }
              >
                <span className="block text-ink">{t.focus.paces[i]?.label}</span>
                <span className="block text-[12px] text-ink-faint">{t.focus.paces[i]?.description}</span>
              </Choice>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Toggle enabled={config.camera} onChange={(camera) => changeConfig({ camera })}>
            <span className="flex items-center gap-2 text-ink">
              <Camera size={16} /> {t.focus.watchCamera}
            </span>
            <span className="block text-[13px]">{t.focus.watchCameraNote}</span>
          </Toggle>
          <Toggle enabled={config.watchTab} onChange={(watchTab) => changeConfig({ watchTab })}>
            <span className="flex items-center gap-2 text-ink">
              <Browser size={16} /> {t.focus.watchTab}
            </span>
            <span className="block text-[13px]">{t.focus.watchTabNote}</span>
          </Toggle>
        </section>

        {missingModel && (
          <div className="rounded-tile border border-gold/30 bg-gold/8 p-4 text-sm">
            <p className="text-ink">{t.focus.downloadNote1(models.megabytes)}</p>
            <p className="mt-1 text-ink-soft">{t.focus.downloadNote2}</p>
            <Button
              variant="subtle"
              size="small"
              className="mt-3"
              icon={<DownloadSimple size={16} />}
              onClick={download}
              disabled={downloading}
            >
              {downloading ? t.focus.downloading : t.focus.download}
            </Button>
            {downloadError && <p className="mt-2 text-error">{downloadError}</p>}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">{t.focus.strictness}</h3>
            <div className="flex gap-1.5">
              {SENSITIVITIES.map((s) => (
                <Choice key={s} active={config.sensitivity === s} onClick={() => changeConfig({ sensitivity: s })}>
                  {t.focus.sensitivities[s]}
                </Choice>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">{t.focus.volume}</h3>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.volume}
                onChange={(e) => changeConfig({ volume: Number(e.target.value) })}
                className="w-full accent-accent"
                aria-label={t.focus.volume}
              />
              <button
                type="button"
                onClick={testAlarm}
                className="text-ink-soft hover:text-ink"
                aria-label={t.focus.testSound}
              >
                <SpeakerHigh size={20} />
              </button>
            </div>
          </div>
        </section>

        {config.camera && (
          <p className="flex gap-2 text-[13px] text-ink-faint">
            <ShieldCheck size={18} className="shrink-0 text-success" aria-hidden />
            {t.focus.privacy}
          </p>
        )}

        {error && <p className="rounded-tile border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          {error && config.camera && (
            <Button
              variant="ghost"
              onClick={() => {
                changeConfig({ camera: false })
                void begin()
              }}
            >
              {t.focus.noCamera}
            </Button>
          )}
          <Button icon={<Play size={18} weight="fill" />} onClick={() => void begin()} disabled={missingModel}>
            {t.focus.getStarted}
          </Button>
        </div>
      </div>
    </WindowFrame>
  )
}

// ── setup and calibration ────────────────────────────────────────────────────

function Preparation() {
  const t = useT()
  const { stage, step, calibration, noFace, stream } = useFocus()
  return (
    <WindowFrame title={stage === 'calibrating' ? t.focus.calibrating : t.focus.preparing} onClose={cancelSetup}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-tile bg-sunken">
          <CameraPreview stream={stream} className="h-full w-full" />
          {stage === 'calibrating' && (
            <div
              aria-hidden
              className={join(
                'pointer-events-none absolute top-1/2 left-1/2 h-[70%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed',
                noFace ? 'border-error' : 'border-info',
              )}
            />
          )}
        </div>
        {stage === 'calibrating' ? (
          <>
            <p className="text-ink">{t.focus.lookAtScreen}</p>
            <p className="text-sm text-ink-soft">{noFace ? t.focus.noFace : t.focus.calibrateNote}</p>
            <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-tint">
              <div
                className="h-full bg-info transition-[width] duration-200"
                style={{ width: `${Math.round(calibration * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-ink-soft">{step ?? t.focus.preparingStep}</p>
        )}
      </div>
    </WindowFrame>
  )
}

// ── the running session ──────────────────────────────────────────────────────

const ATTENTION_COLOR = { focused: 'bg-success', unsure: 'bg-gold', distracted: 'bg-error' } as const

function Widget() {
  const t = useT()
  const { phase, paused, attention, config, stream, phases, elapsedMs, diagnostics } = useFocus()
  const [showPreview, setWithPreview] = useState(false)
  if (!phase) return null
  const progress = 1 - phase.remainingMs / phase.durationMs
  const radius = 26
  const lap = 2 * Math.PI * radius
  const totalMs = phases.at(-1)?.endMs ?? 0
  const inPause = phase.type === 'pause'
  const color = inPause ? 'var(--color-success)' : 'var(--color-accent-ink)'

  return (
    <div className="card fixed right-3 bottom-24 z-50 w-[min(300px,calc(100vw-1.5rem))] animate-appear rounded-panel p-3.5 md:right-6 md:bottom-6">
      <div className="flex items-center gap-3.5">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--color-tint)" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={lap}
              strokeDashoffset={lap * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-200"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center">
            {inPause ? <Coffee size={22} className="text-success" /> : <Timer size={22} className="text-accent-ink" />}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[26px] leading-none text-ink tabular-nums" aria-live="off">
            {timer(phase.remainingMs)}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {paused
              ? t.focus.paused
              : inPause
                ? t.focus.pauseStretch
                : t.focus.focusBlock(Math.floor(phase.index / 2) + 1)}
          </p>
          <p className="text-[12px] text-ink-faint">{t.focus.totalRemaining(timer(totalMs - elapsedMs))}</p>
        </div>
      </div>

      {!inPause && !paused && attention && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
          <span
            className={join(
              'h-2.5 w-2.5 rounded-full',
              ATTENTION_COLOR[attention],
              attention !== 'focused' && 'animate-throb',
            )}
          />
          {config.camera ? t.focus.attention[attention] : t.focus.noCameraLabel}
        </div>
      )}

      {showPreview && stream && !inPause && (
        <>
          <CameraPreview stream={stream} className="mt-3 aspect-[4/3] w-full rounded-tile" />
          {diagnostics && <DiagnosticsPanel d={diagnostics} />}
        </>
      )}

      <div className="mt-3 flex items-center gap-2">
        {paused ? (
          <Button size="small" icon={<Play size={16} weight="fill" />} onClick={unpause} className="flex-1">
            {t.focus.unpause}
          </Button>
        ) : (
          <Button
            size="small"
            variant="subtle"
            icon={<Pause size={16} weight="fill" />}
            onClick={pauseNow}
            className="flex-1"
          >
            {t.focus.pauseButton}
          </Button>
        )}
        {config.camera && stream && (
          <button
            type="button"
            onClick={() => setWithPreview((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
            aria-label={showPreview ? t.focus.hideCamera : t.focus.showCamera}
            aria-pressed={showPreview}
          >
            {showPreview ? <CameraSlash size={18} /> : <Camera size={18} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => void endSession(false)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-error"
          aria-label={t.focus.endSession}
        >
          <Stop size={18} weight="fill" />
        </button>
      </div>
    </div>
  )
}

/** The raw detector numbers, visible with the preview open: to understand why it alerted (or not). */
function DiagnosticsPanel({ d }: { d: Diagnostics }) {
  const t = useT()
  const d_ = t.focus.diagnostics
  const { config } = useFocus()
  const limitDegrees = LIMITS[config.sensitivity].degrees
  const lines: Array<[string, string, boolean]> = [
    [d_.face, d.face ? d_.yes : d_.no, !d.face],
    [
      d_.head,
      d.deviationDegrees === null ? '—' : `${Math.round(d.deviationDegrees)}° / ${limitDegrees}°`,
      (d.deviationDegrees ?? 0) > limitDegrees,
    ],
    [d_.eyesDown, d.lookDown.toFixed(2), d.lookDown > 0.28],
    [d_.blink, d.blink.toFixed(2), d.blink > 0.55],
    [d_.phone, d.phone.toFixed(2), d.phone >= 0.3],
  ]
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px]">
      {lines.map(([label, value, alert]) => (
        <div key={label} className="contents">
          <dt className="text-ink-faint">{label}</dt>
          <dd className={join('text-right', alert ? 'text-error' : 'text-ink-soft')}>{value}</dd>
        </div>
      ))}
      <dt className="text-ink-faint">{d_.reading}</dt>
      <dd className="text-right text-ink-soft">{Math.round(d.costMs)} ms</dd>
    </dl>
  )
}

function Nudge() {
  const t = useT()
  const { nudge } = useFocus()
  if (!nudge) return null
  const Icon = DISTRACTION_ICON[nudge.type]
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="nudge-title"
      aria-describedby="nudge-text"
      className={join(
        'fixed inset-0 z-[70] flex items-center justify-center p-6 backdrop-blur-md',
        nudge.level === 3 ? 'bg-error/35' : nudge.level === 2 ? 'bg-error/22' : 'bg-page/75',
      )}
    >
      <div
        className={join(
          'card w-full max-w-md rounded-panel border-error/50 p-7 text-center',
          nudge.level === 3 ? 'animate-shake' : 'animate-pop',
        )}
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error/15 text-error">
          <Icon size={34} weight="duotone" />
        </span>
        <h2 id="nudge-title" className="mt-5 text-[clamp(1.5rem,4vw,2rem)] text-ink">
          {nudge.title}
        </h2>
        <p id="nudge-text" className="mt-3 text-ink-soft">
          {nudge.text}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button autoFocus size="large" onClick={dismissNudge}>
            {t.focus.imBack}
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              dismissNudge()
              pauseNow()
            }}
          >
            {t.focus.needABreak}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── summary ──────────────────────────────────────────────────────────────────

function Summary() {
  const t = useT()
  const { summary, saveError } = useFocus()
  if (!summary) return null
  const pct = focusPercent(summary.attentiveSeconds, summary.focusSeconds)
  const total = Object.values(summary.distractions).reduce<number>((a, b) => a + (b ?? 0), 0)
  return (
    <WindowFrame title={summary.completed ? t.focus.completed : t.focus.ended} onClose={closeSummary}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-tile bg-tint/60 p-3">
            <p className="font-display text-2xl text-ink">{minutes(summary.attentiveSeconds)}</p>
            <p className="text-[12px] text-ink-faint">{t.focus.minFocused}</p>
          </div>
          <div className="rounded-tile bg-tint/60 p-3">
            <p
              className={join(
                'font-display text-2xl',
                pct >= 80 ? 'text-success' : pct >= 50 ? 'text-gold' : 'text-error',
              )}
            >
              {pct}%
            </p>
            <p className="text-[12px] text-ink-faint">{t.focus.ofFocus}</p>
          </div>
          <div className="rounded-tile bg-tint/60 p-3">
            <p className="font-display text-2xl text-ink">{total}</p>
            <p className="text-[12px] text-ink-faint">{t.focus.distractions(total)}</p>
          </div>
        </div>
        {total > 0 && (
          <ul className="flex flex-col gap-1.5 text-sm">
            {DISTRACTION_TYPES.filter((type) => summary.distractions[type]).map((type) => {
              const Icon = DISTRACTION_ICON[type]
              return (
                <li key={type} className="flex items-center gap-2 text-ink-soft">
                  <Icon size={16} className="text-error" /> {t.focus.labels[type]}
                  <span className="ml-auto text-ink">{summary.distractions[type]}×</span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-sm text-ink-soft">
          {pct >= 90
            ? t.focus.tips.great
            : pct >= 70
              ? t.focus.tips.bom
              : summary.focusSeconds < 60
                ? t.focus.tips.short
                : t.focus.tips.bad}
        </p>
        {saveError && <p className="text-sm text-error">{t.focus.couldNotSave(saveError)}</p>}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              closeSummary()
              openSettings()
            }}
          >
            {t.focus.anotherSession}
          </Button>
          <Button onClick={closeSummary}>{t.general.close}</Button>
        </div>
      </div>
    </WindowFrame>
  )
}

// ── all together ─────────────────────────────────────────────────────────────

export function FocusPanel() {
  const t = useT()
  const stage = useFocus((s) => s.stage)
  // the teacher page is a conversation with its own input bar at the bottom: the floating button would cover it
  const onTeacherPage = useLocation().pathname.endsWith('/teacher')
  return (
    <>
      {stage === 'idle' && !onTeacherPage && (
        <button
          type="button"
          onClick={openSettings}
          className="card fixed right-3 bottom-24 z-40 flex h-12 items-center gap-2 rounded-pill px-4 text-sm text-ink-soft transition-colors hover:text-ink md:right-6 md:bottom-6"
          aria-label={t.focus.open}
        >
          <Timer size={20} className="text-accent-ink" /> {t.focus.button}
        </button>
      )}
      {stage === 'configuring' && <Settings />}
      {(stage === 'preparing' || stage === 'calibrating') && <Preparation />}
      {stage === 'running' && (
        <>
          <Widget />
          <Nudge />
        </>
      )}
      {stage === 'summary' && <Summary />}
    </>
  )
}
