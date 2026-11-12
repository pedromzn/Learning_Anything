/**
 * The spaced review in the API (see `shared/review.ts`):
 * - `GET  /review`          today's exercises (up to the daily limit), across all courses, without answer keys;
 * - `POST /review/attempt`  `{ courseId, key, answer, hintsUsed }` → the correction, the next box and the XP;
 * - `POST /review/hint`     `{ courseId, key, index }` → one hint.
 *
 * The key says where the exercise lives: `m1-a3:e4` (a lesson item) or `cp2:q5` (a checkpoint item). An exercise that
 * no longer exists (the AI rewrote the lesson) silently leaves the review.
 */

import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { gradeExact, resultOf, studentAnswer, studentItem, type Item } from '../../shared/course.js'
import { localDay } from '../../shared/gamification.js'
import {
  REVIEWS_PER_DAY,
  REVIEW_XP,
  addDays,
  type ReviewAttemptResponse,
  type ReviewCard,
  type ReviewToday,
} from '../../shared/review.js'
import { HttpError } from '../errors.js'
import { find, lessonItems, readCourse, type ReadCourse } from '../courses/repository.js'
import { dropReview, dueReviews, scheduleHit, scheduleMiss, upcomingReviews } from '../progress/review.js'
import { record } from '../progress/gamification.js'
import { markStudy } from '../progress/study.js'

export const reviewRouter = Router()

type Route = (req: Request, res: Response) => Promise<void> | void
const route = (f: Route) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(() => f(req, res))
    .catch(next)
}

interface Found {
  course: ReadCourse
  item: Item
  lessonId: string | null
  module: number
  sourceTitle: string
}

/** Where an exercise lives, from its key; null when it no longer exists. */
function findItem(course: ReadCourse, key: string): Found | null {
  const lesson = key.match(/^(m\d{1,2}-a\d{1,2}):(.+)$/)
  if (lesson) {
    const l = find.lesson(course, lesson[1]!)
    const item = l && l.content ? lessonItems(l).find((i) => i.id === lesson[2]) : undefined
    return l && item ? { course, item, lessonId: l.id, module: l.module, sourceTitle: l.plan.title } : null
  }
  const checkpoint = key.match(/^cp(\d{1,2}):(.+)$/)
  if (checkpoint) {
    const module = find.module(course, Number(checkpoint[1]))
    const item = module?.checkpoint?.items.find((i) => i.id === checkpoint[2])
    return module && item ? { course, item, lessonId: null, module: module.order, sourceTitle: '' } : null
  }
  return null
}

reviewRouter.get(
  '/',
  route((_req, res) => {
    const today = localDay()
    const courses = new Map<string, ReadCourse | null>()
    const cards: ReviewCard[] = []
    let more = 0
    for (const row of dueReviews(today)) {
      if (!courses.has(row.course)) courses.set(row.course, readCourse(row.course))
      const course = courses.get(row.course)
      const found = course ? findItem(course, row.key) : null
      if (!found) {
        dropReview(row.course, row.key)
        continue
      }
      if (cards.length >= REVIEWS_PER_DAY) {
        more++
        continue
      }
      cards.push({
        key: row.key,
        courseId: found.course.id,
        courseTitle: found.course.title,
        lessonId: found.lessonId,
        module: found.module,
        sourceTitle: found.sourceTitle,
        box: row.box,
        item: studentItem(found.item, found.course.id),
      })
    }
    const payload: ReviewToday = { today, cards, more, upcoming: upcomingReviews(today, addDays(today, 7)) }
    res.json({ data: payload })
  }),
)

const keySchema = z.object({
  courseId: z.string().min(1).max(80),
  key: z.string().regex(/^(m\d{1,2}-a\d{1,2}|cp\d{1,2}):[\w-]{1,60}$/),
})

function foundFromBody(body: unknown): { found: Found; key: string } {
  const { courseId, key } = keySchema.parse(body ?? {})
  const course = readCourse(courseId)
  const found = course ? findItem(course, key) : null
  if (!found) throw new HttpError(404, 'This exercise is no longer in the course.', 'not_found')
  return { found, key }
}

const attemptSchema = z.object({ answer: z.unknown(), hintsUsed: z.number().int().min(0).max(3).default(0) })

reviewRouter.post(
  '/attempt',
  route((req, res) => {
    const { found, key } = foundFromBody(req.body)
    const { answer: raw, hintsUsed } = attemptSchema.parse(req.body ?? {})
    const answer = studentAnswer(found.item, raw)
    if (!answer || answer.type !== found.item.type)
      throw new HttpError(422, 'The answer does not match this exercise type.')
    const correction = gradeExact(found.item, answer)
    if (!correction) throw new HttpError(422, 'Open questions do not go into the review.', 'invalid')
    const today = localDay()
    const courseId = found.course.id
    const next = correction.correct ? scheduleHit(courseId, key, today) : scheduleMiss(courseId, key, today)
    markStudy(courseId)
    // a correct review gives a little XP, once per exercise per day (less with hints)
    const reward = correction.correct
      ? record([
          {
            type: 'review_correct',
            reference: `${courseId}:${key}:${today}`,
            xp: hintsUsed > 0 ? Math.max(2, REVIEW_XP - 2) : REVIEW_XP,
          },
        ])
      : null
    const payload: ReviewAttemptResponse = { ...resultOf(found.item, correction), next, reward }
    res.json({ data: payload })
  }),
)

reviewRouter.post(
  '/hint',
  route((req, res) => {
    const { found } = foundFromBody(req.body)
    const index = z.number().int().min(0).max(2).parse(req.body?.index)
    const hint = found.item.hints[index]
    if (!hint) throw new HttpError(404, 'There are no more hints for this exercise.', 'no_hint')
    res.json({ data: { hint } })
  }),
)
