/**
 * Ask the teacher in the API (see `shared/teacher.ts`):
 * - `GET  /courses/:id/teacher`                     what Ana can do (voice, listener, Ollama), the language and the
 *                                                   lessons she can talk about;
 * - `POST /courses/:id/teacher`                     the conversation so far (+ the lesson, or null for the course) →
 *                                                   Ana's answer;
 * - `POST /courses/:id/teacher/listen?lesson=m1-a2` the question audio (raw body) → text, through local Whisper.
 *
 * Nothing is stored: no audio, no transcript, no question.
 */

import express, { Router, type NextFunction, type Request, type Response } from 'express'
import { teacherRequestSchema, type TeacherAnswer, type TeacherState } from '../../shared/teacher.js'
import type { TextLesson } from '../../shared/course.js'
import { HttpError } from '../errors.js'
import { find, readCourse, type ReadCourse, type ReadLesson } from '../courses/repository.js'
import { progressOf, moduleUnlocked } from '../courses/summaries.js'
import { askTeacher } from '../teacher/teacher.js'
import { LISTENER_HELP, acceptedAudioType, listenerInstalled, transcribe, vocabularyHint } from '../feynman/listener.js'
import { anaState } from './feynman.js'

export const teacherRouter = Router()

type Route = (req: Request, res: Response) => Promise<void> | void
const route = (f: Route) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(() => f(req, res))
    .catch(next)
}

function courseFromUrl(req: Request): { course: ReadCourse; unlocked: (module: number) => boolean } {
  const course = req.params.id ? readCourse(req.params.id) : null
  if (!course) throw new HttpError(404, 'Course not found.', 'not_found')
  const progress = progressOf(course.id)
  return { course, unlocked: (module) => moduleUnlocked(module, progress) }
}

/** The lesson the student picked; it must be written and in an unlocked module. */
function chosenLesson(course: ReadCourse, unlocked: (m: number) => boolean, id: string | null): ReadLesson | null {
  if (!id) return null
  const lesson = find.lesson(course, id)
  if (!lesson) throw new HttpError(404, 'Lesson not found in this course.', 'not_found')
  if (!unlocked(lesson.module))
    throw new HttpError(403, 'Pass the previous module checkpoint to open this one.', 'module_locked')
  if (lesson.state !== 'ready' || !lesson.content)
    throw new HttpError(409, 'This lesson is not ready yet.', 'lesson_not_ready')
  return lesson
}

teacherRouter.get(
  '/:id/teacher',
  route(async (req, res) => {
    const { course, unlocked } = courseFromUrl(req)
    const payload: TeacherState = {
      ana: await anaState(),
      language: course.brief.language,
      courseTitle: course.title,
      lessons: course.modules.flatMap((m) =>
        m.lessons.map((l) => ({
          id: l.id,
          module: m.order,
          moduleTitle: m.plan.title,
          order: l.order,
          title: l.plan.title,
          type: l.plan.type,
          available: unlocked(m.order) && l.state === 'ready' && Boolean(l.content),
        })),
      ),
    }
    res.json({ data: payload })
  }),
)

teacherRouter.post(
  '/:id/teacher',
  route(async (req, res) => {
    const { course, unlocked } = courseFromUrl(req)
    const { history, lessonId } = teacherRequestSchema.parse(req.body ?? {})
    if (history.at(-1)?.who !== 'student') throw new HttpError(422, 'The last turn must be the student’s.', 'invalid')
    const lesson = chosenLesson(course, unlocked, lessonId)
    const payload: TeacherAnswer = await askTeacher(course, lesson, unlocked, history)
    res.json({ data: payload })
  }),
)

teacherRouter.post(
  '/:id/teacher/listen',
  express.raw({ type: () => true, limit: '15mb' }),
  route(async (req, res) => {
    const { course, unlocked } = courseFromUrl(req)
    const lessonId =
      typeof req.query.lesson === 'string' && /^m\d{1,2}-a\d{1,2}$/.test(req.query.lesson) ? req.query.lesson : null
    const lesson = chosenLesson(course, unlocked, lessonId)
    const type = req.headers['content-type']
    if (!acceptedAudioType(type))
      throw new HttpError(415, 'Send the audio as audio/webm, audio/ogg or audio/mp4.', 'format')
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000)
      throw new HttpError(422, 'Not enough audio arrived. Speak a little closer to the microphone.', 'no_audio')
    if (!listenerInstalled()) throw new HttpError(503, `The listener is not installed. ${LISTENER_HELP}`, 'no_listener')
    // the vocabulary Whisper should expect: the lesson and its sections, or the course and its modules
    const hint = lesson
      ? vocabularyHint(
          lesson.plan.title,
          lesson.plan.type === 'text' ? (lesson.content as TextLesson).sections.map((s) => s.title) : [],
        )
      : vocabularyHint(
          course.title,
          course.modules.map((m) => m.plan.title),
        )
    res.json({ data: { text: await transcribe(req.body, type!, hint, course.brief.language) } })
  }),
)
