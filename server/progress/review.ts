/**
 * The spaced review in the database (see `shared/review.ts`): one row per exercise the student got wrong, with its
 * Leitner box and the day it comes back. A wrong answer anywhere puts the exercise (back) in box 0, due tomorrow; a
 * correct review moves it forward or, after the last box, removes it.
 */

import { afterHit, afterMiss, type ReviewSlot } from '../../shared/review.js'
import { localDay } from '../../shared/gamification.js'
import { getDb, type DatabaseSync } from './db.js'

export interface ReviewRow {
  course: string
  key: string
  box: number
  due: string
}

const now = () => new Date().toISOString()

/** The student got this exercise wrong (in a lesson, a checkpoint or a review): back to box 0, due tomorrow. */
export function scheduleMiss(course: string, key: string, today = localDay(), db: DatabaseSync = getDb()): ReviewSlot {
  const slot = afterMiss(today)
  db.prepare(
    `INSERT INTO reviews (course, item_key, box, due_day, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(course, item_key) DO UPDATE SET box = excluded.box, due_day = excluded.due_day,
       updated_at = excluded.updated_at`,
  ).run(course, key, slot.box, slot.due, now())
  return slot
}

/** A correct review: the next box, or out of the review (null). An exercise not in the review stays out. */
export function scheduleHit(
  course: string,
  key: string,
  today = localDay(),
  db: DatabaseSync = getDb(),
): ReviewSlot | null {
  const row = db.prepare('SELECT box FROM reviews WHERE course = ? AND item_key = ?').get(course, key) as
    | { box: number }
    | undefined
  if (!row) return null
  const slot = afterHit(row.box, today)
  if (!slot) {
    db.prepare('DELETE FROM reviews WHERE course = ? AND item_key = ?').run(course, key)
    return null
  }
  db.prepare('UPDATE reviews SET box = ?, due_day = ?, updated_at = ? WHERE course = ? AND item_key = ?').run(
    slot.box,
    slot.due,
    now(),
    course,
    key,
  )
  return slot
}

/** Everything due up to `today` (oldest first, then lowest box). */
export function dueReviews(today = localDay(), db: DatabaseSync = getDb()): ReviewRow[] {
  return db
    .prepare(
      'SELECT course, item_key AS key, box, due_day AS due FROM reviews WHERE due_day <= ? ORDER BY due_day, box, course',
    )
    .all(today) as unknown as ReviewRow[]
}

/** How many come back after today and up to `until`. */
export function upcomingReviews(today: string, until: string, db: DatabaseSync = getDb()): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE due_day > ? AND due_day <= ?').get(today, until) as {
    n: number
  }
  return Number(r.n)
}

/** An exercise that no longer exists (the AI rewrote the lesson): it leaves the review. */
export function dropReview(course: string, key: string, db: DatabaseSync = getDb()): void {
  db.prepare('DELETE FROM reviews WHERE course = ? AND item_key = ?').run(course, key)
}
