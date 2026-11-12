/**
 * The course routes: list, detail, lesson, attempt, hint, completion, video and checkpoint.
 *
 * Rules that apply to all of them:
 * - the course id is the slug (regex before touching the disk) and the lesson id is `mN-aM`;
 * - the answer key never goes out before the answer: content goes through `studentItem` (seed = slug, so `ordering`
 *   shuffles the same way on every reload);
 * - a locked module (previous checkpoint not passed) opens neither lessons nor the checkpoint.
 */

import { Router, type Request, type RequestHandler, type Response } from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  CHECKPOINT_THRESHOLD,
  gradeExact,
  studentItem,
  studentAnswer,
  resultOf,
  type ExercisesLesson,
  type TextLesson,
} from '../../shared/course.js'
import { FIXED_XP, correctAnswerXp } from '../../shared/gamification.js'
import type { Script } from '../../shared/video.js'
import type {
  LessonDetail,
  StudentScene,
  StudentCheckpoint,
  CompletionResponse,
  HintResponse,
  AttemptResponse,
  CheckpointResult,
} from '../../shared/api.js'
import { scheduleMiss } from '../progress/review.js'
import { HttpError } from '../errors.js'
import {
  find,
  lessonItems,
  readCourse,
  listSlugs,
  videoFolder,
  type ReadLesson,
  type ReadCourse,
} from '../courses/repository.js'
import { progressOf, courseDetail, summaryList, moduleUnlocked, nextLesson } from '../courses/summaries.js'
import { openLesson, completeLesson, saveCheckpoint, saveLessonAttempt } from '../progress/study.js'
import { courseCertificate, issueCertificate, record, type RequestEvent } from '../progress/gamification.js'

export const coursesRouter = Router()

/** Express 4 only catches a sync error if it is passed to `next`; the try/catch lives in one place. */
const route =
  (f: (req: Request, res: Response) => void): RequestHandler =>
  (req, res, next) => {
    try {
      f(req, res)
    } catch (e) {
      next(e)
    }
  }

function courseFromUrl(id: string | undefined): ReadCourse {
  const course = id ? readCourse(id) : null
  if (!course) throw new HttpError(404, 'Course not found.', 'not_found')
  return course
}

/** The lesson from the URL, in the course, with its module unlocked. */
function lessonFromUrl(course: ReadCourse, lessonId: string | undefined): ReadLesson {
  const lesson = find.lesson(course, lessonId ?? '')
  if (!lesson) throw new HttpError(404, 'Lesson not found in this course.', 'not_found')
  if (!moduleUnlocked(lesson.module, progressOf(course.id)))
    throw new HttpError(403, 'Pass the previous module checkpoint to open this one.', 'module_locked')
  return lesson
}

function lessonReady(course: ReadCourse, lessonId: string | undefined): ReadLesson {
  const lesson = lessonFromUrl(course, lessonId)
  if (lesson.state !== 'ready' || !lesson.content)
    throw new HttpError(409, 'This lesson is not ready yet.', 'lesson_not_ready')
  return lesson
}

function scriptForStudent(script: Script, seed: string): { title: string; scenes: StudentScene[] } {
  return {
    title: script.title,
    scenes: script.scenes.map((c) =>
      c.type === 'question' ? { type: 'question', item: studentItem(c.item, seed), narration: c.narration } : c,
    ),
  }
}

// ── list and detail ──────────────────────────────────────────────────────────

coursesRouter.get(
  '/',
  route((_req, res) => {
    const courses = listSlugs().flatMap((slug) => readCourse(slug) ?? [])
    res.json({ data: summaryList(courses) })
  }),
)

coursesRouter.get(
  '/:id',
  route((req, res) => {
    res.json({ data: courseDetail(courseFromUrl(req.params.id)) })
  }),
)

// ── the lesson ───────────────────────────────────────────────────────────────

coursesRouter.get(
  '/:id/lessons/:lessonId',
  route((req, res) => {
    const course = courseFromUrl(req.params.id)
    const lesson = lessonFromUrl(course, req.params.lessonId)
    const a = progressOf(course.id)
    const seed = course.id

    let content: LessonDetail['content'] = null
    if (lesson.state === 'ready' && lesson.content) {
      openLesson(course.id, lesson.id)
      if (lesson.plan.type === 'text') {
        const t = lesson.content as TextLesson
        content = {
          introduction: t.introduction,
          sections: t.sections.map((s) => ({
            title: s.title,
            markdown: s.markdown,
            question: studentItem(s.question, seed),
          })),
          workedExample: t.workedExample,
          summary: t.summary,
        }
      } else if (lesson.plan.type === 'exercises') {
        const e = lesson.content as ExercisesLesson
        content = { guidance: e.guidance, items: e.items.map((i) => studentItem(i, seed)) }
      } else {
        content = {
          script: scriptForStudent(lesson.content as Script, seed),
          video: lesson.video
            ? { ...lesson.video, base: `/api/courses/${course.id}/lessons/${lesson.id}/video/` }
            : null,
        }
      }
    }

    const detail: LessonDetail = {
      id: lesson.id,
      language: course.brief.language,
      module: lesson.module,
      order: lesson.order,
      type: lesson.plan.type,
      title: lesson.plan.title,
      goal: lesson.plan.goal,
      state: lesson.state,
      completed: a.lessons.has(lesson.id),
      content,
      sources: (course.syllabus?.bibliography ?? []).map((b) => ({
        title: b.title,
        author: b.author,
        institution: b.institution,
        type: b.type,
        url: b.url,
      })),
      next: nextLesson(course, lesson),
      problems: lesson.problems,
    }
    res.json({ data: detail })
  }),
)

const attemptSchema = z.object({ answer: z.unknown(), hintsUsed: z.number().int().min(0).max(3).default(0) })

coursesRouter.post(
  '/:id/lessons/:lessonId/items/:itemId/attempt',
  route((req, res) => {
    const course = courseFromUrl(req.params.id)
    const lesson = lessonReady(course, req.params.lessonId)
    const item = lessonItems(lesson).find((i) => i.id === req.params.itemId)
    if (!item) throw new HttpError(404, 'Exercise not found in this lesson.', 'not_found')
    const body = attemptSchema.parse(req.body ?? {})
    const answer = studentAnswer(item, body.answer)
    if (!answer || answer.type !== item.type) throw new HttpError(422, 'The answer does not match this exercise type.')

    const correction = gradeExact(item, answer)
    // a wrong answer comes back in the spaced review (tomorrow, then at growing intervals)
    if (correction && !correction.correct) scheduleMiss(course.id, `${lesson.id}:${item.id}`)
    saveLessonAttempt({
      course: course.id,
      lesson: lesson.id,
      item: item.id,
      correct: correction?.correct ?? null,
      hintsUsed: body.hintsUsed,
    })
    /* only the FIRST correct answer for each item gives XP: the reference is the item, and the event is unique */
    const reward = correction?.correct
      ? record([
          {
            type: 'correctAnswer',
            reference: `${course.id}:${lesson.id}:${item.id}`,
            xp: correctAnswerXp(item.difficulty, body.hintsUsed),
          },
        ])
      : null
    const payload: AttemptResponse = { ...resultOf(item, correction), reward }
    res.json({ data: payload })
  }),
)

coursesRouter.post(
  '/:id/lessons/:lessonId/items/:itemId/hint',
  route((req, res) => {
    const course = courseFromUrl(req.params.id)
    const lesson = lessonReady(course, req.params.lessonId)
    const item = lessonItems(lesson).find((i) => i.id === req.params.itemId)
    if (!item) throw new HttpError(404, 'Exercise not found in this lesson.', 'not_found')
    const index = z.number().int().min(0).max(2).parse(req.body?.index)
    const hint = item.hints[index]
    if (!hint) throw new HttpError(404, 'There are no more hints for this exercise.', 'no_hint')
    const payload: HintResponse = { hint }
    res.json({ data: payload })
  }),
)

coursesRouter.post(
  '/:id/lessons/:lessonId/finish',
  route((req, res) => {
    const course = courseFromUrl(req.params.id)
    const lesson = lessonReady(course, req.params.lessonId)
    completeLesson(course.id, lesson.id)
    /* the type goes into the reference so the "attentive reader" achievement counts only text lessons */
    const reward = record([
      {
        type: 'lesson_completed',
        reference: `${lesson.plan.type}:${course.id}:${lesson.id}`,
        xp: FIXED_XP.lesson_completed,
      },
    ])
    const payload: CompletionResponse = { reward }
    res.json({ data: payload })
  }),
)

// ── the video (HLS) ──────────────────────────────────────────────────────────

/** A closed list of names: no path from the URL ever reaches the disk. */
const VIDEO_FILE = /^(index\.m3u8|part-\d{3}\.ts|subtitles\.vtt|poster\.jpg)$/
const FILE_TYPE: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  vtt: 'text/vtt; charset=utf-8',
  jpg: 'image/jpeg',
}

coursesRouter.get('/:id/lessons/:lessonId/video/:file', (req, res, next) => {
  try {
    const file = req.params.file
    if (!VIDEO_FILE.test(file)) throw new HttpError(404, 'Video file not found.')
    const course = courseFromUrl(req.params.id)
    const lesson = lessonFromUrl(course, req.params.lessonId)
    if (lesson.plan.type !== 'video') throw new HttpError(404, 'This lesson has no video.')
    const filePath = path.join(videoFolder(course.id, lesson.module, lesson.order), file)
    if (!existsSync(filePath)) throw new HttpError(404, 'Video file not found.')
    res.sendFile(filePath, {
      headers: { 'Content-Type': FILE_TYPE[file.split('.').pop()!]!, 'Cache-Control': 'no-cache' },
    })
  } catch (e) {
    next(e)
  }
})

// ── the checkpoint ───────────────────────────────────────────────────────────

function checkpointModule(course: ReadCourse, rawOrder: string | undefined) {
  const order = z.coerce.number().int().min(1).max(16).parse(rawOrder)
  const module = find.module(course, order)
  if (!module) throw new HttpError(404, 'Module not found.', 'not_found')
  if (!moduleUnlocked(order, progressOf(course.id)))
    throw new HttpError(403, 'Pass the previous module checkpoint to open this one.', 'module_locked')
  if (!module.checkpoint) throw new HttpError(404, 'The checkpoint of this module is not ready yet.', 'not_found')
  return { module, checkpoint: module.checkpoint }
}

coursesRouter.get(
  '/:id/modules/:order/checkpoint',
  route((req, res) => {
    const course = courseFromUrl(req.params.id)
    const { module, checkpoint } = checkpointModule(course, req.params.order)
    const payload: StudentCheckpoint = {
      module: module.order,
      threshold: CHECKPOINT_THRESHOLD,
      items: checkpoint.items.map((i) => studentItem(i, course.id)),
      alreadyPassed: progressOf(course.id).checkpoints.has(module.order),
    }
    res.json({ data: payload })
  }),
)

const checkpointSchema = z.object({ answers: z.record(z.string(), z.unknown()).default({}) })

/**
 * The checkpoint is graded all at once: 80% to pass. Passing the last module (all checkpoints passed) completes the
 * course: certificate and course XP. Not passing returns what was wrong — the person redoes the lessons.
 */
coursesRouter.post(
  '/:id/modules/:order/checkpoint',
  route((req, res) => {
    const course = courseFromUrl(req.params.id)
    const { module, checkpoint } = checkpointModule(course, req.params.order)
    const { answers } = checkpointSchema.parse(req.body ?? {})

    const results = checkpoint.items.map((item) => {
      const answer = studentAnswer(item, answers[item.id])
      return { item, answer, correction: answer ? gradeExact(item, answer) : null }
    })
    for (const r of results)
      if (r.answer && r.correction && !r.correction.correct) scheduleMiss(course.id, `cp${module.order}:${r.item.id}`)
    const correct_answers = results.filter((r) => r.correction?.correct).length
    const total = checkpoint.items.length
    const passed = correct_answers / total >= CHECKPOINT_THRESHOLD

    saveCheckpoint({
      course: course.id,
      module: module.order,
      score: correct_answers / total,
      passed,
      answers: results
        .filter((r) => r.answer)
        .map((r) => ({ item: r.item.id, correct: r.correction?.correct === true })),
    })

    const events: RequestEvent[] = []
    let certificate = courseCertificate(course.id)
    if (passed) {
      const ref = `${course.id}:m${module.order}`
      events.push({ type: 'checkpoint_passed', reference: ref, xp: FIXED_XP.checkpoint_passed })
      if (correct_answers === total)
        events.push({ type: 'checkpoint_perfect', reference: ref, xp: FIXED_XP.checkpoint_perfect })

      const a = progressOf(course.id)
      if (course.modules.length > 0 && course.modules.every((m) => a.checkpoints.has(m.order))) {
        certificate = issueCertificate({
          course: course.id,
          title: course.title,
          level: course.brief.level,
          lessons: a.lessons.size,
          modules: course.modules.length,
        })
        events.push({ type: 'course_completed', reference: course.id, xp: FIXED_XP.course_completed })
      }
    }

    const payload: CheckpointResult = {
      passed,
      correct_answers,
      total,
      threshold: CHECKPOINT_THRESHOLD,
      certificate,
      reward: events.length ? record(events) : null,
      results: results.map((r) => ({
        itemId: r.item.id,
        skill: r.item.skill,
        ...resultOf(r.item, r.correction),
      })),
    }
    res.json({ data: payload })
  }),
)
