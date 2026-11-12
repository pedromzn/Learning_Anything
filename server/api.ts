/**
 * Builds the API (`/api`) following the contract in `shared/api.ts`. Every success response is `{ data }`; errors come
 * from `handleError` (mounted by whoever uses this router, in `main.ts`).
 */

import { Router } from 'express'
import { listSlugs } from './courses/repository.js'
import { certificatesRouter, dashboardRouter, profileRouter } from './routes/profile.js'
import { coursesRouter } from './routes/courses.js'
import { eventsRouter } from './routes/events.js'
import { focusRouter } from './routes/focus.js'
import { feynmanRouter, voiceRouter } from './routes/feynman.js'
import { teacherRouter } from './routes/teacher.js'
import { reviewRouter } from './routes/review.js'
import { requestsRouter } from './routes/requests.js'
import { communityRouter } from './routes/community.js'

export const apiRouter = Router()

/** The voice engine belongs to the video module (written separately); if it is missing or fails, health goes on without the field. */
async function voiceEngine(): Promise<string | undefined> {
  try {
    const module = (await import('./video/voice.js')) as { chosenEngine?: () => unknown }
    const picked = await module.chosenEngine?.()
    if (typeof picked === 'string') return picked
    const engine = (picked as { engine?: unknown } | undefined)?.engine
    return typeof engine === 'string' ? engine : undefined
  } catch {
    return undefined
  }
}

apiRouter.get('/health', async (_req, res) => {
  const engine = await voiceEngine()
  res.json({ data: { ok: true, courses: listSlugs().length, ...(engine ? { voiceEngine: engine } : {}) } })
})

apiRouter.use('/courses', feynmanRouter)
apiRouter.use('/courses', teacherRouter)
apiRouter.use('/courses', coursesRouter)
apiRouter.use('/voice', voiceRouter)
apiRouter.use('/profile', profileRouter)
apiRouter.use('/dashboard', dashboardRouter)
apiRouter.use('/certificates', certificatesRouter)
apiRouter.use('/requests', requestsRouter)
apiRouter.use('/events', eventsRouter)
apiRouter.use('/focus', focusRouter)
apiRouter.use('/review', reviewRouter)
apiRouter.use('/community', communityRouter)
