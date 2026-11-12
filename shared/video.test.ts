/** The script: length, questions, and the chart interpreter that runs nothing but math. */
import { describe, expect, it } from 'vitest'
import { compileFunction, checkScript, estimatedDuration, type Script } from './video.js'

describe('the chart interpreter', () => {
  it('computes the listed expressions', () => {
    expect(compileFunction('x^2')!(3)).toBe(9)
    expect(compileFunction('2*x + 1')!(2)).toBe(5)
    expect(compileFunction('Math.sin(x)')!(0)).toBe(0)
    expect(compileFunction('-x^2')!(2)).toBe(-4)
    expect(compileFunction('sqrt(abs(x)) / (1 + pi)')!(4)).toBeCloseTo(2 / (1 + Math.PI))
  })

  it('rejects what is not math', () => {
    expect(compileFunction('alert(1)')).toBeNull()
    expect(compileFunction('x; fetch("/api")')).toBeNull()
    expect(compileFunction('function Object() { [native code] }')).toBeNull()
    expect(compileFunction('(x')).toBeNull()
    expect(compileFunction('')).toBeNull()
  })
})

describe('the script', () => {
  const speech = (words: number) => Array.from({ length: words }, () => 'palavra').join(' ')
  const question = {
    type: 'question' as const,
    item: {
      id: 'v1',
      type: 'true_false' as const,
      skill: 'h',
      bloom: 'understand' as const,
      difficulty: 1,
      prompt: 'e',
      hints: [],
      solution: 's',
      correct: true,
    },
    narration: speech(20),
  }
  const script = (wordsPerScene: number): Script => ({
    title: 't',
    scenes: [
      { type: 'title', title: 't', subtitle: '', narration: speech(wordsPerScene) },
      { type: 'bullets', title: 't', bullets: ['a', 'b'], narration: speech(wordsPerScene) },
      question,
      { type: 'equation', lines: ['x^2'], captions: '', narration: speech(wordsPerScene) },
    ],
  })

  it('accepts a video of about 5 minutes with one question', () => {
    const r = script(240)
    expect(estimatedDuration(r) / 60).toBeGreaterThan(4)
    expect(checkScript(r)).toEqual([])
  })

  it('rejects a video that is too short, has no question, or has LaTeX in the narration', () => {
    expect(checkScript(script(20)).some((p) => p.includes('4 to 7'))).toBe(true)
    const noQuestion = script(240)
    noQuestion.scenes = noQuestion.scenes.filter((c) => c.type !== 'question')
    expect(checkScript(noQuestion).some((p) => p.includes('question'))).toBe(true)
    const withLatex = script(240)
    withLatex.scenes[3].narration = `${speech(200)} \\frac{a}{b}`
    expect(checkScript(withLatex).some((p) => p.includes('LaTeX'))).toBe(true)
  })
})
