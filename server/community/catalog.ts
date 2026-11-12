/**
 * The community catalog on the server side (see `shared/community.ts`):
 * - `buildIndex` reads a folder of bundles and validates each one exactly like `course:import` (the GitHub Action and
 *   the offline fallback use it);
 * - `communityList` reads the catalog published on GitHub and, without internet, the bundles in this folder;
 * - `installFromCommunity` downloads ONE bundle and installs it with `importBundle`, which treats it as untrusted data.
 *
 * The app only reaches the internet here, and only when the person opens the Community tab or installs a course.
 * `COMMUNITY=off` turns the network side off (the tab then shows the local copy).
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  COMMUNITY_FOLDER,
  COMMUNITY_INDEX_BRANCH,
  COMMUNITY_REPO,
  INDEX_FORMAT,
  communityIndexSchema,
  type CommunityEntry,
  type CommunityIndex,
  type CommunityList,
  type InstallResult,
} from '../../shared/community.js'
import {
  LIMITS,
  ShareError,
  checkBundle,
  importBundle,
  validateStaged,
  type CourseBundle,
} from '../../scripts/share.js'
import { config } from '../config.js'
import { HttpError } from '../errors.js'
import { listSlugs, type ReadCourse } from '../courses/repository.js'

/** The repository the catalog comes from: `COMMUNITY_REPO=owner/name` for a fork, otherwise the project's. */
export function communityRepo(value: string | undefined = process.env.COMMUNITY_REPO): string {
  return value && /^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(value) ? value : COMMUNITY_REPO
}

export const networkAllowed = (value: string | undefined = process.env.COMMUNITY): boolean =>
  !/^(off|0|false|no)$/i.test(value ?? '')

const raw = (repo: string, branch: string, file: string) =>
  `https://raw.githubusercontent.com/${repo}/${branch}/${file}`

export const indexUrl = (repo = communityRepo()) => raw(repo, COMMUNITY_INDEX_BRANCH, 'index.json')
export const bundleUrl = (file: string, repo = communityRepo()) => raw(repo, 'main', `${COMMUNITY_FOLDER}/${file}`)

// ── building the index from bundles ──────────────────────────────────────────

export function entryOf(bundle: CourseBundle, course: ReadCourse, bytes: number): CommunityEntry {
  return {
    slug: bundle.slug,
    title: course.title.slice(0, 200),
    summary: (course.syllabus?.summary ?? '').slice(0, 2000),
    topic: course.brief.topic.slice(0, 200),
    language: course.brief.language,
    level: course.brief.level,
    modules: course.modules.length,
    writtenModules: course.modules.filter((m) => m.state === 'ready').length,
    lessons: course.modules.reduce((n, m) => n + m.lessons.filter((l) => l.state === 'ready').length, 0),
    author: bundle.author ?? null,
    file: `${bundle.slug}.course.json`,
    bytes,
    exportedAt: bundle.exportedAt.slice(0, 40),
  }
}

/** Reads, checks and validates one bundle file; the file name must be `<slug>.course.json`. */
export async function inspectBundleFile(file: string): Promise<CommunityEntry> {
  const name = path.basename(file)
  const bytes = statSync(file).size
  if (bytes > LIMITS.bundleBytes) throw new ShareError(`${name}: the bundle is too large (over 20 MB).`)
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    throw new ShareError(`${name}: not valid JSON (${e instanceof Error ? e.message : String(e)}).`)
  }
  const { bundle, serialized } = checkBundle(parsed)
  if (name !== `${bundle.slug}.course.json`)
    throw new ShareError(`${name}: the file must be named after the course slug (${bundle.slug}.course.json).`)
  return validateStaged(bundle.slug, serialized, (course) => entryOf(bundle, course, bytes))
}

export interface BuiltIndex {
  index: CommunityIndex
  problems: { file: string; message: string }[]
}

/** Every `*.course.json` in `folder`, validated; the broken ones go to `problems` instead of the index. */
export async function buildIndex(folder: string): Promise<BuiltIndex> {
  const courses: CommunityEntry[] = []
  const problems: BuiltIndex['problems'] = []
  const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.course.json')) : []
  for (const f of files.sort()) {
    try {
      courses.push(await inspectBundleFile(path.join(folder, f)))
    } catch (e) {
      problems.push({ file: f, message: e instanceof Error ? e.message : String(e) })
    }
  }
  courses.sort((a, b) => a.title.localeCompare(b.title))
  return {
    index: { format: INDEX_FORMAT, version: 1, generatedAt: new Date().toISOString(), courses },
    problems,
  }
}

// ── reading the catalog ──────────────────────────────────────────────────────

type Fetch = typeof fetch
const TIMEOUT_MS = 10_000
const CACHE_MS = 5 * 60_000
let cached: { at: number; repo: string; index: CommunityIndex } | null = null

export function clearCommunityCache(): void {
  cached = null
}

async function download(url: string, maxBytes: number, fetcher: Fetch): Promise<Buffer> {
  const r = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`)
  const declared = Number(r.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error('the file is too large')
  const body = Buffer.from(await r.arrayBuffer())
  if (body.length > maxBytes) throw new Error('the file is too large')
  return body
}

async function remoteIndex(repo: string, fetcher: Fetch): Promise<CommunityIndex> {
  if (cached && cached.repo === repo && Date.now() - cached.at < CACHE_MS) return cached.index
  const body = await download(indexUrl(repo), 5 * 1024 * 1024, fetcher)
  const index = communityIndexSchema.parse(JSON.parse(body.toString('utf8')))
  cached = { at: Date.now(), repo, index }
  return index
}

const localFolder = () => path.join(config.root, COMMUNITY_FOLDER)

export async function communityList(options: { fetcher?: Fetch; refresh?: boolean } = {}): Promise<CommunityList> {
  const repo = communityRepo()
  if (options.refresh) clearCommunityCache()
  const installed = new Set(listSlugs())
  const mark = (courses: CommunityEntry[]) => courses.map((c) => ({ ...c, installed: installed.has(c.slug) }))
  let offline: string
  if (networkAllowed()) {
    try {
      const index = await remoteIndex(repo, options.fetcher ?? fetch)
      return { source: 'remote', repo, courses: mark(index.courses), offline: null }
    } catch (e) {
      offline = e instanceof Error ? e.message : String(e)
    }
  } else offline = 'COMMUNITY=off'
  const { index } = await buildIndex(localFolder())
  return { source: 'local', repo, courses: mark(index.courses), offline }
}

// ── installing ───────────────────────────────────────────────────────────────

export async function installFromCommunity(
  slug: string,
  options: { fetcher?: Fetch; coursesFolder?: string } = {},
): Promise<InstallResult> {
  const list = await communityList({ fetcher: options.fetcher })
  const entry = list.courses.find((c) => c.slug === slug)
  if (!entry) throw new HttpError(404, 'This course is not in the community catalog.', 'not_found')
  if (entry.installed && !options.coursesFolder)
    throw new HttpError(409, 'You already have a course with this name.', 'already_installed')

  let parsed: unknown
  if (list.source === 'remote') {
    const body = await download(bundleUrl(entry.file, list.repo), LIMITS.bundleBytes, options.fetcher ?? fetch).catch(
      (e: unknown) => {
        throw new HttpError(502, `Could not download the course (${e instanceof Error ? e.message : e}).`, 'offline')
      },
    )
    parsed = JSON.parse(body.toString('utf8'))
  } else {
    parsed = JSON.parse(await readFile(path.join(localFolder(), entry.file), 'utf8'))
  }
  if ((parsed as { slug?: unknown })?.slug !== entry.slug)
    throw new HttpError(422, 'The downloaded file does not match the catalog.', 'invalid')
  try {
    const result = await importBundle(parsed, { coursesFolder: options.coursesFolder })
    return { slug: result.slug, files: result.files }
  } catch (e) {
    if (e instanceof ShareError) throw new HttpError(422, e.message, 'invalid')
    throw e
  }
}
