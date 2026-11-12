/**
 * Spaced review: every exercise the student gets wrong (in a lesson or a checkpoint) comes back on the following days,
 * at growing intervals, until it sticks. It is the Leitner system: each correct review moves the exercise to the next
 * box (1 → 3 → 7 → 14 → 30 days); after the last box it leaves the review; a wrong review sends it back to box 0
 * (tomorrow). Pure functions: the server stores the boxes, the tests check the rules.
 */

import type { AttemptResult, StudentItem } from './course.js'
import type { Reward } from './gamification.js'

/** Days until the next review, by box. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const

/** At most this many exercises per day: a review that never ends is a review nobody does. */
export const REVIEWS_PER_DAY = 15

/** XP for each correct review (once per exercise per day). */
export const REVIEW_XP = 5

/** `YYYY-MM-DD` plus `days`, in the calendar (no time zone surprises: noon UTC as the anchor). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface ReviewSlot {
  box: number
  due: string
}

/** A wrong answer (anywhere): back to box 0, due tomorrow. */
export function afterMiss(today: string): ReviewSlot {
  return { box: 0, due: addDays(today, REVIEW_INTERVALS[0]) }
}

/** A correct review: next box, or null when the exercise graduates (leaves the review). */
export function afterHit(box: number, today: string): ReviewSlot | null {
  const next = box + 1
  if (next >= REVIEW_INTERVALS.length) return null
  return { box: next, due: addDays(today, REVIEW_INTERVALS[next]!) }
}

/** One exercise due today, ready for the student (no answer key). */
export interface ReviewCard {
  /** `m1-a3:e4` for a lesson item, `cp2:q5` for a checkpoint item */
  key: string
  courseId: string
  courseTitle: string
  /** where it came from, for the student: "Lesson title" or "Module 2 checkpoint" */
  lessonId: string | null
  module: number
  sourceTitle: string
  box: number
  item: StudentItem
}

export interface ReviewToday {
  today: string
  cards: ReviewCard[]
  /** how many more are due today beyond the daily limit */
  more: number
  /** how many come back in the next 7 days (after today) */
  upcoming: number
}

export interface ReviewAttemptResponse extends AttemptResult {
  /** null when the exercise graduated */
  next: ReviewSlot | null
  reward: Reward | null
}
