/**
 * Focus mode: a pomodoro with an optional webcam watcher. Here live the pure rules — the cycles, the limits of each
 * sensitivity, the evaluator that turns camera readings into distractions, the nudge messages and the shape of the
 * recorded session. The engine (`web/src/focus/engine.ts`) and the server (`server/focus/`) only apply this.
 *
 * Principle: the image never leaves the browser. What arrives here is an already summarized reading (is there a face?
 * how many degrees off? eyes closed? phone in sight?), and what gets recorded is only the session summary.
 */

import { z } from 'zod'

// ── the configuration ───────────────────────────────────────────────────────────

export const SENSITIVITIES = ['light', 'normal', 'strict'] as const
export type Sensitivity = (typeof SENSITIVITIES)[number]

export const focusConfigSchema = z.object({
  /** how long the session lasts, breaks included */
  totalMinutes: z.number().int().min(5).max(480),
  /** the length of each focus block */
  focusMinutes: z.number().int().min(5).max(180),
  /** the break between blocks; 0 = no breaks */
  pauseMinutes: z.number().int().min(0).max(60),
  /** watch through the webcam (without it, it is a plain pomodoro) */
  camera: z.boolean(),
  /** count leaving the app's tab as a distraction */
  watchTab: z.boolean(),
  sensitivity: z.enum(SENSITIVITIES),
  /** alarm volume, from 0 to 1 */
  volume: z.number().min(0).max(1),
})
export type FocusConfig = z.infer<typeof focusConfigSchema>

export const DEFAULT_CONFIG: FocusConfig = {
  totalMinutes: 60,
  focusMinutes: 25,
  pauseMinutes: 5,
  camera: true,
  watchTab: true,
  sensitivity: 'normal',
  volume: 0.7,
}

/** The preset paces on the setup screen. */
export const PACES = [
  { label: 'Classic', description: '25 min focus, 5 break', focus: 25, pause: 5 },
  { label: 'Long', description: '50 min focus, 10 break', focus: 50, pause: 10 },
  { label: 'Straight', description: 'no breaks', focus: 0, pause: 0 },
] as const

export const DURATIONS = [30, 60, 90, 120] as const

// ── the phases ─────────────────────────────────────────────────────────────────

export interface Phase {
  type: 'focus' | 'pause'
  /** from the start of the session, not counting paused time */
  startMs: number
  endMs: number
}

const MINUTE = 60_000

/**
 * The session blocks: focus, break, focus, break… until the total time is filled. With no breaks (or a block longer
 * than the session), it is a single block. The last block is cut to fit, and there is no break at the end (the session
 * ends first).
 */
export function phasePlan(c: Pick<FocusConfig, 'totalMinutes' | 'focusMinutes' | 'pauseMinutes'>): Phase[] {
  const total = c.totalMinutes * MINUTE
  const focus = c.focusMinutes * MINUTE
  const pause = c.pauseMinutes * MINUTE
  if (pause === 0 || focus >= total) return [{ type: 'focus', startMs: 0, endMs: total }]
  const phases: Phase[] = []
  let t = 0
  while (t < total) {
    const focusEnd = Math.min(total, t + focus)
    phases.push({ type: 'focus', startMs: t, endMs: focusEnd })
    t = focusEnd
    if (t >= total) break
    const pauseEnd = Math.min(total, t + pause)
    // a break that would end the session is pointless: its time becomes focus in the previous block
    if (pauseEnd >= total) {
      phases[phases.length - 1]!.endMs = total
      break
    }
    phases.push({ type: 'pause', startMs: t, endMs: pauseEnd })
    t = pauseEnd
  }
  return phases
}

/** Which phase the session is in after `elapsedMs` (not counting manual pauses). `null` = it is over. */
export function phaseAt(
  phases: Phase[],
  elapsedMs: number,
): { index: number; phase: Phase; remainingMs: number } | null {
  const index = phases.findIndex((f) => elapsedMs < f.endMs)
  if (index < 0) return null
  const phase = phases[index]!
  return { index, phase, remainingMs: phase.endMs - elapsedMs }
}

// ── the distractions ────────────────────────────────────────────────────────────

export const DISTRACTION_TYPES = ['phone', 'looking_down', 'left_tab', 'away', 'eyes_closed', 'looking_away'] as const
export type DistractionType = (typeof DISTRACTION_TYPES)[number]

export const DISTRACTION_LABEL: Record<DistractionType, string> = {
  phone: 'Phone',
  looking_down: 'Looking down',
  left_tab: 'Left the app',
  away: 'Left the desk',
  eyes_closed: 'Dozing off',
  looking_away: 'Looking away',
}

/** The distractions only the camera sees. */
const FROM_CAMERA: ReadonlySet<DistractionType> = new Set([
  'phone',
  'looking_down',
  'away',
  'eyes_closed',
  'looking_away',
])

/**
 * How long each condition must last to become a distraction, and how many degrees of head turn count as "looking
 * away". The times avoid a nudge for a blink, a sneeze or a quick look at the notebook.
 */
export const LIMITS: Record<Sensitivity, { seconds: Record<DistractionType, number>; degrees: number }> = {
  light: {
    seconds: { phone: 4, looking_down: 9, left_tab: 12, away: 15, eyes_closed: 8, looking_away: 12 },
    degrees: 30,
  },
  normal: {
    seconds: { phone: 2, looking_down: 5, left_tab: 6, away: 8, eyes_closed: 5, looking_away: 7 },
    degrees: 24,
  },
  strict: {
    seconds: { phone: 1, looking_down: 3, left_tab: 3, away: 4, eyes_closed: 3, looking_away: 4 },
    degrees: 18,
  },
}

/** What the camera and the tab said at this instant. */
export interface Reading {
  /** there is a face in the image (null = the camera did not read at this instant) */
  face: boolean | null
  /** how many degrees the head is turned from the calibrated posture */
  deviationDegrees: number | null
  eyesClosed: boolean
  /** the eyes (and maybe the head) lowered beyond the calibrated posture: how someone looks at a phone in their lap */
  lookingDown?: boolean
  phone: boolean
  tabVisible: boolean
}

/** Since when each condition has been happening (in ms). Removed when the condition stops. */
export type Watcher = Partial<Record<DistractionType, number>>

export interface EvaluatorOptions {
  sensitivity: Sensitivity
  camera: boolean
  watchTab: boolean
}

export type Attention = 'focused' | 'unsure' | 'distracted'

export interface Evaluation {
  watcher: Watcher
  /** the condition that passed its limit (the most serious one, if there is more than one) */
  distraction: DistractionType | null
  /** focused: nothing happening; unsure: something started, still within the limit; distracted: it passed */
  attention: Attention
}

/** The conditions present in this reading, already filtered by what is turned on. */
export function conditions(l: Reading, o: EvaluatorOptions): Set<DistractionType> {
  const activeOnes = new Set<DistractionType>()
  if (o.watchTab && !l.tabVisible) activeOnes.add('left_tab')
  if (o.camera && l.face !== null) {
    if (l.phone) activeOnes.add('phone')
    if (!l.face) activeOnes.add('away')
    else {
      // looking down also lowers the eyelids: in that case it is the phone/lap, not sleep
      if (l.lookingDown) activeOnes.add('looking_down')
      else if (l.eyesClosed) activeOnes.add('eyes_closed')
      if (l.deviationDegrees !== null && l.deviationDegrees > LIMITS[o.sensitivity].degrees)
        activeOnes.add('looking_away')
    }
  }
  return activeOnes
}

/**
 * Updates the watcher with a reading. A condition that goes away resets its clock; one that lasts past its limit
 * becomes a distraction. Priority follows `DISTRACTION_TYPES` (phone first: it is the clearest).
 */
export function evaluate(watcher: Watcher, l: Reading, nowMs: number, o: EvaluatorOptions): Evaluation {
  const activeOnes = conditions(l, o)
  const fresh: Watcher = {}
  for (const type of DISTRACTION_TYPES) {
    // with no camera reading at this instant, a camera condition keeps its clock (no reset, no pointless advance)
    const noReading = FROM_CAMERA.has(type) && l.face === null && o.camera
    if (activeOnes.has(type) || (noReading && watcher[type] !== undefined)) fresh[type] = watcher[type] ?? nowMs
  }
  const limits = LIMITS[o.sensitivity].seconds
  const distraction =
    DISTRACTION_TYPES.find((t) => activeOnes.has(t) && nowMs - (fresh[t] ?? nowMs) >= limits[t] * 1000) ?? null
  const attention: Attention = distraction ? 'distracted' : Object.keys(fresh).length ? 'unsure' : 'focused'
  return { watcher: fresh, distraction, attention }
}

// ── the nudge ─────────────────────────────────────────────────────────────────

const NUDGES: Record<DistractionType, [string, string][]> = {
  phone: [
    ['Phone in hand?', 'Put it face down, away from you. The lesson is still here.'],
    ['The phone again.', 'No notification matters more than the next few minutes of focus. Put it away.'],
    ['Drop that phone!', 'You chose to study now. Phone out of reach and back to the activity.'],
  ],
  left_tab: [
    ['You left the lesson.', 'If you need a break, use the Pause button. Otherwise, let’s get back.'],
    ['Left again without pausing.', 'Another tab right now is a distraction dressed up as a task. Back to studying.'],
    ['Stop running from the lesson!', 'Close that tab. Focus time only counts if you’re here.'],
  ],
  away: [
    ['Where are you?', 'You left without pausing. Next time, press Pause before getting up.'],
    ['Gone again.', 'Getting up without pausing breaks the rhythm. Come back and, if you need to, pause properly.'],
    ['Back to your chair!', 'A deal is a deal: focus now, rest at the break.'],
  ],
  eyes_closed: [
    ['Getting sleepy?', 'Take a deep breath, fix your posture and drink some water. If you’re very tired, pause.'],
    ['Eyes closed again.', 'Your brain is asking for a break. Stand up, stretch and come back, or call it a day.'],
    ['Wake up!', 'Studying asleep doesn’t stick. Take a real break or come back all in.'],
  ],
  looking_down: [
    ['Looking down?', 'If it’s your phone, put it away. If it’s your notebook, that’s fine: use Light strictness.'],
    ['Looking down again.', 'A phone in your lap isn’t studying. Put it away and look back at the screen.'],
    ['Eyes off the phone!', 'It’ll still be there later. Now is lesson time.'],
  ],
  looking_away: [
    ['Lost focus?', 'Your eyes left the screen for a while. Back to the activity.'],
    ['Distracted again.', 'What pulled you away? Write it down for later and get back to the lesson.'],
    ['Focus here!', 'The session only works with your attention on the screen. Let’s finish this block.'],
  ],
}

/** The nudge message. `level` is how many distractions the session has had (1, 2, 3+): the tone rises with each. */
export function nudge(type: DistractionType, level: number): { title: string; text: string; level: 1 | 2 | 3 } {
  const n = Math.min(3, Math.max(1, Math.floor(level))) as 1 | 2 | 3
  const [title, text] = NUDGES[type][n - 1]!
  return { title, text, level: n }
}

// ── the recorded session ─────────────────────────────────────────────────────────

export const distractionCountSchema = z
  .object(Object.fromEntries(DISTRACTION_TYPES.map((t) => [t, z.number().int().min(0).max(10_000)])))
  .partial()
  .strict()

export const focusSessionSchema = z
  .object({
    /** generated in the browser; saving the same id twice only updates it */
    id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
    /** the course open when the session started, if there was one */
    course: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .nullable(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    plannedMinutes: z.number().int().min(1).max(480),
    /** time inside focus blocks (no breaks) */
    focusSeconds: z
      .number()
      .int()
      .min(0)
      .max(480 * 60),
    /** of that time, how much was free of distraction */
    attentiveSeconds: z
      .number()
      .int()
      .min(0)
      .max(480 * 60),
    distractions: distractionCountSchema,
    camera: z.boolean(),
    /** reached the end of the planned time */
    completed: z.boolean(),
  })
  .refine((s) => s.attentiveSeconds <= s.focusSeconds, { message: 'Attentive time is greater than focus time.' })
export type FocusSession = z.infer<typeof focusSessionSchema>

/** From 0 to 100: the share of focus time free of distraction. With no focus time, 0. */
export const focusPercent = (attentiveSeconds: number, focusSeconds: number): number =>
  focusSeconds > 0 ? Math.round((100 * Math.min(attentiveSeconds, focusSeconds)) / focusSeconds) : 0

/** `GET /api/focus/sessions`: the totals and the latest sessions, for the profile. */
export interface FocusSummary {
  sessions: number
  focusedMinutes: number
  /** time-weighted average, from 0 to 100 (null with no timed sessions) */
  focusAverage: number | null
  distractions: Partial<Record<DistractionType, number>>
  recent: FocusSession[]
}

/** `GET /api/focus/models`: whether the detector is downloaded. */
export interface ModelsState {
  installed: boolean
  megabytes: number
  files: Array<{ name: string; present: boolean }>
}
