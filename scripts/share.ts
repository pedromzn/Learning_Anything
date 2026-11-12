/**
 * Course sharing: pack a course into ONE `<slug>.course.json` file and install such a file into `courses/`.
 *
 *   npm run course:export -- <slug> [--out path]
 *   npm run course:import -- <file> [--as <new-slug>] [--force]
 *
 * Both accept `--courses <folder>` to work on another courses folder (the tests and dry runs use it).
 *
 * A bundle is UNTRUSTED data: before anything is written, the import checks the format, the slug, every path (only the
 * known course file names; no "..", no absolute paths), the sizes, and then runs the same schema + teaching validation
 * as `course:validate` on a staging copy. Only then it lands in `courses/<slug>` with a rename. Generated video files,
 * `data/` (personal progress) and `requests/` are never part of a bundle.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../server/config.js'
import { invalidateCache, readCourse, validSlug, type ReadCourse } from '../server/courses/repository.js'

export const BUNDLE_FORMAT = 'learning-anything-course'
export const BUNDLE_VERSION = 1

/** Limits for an imported bundle: generous for a real course, small enough to refuse junk. */
export const LIMITS = {
  bundleBytes: 20 * 1024 * 1024,
  fileBytes: 2 * 1024 * 1024,
  files: 400,
  module: 99,
  lesson: 99,
}

export interface CourseBundle {
  format: typeof BUNDLE_FORMAT
  version: typeof BUNDLE_VERSION
  slug: string
  title: string
  language: string
  exportedAt: string
  /** the GitHub login of whoever shared it in the community, when they chose to sign it */
  author?: string
  files: Record<string, unknown>
}

/**
 * Brief fields that can carry personal context ("I work at…", "for my exam in May"). They help the AI write the
 * course for one person and mean nothing to anyone else, so a shared copy goes without them.
 */
export const PERSONAL_BRIEF_FIELDS = ['goal', 'priorKnowledge', 'context'] as const

// ── allowed paths ───────────────────────────────────────────────────────────

const ROOT_FILES = new Set(['brief.json', 'dossier.json', 'syllabus.json'])
const MODULE_FILE = /^module-([1-9]\d?)\/(?:lesson-([1-9]\d?)\.json|feynman\.json|checkpoint\.json)$/

/** True for the course files a bundle may carry (never the generated `lesson-M.video.json` or `lesson-M.video/`). */
export function allowedPath(p: string): boolean {
  return ROOT_FILES.has(p) || MODULE_FILE.test(p)
}

/** The course JSON files in a folder, as relative paths with `/`, sorted. Anything else is left out. */
function courseFiles(folder: string): string[] {
  const found: string[] = []
  for (const e of readdirSync(folder, { withFileTypes: true })) {
    if (e.isFile() && ROOT_FILES.has(e.name)) found.push(e.name)
    else if (e.isDirectory() && /^module-[1-9]\d?$/.test(e.name)) {
      for (const f of readdirSync(path.join(folder, e.name), { withFileTypes: true })) {
        const rel = `${e.name}/${f.name}`
        if (f.isFile() && allowedPath(rel)) found.push(rel)
      }
    }
  }
  return found.sort()
}

// ── reading a course in any courses folder ──────────────────────────────────

/**
 * Reads (and validates) a course with the repository the CLI uses, pointed at `coursesFolder` for the duration of the
 * call. The repository reads `config.coursesFolder`; this is a short-lived CLI process, so the swap is safe here.
 */
export function readCourseIn(coursesFolder: string, slug: string): ReadCourse | null {
  const previous = config.coursesFolder
  config.coursesFolder = coursesFolder
  invalidateCache(slug)
  try {
    return readCourse(slug)
  } finally {
    invalidateCache(slug)
    config.coursesFolder = previous
  }
}

/** Planned module/lesson numbers of a valid course, to refuse files the syllabus does not mention. */
function plannedPaths(course: ReadCourse): Set<string> {
  const set = new Set(ROOT_FILES)
  for (const m of course.modules) {
    set.add(`module-${m.order}/feynman.json`)
    set.add(`module-${m.order}/checkpoint.json`)
    for (const l of m.lessons) set.add(l.file)
  }
  return set
}

function problemList(course: ReadCourse): string[] {
  return course.problems.slice(0, 20)
}

// ── export ───────────────────────────────────────────────────────────────────

export class ShareError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(problems.length ? `${message}\n${problems.map((p) => `  - ${p}`).join('\n')}` : message)
  }
}

export interface ExportOptions {
  /** keep the personal brief fields (`PERSONAL_BRIEF_FIELDS`); off by default */
  personal?: boolean
  author?: string | null
}

/** Builds the bundle of a course that passes validation. */
export async function exportCourse(
  slug: string,
  coursesFolder = config.coursesFolder,
  options: ExportOptions = {},
): Promise<CourseBundle> {
  if (!validSlug(slug)) throw new ShareError(`Invalid slug: "${slug}" (use lowercase letters, numbers and hyphens).`)
  const course = readCourseIn(coursesFolder, slug)
  if (!course) throw new ShareError(`The course "${slug}" does not exist in ${coursesFolder}.`)
  if (course.problems.length)
    throw new ShareError(
      `The course "${slug}" does not pass validation; fix it first (npm run course:validate -- ${slug}).`,
      problemList(course),
    )
  if (!course.syllabus) throw new ShareError(`The course "${slug}" has no syllabus yet; there is nothing to share.`)

  const folder = path.join(coursesFolder, slug)
  const planned = plannedPaths(course)
  const files: Record<string, unknown> = {}
  for (const rel of courseFiles(folder)) {
    if (!planned.has(rel)) continue // a leftover the syllabus does not mention: not part of the course
    files[rel] = JSON.parse(await readFile(path.join(folder, rel), 'utf8'))
  }
  const brief = files['brief.json']
  if (!options.personal && brief && typeof brief === 'object')
    for (const field of PERSONAL_BRIEF_FIELDS) delete (brief as Record<string, unknown>)[field]
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    slug,
    title: course.title,
    language: course.brief.language,
    exportedAt: new Date().toISOString(),
    ...(options.author ? { author: options.author } : {}),
    files,
  }
}

/** Where the bundle goes: `--out` may be a folder or a `.json` file; default is the current folder. */
export function bundlePath(slug: string, out: string | null): string {
  const name = `${slug}.course.json`
  if (!out) return path.resolve(name)
  const resolved = path.resolve(out)
  if (resolved.endsWith('.json') && !(existsSync(resolved) && statSync(resolved).isDirectory())) return resolved
  return path.join(resolved, name)
}

export async function writeBundle(bundle: CourseBundle, file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`)
}

// ── import ───────────────────────────────────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The structural checks, in memory, before anything touches the disk. Returns the files serialized. */
export function checkBundle(raw: unknown): { bundle: CourseBundle; serialized: Map<string, string> } {
  if (!isPlainObject(raw)) throw new ShareError('Not a course bundle: the file is not a JSON object.')
  if (raw.format !== BUNDLE_FORMAT) throw new ShareError(`Not a course bundle: "format" must be "${BUNDLE_FORMAT}".`)
  if (raw.version !== BUNDLE_VERSION)
    throw new ShareError(`Unsupported bundle version: ${JSON.stringify(raw.version)} (this app reads version 1).`)
  if (typeof raw.slug !== 'string' || !validSlug(raw.slug))
    throw new ShareError('The bundle slug is invalid (lowercase letters, numbers and hyphens, 2 to 61 characters).')
  for (const key of ['title', 'language', 'exportedAt'] as const) {
    const v = raw[key]
    if (typeof v !== 'string' || v.length > 400) throw new ShareError(`The bundle field "${key}" must be a short text.`)
  }
  if (raw.author !== undefined && (typeof raw.author !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(raw.author)))
    throw new ShareError('The bundle field "author" must be a GitHub login.')
  if (!isPlainObject(raw.files)) throw new ShareError('The bundle has no "files" object.')

  const entries = Object.entries(raw.files)
  if (!entries.length) throw new ShareError('The bundle has no files.')
  if (entries.length > LIMITS.files) throw new ShareError(`Too many files in the bundle (${entries.length}).`)

  const bad = entries.map(([p]) => p).filter((p) => !allowedPath(p))
  if (bad.length)
    throw new ShareError(
      'The bundle has paths that are not course files (only brief.json, dossier.json, syllabus.json and ' +
        'module-N/lesson-M.json, module-N/feynman.json, module-N/checkpoint.json are allowed):',
      bad.slice(0, 20).map((p) => JSON.stringify(p.slice(0, 200))),
    )

  const serialized = new Map<string, string>()
  for (const [p, value] of entries) {
    if (!isPlainObject(value)) throw new ShareError(`${p}: the content must be a JSON object.`)
    const text = `${JSON.stringify(value, null, 2)}\n`
    if (Buffer.byteLength(text) > LIMITS.fileBytes) throw new ShareError(`${p}: the file is too large.`)
    serialized.set(p, text)
  }
  return { bundle: raw as unknown as CourseBundle, serialized }
}

/**
 * Writes the files to a temporary courses folder OUTSIDE `courses/`, reads them with the same validation as
 * `course:validate` and hands the course to `inspect` (the community catalog reads its summary there). Throws when the
 * course does not pass or carries files the syllabus does not mention.
 */
export async function validateStaged<T = void>(
  slug: string,
  serialized: Map<string, string>,
  inspect?: (course: ReadCourse) => T,
): Promise<T> {
  const staging = await mkdtemp(path.join(os.tmpdir(), 'learning-anything-import-'))
  try {
    await writeFiles(path.join(staging, slug), serialized)
    const course = readCourseIn(staging, slug)
    if (!course) throw new ShareError('The bundle could not be read as a course.')
    if (course.problems.length)
      throw new ShareError('The course in the bundle does not pass validation:', problemList(course))
    if (!course.syllabus) throw new ShareError('The bundle has no syllabus.')
    const planned = plannedPaths(course)
    const extra = [...serialized.keys()].filter((p) => !planned.has(p))
    if (extra.length) throw new ShareError('The bundle has files the syllabus does not mention:', extra.slice(0, 20))
    return inspect ? inspect(course) : (undefined as T)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export interface ImportOptions {
  as?: string | null
  force?: boolean
  coursesFolder?: string
}

export interface ImportResult {
  slug: string
  folder: string
  files: number
  replaced: boolean
}

async function writeFiles(folder: string, serialized: Map<string, string>): Promise<void> {
  for (const [rel, text] of serialized) {
    const target = path.join(folder, ...rel.split('/'))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, text)
  }
}

/** Validates the bundle fully, then writes it to `<coursesFolder>/<slug>` atomically (temp folder, then rename). */
export async function importBundle(raw: unknown, options: ImportOptions = {}): Promise<ImportResult> {
  const coursesFolder = path.resolve(options.coursesFolder ?? config.coursesFolder)
  const { bundle, serialized } = checkBundle(raw)
  const slug = options.as ?? bundle.slug
  if (!validSlug(slug)) throw new ShareError(`Invalid slug for --as: "${slug}".`)
  const target = path.join(coursesFolder, slug)
  const exists = existsSync(target)
  if (exists && !options.force)
    throw new ShareError(`The course "${slug}" already exists in ${coursesFolder}. Use --as <new-slug> or --force.`)

  // 1. the same validation as course:validate, on a staging copy OUTSIDE the courses folder
  await validateStaged(slug, serialized)

  // 2. write next to the target (same disk, so the rename is atomic), then swap it in
  await mkdir(coursesFolder, { recursive: true })
  const suffix = `${process.pid}-${Date.now()}`
  const temp = path.join(coursesFolder, `.import-${slug}-${suffix}`)
  const old = path.join(coursesFolder, `.replaced-${slug}-${suffix}`)
  try {
    await writeFiles(temp, serialized)
    if (exists) await rename(target, old)
    try {
      await rename(temp, target)
    } catch (error) {
      if (exists) await rename(old, target) // put the previous course back
      throw error
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
  if (exists) await rm(old, { recursive: true, force: true })
  invalidateCache(slug)
  return { slug, folder: target, files: serialized.size, replaced: exists }
}

export async function importFile(file: string, options: ImportOptions = {}): Promise<ImportResult> {
  const resolved = path.resolve(file)
  if (!existsSync(resolved)) throw new ShareError(`File not found: ${file}`)
  if (statSync(resolved).size > LIMITS.bundleBytes) throw new ShareError('The bundle is too large (over 20 MB).')
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(resolved, 'utf8'))
  } catch (e) {
    throw new ShareError(`The file is not valid JSON (${e instanceof Error ? e.message : String(e)}).`)
  }
  return importBundle(raw, options)
}

// ── command line ─────────────────────────────────────────────────────────────

export interface ShareArgs {
  positional: string[]
  out: string | null
  as: string | null
  courses: string | null
  force: boolean
  keepPersonal: boolean
}

export function readShareArgs(argv: string[]): ShareArgs {
  const r: ShareArgs = { positional: [], out: null, as: null, courses: null, force: false, keepPersonal: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' || a === '--as' || a === '--courses') {
      const v = argv[++i]
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value.`)
      r[a.slice(2) as 'out' | 'as' | 'courses'] = v
    } else if (a === '--force') r.force = true
    else if (a === '--keep-personal') r.keepPersonal = true
    else if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`)
    else r.positional.push(a)
  }
  return r
}

const HELP = `Usage:
  npm run course:export -- <slug> [--out path] [--keep-personal] writes <slug>.course.json
                     (without the brief's goal, priorKnowledge and context unless --keep-personal)
  npm run course:import -- <file> [--as <new-slug>] [--force]    installs a bundle into courses/
Both accept --courses <folder> to use another courses folder.`

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)
  const args = readShareArgs(rest)
  const coursesFolder = args.courses ? path.resolve(args.courses) : config.coursesFolder
  if (command === 'export') {
    const slug = args.positional[0]
    if (!slug) throw new Error('Missing the course slug.')
    const bundle = await exportCourse(slug, coursesFolder, { personal: args.keepPersonal })
    const file = bundlePath(slug, args.out)
    await writeBundle(bundle, file)
    console.log(`Exported ${slug} (${Object.keys(bundle.files).length} files) to ${file}`)
    console.log('Videos are not included: whoever imports it generates them on their machine.')
    return 0
  }
  if (command === 'import') {
    const file = args.positional[0]
    if (!file) throw new Error('Missing the bundle file (<slug>.course.json).')
    const result = await importFile(file, { as: args.as, force: args.force, coursesFolder })
    console.log(
      `${result.replaced ? 'Replaced' : 'Imported'} ${result.slug} (${result.files} files) at ${result.folder}`,
    )
    console.log(`Generate the videos with: npm run course:video -- ${result.slug}`)
    return 0
  }
  console.log(HELP)
  return command ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    },
  )
}
