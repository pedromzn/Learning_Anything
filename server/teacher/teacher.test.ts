import { describe, expect, it } from 'vitest'
import { closestExcerpt, firstSentences, lessonExcerpts, plainText, scriptAnswer, type Excerpt } from './teacher.js'

const EXCERPTS: Excerpt[] = [
  { label: 'Photons', text: 'Light exchanges energy in packets called photons. Each photon carries a fixed amount.' },
  { label: 'Waves', text: 'Interference in the double slit shows that light behaves like a wave.' },
]

describe('the teacher in script mode', () => {
  it('finds the excerpt that shares the most words, by root (plurals count)', () => {
    expect(closestExcerpt('why does light make interference patterns?', EXCERPTS)?.label).toBe('Waves')
    expect(closestExcerpt('what is a photon', EXCERPTS)?.label).toBe('Photons')
    expect(closestExcerpt('what is the capital of France', EXCERPTS)).toBeNull()
  })

  it('answers in the course language and says so when the material does not cover it', () => {
    expect(scriptAnswer('what is a photon', EXCERPTS, 'en')).toMatchObject({ source: 'Photons', engine: 'script' })
    expect(scriptAnswer('capital of France', EXCERPTS, 'pt-BR').answer).toMatch(/^Não achei/)
    expect(scriptAnswer('?', EXCERPTS, 'en').source).toBeNull()
  })

  it('reads plain text: no markdown, no LaTeX dollars, no code blocks', () => {
    expect(plainText('**Energia** é $E = hf$.\n\n```js\nx\n```\n[fonte](http://x)')).toBe('Energia é E = hf. fonte')
    expect(firstSentences('One. Two. Three.', 8)).toBe('One.')
  })

  it('keeps answer keys and hints out of an exercises lesson', () => {
    const lesson = {
      plan: { type: 'exercises' } as never,
      content: {
        guidance: 'Practice.',
        items: [{ prompt: 'How much is 2 + 2?', solution: 'It is four.', hints: ['Count.'] }],
      } as never,
    }
    const text = JSON.stringify(lessonExcerpts(lesson, 'en'))
    expect(text).toContain('How much is 2 + 2?')
    expect(text).not.toMatch(/four|Count/)
  })
})
