/** The profile, the Home dashboard and certificate verification. */

import { Router } from 'express'
import { z } from 'zod'
import { dailyGoalSchema } from '../../shared/gamification.js'
import type { Panel } from '../../shared/api.js'
import { HttpError } from '../errors.js'
import { readCourse, listSlugs, find, type ReadCourse } from '../courses/repository.js'
import { progressOf, courseCompleted, summaryList, currentModule } from '../courses/summaries.js'
import { studiedAt } from '../progress/study.js'
import { readCertificate, fullProfile, profileSummary, updateProfile } from '../progress/gamification.js'
import { listRequests } from './requests.js'

export const profileRouter = Router()
export const dashboardRouter = Router()
export const certificatesRouter = Router()

profileRouter.get('/', (_req, res, next) => {
  try {
    res.json({ data: fullProfile() })
  } catch (e) {
    next(e)
  }
})

const changeSchema = z
  .object({ name: z.string().trim().max(80).optional(), dailyGoal: dailyGoalSchema.optional() })
  .strict()

profileRouter.put('/', (req, res, next) => {
  try {
    updateProfile(changeSchema.parse(req.body ?? {}))
    res.json({ data: fullProfile() })
  } catch (e) {
    next(e)
  }
})

/** Where to resume: the first ready, unfinished lesson of the current module of the most recently studied course. */
function resumeFrom(courses: ReadCourse[]): Panel['resume'] {
  const studies = studiedAt()
  const sorted = [...courses]
    .filter((c) => studies.has(c.id))
    .sort((x, y) => studies.get(y.id)!.localeCompare(studies.get(x.id)!))
  for (const course of sorted) {
    const a = progressOf(course.id)
    if (courseCompleted(course, a)) continue
    const module = find.module(course, currentModule(course, a))
    const lesson = module?.lessons.find((x) => x.state === 'ready' && !a.lessons.has(x.id))
    if (module && lesson) {
      return {
        courseId: course.id,
        courseTitle: course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.plan.title,
        type: lesson.plan.type,
        module: module.order,
      }
    }
  }
  return null
}

dashboardRouter.get('/', (_req, res, next) => {
  try {
    const courses = listSlugs().flatMap((slug) => readCourse(slug) ?? [])
    const payload: Panel = {
      profile: profileSummary(),
      resume: resumeFrom(courses),
      courses: summaryList(courses),
      requests: listRequests(),
    }
    res.json({ data: payload })
  } catch (e) {
    next(e)
  }
})

certificatesRouter.get('/:code', (req, res, next) => {
  try {
    const certificate = /^[A-Z0-9-]{8,20}$/.test(req.params.code) ? readCertificate(req.params.code) : null
    if (!certificate) throw new HttpError(404, 'Certificate not found.', 'not_found')
    res.json({ data: certificate })
  } catch (e) {
    next(e)
  }
})
