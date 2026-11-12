/**
 * The video lesson contract: the script as typed scenes. The app (`web/`) and the renderer (`render/`) read from here.
 *
 * **The AI does not write drawing code.** It picks the TYPE of each scene and fills in the data; our own components do
 * the drawing. That is why the formula always comes out right (it is KaTeX, not an invented image), the look is always
 * the app's, and no text coming from the model ever becomes executed code.
 *
 * The script has questions: the `question` scene is where the video PAUSES and the student answers (an item from the
 * same family as the exercises, graded by the server, worth XP). A wrong answer sends the player back to the start of
 * the previous scene.
 */

import { z } from 'zod'
import { itemSchema, hasExactCorrection } from './course.js'

const text = (max: number) => z.string().trim().min(1).max(max)

/** What the voice says in this scene. No LaTeX formulas: the voice reads words ("x squared"), the screen shows the formula. */
const narration = text(1400)

export const sceneSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('title'),
      title: text(120),
      subtitle: z.string().trim().max(160).default(''),
      narration,
    })
    .strict(),
  z
    .object({
      type: z.literal('bullets'),
      title: text(120),
      /** they appear one at a time, following the speech */
      bullets: z.array(text(140)).min(2).max(5),
      narration,
    })
    .strict(),
  z
    .object({
      type: z.literal('equation'),
      /** LaTeX for KaTeX; one equation per line, built up in sequence */
      lines: z.array(text(200)).min(1).max(5),
      captions: z.string().trim().max(200).default(''),
      narration,
    })
    .strict(),
  z
    .object({
      type: z.literal('code'),
      lang: z.enum(['cpp', 'c', 'python', 'javascript', 'pseudocode']),
      code: text(1600),
      /** the lines highlighted in sequence (1 = first) */
      highlights: z.array(z.number().int().min(1).max(60)).max(8).default([]),
      narration,
    })
    .strict(),
  z
    .object({
      type: z.literal('diagram'),
      title: z.string().trim().max(120).default(''),
      /** boxes and arrows: enough for flows, hierarchies and sequences */
      nodes: z
        .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,30}$/), label: text(60) }).strict())
        .min(2)
        .max(8),
      links: z
        .array(z.object({ from: z.string(), to: z.string(), label: z.string().trim().max(40).default('') }).strict())
        .max(10),
      narration,
    })
    .strict(),
  z
    .object({
      type: z.literal('chart'),
      title: z.string().trim().max(120).default(''),
      /** the function of x (`x^2`, `sin(x)`, `2*x+1`), evaluated by the closed interpreter `compileFunction` — never by eval */
      func: text(120),
      xMin: z.number().finite(),
      xMax: z.number().finite(),
      label: z.string().trim().max(80).default(''),
      narration,
    })
    .strict(),
  z
    .object({
      type: z.literal('question'),
      /** exactly graded items only: the video does not wait for AI grading */
      item: itemSchema,
      narration,
    })
    .strict(),
])
export type Scene = z.infer<typeof sceneSchema>
export type SceneType = Scene['type']

export const scriptSchema = z
  .object({
    title: text(160),
    scenes: z.array(sceneSchema).min(4).max(16),
  })
  .strict()
export type Script = z.infer<typeof scriptSchema>

/** ~150 words per minute, the pace of a good spoken explanation. */
export const WORDS_PER_MINUTE = 150

export const narrationSeconds = (narration: string): number =>
  (narration.trim().split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE) * 60

export const estimatedDuration = (script: Script): number =>
  script.scenes.reduce((total, c) => total + narrationSeconds(c.narration) + 1.2, 0)

/** The video lesson length: 4 to 7 minutes, never more than 9. */
export const DURATION = { min: 3.5 * 60, max: 9 * 60 }

/** The rules the schema does not express. Empty = script accepted. */
export function checkScript(script: Script): string[] {
  const problems: string[] = []
  const questions = script.scenes.filter((c) => c.type === 'question')
  if (questions.length < 1 || questions.length > 3) problems.push('The video needs 1 to 3 question scenes.')
  if (script.scenes[0]?.type === 'question') problems.push('The video cannot start with a question.')
  for (const p of questions) {
    if (p.type === 'question' && !hasExactCorrection(p.item)) {
      problems.push(
        `The question "${p.item.id}" must be exactly graded (multiple_choice, true_false, numeric, short_answer or ordering).`,
      )
    }
  }
  const ids = questions.map((p) => (p.type === 'question' ? p.item.id : ''))
  if (new Set(ids).size !== ids.length) problems.push('Two questions with the same id.')
  for (const c of script.scenes) {
    if (c.type === 'diagram') {
      const nodes = new Set(c.nodes.map((n) => n.id))
      for (const l of c.links) {
        if (!nodes.has(l.from) || !nodes.has(l.to))
          problems.push(`The diagram links "${l.from}" to "${l.to}", and one of them does not exist.`)
      }
    }
    if (c.type === 'chart' && c.xMax <= c.xMin) problems.push('In the chart, xMax must be greater than xMin.')
    if (c.type === 'chart' && !compileFunction(c.func)) {
      problems.push(
        `The chart function "${c.func}" uses something other than numbers, x, + − * / ^, parentheses and sin/cos/tan/exp/log/sqrt/abs.`,
      )
    }
    if (/\\[a-zA-Z]+|\$/.test(c.narration))
      problems.push('The narration has LaTeX; the voice needs words ("x squared").')
  }
  const seconds = estimatedDuration(script)
  if (seconds < DURATION.min)
    problems.push(`The video would be ${Math.round(seconds / 60)} minute(s) long; it needs 4 to 7.`)
  if (seconds > DURATION.max)
    problems.push(`The video would be ${Math.round(seconds / 60)} minutes long; the maximum is 9.`)
  return problems
}

// ── the finished video ───────────────────────────────────────────────────────────

/** What is stored with the lesson after rendering: where the video is and where it pauses. */
export interface ReadyVideo {
  /** the HLS playlist, relative to the lesson's storage */
  playlist: string
  subtitles: string
  durationMs: number
  /** where the player pauses: the end of the scene before the question, and the start of that scene (to go back on a wrong answer) */
  pauses: Array<{ itemId: string; atMs: number; backToMs: number }>
  /** the voice was simulated (silence): the panel warns */
  simulatedVoice: boolean
  /** the engine that spoke (`kokoro` or `silence`) */
  voiceEngine?: string
  /** when the video was generated (ISO 8601) */
  generatedAt?: string
  /** the hash of the script used: if it changes later, the video is out of date */
  scriptHash?: string
}

/**
 * The chart interpreter: numbers, `x`, `pi`, `e`, the operators `+ - * / ^`, parentheses and the listed functions — and
 * nothing else. No `eval` and no `new Function`: the expression comes from the model, and the model read web pages.
 * Returns a function of x, or null if the expression contains anything else.
 */
export const CHART_FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
}

type AstNode =
  | { t: 'num'; v: number }
  | { t: 'x' }
  | { t: 'op'; op: string; a: AstNode; b: AstNode }
  | { t: 'neg'; a: AstNode }
  | { t: 'fn'; f: string; a: AstNode }

export function compileFunction(expression: string): ((x: number) => number) | null {
  const tokens = expression
    .replace(/Math\./g, '')
    .replace(/\*\*/g, '^')
    .match(/\d+\.?\d*|[a-z]+|[+\-*/^()]|\S/gi)
  if (!tokens || tokens.length > 200) return null
  let i = 0
  const peek = () => tokens[i]
  const take = () => tokens[i++]

  function primary(): AstNode {
    const f = take()
    if (f === undefined) throw new Error('end')
    if (/^\d/.test(f)) return { t: 'num', v: Number(f) }
    if (f === 'x') return { t: 'x' }
    if (f === 'pi' || f === 'PI') return { t: 'num', v: Math.PI }
    if (f === 'e') return { t: 'num', v: Math.E }
    if (f === '-') return { t: 'neg', a: power() }
    if (f === '(') {
      const inner = sum()
      if (take() !== ')') throw new Error('parenthesis')
      return inner
    }
    if (CHART_FUNCTIONS[f]) {
      if (take() !== '(') throw new Error('function')
      const arg = sum()
      if (take() !== ')') throw new Error('parenthesis')
      return { t: 'fn', f, a: arg }
    }
    throw new Error(`token ${f}`)
  }
  function power(): AstNode {
    const base = primary()
    if (peek() === '^') {
      take()
      return { t: 'op', op: '^', a: base, b: power() }
    }
    return base
  }
  function product(): AstNode {
    let a = power()
    while (peek() === '*' || peek() === '/') a = { t: 'op', op: take()!, a, b: power() }
    return a
  }
  function sum(): AstNode {
    let a = product()
    while (peek() === '+' || peek() === '-') a = { t: 'op', op: take()!, a, b: product() }
    return a
  }

  let tree: AstNode
  try {
    tree = sum()
    if (i !== tokens.length) return null
  } catch {
    return null
  }

  function evaluate(n: AstNode, x: number): number {
    switch (n.t) {
      case 'num':
        return n.v
      case 'x':
        return x
      case 'neg':
        return -evaluate(n.a, x)
      case 'fn':
        return CHART_FUNCTIONS[n.f](evaluate(n.a, x))
      case 'op': {
        const a = evaluate(n.a, x)
        const b = evaluate(n.b, x)
        if (n.op === '+') return a + b
        if (n.op === '-') return a - b
        if (n.op === '*') return a * b
        if (n.op === '/') return a / b
        return Math.pow(a, b)
      }
    }
  }
  return (x: number) => evaluate(tree, x)
}
