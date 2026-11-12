import { describe, expect, it } from 'vitest'
import type { Script } from '../../shared/video.js'
import { BEFORE_SCENE_END_MS, MIN_PAUSE_MS, scriptHash, subtitlesFor, pausesOf } from './production.js'

const scene = (narration: string) => ({ type: 'title' as const, title: 'T', subtitle: '', narration })
const question = (id: string) => ({
  type: 'question' as const,
  narration: 'Responda.',
  item: { id, type: 'multiple_choice', prompt: 'Qual?', choices: ['a', 'b'], correct: 0 },
})
const script = (scenes: unknown[]) => ({ title: 'Lesson', scenes }) as unknown as Script

describe('captions', () => {
  it('splits the scene into chunks of up to 14 words with proportional timing', () => {
    const words = Array.from({ length: 20 }, (_, i) => `p${i}`).join(' ')
    const vtt = subtitlesFor(script([scene(words)]), [0], [20_000])
    const blocks = vtt.split('\n\n').filter((b) => b.includes('-->'))
    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('00:00:00.000 --> 00:00:14.000')
    expect(blocks[1]).toContain('00:00:14.000 --> 00:00:20.000')
  })
})

describe('pauses', () => {
  it('pauses near the end of the question scene and goes back to the start of the previous one', () => {
    const r = script([scene('a'), scene('b'), question('q1')])
    const pauses = pausesOf(r, [0, 10_000, 25_000], [10_000, 15_000, 8_000])
    expect(pauses).toEqual([{ itemId: 'q1', atMs: 25_000 + 8_000 - BEFORE_SCENE_END_MS, backToMs: 10_000 }])
  })

  it('respects the minimum pause in short scenes', () => {
    const r = script([scene('a'), question('q1')])
    expect(pausesOf(r, [0, 5_000], [5_000, 1_000])[0].atMs).toBe(5_000 + MIN_PAUSE_MS)
  })
})

describe('script hash', () => {
  it('changes when the script changes', () => {
    expect(scriptHash(script([scene('a')]))).not.toBe(scriptHash(script([scene('b')])))
    expect(scriptHash(script([scene('a')]))).toBe(scriptHash(script([scene('a')])))
  })
})
