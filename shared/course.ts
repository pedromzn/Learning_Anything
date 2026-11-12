/**
 * The course contract: the brief, the research dossier, the syllabus, the lessons and the items. The user's AI writes
 * the files in `courses/<slug>/`; the app and `npm run course:validate` check each one against these schemas.
 *
 * Everything the AI writes goes through here before it reaches the student: the AI proposes, the schema decides.
 * The size limits are not cosmetic — they are the ceiling of what fits on a lesson screen, and a text that runs away in
 * a loop is cut here.
 */

import { z } from 'zod'
import { DEFAULT_LANGUAGE, languageSchema } from './languages.js'

// ── levels, Bloom and types ────────────────────────────────────────────────────

/** The level asked for in the brief. `mastery` is "complete mastery". */
export const LEVELS = ['basic', 'intermediate', 'advanced', 'mastery'] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_LABEL: Record<Level, string> = {
  basic: 'Just the basics',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  mastery: 'Full mastery',
}

/** The revised Bloom taxonomy (Anderson and Krathwohl, 2001), from the simplest to the most demanding. */
export const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const
export type Bloom = (typeof BLOOM)[number]

/** The Bloom ceiling each level aims for — a "just the basics" course does not ask for a creation project. */
export const LEVEL_BLOOM: Record<Level, Bloom> = {
  basic: 'understand',
  intermediate: 'analyze',
  advanced: 'evaluate',
  mastery: 'create',
}

export const LESSON_TYPES = ['video', 'text', 'exercises'] as const
export type LessonType = (typeof LESSON_TYPES)[number]

export const FORMAT_PREFERENCES = ['balanced', 'more_video', 'more_text', 'more_practice'] as const

// ── the brief ─────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().min(1).max(max)

export const briefSchema = z
  .object({
    topic: text(200),
    /** the scope that makes the course finishable: "physics" → "classical mechanics" */
    scope: text(400),
    goal: text(600),
    level: z.enum(LEVELS),
    priorKnowledge: z.string().trim().max(1000).default(''),
    hoursPerWeek: z.number().int().min(1).max(40),
    /** in weeks; missing = no deadline */
    deadlineWeeks: z.number().int().min(1).max(104).nullable().default(null),
    format: z.enum(FORMAT_PREFERENCES).default('balanced'),
    context: z.string().trim().max(1000).default(''),
    hasComputer: z.boolean().default(true),
    /** the research always reads English; this decides whether the RECOMMENDED reading may be in English */
    readsEnglish: z.boolean().default(false),
    /** the language the course is written, narrated and taught in (`shared/languages.ts`) */
    language: languageSchema.default(DEFAULT_LANGUAGE),
  })
  .strict()
export type Brief = z.infer<typeof briefSchema>

/**
 * The key that says "this is the same course": normalized topic and scope + level. Two briefs with the same key get
 * the same ready course. Nothing personal goes in here — goal and context change the examples, not the syllabus.
 */
export function reuseKey(brief: Pick<Brief, 'topic' | 'scope' | 'level'>): string {
  const normalize = (s: string) =>
    s
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9+#]+/g, ' ')
      .trim()
  return `${normalize(brief.topic)}|${normalize(brief.scope)}|${brief.level}`
}

// ── the bibliography and the sources ──────────────────────────────────────

/**
 * The licenses that allow STORING and redistributing the content. Anything else is read, cited and never stored —
 * including CC BY-NC-SA, which is MIT OpenCourseWare's.
 */
export const STORABLE_LICENSES = ['cc0', 'cc-by', 'cc-by-sa', 'public-domain'] as const
export const LICENSES = [...STORABLE_LICENSES, 'cc-by-nc', 'cc-by-nc-sa', 'proprietary', 'unknown'] as const
export type License = (typeof LICENSES)[number]

export const canSave = (license: License): boolean => (STORABLE_LICENSES as readonly string[]).includes(license)

export const SOURCE_TYPES = ['course', 'book', 'article', 'documentation', 'site', 'video'] as const

export const referenceSchema = z
  .object({
    title: text(300),
    author: z.string().trim().max(200).default(''),
    institution: z.string().trim().max(200).default(''),
    type: z.enum(SOURCE_TYPES),
    url: z.url().max(800).nullable().default(null),
    license: z.enum(LICENSES).default('unknown'),
    /** why this source is here — what it teaches better than the others */
    reason: z.string().trim().max(400).default(''),
  })
  .strict()
export type Reference = z.infer<typeof referenceSchema>

/**
 * The Researcher's dossier: how the good references teach the subject. It is STRUCTURE and concepts, with no text
 * copied from a source — the Architect designs the syllabus from it.
 */
export const dossierSchema = z
  .object({
    summary: text(2000),
    bullets: z
      .array(
        z
          .object({
            title: text(160),
            description: text(600),
            prerequisites: z.array(text(160)).max(6).default([]),
          })
          .strict(),
      )
      .min(4)
      .max(40),
    commonMistakes: z.array(text(300)).max(12).default([]),
    possibleProjects: z.array(text(400)).max(10).default([]),
    references: z.array(referenceSchema).min(3).max(30),
  })
  .strict()
export type Dossier = z.infer<typeof dossierSchema>

// ── the syllabus ────────────────────────────────────────────────────────

export const skillSchema = z
  .object({
    /** short and stable within the course: `m2-derivative-chain-rule` */
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{3,60}$/),
    name: text(160),
    bloom: z.enum(BLOOM),
  })
  .strict()
export type Skill = z.infer<typeof skillSchema>

export const plannedLessonSchema = z
  .object({
    type: z.enum(LESSON_TYPES),
    title: text(160),
    goal: text(400),
    skills: z.array(z.string()).min(1).max(6),
  })
  .strict()
export type PlannedLesson = z.infer<typeof plannedLessonSchema>

export const projectSchema = z
  .object({
    title: text(160),
    prompt: text(3000),
    rubric: z.array(text(300)).min(2).max(8),
  })
  .strict()

export const plannedModuleSchema = z
  .object({
    title: text(160),
    goal: text(500),
    skills: z.array(skillSchema).min(1).max(12),
    lessons: z.array(plannedLessonSchema).min(3).max(9),
    project: projectSchema,
  })
  .strict()
export type PlannedModule = z.infer<typeof plannedModuleSchema>

export const syllabusSchema = z
  .object({
    title: text(160),
    summary: text(1200),
    /** "by the end you can…" — measurable */
    results: z.array(text(300)).min(3).max(10),
    prerequisites: z.array(text(300)).max(8),
    modules: z.array(plannedModuleSchema).min(2).max(16),
    bibliography: z.array(referenceSchema).min(3).max(30),
  })
  .strict()
export type Syllabus = z.infer<typeof syllabusSchema>

/**
 * The teaching rules the schema alone does not express. Returns what is wrong, so the Architect gets it back and fixes
 * it — empty means the syllabus is accepted.
 */
export function checkSyllabus(syllabus: Syllabus): string[] {
  const problems: string[] = []

  syllabus.modules.forEach((module, i) => {
    const n = i + 1
    const types = module.lessons.map((a) => a.type)
    const exercises = types.filter((t) => t === 'exercises').length
    if (exercises === 0) problems.push(`Module ${n} has no exercises lesson.`)
    if (exercises / types.length < 0.3) problems.push(`Module ${n} has less than 30% exercises lessons.`)

    const moduleIds = new Set(module.skills.map((h) => h.id))
    for (const lesson of module.lessons) {
      for (const h of lesson.skills) {
        if (!moduleIds.has(h))
          problems.push(`The lesson "${lesson.title}" names the skill "${h}", which the module does not declare.`)
      }
    }
    const used = new Set(module.lessons.flatMap((a) => a.skills))
    for (const h of module.skills) {
      if (!used.has(h.id)) problems.push(`The skill "${h.id}" of module ${n} is not practiced in any lesson.`)
    }
  })

  const all = syllabus.modules.flatMap((m) => m.skills.map((h) => h.id))
  const duplicates = all.filter((id, i) => all.indexOf(id) !== i)
  if (duplicates.length)
    problems.push(`Skills with the same id in different modules: ${[...new Set(duplicates)].join(', ')}.`)

  return problems
}

// ── the items ────────────────────────────────────────────────────────

const common = {
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  skill: z.string().trim().max(60),
  bloom: z.enum(BLOOM),
  difficulty: z.number().int().min(1).max(3),
  prompt: text(2500),
  /** up to 3, from the lightest to the one that almost gives it away — never the answer */
  hints: z.array(text(500)).max(3).default([]),
  /** the worked solution, shown after the attempt */
  solution: text(4000),
}

export const itemSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...common,
      type: z.literal('multiple_choice'),
      choices: z
        .array(z.object({ text: text(600), explanation: text(800) }).strict())
        .min(3)
        .max(6),
      correct: z.number().int().min(0).max(5),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('true_false'),
      correct: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('numeric'),
      answer: z.number().finite(),
      /** absolute; 0 = exact */
      tolerance: z.number().min(0).default(0),
      unit: z.string().trim().max(30).default(''),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('short_answer'),
      /** the accepted forms; the comparison ignores case, accents, spaces and final punctuation */
      accepted: z.array(text(200)).min(1).max(12),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('ordering'),
      /** already in the RIGHT ORDER; the panel shuffles them */
      steps: z.array(text(300)).min(3).max(8),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('open'),
      rubric: z.array(text(300)).min(2).max(8),
    })
    .strict(),
])
export type Item = z.infer<typeof itemSchema>
export type ItemType = Item['type']

/** The types the server grades on its own, without AI — the only ones that count in a checkpoint. */
export const EXACT_CORRECTION_TYPES: ItemType[] = [
  'multiple_choice',
  'true_false',
  'numeric',
  'short_answer',
  'ordering',
]
export const hasExactCorrection = (item: Item): boolean => EXACT_CORRECTION_TYPES.includes(item.type)

/** The consistency the schema does not catch: the correct choice exists, no id repeats. */
export function checkItems(items: Item[]): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) problems.push(`The id "${item.id}" is repeated.`)
    ids.add(item.id)
    if (item.type === 'multiple_choice' && item.correct >= item.choices.length) {
      problems.push(`The item "${item.id}" points to a correct choice that does not exist.`)
    }
    if (item.type === 'ordering' && new Set(item.steps).size !== item.steps.length) {
      problems.push(`The item "${item.id}" has repeated steps, so the right order is ambiguous.`)
    }
  }
  /*
   * multiple choice is NOT shuffled (the video draws the choices in script order): if the right one always sits in the
   * same position, the student learns the pattern, not the subject. That happened in the first Russian course
   * (2026-11-06): 28 out of 28 in the first choice
   */
  const positions = items.flatMap((i) => (i.type === 'multiple_choice' ? [i.correct] : []))
  if (positions.length >= 4 && new Set(positions).size === 1) {
    problems.push(`The correct choice is always in position ${positions[0] + 1}: vary the position across items.`)
  }
  return problems
}

// ── the answers and exact grading ──────────────────────────────────────────

export const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('multiple_choice'), choice: z.number().int().min(0).max(5) }).strict(),
  z.object({ type: z.literal('true_false'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('numeric'), value: z.string().trim().min(1).max(40) }).strict(),
  z.object({ type: z.literal('short_answer'), text: z.string().trim().min(1).max(300) }).strict(),
  z.object({ type: z.literal('ordering'), order: z.array(z.number().int().min(0).max(7)).min(3).max(8) }).strict(),
  z.object({ type: z.literal('open'), text: z.string().trim().min(1).max(6000) }).strict(),
])
export type Answer = z.infer<typeof answerSchema>

export interface Correction {
  correct: boolean
  /** what to explain: the chosen choice's explanation, or the solution */
  explanation: string
}

/** "3,14", "3.14", "1.000,5" and "-2" become numbers; anything else is null. */
export function readNumber(value: string): number | null {
  const clean = value.trim().replace(/\s/g, '')
  if (!/^-?[\d.,]+$/.test(clean)) return null
  const lastComma = clean.lastIndexOf(',')
  const lastPoint = clean.lastIndexOf('.')
  /* the decimal separator is the one that appears last; the other is the thousands separator */
  const decimal = lastComma > lastPoint ? ',' : '.'
  const thousandsSep = decimal === ',' ? '.' : ','
  const normal = clean.split(thousandsSep).join('').replace(decimal, '.')
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

export function normalizeAnswer(text: string): string {
  return text
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!;]+$/, '')
    .trim()
}

/**
 * Grades without AI. Returns null for what only the AI grades (`open`) and for an answer whose type differs from the
 * item's — the caller treats it as "could not grade", never as the student's mistake.
 *
 * `ordering` receives the order the student built as indices of the ORIGINAL steps (the panel shuffles and sends back
 * the pre-shuffle indices), so getting it right means the order is 0, 1, 2…
 */
export function gradeExact(item: Item, answer: Answer): Correction | null {
  if (item.type !== answer.type) return null

  switch (item.type) {
    case 'multiple_choice': {
      const r = answer as Extract<Answer, { type: 'multiple_choice' }>
      const chosen = item.choices[r.choice]
      if (!chosen) return null
      return { correct: r.choice === item.correct, explanation: chosen.explanation }
    }
    case 'true_false': {
      const r = answer as Extract<Answer, { type: 'true_false' }>
      return { correct: r.value === item.correct, explanation: item.solution }
    }
    case 'numeric': {
      const r = answer as Extract<Answer, { type: 'numeric' }>
      const value = readNumber(r.value)
      if (value === null) return { correct: false, explanation: 'The answer must be a number.' }
      /* the floating-point slack applies even with zero tolerance: 0.1 + 0.2 is not 0.3 in binary */
      const slack = Math.max(item.tolerance, Math.abs(item.answer) * 1e-9, 1e-12)
      return { correct: Math.abs(value - item.answer) <= slack, explanation: item.solution }
    }
    case 'short_answer': {
      const r = answer as Extract<Answer, { type: 'short_answer' }>
      const given = normalizeAnswer(r.text)
      return { correct: item.accepted.some((a) => normalizeAnswer(a) === given), explanation: item.solution }
    }
    case 'ordering': {
      const r = answer as Extract<Answer, { type: 'ordering' }>
      const complete = r.order.length === item.steps.length && new Set(r.order).size === item.steps.length
      return { correct: complete && r.order.every((index, position) => index === position), explanation: item.solution }
    }
    case 'open':
      return null
  }
}

// ── the generated lessons ─────────────────────────────────────────────────────────

/** The text lesson: short sections, each closed by a self-explanation question. */
export const textLessonSchema = z
  .object({
    introduction: text(1500),
    sections: z
      .array(
        z
          .object({
            title: text(160),
            /** Markdown with KaTeX (`$…$` and `$$…$$`) and code blocks */
            markdown: text(8000),
            question: itemSchema,
          })
          .strict(),
      )
      .min(2)
      .max(6),
    workedExample: z
      .object({
        prompt: text(2500),
        /** the steps, for "try before you look": the panel shows one at a time */
        steps: z.array(text(2000)).min(2).max(10),
      })
      .strict(),
    summary: z.array(text(300)).min(2).max(6),
  })
  .strict()
export type TextLesson = z.infer<typeof textLessonSchema>

/** The exercises lesson: 8 to 15 items, from guided to free, with 20–30% from earlier topics (interleaving). */
export const exercisesLessonSchema = z
  .object({
    guidance: text(800),
    items: z.array(itemSchema).min(8).max(15),
  })
  .strict()
export type ExercisesLesson = z.infer<typeof exercisesLessonSchema>

/** The module checkpoint: exact grading only, 80% to move on. */
export const CHECKPOINT_THRESHOLD = 0.8
export const checkpointSchema = z
  .object({
    items: z
      .array(itemSchema)
      .min(5)
      .max(8)
      .refine((items) => items.every(hasExactCorrection), 'The checkpoint only accepts exactly graded items.'),
  })
  .strict()
export type Checkpoint = z.infer<typeof checkpointSchema>

// ── the item as the student sees it (no answer key) ────────────────────────────────────

/**
 * What goes to the browser BEFORE the answer: no correct choice, no accepted forms, no solution, no per-choice
 * explanation and no hints (each hint is requested and counted). Sending the whole item would put the answer key one
 * DevTools away — and the checkpoint decides whether the student moves on.
 *
 * `ordering` goes shuffled, and the student sends back the TEXTS in the order they built: the server compares them with
 * the right order. Sending the original indices along would give the answer away.
 */
export interface StudentItem {
  id: string
  type: ItemType
  prompt: string
  difficulty: number
  bloom: Bloom
  totalHints: number
  choices?: string[]
  steps?: string[]
  unit?: string
  /** only for `open`: what will be assessed, so the student knows what is expected */
  rubric?: string[]
}

/** Deterministic shuffle by seed: reloading the page does not change the order of the steps. */
export function shuffle<T>(list: readonly T[], seed: string): T[] {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 16777619)
  }
  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const shuffled = [...list]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  /* shuffling 3 steps and landing on the right order would give the answer away: rotate by one to leave it */
  if (shuffled.length > 1 && shuffled.every((v, i) => v === list[i])) shuffled.push(shuffled.shift() as T)
  return shuffled
}

export function studentItem(item: Item, seed: string): StudentItem {
  const base: StudentItem = {
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    difficulty: item.difficulty,
    bloom: item.bloom,
    totalHints: item.hints.length,
  }
  if (item.type === 'multiple_choice') return { ...base, choices: item.choices.map((a) => a.text) }
  if (item.type === 'ordering') return { ...base, steps: shuffle(item.steps, `${seed}:${item.id}`) }
  if (item.type === 'numeric') return { ...base, unit: item.unit }
  if (item.type === 'open') return { ...base, rubric: item.rubric }
  return base
}

/** The answer as the browser sends it: same as `Answer`, except `ordering`, which comes as texts. */
export const studentAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('multiple_choice'), choice: z.number().int().min(0).max(5) }).strict(),
  z.object({ type: z.literal('true_false'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('numeric'), value: z.string().trim().min(1).max(40) }).strict(),
  z.object({ type: z.literal('short_answer'), text: z.string().trim().min(1).max(300) }).strict(),
  z.object({ type: z.literal('ordering'), texts: z.array(z.string().max(300)).min(3).max(8) }).strict(),
  z.object({ type: z.literal('open'), text: z.string().trim().min(1).max(6000) }).strict(),
])

/** Turns an `ordering` given as texts into indices of the original steps; an unknown text becomes -1 (and is wrong). */
export function studentAnswer(item: Item, raw: unknown): Answer | null {
  const parsed = studentAnswerSchema.safeParse(raw)
  if (!parsed.success) return null
  const r = parsed.data
  if (r.type !== 'ordering') return r
  if (item.type !== 'ordering') return null
  const order = r.texts.map((t) => item.steps.indexOf(t))
  if (order.some((i) => i < 0)) return { type: 'ordering', order: order.map((i) => (i < 0 ? 7 : i)) }
  return { type: 'ordering', order }
}

/** What comes back after the answer: now, yes, the explanation and the solution. */
export interface AttemptResult {
  /** null = only the AI grades it (open), and the grading comes later */
  correct: boolean | null
  explanation: string
  solution: string
  /** the position of the right choice, for the panel to mark */
  correctChoice?: number
  /** the right order for `ordering` */
  correctOrder?: string[]
  /** the right numeric answer, with the unit */
  rightAnswer?: string
}

export function resultOf(item: Item, correction: Correction | null): AttemptResult {
  const result: AttemptResult = {
    correct: correction?.correct ?? null,
    explanation: correction?.explanation ?? '',
    solution: item.solution,
  }
  if (item.type === 'multiple_choice') result.correctChoice = item.correct
  if (item.type === 'ordering') result.correctOrder = item.steps
  if (item.type === 'numeric')
    result.rightAnswer = `${item.answer.toLocaleString('pt-BR')}${item.unit ? ` ${item.unit}` : ''}`
  if (item.type === 'short_answer') result.rightAnswer = item.accepted[0]
  if (item.type === 'true_false') result.rightAnswer = item.correct ? 'true' : 'false'
  return result
}
