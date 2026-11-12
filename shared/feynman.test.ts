import { describe, expect, it } from 'vitest'
import {
  checkFeynman,
  speechHasCue,
  feynmanSchema,
  normalizeSpeech,
  feynmanScore,
  anaReplySchema,
  type Feynman,
} from './feynman.js'

export const TEST_FEYNMAN: Feynman = {
  topic: 'A luz como onda e como partícula',
  request: 'Explique para um amigo por que a luz às vezes parece onda e às vezes parece partícula.',
  opening: 'Oi! Eu nunca entendi esse negócio da luz. Me explica do começo?',
  keyPoints: [
    {
      id: 'interferencia',
      idea: 'A interferência mostra que a luz se comporta como onda.',
      cues: ['interferencia', 'fenda dupla', 'franjas'],
      question: 'Que experimento mostra que a luz é onda?',
    },
    {
      id: 'fotons',
      idea: 'A luz troca energia em pacotes, os fótons.',
      cues: ['foton', 'fotons', 'pacotes', 'quantum'],
      question: 'Como a luz entrega energia?',
    },
    {
      id: 'energia-frequencia',
      idea: 'A energia do fóton cresce com a frequência: E = h vezes f.',
      cues: ['frequencia', 'h vezes', 'constante de planck'],
      question: 'Do que depende a energia de um fóton?',
    },
  ],
  commonMistakes: [{ error: 'Luz mais forte tem fótons mais energéticos.', correction: 'Mais forte = mais fótons.' }],
  questions: ['E se a luz fosse só onda?', 'Por que a luz vermelha não arranca elétrons?'],
  skills: ['m1-dualidade'],
}

describe('the feynman.json file', () => {
  it('the example passes the schema and the rules', () => {
    expect(feynmanSchema.safeParse(TEST_FEYNMAN).success).toBe(true)
    expect(checkFeynman(TEST_FEYNMAN, new Set(['m1-dualidade']))).toEqual([])
  })

  it('rejects fewer than 3 points, repeated ids, repeated cues, an unknown skill and LaTeX in the opening', () => {
    expect(feynmanSchema.safeParse({ ...TEST_FEYNMAN, keyPoints: TEST_FEYNMAN.keyPoints.slice(0, 2) }).success).toBe(
      false,
    )
    const [a, b, c] = TEST_FEYNMAN.keyPoints
    const bad: Feynman = {
      ...TEST_FEYNMAN,
      opening: 'Me explica $E=hf$?',
      keyPoints: [a!, { ...b!, id: a!.id }, { ...c!, cues: ['Frequência', 'frequencia'] }],
    }
    const problems = checkFeynman(bad, new Set(['outra']))
    expect(problems.join(' ')).toMatch(/same id/)
    expect(problems.join(' ')).toMatch(/repeats cues/)
    expect(problems.join(' ')).toMatch(/skill "m1-dualidade"/)
    expect(problems.join(' ')).toMatch(/LaTeX/)
  })
})

describe('the speech', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalizeSpeech('  Fótons, E = h × f!  ')).toBe('fotons e h f')
  })

  it('finds the cue only as a whole word', () => {
    const speech = normalizeSpeech('A luz chega em pacotes chamados fótons')
    expect(speechHasCue(speech, 'fótons')).toBe(true)
    expect(speechHasCue(speech, 'pacotes chamados')).toBe(true)
    expect(speechHasCue(speech, 'foto')).toBe(false)
  })
})

describe('the score', () => {
  it('comes from the points and the mistakes', () => {
    expect(feynmanScore(['covered', 'covered', 'covered'], 0)).toBe(100)
    expect(feynmanScore(['covered', 'partial', 'missing', 'covered'], 0)).toBe(63)
    expect(feynmanScore(['covered', 'covered'], 1)).toBe(90)
    expect(feynmanScore(['covered'], 9)).toBe(70)
    expect(feynmanScore([], 0)).toBe(0)
  })

  it('the brain reply has a fixed shape', () => {
    expect(
      anaReplySchema.safeParse({ answer: 'Legal! E a frequência?', coveredPoints: ['fotons'], correction: null })
        .success,
    ).toBe(true)
    expect(anaReplySchema.safeParse({ answer: '', coveredPoints: [], correction: null }).success).toBe(false)
  })
})
