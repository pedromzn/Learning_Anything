/**
 * Script mode: Mandy without AI, for whoever does not have Ollama. It checks the speech against the `cues` of each key
 * point, comments on what came up and asks the ready-made question of the next missing point; with everything covered,
 * it asks the follow-up questions. It does not catch content mistakes (that needs a real model) — and the evaluation
 * says so.
 */

import {
  speechHasCue,
  normalizeSpeech,
  type BrainEvaluation,
  type Feynman,
  type KeyPoint,
  type MandyReply,
  type Turn,
} from '../../shared/feynman.js'
import type { Language } from '../../shared/languages.js'

/** The ready-made script mode lines, in the course language. */
const PHRASES: Record<
  Language,
  {
    manyNew: string
    oneNew: string
    quick: string
    notClear: string
    anotherWay: (question: string) => string
    allCovered: string
    covered: string
    partial: string
    missing: string
    coveredAll: string
    review: (n: number) => string
    noAI: string
  }
> = {
  en: {
    manyNew: 'Nice, that cleared up quite a lot.',
    oneNew: 'Nice, I got that part.',
    quick: 'Hmm, that was really quick.',
    notClear: 'I see, but it’s still not clear to me.',
    anotherWay: (p) => `Try it another way: ${p}`,
    allCovered: 'You explained all the central points. Whenever you want, press Done to see your evaluation.',
    covered: 'It came up in your explanation.',
    partial: 'You touched on it, but you can develop it further.',
    missing: 'It did not come up in your explanation.',
    coveredAll: 'You went through all the central points.',
    review: (n) =>
      `Review the ${n === 1 ? 'point that was' : `${n} points that were`} incomplete in the module lessons.`,
    noAI: ' In script mode Mandy checks keywords and does not correct content mistakes; install Ollama for a real conversation.',
  },
  'pt-BR': {
    manyNew: 'Boa, isso esclareceu bastante coisa.',
    oneNew: 'Boa, entendi essa parte.',
    quick: 'Hum, foi bem rápido.',
    notClear: 'Entendi, mas ainda não ficou claro para mim.',
    anotherWay: (p) => `Tenta de outro jeito: ${p}`,
    allCovered: 'Você explicou todos os pontos centrais. Quando quiser, aperte Terminei para ver sua avaliação.',
    covered: 'Apareceu na sua explicação.',
    partial: 'Você tocou no assunto, mas dá para desenvolver mais.',
    missing: 'Não apareceu na sua explicação.',
    coveredAll: 'Você passou por todos os pontos centrais.',
    review: (n) =>
      `Reveja os ${n === 1 ? 'ponto que ficou' : `${n} pontos que ficaram`} incompletos nas aulas do módulo.`,
    noAI: ' No modo roteiro a Mandy confere palavras-chave e não corrige erros de conteúdo; instale o Ollama para uma conversa de verdade.',
  },
}

/** The comment for a point Mandy did not evaluate (so the route can complete the evaluation). */
export const missingComment = (language: Language): string => PHRASES[language].missing

/** How many distinct cues of each point appear in the text. */
export function cuesInSpeech(text: string, f: Feynman): Map<string, number> {
  const speech = normalizeSpeech(text)
  return new Map(f.keyPoints.map((p) => [p.id, p.cues.filter((s) => speechHasCue(speech, s)).length]))
}

const lastAnaSpeech = (history: readonly Turn[]): string =>
  [...history].reverse().find((t) => t.who === 'mandy')?.text ?? ''

export function scriptTurn(
  f: Feynman,
  history: readonly Turn[],
  coveredIds: readonly string[],
  language: Language,
): MandyReply {
  const phrases = PHRASES[language]
  const speech = [...history].reverse().find((t) => t.who === 'student')?.text ?? ''
  const cues = cuesInSpeech(speech, f)
  const newOnes = f.keyPoints.filter((p) => !coveredIds.includes(p.id) && (cues.get(p.id) ?? 0) > 0)
  const all = new Set([...coveredIds, ...newOnes.map((p) => p.id)])
  const remaining = f.keyPoints.filter((p) => !all.has(p.id))
  const previous = lastAnaSpeech(history)

  let beginning: string
  if (newOnes.length) beginning = newOnes.length > 1 ? phrases.manyNew : phrases.oneNew
  else if (normalizeSpeech(speech).split(' ').length < 4) beginning = phrases.quick
  else beginning = phrases.notClear

  let question: string
  const next: KeyPoint | undefined = remaining[0]
  if (next) {
    // if this point's question was just asked and not answered, try the next one (do not get stuck on one point)
    const repeated = previous.includes(next.question) && !newOnes.length
    question = repeated && remaining[1] ? remaining[1].question : next.question
    if (repeated && !remaining[1]) question = phrases.anotherWay(next.question)
  } else {
    const newOne = f.questions.find((p) => !history.some((t) => t.who === 'mandy' && t.text.includes(p)))
    question = newOne ?? phrases.allCovered
  }
  return { answer: `${beginning} ${question}`, coveredPoints: newOnes.map((p) => p.id), correction: null }
}

/** The evaluation without AI: two or more cues = covered; one = partial; none = missing. */
export function scriptEvaluation(f: Feynman, history: readonly Turn[], language: Language): BrainEvaluation {
  const phrases = PHRASES[language]
  const text = history
    .filter((t) => t.who === 'student')
    .map((t) => t.text)
    .join(' ')
  const cues = cuesInSpeech(text, f)
  const points = f.keyPoints.map((p) => {
    const n = cues.get(p.id) ?? 0
    const status = n >= 2 ? ('covered' as const) : n === 1 ? ('partial' as const) : ('missing' as const)
    const comment = status === 'covered' ? phrases.covered : status === 'partial' ? phrases.partial : phrases.missing
    return { id: p.id, status, comment }
  })
  const missing = points.filter((p) => p.status !== 'covered').length
  return {
    points,
    errors: [],
    advice: (missing === 0 ? phrases.coveredAll : phrases.review(missing)) + phrases.noAI,
  }
}
