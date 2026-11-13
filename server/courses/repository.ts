/**
 * The course repository: reads `courses/<slug>/` from disk and validates each file with the SAME schemas and rules the
 * AI knows (`shared/course.ts`, `shared/video.ts`). Nothing is written here — the user's AI does the writing; the app
 * and the CLI (`course:status`, `course:validate`) only read, and the state of each module is INFERRED from the files.
 *
 * Stable API (used by the routes and by `scripts/course.ts`):
 *   validSlug(slug): boolean
 *   listSlugs(): string[]                            folders in courses/ with a valid name
 *   readCourse(slug): ReadCourse | null              null = the folder does not exist; cache invalidated by mtime
 *   invalidateCache(slug?): void                     the file watcher calls it when something changes
 *   nextStep(course): AiStep | null                  what the AI should write (or fix) now; null = complete
 *   lessonId(module, order) / readLessonId(id)       `m1-a2` <-> { module, order } (null if the format does not match)
 *   find.lesson(course, id) / find.module(course, order)
 *   lessonItems(lesson): Item[]                      the gradable items (section questions, exercises, scenes)
 *   videoFolder(slug, module, order): string         the `lesson-M.video/` folder, inside courses/<slug>/
 *   fileType(relativePath): CourseEvent['type']
 *
 * Security: the slug goes through a regex before touching the disk and lesson/module ids are numeric; no path from the
 * URL reaches `path.join` without that.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { config } from '../config.js'
import {
  exercisesLessonSchema,
  textLessonSchema,
  checkpointSchema,
  checkSyllabus,
  checkItems,
  dossierSchema,
  syllabusSchema,
  briefSchema,
  LEVELS,
  type ExercisesLesson,
  type TextLesson,
  type PlannedLesson,
  type Checkpoint,
  type Dossier,
  type Syllabus,
  type Item,
  type PlannedModule,
} from '../../shared/course.js'
import { checkScript, scriptSchema, type Script, type ReadyVideo } from '../../shared/video.js'
import { checkFeynman, feynmanSchema, type Feynman } from '../../shared/feynman.js'
import type { LessonState, ModuleState, CourseEvent } from '../../shared/api.js'
import { DEFAULT_LANGUAGE, languageSchema } from '../../shared/languages.js'

// ── types ────────────────────────────────────────────────────────────────────

export type ReadBrief = z.infer<typeof readBriefSchema>

export type ReadContent = TextLesson | ExercisesLesson | Script

export interface ReadLesson {
  /** `m1-a2` */
  id: string
  module: number
  order: number
  plan: PlannedLesson
  state: LessonState
  /** path relative to the course folder: `module-1/lesson-2.json` */
  file: string
  /** the validated content; null if missing or invalid */
  content: ReadContent | null
  /** only in video lessons, once the render is done */
  video: ReadyVideo | null
  problems: string[]
}

export interface ReadModule {
  order: number
  plan: PlannedModule
  state: ModuleState
  lessons: ReadLesson[]
  /** the Feynman block (teach Mandy), between the lessons and the checkpoint */
  feynman: Feynman | null
  hasFeynmanFile: boolean
  checkpoint: Checkpoint | null
  /** the file exists (valid or not) */
  hasCheckpointFile: boolean
  /** all problems in the module files, `file: message` */
  problems: string[]
}

export interface ReadCourse {
  /** the slug, which is the folder name */
  id: string
  title: string
  brief: ReadBrief
  /** brief.json exists and passed the schema */
  validBrief: boolean
  dossier: Dossier | null
  syllabus: Syllabus | null
  modules: ReadModule[]
  /** the problems of ALL files, `file: message` */
  problems: string[]
  /** the same problems, grouped by file (path relative to the course folder) */
  problemsByFile: Record<string, string[]>
  /** the newest file in the folder */
  updatedAt: Date
  /** the folder exists but the syllabus does not yet (the AI is researching) */
  underConstruction: boolean
}

// ── schemas of the files only the app knows ──────────────────────────────────

/** The brief file: only topic, scope and level are required; the rest is optional and free. */
const readBriefSchema = briefSchema
  .partial()
  .extend({
    topic: z.string().trim().min(2).max(200),
    scope: z.string().trim().min(2).max(400),
    level: z.enum(LEVELS),
    // the same default as the strict schema: a course without `language` is in English
    language: languageSchema.catch(DEFAULT_LANGUAGE).default(DEFAULT_LANGUAGE),
  })
  .loose()

const readyVideoSchema = z.object({
  playlist: z.string(),
  subtitles: z.string(),
  durationMs: z.number().nonnegative(),
  pauses: z.array(z.object({ itemId: z.string(), atMs: z.number(), backToMs: z.number() })),
  simulatedVoice: z.boolean(),
  /* written by `course:video`: the app shows the engine and warns when the script changed after the render */
  voiceEngine: z.string().optional(),
  generatedAt: z.string().optional(),
  scriptHash: z.string().optional(),
})

// ── ids and names ────────────────────────────────────────────────────────────

const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/
const LESSON_ID = /^m(\d{1,2})-a(\d{1,2})$/

export const validSlug = (slug: string): boolean => SLUG.test(slug)
export const lessonId = (module: number, order: number): string => `m${module}-a${order}`

export function readLessonId(id: string): { module: number; order: number } | null {
  const m = LESSON_ID.exec(id)
  if (!m) return null
  const module = Number(m[1])
  const order = Number(m[2])
  return module >= 1 && order >= 1 ? { module, order } : null
}

const courseFolder = (slug: string) => path.join(config.coursesFolder, slug)
const lessonFile = (module: number, order: number) => `module-${module}/lesson-${order}.json`

export function videoFolder(slug: string, module: number, order: number): string {
  return path.join(courseFolder(slug), `module-${module}`, `lesson-${order}.video`)
}

/** A file's type from its name (path relative to the course folder) — for the "creating the course" event. */
export function fileType(relative: string): CourseEvent['type'] {
  const p = relative.split(path.sep).join('/')
  if (p === 'brief.json') return 'brief'
  if (p === 'dossier.json') return 'dossier'
  if (p === 'syllabus.json') return 'syllabus'
  if (/^module-\d+\/checkpoint\.json$/.test(p)) return 'checkpoint'
  if (/^module-\d+\/feynman\.json$/.test(p)) return 'feynman'
  if (/^module-\d+\/lesson-\d+\.video(\.json|\/.*)$/.test(p)) return 'video'
  if (/^module-\d+\/lesson-\d+\.json$/.test(p)) return 'lesson'
  return 'other'
}

// ── reading ──────────────────────────────────────────────────────────────────

export function listSlugs(): string[] {
  if (!existsSync(config.coursesFolder)) return []
  return readdirSync(config.coursesFolder, { withFileTypes: true })
    .filter((e) => e.isDirectory() && validSlug(e.name))
    .map((e) => e.name)
    .sort()
}

type Reading<T> = { ok: true; value: T } | { ok: false; exists: boolean; problems: string[] }

/** Reads and validates a JSON. `exists: false` = the file is not there (yet); `exists: true` = it is, but broken. */
function readJson<T>(slug: string, file: string, schema: z.ZodType<T>): Reading<T> {
  const filePath = path.join(courseFolder(slug), file)
  if (!existsSync(filePath)) return { ok: false, exists: false, problems: [] }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (e) {
    return { ok: false, exists: true, problems: [`Invalid JSON (${e instanceof Error ? e.message : e})`] }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      exists: true,
      problems: parsed.error.issues.slice(0, 15).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`),
    }
  }
  return { ok: true, value: parsed.data }
}

/** Walks the course folder (modules and video folders) and returns the signature and the newest mtime. */
function scan(slug: string): { signature: string; newest: number } | null {
  const root = courseFolder(slug)
  if (!existsSync(root)) return null
  const parts: string[] = []
  let newest = 0
  const visit = (dir: string, depth: number) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (depth < 3) visit(filePath, depth + 1)
      } else {
        const st = statSync(filePath)
        parts.push(`${path.relative(root, filePath)}:${st.mtimeMs}:${st.size}`)
        newest = Math.max(newest, st.mtimeMs)
      }
    }
  }
  visit(root, 0)
  if (!newest) newest = statSync(root).mtimeMs
  return { signature: parts.sort().join('|'), newest }
}

const cache = new Map<string, { signature: string; course: ReadCourse }>()

export function invalidateCache(slug?: string): void {
  if (slug) cache.delete(slug)
  else cache.clear()
}

export function readCourse(slug: string): ReadCourse | null {
  if (!validSlug(slug)) return null
  const v = scan(slug)
  if (!v) {
    cache.delete(slug)
    return null
  }
  const stored = cache.get(slug)
  if (stored && stored.signature === v.signature) return stored.course
  const course = assemble(slug, new Date(v.newest))
  cache.set(slug, { signature: v.signature, course })
  return course
}

function assemble(slug: string, updatedAt: Date): ReadCourse {
  const byFile: Record<string, string[]> = {}
  const record = (file: string, list: string[]) => {
    if (list.length) byFile[file] = [...(byFile[file] ?? []), ...list]
  }

  // brief
  const readBrief = readJson(slug, 'brief.json', readBriefSchema)
  if (!readBrief.ok) record('brief.json', readBrief.exists ? readBrief.problems : ['the file does not exist'])
  const brief: ReadBrief = readBrief.ok
    ? readBrief.value
    : { topic: slug.replace(/-/g, ' '), scope: '', level: 'basic', language: DEFAULT_LANGUAGE }

  // dossier
  const readDossier = readJson(slug, 'dossier.json', dossierSchema)
  if (!readDossier.ok) record('dossier.json', readDossier.problems)
  const dossier = readDossier.ok ? readDossier.value : null
  if (dossier) {
    const noLink = dossier.references.filter((r) => !r.url).map((r) => r.title)
    if (noLink.length)
      record('dossier.json', [
        `references without a link (the student needs to reach the source): ${noLink.join('; ')}`,
      ])
  }

  // syllabus
  const readSyllabus = readJson(slug, 'syllabus.json', syllabusSchema)
  if (!readSyllabus.ok) record('syllabus.json', readSyllabus.problems)
  const syllabus = readSyllabus.ok ? readSyllabus.value : null
  if (syllabus) record('syllabus.json', checkSyllabus(syllabus))

  // modules
  const modules: ReadModule[] = (syllabus?.modules ?? []).map((plan, i) => readModule(slug, i + 1, plan, record))

  const problems = Object.entries(byFile).flatMap(([file, list]) => list.map((p) => `${file}: ${p}`))
  return {
    id: slug,
    title: syllabus?.title ?? brief.topic,
    brief,
    validBrief: readBrief.ok,
    dossier,
    syllabus,
    modules,
    problems,
    problemsByFile: byFile,
    updatedAt,
    underConstruction: !syllabus,
  }
}

function readModule(
  slug: string,
  n: number,
  plan: PlannedModule,
  record: (file: string, list: string[]) => void,
): ReadModule {
  const moduleProblems: string[] = []
  const score = (file: string, list: string[]) => {
    record(file, list)
    for (const p of list) moduleProblems.push(`${file}: ${p}`)
  }

  const lessons: ReadLesson[] = plan.lessons.map((planned, j) => {
    const order = j + 1
    const file = lessonFile(n, order)
    let content: ReadContent | null = null
    let problems: string[] = []
    let exists = false

    if (planned.type === 'text') {
      const l = readJson(slug, file, textLessonSchema)
      exists = l.ok || l.exists
      if (l.ok) {
        content = l.value
        problems = checkItems(l.value.sections.map((s) => s.question))
      } else problems = l.problems
    } else if (planned.type === 'exercises') {
      const l = readJson(slug, file, exercisesLessonSchema)
      exists = l.ok || l.exists
      if (l.ok) {
        content = l.value
        problems = checkItems(l.value.items)
      } else problems = l.problems
    } else {
      const l = readJson(slug, file, scriptSchema)
      exists = l.ok || l.exists
      if (l.ok) {
        content = l.value
        problems = checkScript(l.value)
      } else problems = l.problems
    }
    if (problems.length) {
      score(file, problems)
      content = null
    }

    const video = content && planned.type === 'video' ? readVideo(slug, n, order) : null
    const state: LessonState = problems.length ? 'with_errors' : exists ? 'ready' : 'planned'
    return { id: lessonId(n, order), module: n, order, plan: planned, state, file, content, video, problems }
  })

  const fyFile = `module-${n}/feynman.json`
  const fy = readJson(slug, fyFile, feynmanSchema)
  let feynman: Feynman | null = null
  let feynmanProblems: string[] = []
  if (fy.ok) {
    feynmanProblems = checkFeynman(fy.value, new Set(plan.skills.map((h) => h.id)))
    if (!feynmanProblems.length) feynman = fy.value
  } else feynmanProblems = fy.problems
  if (feynmanProblems.length) score(fyFile, feynmanProblems)
  const hasFeynmanFile = fy.ok || fy.exists

  const cpFile = `module-${n}/checkpoint.json`
  const cp = readJson(slug, cpFile, checkpointSchema)
  let checkpoint: Checkpoint | null = null
  let checkpointProblems: string[] = []
  if (cp.ok) {
    checkpointProblems = checkItems(cp.value.items)
    if (!checkpointProblems.length) checkpoint = cp.value
  } else checkpointProblems = cp.problems
  if (checkpointProblems.length) score(cpFile, checkpointProblems)
  const hasCheckpointFile = cp.ok || cp.exists

  const allReady = lessons.every((a) => a.state === 'ready') && feynman !== null && checkpoint !== null
  const anyError =
    lessons.some((a) => a.state === 'with_errors') || feynmanProblems.length > 0 || checkpointProblems.length > 0
  const anyFile = lessons.some((a) => a.state !== 'planned') || hasFeynmanFile || hasCheckpointFile
  const state: ModuleState = anyError ? 'with_errors' : allReady ? 'ready' : anyFile ? 'partial' : 'planned'

  return {
    order: n,
    plan,
    state,
    lessons,
    feynman,
    hasFeynmanFile,
    checkpoint,
    hasCheckpointFile,
    problems: moduleProblems,
  }
}

/** The video only counts if `.video.json` is valid AND the playlist is in the folder (the render may have stopped midway). */
function readVideo(slug: string, module: number, order: number): ReadyVideo | null {
  const l = readJson(slug, `module-${module}/lesson-${order}.video.json`, readyVideoSchema)
  if (!l.ok) return null
  if (!existsSync(path.join(videoFolder(slug, module, order), 'index.m3u8'))) return null
  return l.value
}

// ── queries ──────────────────────────────────────────────────────────────────

export const find = {
  module: (course: ReadCourse, order: number): ReadModule | undefined => course.modules.find((m) => m.order === order),
  lesson(course: ReadCourse, id: string): ReadLesson | undefined {
    const ref = readLessonId(id)
    if (!ref) return undefined
    return course.modules.find((m) => m.order === ref.module)?.lessons.find((a) => a.order === ref.order)
  },
}

/** The gradable items of a ready lesson; video questions are items like any other. */
export function lessonItems(lesson: ReadLesson): Item[] {
  const c = lesson.content
  if (!c) return []
  if (lesson.plan.type === 'text') return (c as TextLesson).sections.map((s) => s.question)
  if (lesson.plan.type === 'exercises') return (c as ExercisesLesson).items
  return (c as Script).scenes.flatMap((scene) => (scene.type === 'question' ? [scene.item] : []))
}

// ── the AI's next step ───────────────────────────────────────────────────────

export interface AiStep {
  /** relative to the course folder */
  file: string
  description: string
  /** the module the step belongs to (for the request text); null for root files */
  module: number | null
  /** true = fix a file that exists; false = write a missing one */
  correction: boolean
}

/**
 * What the AI should do now: first FIX the first file with an error; otherwise write what is missing, in the order
 * brief → dossier → syllabus → (per module) lessons in order → Feynman → checkpoint. Null = the course is complete.
 */
export function nextStep(course: ReadCourse): AiStep | null {
  const error = firstError(course)
  if (error) return error

  if (!course.validBrief) return missing('brief.json', 'the course brief (topic, scope and level)', null)
  if (!course.dossier) return missing('dossier.json', 'the research dossier', null)
  if (!course.syllabus) return missing('syllabus.json', 'the syllabus with all modules', null)

  for (const m of course.modules) {
    if (m.state === 'ready') continue
    const lesson = m.lessons.find((a) => a.state === 'planned')
    if (lesson) {
      return missing(
        lesson.file,
        `lesson ${lesson.order} of module ${m.order} (${lesson.plan.type}): "${lesson.plan.title}"`,
        m.order,
      )
    }
    if (!m.hasFeynmanFile)
      return missing(`module-${m.order}/feynman.json`, `the Feynman block of module ${m.order}`, m.order)
    if (!m.hasCheckpointFile)
      return missing(`module-${m.order}/checkpoint.json`, `the checkpoint of module ${m.order}`, m.order)
  }
  return null
}

function missing(file: string, description: string, module: number | null): AiStep {
  return { file, description: `Write ${description}.`, module, correction: false }
}

function firstError(course: ReadCourse): AiStep | null {
  // the natural file order, so the most "upstream" error comes first
  const order = [
    'brief.json',
    'dossier.json',
    'syllabus.json',
    ...course.modules.flatMap((m) => [
      ...m.lessons.map((a) => a.file),
      `module-${m.order}/feynman.json`,
      `module-${m.order}/checkpoint.json`,
    ]),
  ]
  for (const file of order) {
    const list = course.problemsByFile[file]
    if (!list?.length) continue
    const module = /^module-(\d+)\//.exec(file)
    return {
      file,
      description: `Fix ${file}: ${list[0]}`,
      module: module ? Number(module[1]) : null,
      correction: true,
    }
  }
  return null
}
