/**
 * The community in the API (see `server/community/`):
 * - `GET  /community?refresh=1`            the catalog (GitHub, or the local copy offline), marking what is installed;
 * - `POST /community/install`              `{ slug }` → downloads, validates and installs one course;
 * - `GET  /community/share/:id`            what would be published (files, removed fields, whether `gh` is ready);
 * - `GET  /community/share/:id/file?sign=` the bundle to download (to send by hand, without `gh`);
 * - `POST /community/share/:id`            `{ sign }` → opens the pull request with the person's `gh`.
 */

import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { validSlug } from '../courses/repository.js'
import { HttpError } from '../errors.js'
import { communityList, installFromCommunity } from '../community/catalog.js'
import { ghLogin, publishCourse, shareFile, sharePreview } from '../community/publish.js'

export const communityRouter = Router()

type Route = (req: Request, res: Response) => Promise<void> | void
const route = (f: Route) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(() => f(req, res))
    .catch(next)
}

const slugOf = (value: unknown): string => {
  const slug = z.string().parse(value)
  if (!validSlug(slug)) throw new HttpError(404, 'Course not found.', 'not_found')
  return slug
}

communityRouter.get(
  '/',
  route(async (req, res) => {
    res.json({ data: await communityList({ refresh: req.query.refresh === '1' }) })
  }),
)

communityRouter.post(
  '/install',
  route(async (req, res) => {
    res.json({ data: await installFromCommunity(slugOf(req.body?.slug)) })
  }),
)

communityRouter.get(
  '/share/:id',
  route(async (req, res) => {
    res.json({ data: await sharePreview(slugOf(req.params.id)) })
  }),
)

communityRouter.get(
  '/share/:id/file',
  route(async (req, res) => {
    const slug = slugOf(req.params.id)
    const author = req.query.sign === '1' ? await ghLogin() : null
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.course.json"`)
    res.send(await shareFile(slug, author))
  }),
)

communityRouter.post(
  '/share/:id',
  route(async (req, res) => {
    const { sign } = z.object({ sign: z.boolean().default(true) }).parse(req.body ?? {})
    res.json({ data: await publishCourse(slugOf(req.params.id), { sign }) })
  }),
)
