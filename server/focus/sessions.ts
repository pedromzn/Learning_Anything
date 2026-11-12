/** Focus mode sessions in SQLite: only the summary (times and distraction counts), never an image. */

import {
  DISTRACTION_TYPES,
  distractionCountSchema,
  focusPercent,
  type FocusSummary,
  type FocusSession,
  type DistractionType,
} from '../../shared/focus.js'
import { getDb, type DatabaseSync } from '../progress/db.js'

interface Row {
  id: string
  course: string | null
  started_at: string
  ended_at: string
  planned_minutes: number
  focus_seconds: number
  attentive_seconds: number
  distractions: string
  camera: number
  completed: number
}

/** Saves (or updates, if the id already exists: the browser may send the same session twice). */
export function saveSession(s: FocusSession, db: DatabaseSync = getDb()): void {
  db.prepare(
    `INSERT INTO focus_sessions (id, course, started_at, ended_at, planned_minutes, focus_seconds,
       attentive_seconds, distractions, camera, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       ended_at = excluded.ended_at,
       focus_seconds = excluded.focus_seconds,
       attentive_seconds = excluded.attentive_seconds,
       distractions = excluded.distractions,
       completed = MAX(focus_sessions.completed, excluded.completed)`,
  ).run(
    s.id,
    s.course,
    s.startedAt,
    s.endedAt,
    s.plannedMinutes,
    s.focusSeconds,
    s.attentiveSeconds,
    JSON.stringify(s.distractions),
    s.camera ? 1 : 0,
    s.completed ? 1 : 0,
  )
}

function toSession(l: Row): FocusSession {
  const distractions = distractionCountSchema.safeParse(JSON.parse(l.distractions || '{}'))
  return {
    id: l.id,
    course: l.course,
    startedAt: l.started_at,
    endedAt: l.ended_at,
    plannedMinutes: l.planned_minutes,
    focusSeconds: l.focus_seconds,
    attentiveSeconds: l.attentive_seconds,
    distractions: distractions.success ? distractions.data : {},
    camera: l.camera === 1,
    completed: l.completed === 1,
  }
}

/** The totals of all sessions and the `limit` most recent ones. */
export function focusSummary(limit = 10, db: DatabaseSync = getDb()): FocusSummary {
  const lines = db.prepare('SELECT * FROM focus_sessions ORDER BY started_at DESC').all() as unknown as Row[]
  const sessions = lines.map(toSession)
  const focus = sessions.reduce((sum, s) => sum + s.focusSeconds, 0)
  const attentive = sessions.reduce((sum, s) => sum + s.attentiveSeconds, 0)
  const distractions: Partial<Record<DistractionType, number>> = {}
  for (const s of sessions) {
    for (const t of DISTRACTION_TYPES) {
      const n = s.distractions[t] ?? 0
      if (n) distractions[t] = (distractions[t] ?? 0) + n
    }
  }
  return {
    sessions: sessions.length,
    focusedMinutes: Math.round(attentive / 60),
    focusAverage: focus > 0 ? focusPercent(attentive, focus) : null,
    distractions,
    recent: sessions.slice(0, limit),
  }
}
