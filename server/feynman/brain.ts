/**
 * Ana's brain: an open model running on Ollama, on the person's machine (`http://127.0.0.1:11434`). The answer comes
 * as JSON with a schema (Ollama's `format` feature), checked by zod. Without Ollama, without a model, or if the model
 * fails midway, Ana falls back to script mode — the lesson does not break.
 */

import { z } from 'zod'
import {
  brainEvaluationSchema,
  anaReplySchema,
  type BrainEvaluation,
  type Feynman,
  type AnaEngine,
  type AnaReply,
  type Turn,
} from '../../shared/feynman.js'
import {
  studentUtterances,
  evaluationInstruction,
  anaInstruction,
  conversationMessages,
  speechesLabel,
} from './context.js'
import type { Language } from '../../shared/languages.js'
import { scriptEvaluation, scriptTurn } from './script.js'

/** The models Ana prefers, in order (the first installed one wins). `FEYNMAN_MODEL` overrides them. */
export const PREFERRED_MODELS = ['qwen3:8b', 'qwen3:4b', 'llama3.1:8b', 'gemma3:4b'] as const

/** The Ollama address: `OLLAMA_HOST` (the same variable Ollama uses), with `http://` and no trailing slash. */
export function ollamaUrl(value: string | undefined = process.env.OLLAMA_HOST): string {
  let v = (value ?? '').trim() || '127.0.0.1:11434'
  if (!/^https?:\/\//.test(v)) v = `http://${v}`
  return v.replace(/\/+$/, '').replace('//0.0.0.0', '//127.0.0.1')
}

const stripTag = (name: string) => name.replace(/:latest$/, '')

/** Which installed model to use. An explicit request that is not installed = none (with a warning on screen). */
export function chooseModel(
  installedNames: readonly string[],
  request: string | undefined = process.env.FEYNMAN_MODEL,
): string | null {
  const names = new Set(installedNames)
  const lookup = (m: string) => installedNames.find((i) => i === m || stripTag(i) === stripTag(m)) ?? null
  if (request?.trim()) return lookup(request.trim())
  for (const m of PREFERRED_MODELS) if (lookup(m)) return lookup(m)
  // no preferred one: the first that is not an embedding model (those cannot chat)
  return [...names].find((n) => !/embed|bge|minilm/i.test(n)) ?? null
}

/** Models that "think out loud": we ask them not to think (the answer must be fast and only the JSON). */
const thinksFirst = (model: string) => /^(qwen3|deepseek-r1|magistral|gpt-oss)/i.test(model)

export interface OllamaState {
  ok: boolean
  models: string[]
  model: string | null
}

let stateCache: { at: number; value: OllamaState } | null = null

export async function ollamaState(): Promise<OllamaState> {
  if (stateCache && Date.now() - stateCache.at < 15_000) return stateCache.value
  let value: OllamaState
  try {
    const r = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(2500) })
    const j = (await r.json()) as { models?: Array<{ name?: string }> }
    const models = (j.models ?? []).flatMap((m) => (m.name ? [m.name] : []))
    value = { ok: r.ok, models, model: r.ok ? chooseModel(models) : null }
  } catch {
    value = { ok: false, models: [], model: null }
  }
  stateCache = { at: Date.now(), value }
  return value
}

export const forgetOllamaState = () => {
  stateCache = null
}

export async function chatWithOllama<T>(
  model: string,
  messages: Array<{ role: string; content: string }>,
  schema: z.ZodType<T>,
): Promise<T> {
  const body = {
    model: model,
    messages: messages,
    stream: false,
    format: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }),
    keep_alive: '15m',
    options: { temperature: 0.4, num_ctx: 8192 },
    ...(thinksFirst(model) ? { think: false } : {}),
  }
  const r = await fetch(`${ollamaUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })
  const j = (await r.json().catch(() => null)) as { message?: { content?: string }; error?: string } | null
  if (!r.ok || !j?.message?.content) throw new Error(j?.error ?? `Ollama answered ${r.status}.`)
  // some models still emit a <think>…</think> block before the JSON
  const content = j.message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return schema.parse(JSON.parse(content))
}

/** Strips from spoken text what the voice would read badly (markdown, LaTeX, emojis). */
export function toSpeech(text: string): string {
  return text
    .replace(/\$+([^$]*)\$+/g, '$1')
    .replace(/[*_#`>]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function anaReply(
  f: Feynman,
  lessons: string,
  history: readonly Turn[],
  coveredIds: readonly string[],
  language: Language,
): Promise<{ answer: AnaReply; engine: AnaEngine }> {
  const { model } = await ollamaState()
  if (model) {
    try {
      const messages = conversationMessages(anaInstruction(f, lessons, coveredIds, language), history)
      const r = await chatWithOllama(model, messages, anaReplySchema)
      const validIds = new Set(f.keyPoints.map((p) => p.id))
      return {
        answer: {
          ...r,
          answer: toSpeech(r.answer),
          coveredPoints: r.coveredPoints.filter((id) => validIds.has(id)),
        },
        engine: 'ollama',
      }
    } catch (e) {
      console.warn(`[feynman] Ollama failed, going on in script mode: ${e instanceof Error ? e.message : e}`)
      forgetOllamaState()
    }
  }
  return { answer: scriptTurn(f, history, coveredIds, language), engine: 'script' }
}

export async function anaEvaluation(
  f: Feynman,
  lessons: string,
  history: readonly Turn[],
  language: Language,
): Promise<{ evaluation: BrainEvaluation; engine: AnaEngine }> {
  const { model } = await ollamaState()
  if (model) {
    try {
      const messages = [
        { role: 'system', content: evaluationInstruction(f, lessons, language) },
        { role: 'user', content: `${speechesLabel(language)}\n${studentUtterances(history)}` },
      ]
      return { evaluation: await chatWithOllama(model, messages, brainEvaluationSchema), engine: 'ollama' }
    } catch (e) {
      console.warn(
        `[feynman] Ollama failed on the evaluation, using script mode: ${e instanceof Error ? e.message : e}`,
      )
      forgetOllamaState()
    }
  }
  return { evaluation: scriptEvaluation(f, history, language), engine: 'script' }
}
