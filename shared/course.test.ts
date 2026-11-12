/** Exact grading and the syllabus checks: what decides a score cannot be wrong. */
import { describe, expect, it } from 'vitest'
import {
  reuseKey,
  checkSyllabus,
  checkItems,
  studentItem,
  studentAnswer,
  gradeExact,
  readNumber,
  type Syllabus,
  type Item,
} from './course.js'

const base = { skill: 'h', bloom: 'apply' as const, difficulty: 1, prompt: 'e', hints: [], solution: 's' }

describe('readNumber', () => {
  it('reads comma and point as decimal, and the other as thousands', () => {
    expect(readNumber('3,14')).toBe(3.14)
    expect(readNumber('3.14')).toBe(3.14)
    expect(readNumber('1.000,5')).toBe(1000.5)
    expect(readNumber('1,000.5')).toBe(1000.5)
    expect(readNumber('-2')).toBe(-2)
    expect(readNumber(' 42 ')).toBe(42)
  })

  it('rejects what is not a number', () => {
    expect(readNumber('abc')).toBeNull()
    expect(readNumber('2x')).toBeNull()
    expect(readNumber('')).toBeNull()
  })
})

describe('gradeExact', () => {
  it('multiple choice returns the explanation of the chosen choice', () => {
    const item: Item = {
      ...base,
      id: 'a',
      type: 'multiple_choice',
      choices: [
        { text: '1', explanation: 'errada porque…' },
        { text: '2', explanation: 'certa porque…' },
        { text: '3', explanation: 'errada também' },
      ],
      correct: 1,
    }
    expect(gradeExact(item, { type: 'multiple_choice', choice: 1 })).toEqual({
      correct: true,
      explanation: 'certa porque…',
    })
    expect(gradeExact(item, { type: 'multiple_choice', choice: 0 })).toEqual({
      correct: false,
      explanation: 'errada porque…',
    })
    expect(gradeExact(item, { type: 'multiple_choice', choice: 5 })).toBeNull()
  })

  it('numeric respects the tolerance and the floating-point slack', () => {
    const exact: Item = { ...base, id: 'n', type: 'numeric', answer: 0.3, tolerance: 0, unit: '' }
    expect(gradeExact(exact, { type: 'numeric', value: String(0.1 + 0.2) })?.correct).toBe(true)
    expect(gradeExact(exact, { type: 'numeric', value: '0,3' })?.correct).toBe(true)
    expect(gradeExact(exact, { type: 'numeric', value: '0,31' })?.correct).toBe(false)
    const loose: Item = { ...exact, answer: 9.81, tolerance: 0.05 }
    expect(gradeExact(loose, { type: 'numeric', value: '9,8' })?.correct).toBe(true)
    expect(gradeExact(loose, { type: 'numeric', value: 'nove' })?.correct).toBe(false)
  })

  it('short answer ignores case, accents, spaces and the final period', () => {
    const item: Item = { ...base, id: 'c', type: 'short_answer', accepted: ['Aceleração'] }
    expect(gradeExact(item, { type: 'short_answer', text: '  aceleracao. ' })?.correct).toBe(true)
    expect(gradeExact(item, { type: 'short_answer', text: 'speed' })?.correct).toBe(false)
  })

  it('ordering requires the complete order with no repeats', () => {
    const item: Item = { ...base, id: 'o', type: 'ordering', steps: ['a', 'b', 'c'] }
    expect(gradeExact(item, { type: 'ordering', order: [0, 1, 2] })?.correct).toBe(true)
    expect(gradeExact(item, { type: 'ordering', order: [1, 0, 2] })?.correct).toBe(false)
    expect(gradeExact(item, { type: 'ordering', order: [0, 0, 1] })?.correct).toBe(false)
    expect(gradeExact(item, { type: 'ordering', order: [0, 1] })?.correct).toBe(false)
  })

  it('open and mismatched types are not graded here', () => {
    const open: Item = { ...base, id: 'x', type: 'open', rubric: ['one', 'second'] }
    expect(gradeExact(open, { type: 'open', text: 'qualquer' })).toBeNull()
    const tf: Item = { ...base, id: 'v', type: 'true_false', correct: true }
    expect(gradeExact(tf, { type: 'numeric', value: '1' })).toBeNull()
    expect(gradeExact(tf, { type: 'true_false', value: true })?.correct).toBe(true)
  })
})

describe('checkItems', () => {
  it('flags a repeated id and a nonexistent correct choice', () => {
    const items: Item[] = [
      { ...base, id: 'a', type: 'true_false', correct: true },
      { ...base, id: 'a', type: 'true_false', correct: false },
      {
        ...base,
        id: 'm',
        type: 'multiple_choice',
        choices: [
          { text: '1', explanation: 'x' },
          { text: '2', explanation: 'x' },
          { text: '3', explanation: 'x' },
        ],
        correct: 4,
      },
    ]
    expect(checkItems(items)).toHaveLength(2)
  })
})

describe('checkSyllabus', () => {
  const module = (n: number, types: Array<'video' | 'text' | 'exercises'>) => ({
    title: `Módulo ${n}`,
    goal: 'o',
    skills: [{ id: `m${n}-um`, name: 'one', bloom: 'apply' as const }],
    lessons: types.map((type, i) => ({ type, title: `aula ${i}`, goal: 'o', skills: [`m${n}-um`] })),
    project: { title: 'p', prompt: 'e', rubric: ['a', 'b'] },
  })
  const syllabus = (modules: Syllabus['modules']): Syllabus => ({
    title: 't',
    summary: 'r',
    results: ['a', 'b', 'c'],
    prerequisites: [],
    modules,
    bibliography: [],
  })

  it('accepts a syllabus with enough practice', () => {
    expect(
      checkSyllabus(
        syllabus([module(1, ['video', 'text', 'exercises']), module(2, ['text', 'exercises', 'exercises'])]),
      ),
    ).toEqual([])
  })

  it('fails a module with no exercises and a skill named but not declared', () => {
    const noPractice = module(1, ['video', 'text', 'video'])
    const citesOther = module(2, ['video', 'text', 'exercises'])
    citesOther.lessons[0].skills = ['m9-fantasma']
    const problems = checkSyllabus(syllabus([noPractice, citesOther]))
    expect(problems.some((p) => p.includes('has no exercises lesson'))).toBe(true)
    expect(problems.some((p) => p.includes('m9-fantasma'))).toBe(true)
  })
})

describe('reuseKey', () => {
  it('is the same for the same request written in different ways', () => {
    const a = reuseKey({ topic: 'Cálculo', scope: 'Derivadas e integrais', level: 'basic' })
    const b = reuseKey({ topic: '  cálculo ', scope: 'derivadas, e integrais!', level: 'basic' })
    expect(a).toBe(b)
  })

  it('tells levels apart and C++ from C', () => {
    const cpp = reuseKey({ topic: 'C++', scope: 'do zero', level: 'basic' })
    expect(cpp).not.toBe(reuseKey({ topic: 'C', scope: 'do zero', level: 'basic' }))
    expect(cpp).not.toBe(reuseKey({ topic: 'C++', scope: 'do zero', level: 'advanced' }))
  })
})

describe('the item without the answer key', () => {
  const ordering: Item = { ...base, id: 'o', type: 'ordering', steps: ['a', 'b', 'c', 'd'] }
  const multipleChoice: Item = {
    ...base,
    id: 'm',
    type: 'multiple_choice',
    choices: [
      { text: 'x', explanation: 'segredo 1' },
      { text: 'y', explanation: 'segredo 2' },
      { text: 'z', explanation: 'segredo 3' },
    ],
    correct: 2,
    hints: ['dica secreta'],
  }

  it('carries no answer, solution, explanation or hints', () => {
    const seen = JSON.stringify(studentItem(multipleChoice, 'f1'))
    expect(seen).not.toContain('segredo')
    expect(seen).not.toContain('dica secreta')
    expect(seen).not.toContain('"correct"')
    expect(seen).not.toContain('"solution"')
    expect(studentItem(multipleChoice, 'f1').totalHints).toBe(1)
  })

  it('ordering goes shuffled, always the same for the same seed, and never in the right order', () => {
    const a = studentItem(ordering, 'f1').steps
    expect(a).toEqual(studentItem(ordering, 'f1').steps)
    expect(a).not.toEqual(['a', 'b', 'c', 'd'])
    expect([...a!].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('the answer as texts becomes the order of the original steps', () => {
    expect(studentAnswer(ordering, { type: 'ordering', texts: ['a', 'b', 'c', 'd'] })).toEqual({
      type: 'ordering',
      order: [0, 1, 2, 3],
    })
    const madeUp = studentAnswer(ordering, { type: 'ordering', texts: ['a', 'b', 'c', 'zzz'] })
    expect(gradeExact(ordering, madeUp!)?.correct).toBe(false)
    expect(studentAnswer(ordering, { type: 'ordering', order: [0, 1, 2] })).toBeNull()
  })
})
