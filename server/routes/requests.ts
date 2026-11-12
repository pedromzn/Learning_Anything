/**
 * The "New course" requests: the brief becomes `requests/<slug>.json` and the person gets a ready text to paste into
 * their AI. The app does not generate content — their AI does the research and the writing, following AGENTS.md.
 */

import { Router } from 'express'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { briefSchema, type Brief } from '../../shared/course.js'
import type { CreatedRequest, RequestSummary } from '../../shared/api.js'
import { config } from '../config.js'
import { HttpError } from '../errors.js'
import { listSlugs, validSlug } from '../courses/repository.js'

export const requestsRouter = Router()

interface SavedRequest {
  slug: string
  createdAt: string
  brief: Brief
}

/** `Cálculo 1: limites` → `calculo-1-limites` (no accents, only a-z, 0-9 and hyphen, up to 50 characters). */
export function topicSlug(topic: string): string {
  const base = topic
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  return base.length >= 2 ? base : 'course'
}

const requestFile = (slug: string) => path.join(config.requestsFolder, `${slug}.json`)

function availableSlug(base: string): string {
  const taken = new Set([...listSlugs(), ...requestSlugs()])
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 56)}-${n}`
  return slug
}

function requestSlugs(): string[] {
  if (!existsSync(config.requestsFolder)) return []
  return readdirSync(config.requestsFolder)
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -5))
    .filter(validSlug)
}

/** The requests that have no folder in `courses/` yet (the AI has not started), newest first. */
export function listRequests(): RequestSummary[] {
  const finished = new Set(listSlugs())
  const list: RequestSummary[] = []
  for (const slug of requestSlugs()) {
    if (finished.has(slug)) continue
    try {
      const p = JSON.parse(readFileSync(requestFile(slug), 'utf8')) as Partial<SavedRequest>
      if (p.brief?.topic && p.brief.level)
        list.push({ slug, topic: p.brief.topic, level: p.brief.level, createdAt: p.createdAt ?? '' })
    } catch {
      /* broken file: not listed */
    }
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

requestsRouter.post('/', (req, res, next) => {
  try {
    const brief = briefSchema.parse(req.body)
    const slug = availableSlug(topicSlug(brief.topic))
    mkdirSync(config.requestsFolder, { recursive: true })
    const request: SavedRequest = { slug, createdAt: new Date().toISOString(), brief }
    writeFileSync(requestFile(slug), `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx' })
    const payload: CreatedRequest = {
      slug,
      file: `requests/${slug}.json`,
      instruction: `Read AGENTS.md and create the course from the request requests/${slug}.json.`,
    }
    res.status(201).json({ data: payload })
  } catch (e) {
    next(e)
  }
})

requestsRouter.get('/', (_req, res, next) => {
  try {
    res.json({ data: listRequests() })
  } catch (e) {
    next(e)
  }
})

requestsRouter.delete('/:slug', (req, res, next) => {
  try {
    const { slug } = req.params
    if (!validSlug(slug) || !existsSync(requestFile(slug))) throw new HttpError(404, 'Request not found.', 'not_found')
    unlinkSync(requestFile(slug))
    res.json({ data: { ok: true } })
  } catch (e) {
    next(e)
  }
})
