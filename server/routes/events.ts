/**
 * The real-time feed of the "creating the course" page: `GET /api/events` (Server-Sent Events). A file watcher looks at `courses/` and
 * `requests/` and, for every file the AI writes, sends `event: course` (`CourseEvent`) — and `event: request` when a
 * request appears or disappears (`{ slug }`), so the Home list updates.
 *
 * There is ONE watcher for all listeners, and it shuts down when the last one leaves. A write usually fires several
 * events in a row, so each file waits for ~150 ms of quiet before it becomes an event.
 */

import { Router, type Response } from 'express'
import { existsSync, mkdirSync, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import type { CourseEvent } from '../../shared/api.js'
import { config } from '../config.js'
import { invalidateCache, readCourse, validSlug, fileType } from '../courses/repository.js'

export const eventsRouter = Router()

const listeners = new Set<Response>()
let watchers: FSWatcher[] = []
const delays = new Map<string, NodeJS.Timeout>()

const DEBOUNCE_MS = 150
const HEARTBEAT_MS = 25_000

function send(event: string, payload: unknown): void {
  const text = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of listeners) res.write(text)
}

/** Editor temp files and the dozens of video segments are not news. */
function ignore(relative: string): boolean {
  const name = path.basename(relative)
  if (name.startsWith('.') || name.endsWith('~') || /\.(tmp|swp|swx)$/.test(name)) return true
  const parts = relative.split('/')
  return parts.some((p) => p.endsWith('.video')) && name !== 'index.m3u8'
}

function onCourseChange(name: string): void {
  const relative = name.split(path.sep).join('/')
  const [slug, ...rest] = relative.split('/')
  if (!slug || !validSlug(slug) || rest.length === 0) return
  const file = rest.join('/')
  if (ignore(file)) return
  invalidateCache(slug)
  const type = fileType(file)
  const exists = existsSync(path.join(config.coursesFolder, slug, file))
  let valid = exists
  if (exists && ['brief', 'dossier', 'syllabus', 'lesson', 'checkpoint'].includes(type)) {
    const course = readCourse(slug)
    valid = !course?.problemsByFile[file]?.length
  }
  const event: CourseEvent = { courseId: slug, file, type, valid, at: new Date().toISOString() }
  send('course', event)
}

function onRequestChange(name: string): void {
  if (!name.endsWith('.json')) return
  const slug = name.slice(0, -5)
  if (validSlug(slug)) send('request', { slug })
}

function schedule(key: string, f: () => void): void {
  clearTimeout(delays.get(key))
  delays.set(
    key,
    setTimeout(() => {
      delays.delete(key)
      try {
        f()
      } catch (e) {
        console.error('[events]', e)
      }
    }, DEBOUNCE_MS),
  )
}

function watchFolder(folder: string, onChange: (name: string) => void, prefix: string): void {
  mkdirSync(folder, { recursive: true })
  const watcher = watch(folder, { recursive: true }, (_type, name) => {
    if (name) schedule(`${prefix}:${name}`, () => onChange(String(name)))
  })
  watcher.on('error', () => undefined)
  watchers.push(watcher)
}

function startWatchers(): void {
  if (watchers.length) return
  watchFolder(config.coursesFolder, onCourseChange, 'c')
  watchFolder(config.requestsFolder, onRequestChange, 'p')
}

function stopWatchers(): void {
  for (const v of watchers) v.close()
  watchers = []
  for (const t of delays.values()) clearTimeout(t)
  delays.clear()
}

eventsRouter.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')
  listeners.add(res)
  startWatchers()
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
  req.on('close', () => {
    clearInterval(heartbeat)
    listeners.delete(res)
    if (listeners.size === 0) stopWatchers()
  })
})
