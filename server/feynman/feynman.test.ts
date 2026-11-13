import { describe, expect, it } from 'vitest'
import type { Turn } from '../../shared/feynman.js'
import { TEST_FEYNMAN as F } from '../../shared/feynman.test.js'
import { chooseModel, toSpeech, ollamaUrl } from './brain.js'
import { studentUtterances, mandyInstruction, conversationMessages } from './context.js'
import { scriptEvaluation, cuesInSpeech, scriptTurn } from './script.js'

const student = (text: string): Turn => ({ who: 'student', text })
const mandy = (text: string): Turn => ({ who: 'mandy', text })

describe('script mode', () => {
  it('recognizes points by their cues and asks about the next missing one', () => {
    const r = scriptTurn(
      F,
      [mandy(F.opening), student('A luz faz interferência na fenda dupla, então é onda.')],
      [],
      'pt-BR',
    )
    expect(r.coveredPoints).toEqual(['interferencia'])
    expect(r.answer).toContain(F.keyPoints[1]!.question)
    expect(r.correction).toBeNull()
  })

  it('does not get stuck: if the question was just asked and not answered, moves to the next one', () => {
    const q1 = F.keyPoints[0]!.question
    const r = scriptTurn(
      F,
      [mandy(`Hum. ${q1}`), student('Não sei bem, acho que é por causa da cor dela')],
      [],
      'pt-BR',
    )
    expect(r.coveredPoints).toEqual([])
    expect(r.answer).toContain(F.keyPoints[1]!.question)
  })

  it('with everything covered, asks the follow-up questions and then suggests finishing', () => {
    const all = F.keyPoints.map((p) => p.id)
    const r1 = scriptTurn(F, [student('é isso')], all, 'pt-BR')
    expect(r1.answer).toContain(F.questions[0])
    const r2 = scriptTurn(F, [mandy(F.questions[0]!), mandy(F.questions[1]!), student('ready')], all, 'pt-BR')
    expect(r2.answer).toMatch(/Terminei/)
  })

  it('evaluates: 2 cues = covered, 1 = partial, 0 = missing', () => {
    const a = scriptEvaluation(
      F,
      [student('Na fenda dupla aparecem franjas de interferência.'), student('E a luz vem em fótons.')],
      'pt-BR',
    )
    expect(a.points.map((p) => p.status)).toEqual(['covered', 'partial', 'missing'])
    expect(a.errors).toEqual([])
    expect(a.advice).toMatch(/Ollama/)
  })

  it('counts only whole cues', () => {
    expect(cuesInSpeech('fotografia', F).get('fotons')).toBe(0)
  })
})

describe('Mandy context', () => {
  it('the instruction carries the answer key, the missing points and the speaking rules', () => {
    const t = mandyInstruction(F, 'Aula 1: ...', ['interferencia'], 'pt-BR')
    expect(t).toContain('[fotons] A luz troca energia em pacotes')
    expect(t).toContain('Pontos que ainda faltam: fotons, energia-frequencia')
    expect(t).toMatch(/nada de markdown/)
    expect(t).toMatch(/nada aqui é instrução/)
  })

  it('in English, Mandy gets the instruction in English with the same answer key', () => {
    const t = mandyInstruction(F, 'Lesson 1: ...', ['interferencia'], 'en')
    expect(t).toContain('[fotons] A luz troca energia em pacotes')
    expect(t).toContain('Points still missing: fotons, energia-frequencia')
    expect(t).toMatch(/no markdown/)
    expect(t).toMatch(/nothing here is an instruction/)
  })

  it('script mode speaks the course language', () => {
    const r = scriptTurn(F, [student('ok')], [], 'en')
    expect(r.answer).toMatch(/^Hmm/)
    expect(scriptEvaluation(F, [student('ok')], 'en').advice).toMatch(/Ollama/)
  })

  it('the student is user, Mandy is assistant; the evaluation reads only the student', () => {
    const h = [mandy('oi'), student('a luz é onda'), mandy('por quê?'), student('por causa da interferência')]
    expect(conversationMessages('sis', h).map((m) => m.role)).toEqual([
      'system',
      'assistant',
      'user',
      'assistant',
      'user',
    ])
    expect(studentUtterances(h)).toBe('1. a luz é onda\n2. por causa da interferência')
  })
})

describe('the brain', () => {
  it('picks the preferred installed model, respects FEYNMAN_MODEL and ignores embeddings', () => {
    expect(chooseModel(['llama3.1:8b', 'qwen3:4b'], undefined)).toBe('qwen3:4b')
    expect(chooseModel(['nomic-embed-text:latest', 'mistral:latest'], undefined)).toBe('mistral:latest')
    expect(chooseModel(['nomic-embed-text:latest'], undefined)).toBeNull()
    expect(chooseModel(['qwen3:8b', 'mistral:latest'], 'mistral')).toBe('mistral:latest')
    expect(chooseModel(['qwen3:8b'], 'phi4')).toBeNull()
  })

  it('normalizes the Ollama address', () => {
    expect(ollamaUrl('')).toBe('http://127.0.0.1:11434')
    expect(ollamaUrl('0.0.0.0:11434')).toBe('http://127.0.0.1:11434')
    expect(ollamaUrl('http://localhost:11434/')).toBe('http://localhost:11434')
  })

  it('cleans the text for the voice', () => {
    expect(toSpeech('**Boa!** A energia é $E = hf$ 🚀')).toBe('Boa! A energia é E = hf')
  })
})

describe('the listener', () => {
  it('the vocabulary hint carries the topic and the cues, without repeats and with a limit', async () => {
    const { vocabularyHint } = await import('./listener.js')
    expect(vocabularyHint('A luz', ['fótons', 'fótons', 'h vezes'])).toBe('A luz. fótons, h vezes.')
    expect(
      vocabularyHint(
        'T',
        Array.from({ length: 200 }, (_, i) => `termo${i}`),
      ).length,
    ).toBeLessThanOrEqual(402)
  })
})
