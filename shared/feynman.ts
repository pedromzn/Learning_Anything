/**
 * The Feynman block: the student explains the module's central topic out loud to Mandy (an AI with a voice), and she
 * asks, nudges and corrects. Here live the file the course AI writes (`module-N/feynman.json`), the teaching rules,
 * the shapes of the conversation and the evaluation, and the passing score. See `docs/FEYNMAN.md`.
 */

import { z } from 'zod'
import type { Reward } from './gamification.js'
import type { Language } from './languages.js'

const text = (max: number) => z.string().trim().min(1).max(max)
const shortId = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{2,40}$/)

// ── the file written by the course AI ───────────────────────────────────────

export const keyPointSchema = z
  .object({
    id: shortId,
    /** what a good explanation must say, in one sentence */
    idea: text(300),
    /** words and phrases that show the idea in the student's speech (script mode checks for them) */
    cues: z.array(text(60)).min(2).max(10),
    /** the question Mandy asks if the point does not come up */
    question: text(300),
  })
  .strict()
export type KeyPoint = z.infer<typeof keyPointSchema>

export const feynmanSchema = z
  .object({
    /** the central topic the student will explain */
    topic: text(200),
    /** the instruction the student reads before starting */
    request: text(600),
    /** Mandy's first line (short, inviting the student to start) */
    opening: text(400),
    keyPoints: z.array(keyPointSchema).min(3).max(7),
    commonMistakes: z
      .array(z.object({ error: text(300), correction: text(400) }).strict())
      .min(1)
      .max(6),
    /** follow-up questions: "what if…", "why…", "give me an example…" */
    questions: z.array(text(300)).min(2).max(6),
    /** the ids of the module skills this block practices */
    skills: z.array(z.string().trim().max(60)).min(1).max(8),
  })
  .strict()
export type Feynman = z.infer<typeof feynmanSchema>

/** The rules the schema alone does not catch. Empty = accepted. */
export function checkFeynman(f: Feynman, moduleSkills?: ReadonlySet<string>): string[] {
  const problems: string[] = []
  const ids = f.keyPoints.map((p) => p.id)
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (duplicates.length) problems.push(`Key points with the same id: ${[...new Set(duplicates)].join(', ')}.`)
  for (const p of f.keyPoints) {
    const cues = p.cues.map(normalizeSpeech)
    if (new Set(cues).size !== cues.length) problems.push(`The point "${p.id}" repeats cues.`)
  }
  if (moduleSkills) {
    for (const h of f.skills) {
      if (!moduleSkills.has(h))
        problems.push(`The Feynman block names the skill "${h}", which the module does not declare.`)
    }
  }
  if (/\$/.test(f.opening)) problems.push('The opening is spoken: write it without LaTeX (no $).')
  return problems
}

// ── the speech ───────────────────────────────────────────────────────────────────

/** Lowercase, no accents, no punctuation, single spaces: to compare the speech with the cues. */
export function normalizeSpeech(t: string): string {
  return t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The cue appears in the speech as whole words (not as part of another word). */
export function speechHasCue(normalizedSpeech: string, cue: string): boolean {
  const s = normalizeSpeech(cue)
  return s.length > 0 && ` ${normalizedSpeech} `.includes(` ${s} `)
}

// ── the conversation ───────────────────────────────────────────────────────────────

export const MAX_TURNS = 40

export const turnSchema = z
  .object({
    who: z.enum(['student', 'mandy']),
    text: z.string().trim().min(1).max(4000),
  })
  .strict()
export type Turn = z.infer<typeof turnSchema>

export const conversationRequestSchema = z
  .object({
    history: z.array(turnSchema).min(1).max(MAX_TURNS),
    /** the points already covered (the server only adds to them) */
    coveredIds: z.array(shortId).max(7).default([]),
  })
  .strict()
export type ConversationRequest = z.infer<typeof conversationRequestSchema>

/** What the brain returns for each student turn. */
export const mandyReplySchema = z
  .object({
    /** what Mandy says now: short, one or two sentences, ending in a question when it makes sense */
    answer: z.string().trim().min(1).max(600),
    /** the ids of the key points THIS student turn covered */
    coveredPoints: z.array(z.string()).max(7),
    /** if the student said something wrong: the mistake in one sentence (the correction is already in the answer) */
    correction: z.string().trim().max(400).nullable(),
  })
  .strict()
export type MandyReply = z.infer<typeof mandyReplySchema>

export type MandyEngine = 'ollama' | 'script'

/** `POST …/feynman/conversation` */
export interface MandyTurn {
  answer: string
  /** all points covered so far (the earlier ones + this turn's) */
  coveredIds: string[]
  correction: string | null
  engine: MandyEngine
}

// ── the evaluation ──────────────────────────────────────────────────────────────

/** With 70 or more, the block is passed. */
export const FEYNMAN_MIN_SCORE = 70

export const brainEvaluationSchema = z
  .object({
    points: z
      .array(
        z
          .object({
            id: z.string(),
            status: z.enum(['covered', 'partial', 'missing']),
            comment: z.string().trim().max(400),
          })
          .strict(),
      )
      .max(7),
    /** the mistakes that showed up in the explanation and were not fixed by the student */
    errors: z.array(z.string().trim().max(400)).max(6),
    /** a short piece of advice for next time */
    advice: z.string().trim().min(1).max(600),
  })
  .strict()
export type BrainEvaluation = z.infer<typeof brainEvaluationSchema>

export type PointStatus = BrainEvaluation['points'][number]['status']

/**
 * The score comes from the points, not from the model's hunch: covered is worth 1, partial 0.5, missing 0; each
 * mistake left uncorrected takes off 10 (at most 30). So the same explanation gets the same score.
 */
export function feynmanScore(statuses: PointStatus[], errors: number): number {
  if (!statuses.length) return 0
  const sum = statuses.reduce((t, s) => t + (s === 'covered' ? 1 : s === 'partial' ? 0.5 : 0), 0)
  const base = (100 * sum) / statuses.length
  return Math.max(0, Math.round(base - Math.min(30, 10 * Math.max(0, errors))))
}

/** `POST …/feynman/evaluate` */
export interface FeynmanEvaluation {
  score: number
  passed: boolean
  points: Array<{ id: string; idea: string; status: PointStatus; comment: string }>
  errors: string[]
  advice: string
  engine: MandyEngine
  /** the XP earned (0 if failed or if already passed before) */
  reward: Reward
}

// ── what the screen receives ──────────────────────────────────────────────────────

/** The engines the machine has right now. */
export interface MandyState {
  /** local Whisper is installed (without it, there is no way to listen) */
  listener: boolean
  /** the Kokoro voice is installed (without it, Mandy answers in writing only) */
  voice: boolean
  /** Ollama answered and there is a usable model */
  ollama: boolean
  /** the model that will hold the conversation, if any */
  model: string | null
  engine: MandyEngine
}

/** `GET /api/courses/:id/modules/:order/feynman`: the block WITHOUT the answer key (ideas appear only once covered). */
export interface StudentFeynman {
  courseId: string
  /** the course language: Mandy listens, thinks and speaks in it */
  language: Language
  courseTitle: string
  module: number
  moduleTitle: string
  topic: string
  request: string
  opening: string
  points: number
  alreadyPassed: boolean
  bestScore: number | null
  mandy: MandyState
}
