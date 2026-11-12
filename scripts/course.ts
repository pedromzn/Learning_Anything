/**
 * The course CLI, made for the AI (and the person) to read: `status`, `validate`, `video` and `schemas`.
 * Output in English; exit code 1 when there is a problem.
 *
 *   npm run course:status -- <slug>
 *   npm run course:validate -- <slug> [--module N]     |     npm run course:validate -- --all
 *   npm run course:video -- <slug> [--module N] [--lesson M] [--force]
 *   npm run course:schemas
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { config } from '../server/config.js'
import {
  listSlugs,
  readCourse,
  nextStep,
  validSlug,
  videoFolder,
  type ReadLesson,
  type ReadCourse,
} from '../server/courses/repository.js'
import { scriptHash, produceVideo } from '../server/video/production.js'
import { chosenEngine } from '../server/video/voice.js'
import { feynmanSchema } from '../shared/feynman.js'
import {
  exercisesLessonSchema,
  textLessonSchema,
  checkpointSchema,
  dossierSchema,
  syllabusSchema,
  briefSchema,
} from '../shared/course.js'
import { estimatedDuration, scriptSchema, type Script, type ReadyVideo } from '../shared/video.js'

const MAX_PROBLEMS_PER_FILE = 20

// ── arguments ───────────────────────────────────────────────────────────────

export interface Args {
  positional: string[]
  module: number | null
  lesson: number | null
  force: boolean
  all: boolean
}

export function readArgs(argv: string[]): Args {
  const r: Args = { positional: [], module: null, lesson: null, force: false, all: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--module' || a === '--lesson') {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1) throw new Error(`${a} needs a whole number from 1 up.`)
      if (a === '--module') r.module = n
      else r.lesson = n
    } else if (a === '--force') r.force = true
    else if (a === '--all') r.all = true
    else if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`)
    else r.positional.push(a)
  }
  return r
}

// ── reading helpers ────────────────────────────────────────────────────────

const minutes = (seconds: number) =>
  `${Math.floor(seconds / 60)}min${String(Math.round(seconds % 60)).padStart(2, '0')}s`

function requireCourse(slug: string | undefined): ReadCourse {
  if (!slug) throw new Error(`Missing the course slug. Existing courses: ${listSlugs().join(', ') || '(none)'}.`)
  if (!validSlug(slug)) throw new Error(`Invalid slug: "${slug}" (use lowercase letters, numbers and hyphens).`)
  const course = readCourse(slug)
  if (!course)
    throw new Error(`The course "${slug}" does not exist in courses/. Existing: ${listSlugs().join(', ') || '(none)'}.`)
  return course
}

/** The `lesson-M.video.json` written by the render, read raw (it has fields the repository does not pass on). */
export function readReadyVideo(slug: string, module: number, order: number): ReadyVideo | null {
  const file = path.join(config.coursesFolder, slug, `module-${module}`, `lesson-${order}.video.json`)
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ReadyVideo
  } catch {
    return null
  }
}

export type VideoStatus = 'no-video' | 'up_to_date' | 'outdated'

export function videoStatus(script: Script, ready: ReadyVideo | null, folderExists: boolean): VideoStatus {
  if (!ready || !folderExists) return 'no-video'
  // old video, no hash: no way to tell; treat it as up to date (use --force to redo it)
  if (!ready.scriptHash) return 'up_to_date'
  return ready.scriptHash === scriptHash(script) ? 'up_to_date' : 'outdated'
}

const VIDEO_LABEL: Record<VideoStatus, string> = {
  'no-video': 'video NOT rendered',
  up_to_date: 'video rendered',
  outdated: 'video OUT OF DATE (the script changed after the render)',
}

function lessonStatus(course: ReadCourse, a: ReadLesson): VideoStatus | null {
  if (a.plan.type !== 'video' || !a.content) return null
  const ready = readReadyVideo(course.id, a.module, a.order)
  return videoStatus(a.content as Script, ready, existsSync(videoFolder(course.id, a.module, a.order)))
}

// ── status ───────────────────────────────────────────────────────────────────

export function status(slug: string | undefined): number {
  const course = requireCourse(slug)
  const lines: string[] = []
  const marker = (ok: boolean) => (ok ? '[ok]      ' : '[missing] ')
  lines.push(`Course: ${course.id} — ${course.title}`)
  lines.push(`Brief: ${course.brief.topic} (${course.brief.level})`, '')
  lines.push(`${marker(course.validBrief)}brief.json`)
  lines.push(`${marker(Boolean(course.dossier))}dossier.json`)
  lines.push(
    `${marker(Boolean(course.syllabus))}syllabus.json${course.syllabus ? ` (${course.syllabus.modules.length} modules)` : ''}`,
  )

  for (const m of course.modules) {
    lines.push('', `Module ${m.order}: ${m.plan.title} [${m.state}]`)
    for (const a of m.lessons) {
      const state = a.state === 'ready' ? 'ready' : a.state === 'with_errors' ? 'HAS ERRORS' : 'to write'
      const video = lessonStatus(course, a)
      lines.push(
        `  lesson ${a.order} (${a.plan.type}) ${state}: ${a.plan.title}${video ? `; ${VIDEO_LABEL[video]}` : ''}`,
      )
    }
    const fy = m.feynman ? 'ready' : m.hasFeynmanFile ? 'HAS ERRORS' : 'to write'
    lines.push(`  feynman ${fy}`)
    const cp = m.checkpoint ? 'ready' : m.hasCheckpointFile ? 'HAS ERRORS' : 'to write'
    lines.push(`  checkpoint ${cp}`)
  }

  const withProblem = Object.entries(course.problemsByFile)
  if (withProblem.length) {
    lines.push(
      '',
      `Problems in ${withProblem.length} file(s); run "npm run course:validate -- ${course.id}" for the list.`,
    )
  }

  const step = nextStep(course)
  lines.push('')
  if (step) {
    lines.push(`NEXT FILE: courses/${course.id}/${step.file}`, step.description)
  } else {
    const pendingItems = course.modules.flatMap((m) =>
      m.lessons.filter((a) => lessonStatus(course, a) === 'no-video' || lessonStatus(course, a) === 'outdated'),
    )
    lines.push('All course files are written and valid.')
    if (pendingItems.length)
      lines.push(`${pendingItems.length} video(s) still to render: npm run course:video -- ${course.id}`)
  }
  console.log(lines.join('\n'))
  return withProblem.length ? 1 : 0
}

// ── validate ──────────────────────────────────────────────────────────────────

export function problemReport(course: ReadCourse, module: number | null): { text: string; problems: number } {
  const lines: string[] = []
  let total = 0
  const files = Object.entries(course.problemsByFile).filter(([file]) => {
    if (module === null) return true
    const m = /^module-(\d+)\//.exec(file)
    return m ? Number(m[1]) === module : false
  })
  for (const [file, list] of files) {
    total += list.length
    lines.push(`courses/${course.id}/${file} (${list.length} problem(s))`)
    for (const p of list.slice(0, MAX_PROBLEMS_PER_FILE)) lines.push(`  - ${p}`)
    if (list.length > MAX_PROBLEMS_PER_FILE) lines.push(`  ... and ${list.length - MAX_PROBLEMS_PER_FILE} more`)
  }
  return { text: lines.join('\n'), problems: total }
}

function validateOne(slug: string, module: number | null): number {
  const course = requireCourse(slug)
  const { text, problems } = problemReport(course, module)
  const output: string[] = [`Course ${slug}${module ? `, module ${module}` : ''}`]
  for (const m of course.modules) {
    if (module !== null && m.order !== module) continue
    for (const a of m.lessons) {
      if (a.plan.type === 'video' && a.content) {
        const s = estimatedDuration(a.content as Script)
        output.push(`  module-${m.order}/lesson-${a.order}.json: video of ${minutes(s)} estimated`)
      }
    }
  }
  if (problems) {
    output.push(text, `${problems} problem(s) found.`)
    console.log(output.join('\n'))
    return 1
  }
  output.push('All valid.')
  console.log(output.join('\n'))
  return 0
}

export function validate(args: Args): number {
  if (args.all) {
    const slugs = listSlugs()
    if (!slugs.length) {
      console.log('No courses in courses/.')
      return 0
    }
    let failures = 0
    for (const s of slugs) {
      failures += validateOne(s, null)
      console.log('')
    }
    console.log(failures ? `${failures} course(s) with problems.` : `${slugs.length} valid course(s).`)
    return failures ? 1 : 0
  }
  return validateOne(args.positional[0] ?? requireCourse(undefined).id, args.module)
}

// ── video ────────────────────────────────────────────────────────────────────

async function video(args: Args): Promise<number> {
  const course = requireCourse(args.positional[0])
  const candidates = course.modules
    .filter((m) => args.module === null || m.order === args.module)
    .flatMap((m) => m.lessons)
    .filter((a) => a.plan.type === 'video' && (args.lesson === null || a.order === args.lesson))

  if (!candidates.length) {
    console.log('No video lesson found with that filter.')
    return 1
  }

  const engine = await chosenEngine(course.brief.language)
  console.log(`Voice: ${engine.engine}${engine.voice ? ` (${engine.voice})` : ''}; ${engine.detail}`)
  if (engine.simulated)
    console.log('Warning: with no voice, the videos come out silent. Run "npm run voice:install" to get narration.')

  let failures = 0
  let finished = 0
  for (const a of candidates) {
    const name = `module ${a.module}, lesson ${a.order} (${a.plan.title})`
    if (!a.content) {
      console.log(`Skipped ${name}: the script is missing or invalid. Run course:validate.`)
      failures++
      continue
    }
    const script = a.content as Script
    const status = lessonStatus(course, a)
    if (status === 'up_to_date' && !args.force) {
      console.log(`Skipped ${name}: it already has a video for this script (use --force to redo it).`)
      continue
    }
    console.log(`Producing ${name}...`)
    const start = Date.now()
    try {
      const ready = await produceVideo(
        { slug: course.id, module: a.module, lesson: a.order, script, language: course.brief.language },
        { onProgress: (m) => console.log(`  ${m}`) },
      )
      finished++
      console.log(
        `  Done in ${Math.round((Date.now() - start) / 1000)}s: ${minutes(ready.durationMs / 1000)}, ` +
          `${ready.pauses.length} pause(s), voice ${ready.voiceEngine}${ready.simulatedVoice ? ' (silent)' : ''}.`,
      )
    } catch (error) {
      failures++
      console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log(`\n${finished} video(s) produced${failures ? `, ${failures} failed` : ''}.`)
  return failures ? 1 : 0
}

// ── schemas ─────────────────────────────────────────────────────────────────

export const SCHEMAS: Record<string, z.ZodType> = {
  brief: briefSchema,
  dossier: dossierSchema,
  syllabus: syllabusSchema,
  'text-lesson': textLessonSchema,
  'exercises-lesson': exercisesLessonSchema,
  script: scriptSchema,
  feynman: feynmanSchema,
  checkpoint: checkpointSchema,
}

async function schemas(): Promise<number> {
  const folder = path.join(config.root, 'docs', 'schemas')
  await mkdir(folder, { recursive: true })
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
    await writeFile(path.join(folder, `${name}.schema.json`), `${JSON.stringify(json, null, 2)}\n`)
    console.log(`docs/schemas/${name}.schema.json`)
  }
  return 0
}

// ── main ────────────────────────────────────────────────────────────────

const HELP = `Usage: npm run course:<command> -- [arguments]
  status <slug>                                     what exists, what is missing and the next file
  validate <slug> [--module N] | --all              schemas and teaching rules
  video <slug> [--module N] [--lesson M] [--force]  local voice, render and HLS for the video lessons
  schemas                                           writes docs/schemas/*.schema.json`

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)
  const args = readArgs(rest)
  switch (command) {
    case 'status':
      return status(args.positional[0])
    case 'validate':
      return validate(args)
    case 'video':
      return video(args)
    case 'schemas':
      return schemas()
    default:
      console.log(HELP)
      return command ? 1 : 0
  }
}

// only runs when called as a script (the tests import the pure functions without triggering anything)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    },
  )
}
