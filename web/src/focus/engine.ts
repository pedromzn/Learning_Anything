/**
 * The focus mode engine. It lives OUTSIDE React (the shell remounts on every screen change; the session must not die
 * with it): it holds the camera, the detector, the clock and the distractions, and publishes the state in a zustand
 * store that the UI reads.
 *
 * The clock uses real time, not a tick count: with the tab hidden the browser spaces out timers, and the time stays
 * right. Detection only runs in focus blocks while the session is running; during breaks the camera rests.
 */

import { create } from 'zustand'
import {
  DEFAULT_CONFIG,
  evaluate,
  nudge,
  focusConfigSchema,
  phaseAt,
  phasePlan,
  type Attention,
  type FocusConfig,
  type Phase,
  type Reading,
  type FocusSession,
  type DistractionType,
  type Watcher,
} from '@shared/focus'
// MediaPipe is heavy: it only loads when the person turns on the camera (dynamic import in `loadDetector`)
import type { Detector, Pose } from './detector'
import { alarm, prepare, chime } from './sound'
import { t } from '@/i18n'

export type Stage = 'idle' | 'configuring' | 'preparing' | 'calibrating' | 'running' | 'summary'

export interface OpenNudge {
  type: DistractionType
  title: string
  text: string
  level: 1 | 2 | 3
}

export interface FocusState {
  stage: Stage
  config: FocusConfig
  error: string | null
  /** what is loading now (detector, camera) */
  step: string | null
  /** from 0 to 1 during calibration */
  calibration: number
  /** calibration cannot see the face */
  noFace: boolean
  phases: Phase[]
  elapsedMs: number
  paused: boolean
  phase: { index: number; type: Phase['type']; remainingMs: number; durationMs: number } | null
  attention: Attention | null
  nudge: OpenNudge | null
  distractions: Partial<Record<DistractionType, number>>
  focusSeconds: number
  attentiveSeconds: number
  /** the camera, for the UI preview */
  stream: MediaStream | null
  summary: FocusSession | null
  /** saving the summary failed (the session did not reach the profile) */
  saveError: string | null
  /** the raw detector numbers, for the diagnostics panel (to tune the thresholds with data) */
  diagnostics: Diagnostics | null
}

export interface Diagnostics {
  face: boolean
  deviationDegrees: number | null
  /** how much lower the eyes are than at calibration (0 to 1) */
  lookDown: number
  blink: number
  /** the highest phone score in the latest readings (0 to 1) */
  phone: number
  /** how long the face reading takes, in ms */
  costMs: number
}

const CONFIG_KEY = 'learning-anything:focus:config'

function savedConfig(): FocusConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    const parsed = raw ? focusConfigSchema.safeParse(JSON.parse(raw)) : null
    return parsed?.success ? parsed.data : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

function storeConfig(c: FocusConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
  } catch {
    // no storage (private tab, blocked): it just does not remember the choice
  }
}

const INITIAL: Omit<FocusState, 'config'> = {
  stage: 'idle',
  error: null,
  step: null,
  calibration: 0,
  noFace: false,
  phases: [],
  elapsedMs: 0,
  paused: false,
  phase: null,
  attention: null,
  nudge: null,
  distractions: {},
  focusSeconds: 0,
  attentiveSeconds: 0,
  stream: null,
  summary: null,
  saveError: null,
  diagnostics: null,
}

export const useFocus = create<FocusState>(() => ({ ...INITIAL, config: savedConfig() }))

const patchState = (partial: Partial<FocusState>) => useFocus.setState(partial)
const state = () => useFocus.getState()

// ── what lives outside the store ─────────────────────────────────────────────

let detector: Detector | null = null
let loadingDetector: Promise<Detector> | null = null
let video: HTMLVideoElement | null = null
let timer: number | null = null
let lastTick = 0
let lastPhoneReading = 0
let phoneSeen = false
/** the scores of the last 3 phone readings: 2 must be above the threshold (a single false positive does not count) */
let phoneScores: number[] = []
let lookDownBase = 0
let watcher: Watcher = {}
let basePose: Pose | null = null
let blinkBase = 0
let sessionId = ''
let startedAt = ''
let course: string | null = null
/** how long the last face reading took: on a slow machine, read less often */
let readCost = 0
let lastFaceReading = 0
let lastFace: { face: boolean; deviation: number | null; eyesClosed: boolean; lookingDown: boolean } | null = null

const TICK_MS = 200
const CALIBRATION_MS = 3000

function loadDetector(): Promise<Detector> {
  loadingDetector ??= import('./detector')
    .then(({ Detector }) => Detector.create())
    .then((d) => (detector = d))
    .catch((e) => {
      loadingDetector = null
      throw e
    })
  return loadingDetector
}

async function turnOnCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error(t().focus.browserWithoutCamera)
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  })
  // a hidden <video>, outside the React tree, so the detector keeps reading across screen changes
  video ??= Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true })
  video.setAttribute('aria-hidden', 'true')
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px'
  if (!video.isConnected) document.body.appendChild(video)
  video.srcObject = stream
  await video.play()
  return stream
}

function turnOffCamera() {
  state()
    .stream?.getTracks()
    .forEach((t) => t.stop())
  if (video) video.srcObject = null
  patchState({ stream: null })
}

function openCourse(): string | null {
  const m = /^\/courses\/([a-z0-9-]{1,80})(\/|$)/.exec(window.location.pathname)
  return m?.[1] ?? null
}

const newId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

function systemNotify(title: string, text: string) {
  if (document.visibilityState === 'visible' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, { body: text, tag: 'learning-anything-focus', requireInteraction: true })
  } catch {
    // some browsers only notify through a service worker: the sound already warned
  }
}

// ── calibration ──────────────────────────────────────────────────────────────

/** 3 s looking at the screen: records the neutral posture and the normal "blink" of this person with this camera. */
async function calibrate(): Promise<boolean> {
  if (!detector || !video) return false
  patchState({ stage: 'calibrating', calibration: 0, noFace: false })
  const poses: Pose[] = []
  const blinks: number[] = []
  const lookDowns: number[] = []
  const start = Date.now()
  const limit = start + 10_000
  while (Date.now() < limit && state().stage === 'calibrating') {
    const r = detector.readFace(video)
    if (r.face && r.pose) {
      poses.push(r.pose)
      blinks.push(r.blink)
      lookDowns.push(r.lookDown)
    }
    const samples = poses.length
    patchState({ calibration: Math.min(1, samples / 15), noFace: Date.now() - start > 2500 && samples < 3 })
    if (samples >= 15 && Date.now() - start >= CALIBRATION_MS) break
    await new Promise((r) => setTimeout(r, TICK_MS))
  }
  if (state().stage !== 'calibrating' || poses.length < 5) return false
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  basePose = { yaw: media(poses.map((p) => p.yaw)), pitch: media(poses.map((p) => p.pitch)) }
  blinkBase = media(blinks)
  lookDownBase = media(lookDowns)
  return true
}

// ── the loop ─────────────────────────────────────────────────────────────────

const PHONE_SCORE = 0.3

function readCamera(now: number): Pick<Reading, 'face' | 'deviationDegrees' | 'eyesClosed' | 'lookingDown' | 'phone'> {
  const { config } = state()
  if (!config.camera || !detector || !video || video.readyState < 2) {
    return { face: null, deviationDegrees: null, eyesClosed: false, lookingDown: false, phone: false }
  }
  // on a slow machine, space out the face reading (twice what it costs, at least one tick)
  if (now - lastFaceReading >= Math.max(TICK_MS, readCost * 2) || !lastFace) {
    const t0 = performance.now()
    const r = detector.readFace(video)
    readCost = performance.now() - t0
    lastFaceReading = now
    const poseDeviation =
      r.pose && basePose ? { yaw: r.pose.yaw - basePose.yaw, pitch: r.pose.pitch - basePose.pitch } : null
    const lookDown = Math.max(0, r.lookDown - lookDownBase)
    lastFace = {
      face: r.face,
      deviation: poseDeviation ? Math.hypot(poseDeviation.yaw, poseDeviation.pitch) : null,
      eyesClosed: r.face && r.blink > Math.max(0.55, blinkBase + 0.3),
      // someone looking at a phone in their lap lowers the eyes much more than the head: eyes far down, or eyes a
      // bit down together with a tilted head
      lookingDown: r.face && (lookDown > 0.28 || (lookDown > 0.14 && Math.abs(poseDeviation?.pitch ?? 0) > 10)),
    }
    patchState({
      diagnostics: {
        face: r.face,
        deviationDegrees: lastFace.deviation,
        lookDown,
        blink: r.blink,
        phone: Math.max(0, ...phoneScores),
        costMs: readCost,
      },
    })
  }
  if (now - lastPhoneReading >= 500) {
    phoneScores = [...phoneScores, detector.readPhone(video)].slice(-3)
    phoneSeen = phoneScores.filter((n) => n >= PHONE_SCORE).length >= 2
    lastPhoneReading = now
  }
  return {
    face: lastFace.face,
    deviationDegrees: lastFace.deviation,
    eyesClosed: lastFace.eyesClosed,
    lookingDown: lastFace.lookingDown,
    phone: phoneSeen,
  }
}

function openNudge(type: DistractionType) {
  const s = state()
  const distractions = { ...s.distractions, [type]: (s.distractions[type] ?? 0) + 1 }
  const total = Object.values(distractions).reduce((a, b) => a + (b ?? 0), 0)
  const level = nudge(type, total).level
  const [title, text] = t().focus.nudges[type][level - 1]!
  const b = { title, text, level }
  patchState({ distractions, nudge: { type, ...b }, attention: 'distracted' })
  alarm(s.config.volume, b.level)
  systemNotify(b.title, b.text)
  watcher = {}
}

function tick() {
  const s = state()
  if (s.stage !== 'running') return
  const now = Date.now()
  const dt = Math.max(0, now - lastTick)
  lastTick = now
  if (s.paused) return

  const elapsedMs = s.elapsedMs + dt
  const current = phaseAt(s.phases, elapsedMs)
  if (!current) {
    patchState({ elapsedMs: s.phases.at(-1)?.endMs ?? elapsedMs })
    void endSession(true)
    return
  }
  const changed = s.phase !== null && s.phase.index !== current.index
  const phase = {
    index: current.index,
    type: current.phase.type,
    remainingMs: current.remainingMs,
    durationMs: current.phase.endMs - current.phase.startMs,
  }

  if (changed) {
    watcher = {}
    chime(s.config.volume, current.phase.type === 'focus')
    if (current.phase.type === 'pause') systemNotify(...t().focus.pauseNotification)
    else systemNotify(...t().focus.resumeNotification)
  }

  if (current.phase.type === 'pause') {
    patchState({ elapsedMs, phase, attention: null, nudge: changed ? null : s.nudge })
    return
  }

  const focusSeconds = s.focusSeconds + dt / 1000
  if (s.nudge) {
    // with the nudge on screen, time runs and does not count as attentive
    patchState({ elapsedMs, phase, focusSeconds })
    return
  }
  const reading: Reading = { ...readCamera(now), tabVisible: document.visibilityState === 'visible' }
  const av = evaluate(watcher, reading, now, s.config)
  watcher = av.watcher
  if (av.distraction) {
    patchState({ elapsedMs, phase, focusSeconds })
    openNudge(av.distraction)
    return
  }
  patchState({
    elapsedMs,
    phase,
    focusSeconds,
    attentiveSeconds: s.attentiveSeconds + dt / 1000,
    attention: av.attention,
  })
}

function startClock() {
  stopTimer()
  lastTick = Date.now()
  timer = window.setInterval(tick, TICK_MS)
}

function stopTimer() {
  if (timer !== null) window.clearInterval(timer)
  timer = null
}

// ── the saved session ────────────────────────────────────────────────────────

function currentSession(completed: boolean): FocusSession {
  const s = state()
  const focusSeconds = Math.round(s.focusSeconds)
  return {
    id: sessionId,
    course,
    startedAt,
    endedAt: new Date().toISOString(),
    plannedMinutes: s.config.totalMinutes,
    focusSeconds,
    attentiveSeconds: Math.min(focusSeconds, Math.round(s.attentiveSeconds)),
    distractions: s.distractions,
    camera: s.config.camera,
    completed,
  }
}

async function save(session: FocusSession): Promise<string | null> {
  try {
    const r = await fetch('/api/focus/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    })
    if (r.ok) return null
    const j = (await r.json().catch(() => null)) as { error?: string } | null
    return j?.error ?? t().general.serverResponded(r.status)
  } catch {
    return t().general.noServer
  }
}

/* closing the tab mid-session: saves it as interrupted (sendBeacon survives the close) */
window.addEventListener('pagehide', () => {
  const s = state()
  if (s.stage !== 'running' || s.focusSeconds < 30) return
  navigator.sendBeacon?.(
    '/api/focus/sessions',
    new Blob([JSON.stringify(currentSession(false))], { type: 'text/plain' }),
  )
})

/* when coming back to the tab, the clock recalculates at once (without waiting for the next spaced tick) */
document.addEventListener('visibilitychange', () => {
  if (state().stage === 'running') tick()
})

// ── the actions (what the UI calls) ──────────────────────────────────────────

export function openSettings() {
  const s = state()
  if (s.stage === 'idle' || s.stage === 'summary') patchState({ stage: 'configuring', error: null, summary: null })
}

export function closeSettings() {
  if (state().stage === 'configuring') patchState({ stage: 'idle', error: null })
}

export function changeConfig(partial: Partial<FocusConfig>) {
  const config = focusConfigSchema.parse({ ...state().config, ...partial })
  storeConfig(config)
  patchState({ config })
}

export async function begin(): Promise<void> {
  const { config } = state()
  prepare() // audio must be born from the click
  if (config.watchTab && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => {})
  }
  watcher = {}
  basePose = null
  lastFace = null
  phoneSeen = false
  phoneScores = []
  patchState({ ...INITIAL, stage: 'preparing', config })

  if (config.camera) {
    try {
      patchState({ step: t().focus.loadingDetector })
      await loadDetector()
      patchState({ step: t().focus.startingCamera })
      patchState({ stream: await turnOnCamera() })
    } catch (e) {
      turnOffCamera()
      const name = (e as { name?: string })?.name
      const error =
        name === 'NotAllowedError'
          ? t().focus.cameraDenied
          : name === 'NotFoundError'
            ? t().focus.noCameraFound
            : t().focus.detectorFailed(e instanceof Error ? e.message : String(e))
      patchState({ stage: 'configuring', error, step: null })
      return
    }
    if (!(await calibrate())) {
      if (state().stage !== 'calibrating') return // cancelled
      turnOffCamera()
      patchState({
        stage: 'configuring',
        step: null,
        error: t().focus.noFaceInCalibration,
      })
      return
    }
  }

  sessionId = newId()
  startedAt = new Date().toISOString()
  course = openCourse()
  const phases = phasePlan(config)
  patchState({ stage: 'running', step: null, phases, attention: 'focused' })
  chime(config.volume)
  startClock()
}

export function cancelSetup() {
  const e = state().stage
  if (e !== 'preparing' && e !== 'calibrating') return
  turnOffCamera()
  patchState({ stage: 'configuring', step: null })
}

export function pauseNow() {
  if (state().stage !== 'running') return
  tick()
  watcher = {}
  patchState({ paused: true, attention: null })
}

export function unpause() {
  if (state().stage !== 'running') return
  lastTick = Date.now()
  watcher = {}
  patchState({ paused: false, attention: 'focused' })
}

/** "I'm back": closes the nudge and resets the condition timers. */
export function dismissNudge() {
  watcher = {}
  lastFace = null
  patchState({ nudge: null, attention: 'focused' })
}

export async function endSession(completed = false): Promise<void> {
  if (state().stage !== 'running') return
  tick()
  stopTimer()
  const session = currentSession(completed)
  turnOffCamera()
  patchState({ stage: 'summary', summary: session, nudge: null, paused: false, saveError: null })
  chime(state().config.volume, false)
  if (session.focusSeconds > 0) patchState({ saveError: await save(session) })
}

export function closeSummary() {
  if (state().stage === 'summary') patchState({ stage: 'idle', summary: null })
}

/** Stops the settings sound test. */
export const testAlarm = () => alarm(state().config.volume, 2)
