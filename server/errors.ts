/** API errors: the `{ error, code? }` shape and the middleware that produces it. */

import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const handleError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error)
  if (error instanceof ZodError) {
    const first = error.issues[0]
    const where = first?.path.length ? `${first.path.join('.')}: ` : ''
    res.status(422).json({ error: `${where}${first?.message ?? 'Invalid data.'}`, code: 'invalid' })
    return
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) })
    return
  }
  /* malformed JSON body coming from express.json */
  if (error && typeof error === 'object' && (error as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON.', code: 'invalid_json' })
    return
  }
  console.error('[error]', error)
  res.status(500).json({ error: 'Internal server error.', code: 'internal' })
}
