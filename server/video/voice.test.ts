import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MODEL_FILES,
  defaultVoice,
  chunkHash,
  requestedEngine,
  voiceName,
  enginePython,
  silenceSeconds,
  requestedSpeed,
  requestedVoice,
} from './voice.js'

describe('engine choice', () => {
  it('reads VOICE_ENGINE and treats an unknown value as auto', () => {
    expect(requestedEngine(' KOKORO ')).toBe('kokoro')
    expect(requestedEngine('silence')).toBe('silence')
    expect(requestedEngine('piper')).toBe('auto')
    expect(requestedEngine(undefined)).toBe('auto')
  })

  it('the voice follows the course language: VOICE only applies when it is of that language', () => {
    expect(defaultVoice('pt-BR')).toBe('pf_dora')
    expect(defaultVoice('en')).toBe('af_heart')
    expect(requestedVoice('pt-BR', undefined)).toBe('pf_dora')
    expect(requestedVoice('pt-BR', ' PM_ALEX ')).toBe('pm_alex')
    expect(requestedVoice('pt-BR', 'af_heart')).toBe('pf_dora')
    expect(requestedVoice('en', 'am_michael')).toBe('am_michael')
    expect(requestedVoice('en', 'pf_dora')).toBe('af_heart')
  })

  it('the speed stays between 0.5 and 2, with 1 by default', () => {
    expect(requestedSpeed(undefined)).toBe(1)
    expect(requestedSpeed('1,1')).toBe(1.1)
    expect(requestedSpeed('5')).toBe(2)
    expect(requestedSpeed('0.1')).toBe(0.5)
    expect(requestedSpeed('rápido')).toBe(1)
  })

  it('the engine Python lives in the isolated environment, with each OS path', () => {
    expect(enginePython('darwin').endsWith(path.join('.venv', 'bin', 'python'))).toBe(true)
    expect(enginePython('win32').endsWith(path.join('.venv', 'Scripts', 'python.exe'))).toBe(true)
  })

  it('the model files have a sha256 to check the download', () => {
    for (const a of MODEL_FILES) expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('the hash changes with engine, voice and text', () => {
    const base = chunkHash('kokoro', 'pf_dora', 'olá')
    expect(base).toHaveLength(64)
    expect(chunkHash('kokoro', 'pf_dora', 'olá')).toBe(base)
    expect(chunkHash('silence', 'pf_dora', 'olá')).not.toBe(base)
    expect(chunkHash('kokoro', 'pm_alex', 'olá')).not.toBe(base)
    expect(chunkHash('kokoro', 'pf_dora', 'oi')).not.toBe(base)
  })

  it('the silence lasts at least 1.5 s and grows with the text', () => {
    expect(silenceSeconds('oi')).toBe(1.5)
    expect(silenceSeconds(Array(150).fill('palavra').join(' '))).toBeCloseTo(64.8, 1)
    expect(voiceName('silence')).toBe('')
  })
})
