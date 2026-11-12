/**
 * The ears of the Feynman lesson: the student's speech (the audio the browser recorded) becomes text through local
 * Whisper. ffmpeg converts the audio to 16 kHz mono wav in a temporary folder, it is transcribed and then deleted.
 * Nothing is kept.
 */

import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { PythonProcess } from '../video/pythonProcess.js'
import { LANGUAGE_DATA, type Language } from '../../shared/languages.js'
import { VOICE_FOLDER, ffmpegInstalled, enginePython, FFMPEG_HELP } from '../video/voice.js'

const execFileAsync = promisify(execFile)

export const LISTENER_SCRIPT = path.join(config.root, 'voice', 'whisper_worker.py')
export const WHISPER_FOLDER = path.join(VOICE_FOLDER, 'whisper')
export const LISTENER_REQUIREMENTS = path.join(config.root, 'voice', 'requirements-listener.txt')

export const WHISPER_SIZES = ['base', 'small', 'medium'] as const
export type WhisperSize = (typeof WHISPER_SIZES)[number]

/** `FEYNMAN_WHISPER` (default `small`: gets technical terms right that `base` gets wrong, and is still fast on CPU). */
export function whisperSize(value: string | undefined = process.env.FEYNMAN_WHISPER): WhisperSize {
  const v = (value ?? '').trim().toLowerCase()
  return (WHISPER_SIZES as readonly string[]).includes(v) ? (v as WhisperSize) : 'small'
}

/** The folder faster-whisper creates when it downloads the model (Hugging Face cache layout). */
export const whisperModelFolder = (size: WhisperSize): string =>
  path.join(WHISPER_FOLDER, `models--Systran--faster-whisper-${size}`)

/** Whether the faster-whisper package is in the voice Python environment. */
function packageInstalled(): boolean {
  const lib =
    process.platform === 'win32'
      ? [path.join(VOICE_FOLDER, '.venv', 'Lib', 'site-packages')]
      : (() => {
          const base = path.join(VOICE_FOLDER, '.venv', 'lib')
          try {
            return readdirSync(base).map((d) => path.join(base, d, 'site-packages'))
          } catch {
            return []
          }
        })()
  return lib.some((folder) => existsSync(path.join(folder, 'faster_whisper')))
}

export function listenerInstalled(): boolean {
  return existsSync(enginePython()) && packageInstalled() && existsSync(whisperModelFolder(whisperSize()))
}

export const LISTENER_HELP = 'Run `npm run feynman:install` (installs local Whisper, once).'

const whisper = new PythonProcess(
  'listener (Whisper)',
  () => ({ python: enginePython(), args: ['-I', LISTENER_SCRIPT, whisperSize(), WHISPER_FOLDER] }),
  5 * 60_000,
)

/** The formats that browsers' MediaRecorder records. */
const EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

export const acceptedAudioType = (type: string | undefined): boolean =>
  Boolean(type && EXTENSION[type.split(';')[0]!.trim().toLowerCase()])

/**
 * The vocabulary Whisper should expect: the topic and the cues of the key points. It goes as `initial_prompt` (Whisper
 * takes about 200 tokens), which helps it get technical terms right ("photons", "h times the frequency").
 */
export function vocabularyHint(topic: string, cues: readonly string[]): string {
  let hint = `${topic}.`
  for (const s of new Set(cues)) {
    if (hint.length + s.length + 2 > 400) break
    hint += ` ${s},`
  }
  return hint.replace(/,$/, '.')
}

/** Transcribes audio recorded by the browser. Returns '' if there was no speech. */
export async function transcribe(
  audio: Buffer,
  type: string,
  hint = '',
  language: Language = 'pt-BR',
): Promise<string> {
  if (!listenerInstalled()) throw new Error(`The listener is not installed. ${LISTENER_HELP}`)
  if (!(await ffmpegInstalled())) throw new Error(FFMPEG_HELP)
  const extension = EXTENSION[type.split(';')[0]!.trim().toLowerCase()] ?? 'webm'
  const folder = await mkdtemp(path.join(os.tmpdir(), 'listener-'))
  try {
    const input = path.join(folder, `speech.${extension}`)
    const wav = path.join(folder, 'speech.wav')
    await writeFile(input, audio)
    await execFileAsync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      input,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      wav,
    ])
    const r = await whisper.send({ wav, hint, language: LANGUAGE_DATA[language].whisper })
    return typeof r.text === 'string' ? r.text.trim() : ''
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
