/**
 * The Learning Anything server: the API (`/api`) and the web app on the SAME port.
 *
 * - `npm run dev`: Vite runs as middleware (with hot reload) — no second process, no proxy.
 * - `npm start`: serves the already built `dist/`.
 *
 * There is no login: the app is local and for a single person. That is why it listens on 127.0.0.1 by default —
 * opening it to the network (`HOST=0.0.0.0`) is up to whoever runs it, and the README warns about it.
 */

import express from 'express'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import '../shared/zodPortuguese.js'
import { config } from './config.js'
import { apiRouter } from './api.js'
import { handleError } from './errors.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', apiRouter)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route not found.', code: 'not_found' }))
  app.use('/api', handleError)

  if (config.production) {
    const dist = path.join(ROOT, 'dist')
    if (!existsSync(path.join(dist, 'index.html'))) throw new Error('Run `npm run build` first (or use `npm run dev`).')
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  } else {
    const { createServer } = await import('vite')
    const vite = await createServer({
      configFile: path.join(ROOT, 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  }
  return app
}

const entryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (entryPoint) {
  const app = await createApp()
  app.listen(config.port, config.host, () => {
    console.log(
      `\n  ✦ Learning Anything at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}\n`,
    )
  })
}
