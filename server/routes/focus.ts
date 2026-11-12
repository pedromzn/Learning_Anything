/**
 * Focus mode in the API:
 * - `GET /focus/models` and `POST /focus/models` (download the detector, only when the person asks);
 * - `GET /focus/files/models/:name` and `/focus/files/wasm/*` (the files the browser loads);
 * - `GET /focus/sessions` (the summary for the profile) and `POST /focus/sessions` (save a session).
 */

import express, { Router } from 'express'
import path from 'node:path'
import { focusSessionSchema } from '../../shared/focus.js'
import { HttpError } from '../errors.js'
import { MODEL_NAMES, MODELS_FOLDER, WASM_FOLDER, modelsState, installModels } from '../focus/models.js'
import { saveSession, focusSummary } from '../focus/sessions.js'

export const focusRouter = Router()

focusRouter.get('/models', (_req, res) => {
  res.json({ data: modelsState() })
})

focusRouter.post('/models', async (_req, res, next) => {
  try {
    res.json({ data: await installModels() })
  } catch (e) {
    next(new HttpError(502, e instanceof Error ? e.message : 'The detector download failed.', 'download_failed'))
  }
})

focusRouter.get('/files/models/:name', (req, res, next) => {
  if (!MODEL_NAMES.has(req.params.name)) return next(new HttpError(404, 'Unknown model.', 'not_found'))
  res.sendFile(path.join(MODELS_FOLDER, req.params.name), { maxAge: '7d' }, (error) => {
    if (error && !res.headersSent)
      next(new HttpError(404, 'The detector is not downloaded. Download it with the focus mode button.', 'no_model'))
  })
})

focusRouter.use('/files/wasm', express.static(WASM_FOLDER, { maxAge: '7d', index: false }))

focusRouter.get('/sessions', (_req, res, next) => {
  try {
    res.json({ data: focusSummary() })
  } catch (e) {
    next(e)
  }
})

/*
 * The `sendBeacon` sent when the tab closes posts the body as text/plain; that is why this route accepts text and converts it.
 */
focusRouter.post('/sessions', express.text({ type: 'text/plain', limit: '16kb' }), (req, res, next) => {
  try {
    const body: unknown = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    saveSession(focusSessionSchema.parse(body))
    res.json({ data: focusSummary() })
  } catch (e) {
    next(e instanceof SyntaxError ? new HttpError(400, 'Invalid JSON.', 'invalid_json') : e)
  }
})
