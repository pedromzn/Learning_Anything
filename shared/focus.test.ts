import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  evaluate,
  nudge,
  phaseAt,
  focusPercent,
  phasePlan,
  focusSessionSchema,
  type Reading,
  type EvaluatorOptions,
  type Watcher,
} from './focus.js'

const MIN = 60_000
const FOCUSED: Reading = { face: true, deviationDegrees: 3, eyesClosed: false, phone: false, tabVisible: true }
const OPTIONS: EvaluatorOptions = { sensitivity: 'normal', camera: true, watchTab: true }

/** Runs a sequence of readings, one per second, and returns the last evaluation. */
function run(readings: Reading[], options = OPTIONS, stepMs = 1000) {
  let watcher: Watcher = {}
  let last = evaluate(watcher, FOCUSED, 0, options)
  readings.forEach((l, i) => {
    last = evaluate(watcher, l, (i + 1) * stepMs, options)
    watcher = last.watcher
  })
  return last
}

describe('phasePlan', () => {
  it('1 hour on classic 25/5: focus 25, break 5, focus 30 (the final break becomes focus)', () => {
    const f = phasePlan({ totalMinutes: 60, focusMinutes: 25, pauseMinutes: 5 })
    expect(f.map((x) => [x.type, (x.endMs - x.startMs) / MIN])).toEqual([
      ['focus', 25],
      ['pause', 5],
      ['focus', 30],
    ])
  })

  it('with no breaks, or a block longer than the session, it is a single block', () => {
    expect(phasePlan({ totalMinutes: 60, focusMinutes: 25, pauseMinutes: 0 })).toEqual([
      { type: 'focus', startMs: 0, endMs: 60 * MIN },
    ])
    expect(phasePlan({ totalMinutes: 30, focusMinutes: 50, pauseMinutes: 10 })).toHaveLength(1)
  })

  it('never ends on a break and adds up to exactly the total', () => {
    for (const [total, focus, pause] of [
      [60, 25, 5],
      [90, 25, 5],
      [120, 50, 10],
      [55, 25, 5],
      [31, 25, 5],
    ] as const) {
      const f = phasePlan({ totalMinutes: total, focusMinutes: focus, pauseMinutes: pause })
      expect(f.at(-1)!.type).toBe('focus')
      expect(f.at(-1)!.endMs).toBe(total * MIN)
      f.slice(1).forEach((x, i) => expect(x.startMs).toBe(f[i]!.endMs))
    }
  })

  it('phaseAt finds the block and the time left; after the end, null', () => {
    const f = phasePlan({ totalMinutes: 60, focusMinutes: 25, pauseMinutes: 5 })
    expect(phaseAt(f, 0)).toMatchObject({ index: 0, remainingMs: 25 * MIN })
    expect(phaseAt(f, 26 * MIN)).toMatchObject({ index: 1, phase: { type: 'pause' }, remainingMs: 4 * MIN })
    expect(phaseAt(f, 60 * MIN)).toBeNull()
  })
})

describe('evaluate', () => {
  it('focused when nothing happens', () => {
    expect(run([FOCUSED, FOCUSED, FOCUSED])).toMatchObject({ attention: 'focused', distraction: null })
  })

  it('the phone only becomes a distraction after the limit', () => {
    const phone = { ...FOCUSED, phone: true }
    expect(run([phone, phone])).toMatchObject({ attention: 'unsure', distraction: null })
    expect(run([phone, phone, phone, phone])).toMatchObject({ attention: 'distracted', distraction: 'phone' })
  })

  it('a quick glance does not count: a condition that goes away resets the clock', () => {
    const far = { ...FOCUSED, deviationDegrees: 50 }
    const seq = [...Array(5).fill(far), FOCUSED, ...Array(5).fill(far)]
    expect(run(seq).distraction).toBeNull()
    expect(run(Array(LIMITS.normal.seconds.looking_away + 1).fill(far)).distraction).toBe('looking_away')
  })

  it('away: no face beyond the limit', () => {
    const gone = { ...FOCUSED, face: false, deviationDegrees: null }
    expect(run(Array(9).fill(gone)).distraction).toBe('away')
  })

  it('without the camera, only the tab counts', () => {
    const everything = { face: false, deviationDegrees: null, eyesClosed: true, phone: true, tabVisible: true }
    expect(run(Array(30).fill(everything), { ...OPTIONS, camera: false }).attention).toBe('focused')
    const leftTab = { ...everything, tabVisible: false }
    expect(run(Array(7).fill(leftTab), { ...OPTIONS, camera: false }).distraction).toBe('left_tab')
    expect(run(Array(30).fill(leftTab), { ...OPTIONS, camera: false, watchTab: false }).attention).toBe('focused')
  })

  it('with no camera reading at an instant, the condition clock does not reset', () => {
    const gone = { ...FOCUSED, face: false, deviationDegrees: null }
    const noReading = { ...FOCUSED, face: null, deviationDegrees: null }
    expect(run([...Array(5).fill(gone), noReading, ...Array(4).fill(gone)]).distraction).toBe('away')
  })

  it('strict sensitivity catches earlier than light', () => {
    const closed = { ...FOCUSED, eyesClosed: true }
    expect(run(Array(4).fill(closed), { ...OPTIONS, sensitivity: 'strict' }).distraction).toBe('eyes_closed')
    expect(run(Array(4).fill(closed), { ...OPTIONS, sensitivity: 'light' }).distraction).toBeNull()
  })

  it('looking down (phone in the lap) becomes a distraction, and takes priority over closed eyes', () => {
    const lap = { ...FOCUSED, lookingDown: true, eyesClosed: true }
    expect(run(Array(4).fill(lap)).distraction).toBeNull()
    expect(run(Array(6).fill(lap)).distraction).toBe('looking_down')
  })

  it('the phone takes priority when there is more than one distraction', () => {
    const everything = { face: false, deviationDegrees: null, eyesClosed: false, phone: true, tabVisible: true }
    expect(run(Array(20).fill(everything)).distraction).toBe('phone')
  })
})

describe('nudge and session', () => {
  it('the tone rises with the number of distractions and stops at level 3', () => {
    expect(nudge('phone', 1).level).toBe(1)
    expect(nudge('phone', 2).title).not.toBe(nudge('phone', 1).title)
    expect(nudge('phone', 9).level).toBe(3)
    expect(nudge('away', 0).level).toBe(1)
  })

  it('focus percentage', () => {
    expect(focusPercent(45 * 60, 50 * 60)).toBe(90)
    expect(focusPercent(0, 0)).toBe(0)
    expect(focusPercent(100, 50)).toBe(100)
  })

  it('the session schema accepts a good session and rejects attentive time greater than focus time', () => {
    const good = {
      id: 'a1b2c3d4-e5f6',
      course: 'some-course',
      startedAt: '2026-11-11T10:00:00.000Z',
      endedAt: '2026-11-11T11:00:00.000Z',
      plannedMinutes: 60,
      focusSeconds: 3000,
      attentiveSeconds: 2700,
      distractions: { phone: 2, away: 1 },
      camera: true,
      completed: true,
    }
    expect(focusSessionSchema.safeParse(good).success).toBe(true)
    expect(focusSessionSchema.safeParse({ ...good, attentiveSeconds: 4000 }).success).toBe(false)
    expect(focusSessionSchema.safeParse({ ...good, distractions: { banana: 1 } }).success).toBe(false)
  })
})
