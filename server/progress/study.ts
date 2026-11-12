/**
 * What the person HAS ALREADY DONE in the courses: lessons opened and completed, attempts, passed checkpoints, the last
 * study session. It only reads and writes SQLite; gamification decides XP, the routes decide what is "unlocked".
 */

import { getDb, transaction, type DatabaseSync } from './db.js'

const now = () => new Date().toISOString()

/** Records that the lesson was opened (once) and that the course was studied now. */
export function openLesson(course: string, lesson: string, db: DatabaseSync = getDb()): void {
  const at = now()
  db.prepare('INSERT OR IGNORE INTO lesson_progress (course, lesson, started_at) VALUES (?, ?, ?)').run(
    course,
    lesson,
    at,
  )
  markStudy(course, db)
}

export function markStudy(course: string, db: DatabaseSync = getDb()): void {
  db.prepare(
    'INSERT INTO studies (course, last_at) VALUES (?, ?) ON CONFLICT(course) DO UPDATE SET last_at = excluded.last_at',
  ).run(course, now())
}

export function saveLessonAttempt(
  d: { course: string; lesson: string; item: string; correct: boolean | null; hintsUsed: number },
  db: DatabaseSync = getDb(),
): void {
  transaction(db, () => {
    const at = now()
    db.prepare('INSERT OR IGNORE INTO lesson_progress (course, lesson, started_at) VALUES (?, ?, ?)').run(
      d.course,
      d.lesson,
      at,
    )
    db.prepare(
      "INSERT INTO attempts (course, lesson, item, origin, correct, hints_used, at) VALUES (?, ?, ?, 'lesson', ?, ?, ?)",
    ).run(d.course, d.lesson, d.item, d.correct === null ? null : d.correct ? 1 : 0, d.hintsUsed, at)
    db.prepare(
      'UPDATE lesson_progress SET attempts = attempts + 1, correct_answers = correct_answers + ? WHERE course = ? AND lesson = ?',
    ).run(d.correct ? 1 : 0, d.course, d.lesson)
    markStudy(d.course, db)
  })
}

export function completeLesson(course: string, lesson: string, db: DatabaseSync = getDb()): void {
  const at = now()
  db.prepare('INSERT OR IGNORE INTO lesson_progress (course, lesson, started_at) VALUES (?, ?, ?)').run(
    course,
    lesson,
    at,
  )
  db.prepare(
    'UPDATE lesson_progress SET completed_at = ? WHERE course = ? AND lesson = ? AND completed_at IS NULL',
  ).run(at, course, lesson)
  markStudy(course, db)
}

/** The ids of a course's completed lessons. */
export function completedLessons(course: string, db: DatabaseSync = getDb()): Set<string> {
  const lines = db
    .prepare('SELECT lesson FROM lesson_progress WHERE course = ? AND completed_at IS NOT NULL')
    .all(course) as unknown as Array<{ lesson: string }>
  return new Set(lines.map((l) => l.lesson))
}

export function passedCheckpoints(course: string, db: DatabaseSync = getDb()): Set<number> {
  const lines = db.prepare('SELECT module FROM passed_checkpoints WHERE course = ?').all(course) as unknown as Array<{
    module: number
  }>
  return new Set(lines.map((l) => l.module))
}

/** Saves the checkpoint answers and, if passed, the pass (keeps the best score). */
export function saveCheckpoint(
  d: {
    course: string
    module: number
    score: number
    passed: boolean
    answers: Array<{ item: string; correct: boolean }>
  },
  db: DatabaseSync = getDb(),
): void {
  transaction(db, () => {
    const at = now()
    for (const r of d.answers) {
      db.prepare(
        "INSERT INTO attempts (course, module, item, origin, correct, at) VALUES (?, ?, ?, 'checkpoint', ?, ?)",
      ).run(d.course, d.module, r.item, r.correct ? 1 : 0, at)
    }
    if (d.passed) {
      db.prepare(
        `INSERT INTO passed_checkpoints (course, module, score, at) VALUES (?, ?, ?, ?)
         ON CONFLICT(course, module) DO UPDATE SET score = MAX(score, excluded.score)`,
      ).run(d.course, d.module, d.score, at)
    }
    markStudy(d.course, db)
  })
}

/** Saves a Feynman block attempt (only the score and the status of each point). */
export function saveFeynman(
  d: { course: string; module: number; score: number; passed: boolean; points: Record<string, string>; engine: string },
  db: DatabaseSync = getDb(),
): void {
  db.prepare(
    'INSERT INTO feynman_attempts (course, module, score, passed, points, engine, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(d.course, d.module, d.score, d.passed ? 1 : 0, JSON.stringify(d.points), d.engine, now())
  markStudy(d.course, db)
}

/** The modules with a passed Feynman, and the best score of each attempted module. */
export function courseFeynmans(
  course: string,
  db: DatabaseSync = getDb(),
): { passedOnes: Set<number>; bestScores: Map<number, number> } {
  const lines = db
    .prepare(
      'SELECT module, MAX(score) AS score, MAX(passed) AS passed FROM feynman_attempts WHERE course = ? GROUP BY module',
    )
    .all(course) as unknown as Array<{ module: number; score: number; passed: number }>
  return {
    passedOnes: new Set(lines.filter((l) => l.passed === 1).map((l) => l.module)),
    bestScores: new Map(lines.map((l) => [l.module, Number(l.score)])),
  }
}

/** When each course was last studied (ISO). */
export function studiedAt(db: DatabaseSync = getDb()): Map<string, string> {
  const lines = db.prepare('SELECT course, last_at FROM studies').all() as unknown as Array<{
    course: string
    last_at: string
  }>
  return new Map(lines.map((l) => [l.course, l.last_at]))
}
