import { describe, expect, it } from 'vitest'
import { readArgs, videoStatus } from './course.js'
import { scriptHash } from '../server/video/production.js'
import type { Script, ReadyVideo } from '../shared/video.js'

describe('CLI arguments', () => {
  it('reads slug, --module, --lesson and --force', () => {
    expect(readArgs(['russian', '--module', '2', '--lesson', '3', '--force'])).toEqual({
      positional: ['russian'],
      module: 2,
      lesson: 3,
      force: true,
      all: false,
    })
  })
  it('rejects an invalid number and an unknown option', () => {
    expect(() => readArgs(['--module', 'x'])).toThrow()
    expect(() => readArgs(['--banana'])).toThrow()
  })
})

describe('video status', () => {
  const script = { title: 'x', scenes: [] } as unknown as Script
  const ready = (hash?: string) =>
    ({
      playlist: 'index.m3u8',
      subtitles: 'l.vtt',
      durationMs: 1,
      pauses: [],
      simulatedVoice: false,
      scriptHash: hash,
    }) as ReadyVideo
  it('tells apart no video, up to date and out of date', () => {
    expect(videoStatus(script, null, false)).toBe('no-video')
    expect(videoStatus(script, ready(scriptHash(script)), true)).toBe('up_to_date')
    expect(videoStatus(script, ready('other'), true)).toBe('outdated')
    expect(videoStatus(script, ready(), true)).toBe('up_to_date')
  })
})
