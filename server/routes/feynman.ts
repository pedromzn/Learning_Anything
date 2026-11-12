/**
 * The Feynman lesson in the API (see `docs/FEYNMAN.md`):
 * - `GET  /courses/:id/modules/:order/feynman`               the block, without the answer key, and the available engines;
 * - `POST /courses/:id/modules/:order/feynman/listen`        the speech audio (raw body) → text, through local Whisper;
 * - `POST /courses/:id/modules/:order/feynman/conversation`  the conversation so far → Ana's next line;
 * - `POST /courses/:id/modules/:order/feynman/evaluate`      the whole conversation → score, points, errors, XP;
 * - `POST /voice/speak`                                      a short text → mp3 (Ana's voice).
 *
 * No audio or transcript is stored: only the score and the status of each point.
 */

import express, { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  FEYNMAN_MIN_SCORE,
  feynmanScore,
  conversationRequestSchema,
  turnSchema,
  MAX_TURNS,
  type FeynmanEvaluation,
  type AnaState,
  type StudentFeynman,
  type AnaTurn,
} from '../../shared/feynman.js'
import { FIXED_XP } from '../../shared/gamification.js'
import { HttpError } from '../errors.js'
import { find, readCourse, type ReadCourse } from '../courses/repository.js'
import { progressOf, moduleUnlocked } from '../courses/summaries.js'
import { anaEvaluation, ollamaState, toSpeech, anaReply } from '../feynman/brain.js'
import { lessonSummaries } from '../feynman/context.js'
import { missingComment } from '../feynman/script.js'
import { LISTENER_HELP, vocabularyHint, listenerInstalled, acceptedAudioType, transcribe } from '../feynman/listener.js'
import { courseFeynmans, saveFeynman } from '../progress/study.js'
import { record } from '../progress/gamification.js'
import { VOICES, kokoroInstalled, narrate } from '../video/voice.js'

export const feynmanRouter = Router()
export const voiceRouter = Router()

type Route = (req: Request, res: Response) => Promise<void> | void
const route = (f: Route) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(() => f(req, res))
    .catch(next)
}

function blockFromUrl(req: Request): { course: ReadCourse; order: number } & ReturnType<typeof moduleWithFeynman> {
  const course = req.params.id ? readCourse(req.params.id) : null
  if (!course) throw new HttpError(404, 'Course not found.', 'not_found')
  const order = z.coerce.number().int().min(1).max(16).parse(req.params.order)
  return { course, order, ...moduleWithFeynman(course, order) }
}

function moduleWithFeynman(course: ReadCourse, order: number) {
  const module = find.module(course, order)
  if (!module) throw new HttpError(404, 'Module not found.', 'not_found')
  if (!moduleUnlocked(order, progressOf(course.id)))
    throw new HttpError(403, 'Pass the previous module checkpoint to open this one.', 'module_locked')
  if (!module.feynman) throw new HttpError(404, 'The Feynman block of this module is not ready yet.', 'not_found')
  return { module, feynman: module.feynman }
}

export async function anaState(): Promise<AnaState> {
  const ollama = await ollamaState()
  return {
    listener: listenerInstalled(),
    voice: kokoroInstalled(),
    ollama: Boolean(ollama.model),
    model: ollama.model,
    engine: ollama.model ? 'ollama' : 'script',
  }
}

feynmanRouter.get(
  '/:id/modules/:order/feynman',
  route(async (req, res) => {
    const { course, module, feynman } = blockFromUrl(req)
    const { passedOnes, bestScores } = courseFeynmans(course.id)
    const payload: StudentFeynman = {
      courseId: course.id,
      courseTitle: course.title,
      module: module.order,
      moduleTitle: module.plan.title,
      topic: feynman.topic,
      request: feynman.request,
      opening: feynman.opening,
      points: feynman.keyPoints.length,
      alreadyPassed: passedOnes.has(module.order),
      bestScore: bestScores.get(module.order) ?? null,
      ana: await anaState(),
      language: course.brief.language,
    }
    res.json({ data: payload })
  }),
)

feynmanRouter.post(
  '/:id/modules/:order/feynman/listen',
  express.raw({ type: () => true, limit: '15mb' }),
  route(async (req, res) => {
    const { course, feynman } = blockFromUrl(req)
    const type = req.headers['content-type']
    if (!acceptedAudioType(type))
      throw new HttpError(415, 'Send the audio as audio/webm, audio/ogg or audio/mp4.', 'format')
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000)
      throw new HttpError(422, 'Not enough audio arrived. Speak a little closer to the microphone.', 'no_audio')
    if (!listenerInstalled()) throw new HttpError(503, `The listener is not installed. ${LISTENER_HELP}`, 'no_listener')
    const hint = vocabularyHint(
      feynman.topic,
      feynman.keyPoints.flatMap((p) => p.cues),
    )
    res.json({ data: { text: await transcribe(req.body, type!, hint, course.brief.language) } })
  }),
)

feynmanRouter.post(
  '/:id/modules/:order/feynman/conversation',
  route(async (req, res) => {
    const { course, module, feynman } = blockFromUrl(req)
    const { history, coveredIds } = conversationRequestSchema.parse(req.body ?? {})
    if (history.at(-1)?.who !== 'student') throw new HttpError(422, "The last turn must be the student's.", 'invalid')
    const validIds = new Set(feynman.keyPoints.map((p) => p.id))
    const before = coveredIds.filter((id) => validIds.has(id))
    const { answer, engine } = await anaReply(
      feynman,
      lessonSummaries(module, course.brief.language),
      history,
      before,
      course.brief.language,
    )
    const payload: AnaTurn = {
      answer: answer.answer,
      coveredIds: [...new Set([...before, ...answer.coveredPoints])],
      correction: answer.correction,
      engine,
    }
    res.json({ data: payload })
  }),
)

const evaluationRequestSchema = z.object({ history: z.array(turnSchema).min(1).max(MAX_TURNS) }).strict()

feynmanRouter.post(
  '/:id/modules/:order/feynman/evaluate',
  route(async (req, res) => {
    const { course, module, feynman } = blockFromUrl(req)
    const { history } = evaluationRequestSchema.parse(req.body ?? {})
    if (!history.some((t) => t.who === 'student'))
      throw new HttpError(422, 'Explain something to Ana before asking for the evaluation.', 'no_explanation')
    const { evaluation, engine } = await anaEvaluation(
      feynman,
      lessonSummaries(module, course.brief.language),
      history,
      course.brief.language,
    )
    const fromBrain = new Map(evaluation.points.map((p) => [p.id, p]))
    const points = feynman.keyPoints.map((p) => {
      const a = fromBrain.get(p.id)
      return {
        id: p.id,
        idea: p.idea,
        status: a?.status ?? ('missing' as const),
        comment: a?.comment || missingComment(course.brief.language),
      }
    })
    const score = feynmanScore(
      points.map((p) => p.status),
      evaluation.errors.length,
    )
    const passed = score >= FEYNMAN_MIN_SCORE
    saveFeynman({
      course: course.id,
      module: module.order,
      score,
      passed,
      points: Object.fromEntries(points.map((p) => [p.id, p.status])),
      engine,
    })
    const reward = record(
      passed
        ? [{ type: 'feynman_passed', reference: `${course.id}:m${module.order}`, xp: FIXED_XP.feynman_passed }]
        : [],
    )
    const payload: FeynmanEvaluation = {
      score,
      passed,
      points,
      errors: evaluation.errors,
      advice: evaluation.advice,
      engine,
      reward,
    }
    res.json({ data: payload })
  }),
)

const speechRequestSchema = z
  .object({ text: z.string().trim().min(1).max(800), voice: z.enum(VOICES).default('pf_dora') })
  .strict()

voiceRouter.post(
  '/speak',
  route(async (req, res) => {
    const { text, voice } = speechRequestSchema.parse(req.body ?? {})
    if (!kokoroInstalled())
      throw new HttpError(503, 'The voice is not installed. Run `npm run voice:install`.', 'no_voice')
    const segment = await narrate(toSpeech(text), { voice })
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.type('audio/mpeg').sendFile(segment.file)
  }),
)
